"""
Celery async task pipeline.
  analyze_logbook  — quality + plagiarism + sentiment → writes logbook_analyses

(compute_risk retired 2026-07-03: risk scoring moved to the Node backend,
computed rule-based from live entries-pipeline data.)
"""
import json
from datetime import datetime, timezone

import psycopg2.extras
from celery.utils.log import get_task_logger

from tasks.celery_app import celery_app
from config.database import get_sync_mongo_db, get_sync_pg_conn
from config.settings import settings
from services import quality_scorer, plagiarism_detector as pdet, sentiment_analyser

logger = get_task_logger(__name__)


# ── analyze_logbook ───────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def analyze_logbook(self, submission_id: str, student_id: str, placement_id: str):
    logger.info(f"Starting analysis for submission {submission_id}")

    pg_conn = get_sync_pg_conn()
    try:
        cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── 1. Mark as processing ──────────────────────────────
        cur.execute(
            "UPDATE logbook_submissions SET ai_analysis_status = 'processing' WHERE id = %s",
            (submission_id,),
        )
        pg_conn.commit()

        # ── 2. Fetch content from MongoDB ──────────────────────
        mongo_db  = get_sync_mongo_db()
        entry     = mongo_db["logbook_entries"].find_one({"submissionId": submission_id})
        if not entry:
            logger.error(f"No MongoDB entry for submission {submission_id}")
            raise ValueError("MongoDB entry not found")

        tasks_text   = entry.get("tasksCompleted", "")
        tech_text    = entry.get("technologiesUsed", "")
        challenges   = entry.get("challenges", "")
        reflection   = entry.get("reflection", "")
        full_text    = f"{tasks_text} {tech_text} {challenges} {reflection}"

        # ── 3. Quality analysis ────────────────────────────────
        q_result = quality_scorer.score(
            tasks=tasks_text,
            technologies=tech_text,
            challenges=challenges,
            reflection=reflection,
        )

        # ── 4. Plagiarism check ────────────────────────────────
        p_result = pdet.detector.check(submission_id=submission_id, text=full_text)

        # ── 5. Sentiment analysis ──────────────────────────────
        s_result = sentiment_analyser.analyse(full_text)

        # ── 5b. Validate/normalise the quality score before persisting ──
        # Never write an out-of-range or non-numeric score to the DB — a corrupt
        # value would otherwise poison every downstream average.
        quality_score, q_out_of_range = quality_scorer.clamp_quality_score(
            q_result.quality_score
        )
        if q_out_of_range:
            logger.warning(
                "Quality score out of range for %s — raw=%r clamped=%r",
                submission_id, q_result.quality_score, quality_score,
            )
        if quality_score is None:
            raise ValueError(
                f"Non-numeric quality score for {submission_id}: {q_result.quality_score!r}"
            )

        # ── 6. Write to logbook_analyses ──────────────────────
        cur.execute(
            """
            INSERT INTO logbook_analyses (
                id, submission_id,
                quality_score, task_depth_score, tech_vocab_score,
                reflection_score, temporal_consistency_score,
                relevance_score, is_relevance_flagged,
                plagiarism_similarity, is_plagiarism_flagged, plagiarism_match_ids,
                authenticity_flag,
                sentiment_polarity, sentiment_class,
                ai_feedback_summary,
                computed_at
            ) VALUES (
                gen_random_uuid(), %s,
                %s, %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s,
                %s, %s,
                %s,
                NOW()
            )
            ON CONFLICT (submission_id) DO UPDATE SET
                quality_score              = EXCLUDED.quality_score,
                task_depth_score           = EXCLUDED.task_depth_score,
                tech_vocab_score           = EXCLUDED.tech_vocab_score,
                reflection_score           = EXCLUDED.reflection_score,
                temporal_consistency_score = EXCLUDED.temporal_consistency_score,
                relevance_score            = EXCLUDED.relevance_score,
                is_relevance_flagged       = EXCLUDED.is_relevance_flagged,
                plagiarism_similarity      = EXCLUDED.plagiarism_similarity,
                is_plagiarism_flagged      = EXCLUDED.is_plagiarism_flagged,
                plagiarism_match_ids       = EXCLUDED.plagiarism_match_ids,
                sentiment_polarity         = EXCLUDED.sentiment_polarity,
                sentiment_class            = EXCLUDED.sentiment_class,
                ai_feedback_summary        = EXCLUDED.ai_feedback_summary,
                computed_at                = EXCLUDED.computed_at,
                updated_at                 = NOW()
            """,
            (
                submission_id,
                quality_score,  q_result.task_depth_score, q_result.tech_vocab_score,
                q_result.reflection_score, q_result.temporal_consistency_score,
                q_result.relevance_score, q_result.is_relevance_flagged,
                p_result.plagiarism_similarity, p_result.is_plagiarism_flagged,
                p_result.plagiarism_match_ids,
                p_result.is_plagiarism_flagged,   # authenticity_flag mirrors plagiarism
                s_result.sentiment_polarity, s_result.sentiment_class,
                q_result.ai_feedback_summary,
            ),
        )

        # ── 7. Mark submission AI status as completed ──────────
        cur.execute(
            "UPDATE logbook_submissions SET ai_analysis_status = 'completed' WHERE id = %s",
            (submission_id,),
        )
        pg_conn.commit()

        # ── 8. Add to plagiarism index for future checks ───────
        pdet.detector.add_document(submission_id, full_text)

        logger.info(f"Analysis complete for {submission_id} — quality={quality_score}")

    except Exception as exc:
        pg_conn.rollback()
        try:
            pg_conn.cursor().execute(
                "UPDATE logbook_submissions SET ai_analysis_status = 'failed' WHERE id = %s",
                (submission_id,),
            )
            pg_conn.commit()
        except Exception:
            pass
        logger.error(f"Analysis failed for {submission_id}: {exc}")
        raise self.retry(exc=exc)

    finally:
        pg_conn.close()
