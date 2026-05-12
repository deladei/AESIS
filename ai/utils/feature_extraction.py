"""
Extracts the 18 XGBoost features for risk prediction from PostgreSQL.
All queries run synchronously (called from Celery tasks).
"""
import math
from datetime import datetime, timezone
from typing import Optional
import numpy as np
import psycopg2.extras
from config.database import get_sync_pg_conn


FEATURE_NAMES = [
    "submission_rate",           # 1
    "late_submission_rate",      # 2
    "avg_quality_score",         # 3
    "quality_score_std",         # 4
    "avg_hours_worked",          # 5
    "word_count_avg",            # 6
    "word_count_trend",          # 7
    "quality_trend",             # 8
    "days_since_last_submission",# 9
    "consecutive_late_streak",   # 10
    "tech_vocab_score_avg",      # 11
    "reflection_score_avg",      # 12
    "task_depth_score_avg",      # 13
    "plagiarism_flag_count",     # 14
    "relevance_flag_count",      # 15
    "feedback_received_count",   # 16
    "flagged_submission_count",  # 17
    "weeks_elapsed",             # 18
]


def extract_features(student_id: str, placement_id: str) -> dict:
    conn = get_sync_pg_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── Placement context ──────────────────────────────────
        cur.execute(
            """
            SELECT start_date, EXTRACT(EPOCH FROM (NOW() - start_date)) / 604800 AS weeks_elapsed
            FROM placements WHERE id = %s
            """,
            (placement_id,),
        )
        placement = cur.fetchone()
        weeks_elapsed = float(placement["weeks_elapsed"]) if placement else 0.0

        # ── Submission stats ───────────────────────────────────
        cur.execute(
            """
            SELECT
                COUNT(*)                                        AS total_slots,
                COUNT(*) FILTER (WHERE submission_status NOT IN ('draft'))  AS submitted_count,
                COUNT(*) FILTER (WHERE is_late = TRUE)          AS late_count,
                COUNT(*) FILTER (WHERE submission_status = 'flagged') AS flagged_count,
                MAX(submitted_at)                               AS last_submitted_at
            FROM logbook_submissions
            WHERE placement_id = %s AND student_id = %s
            """,
            (placement_id, student_id),
        )
        stats = cur.fetchone()
        total_slots    = int(stats["total_slots"] or 0)
        submitted      = int(stats["submitted_count"] or 0)
        late_count     = int(stats["late_count"] or 0)
        flagged_count  = int(stats["flagged_count"] or 0)
        last_submitted = stats["last_submitted_at"]

        submission_rate    = submitted / total_slots if total_slots > 0 else 0.0
        late_submission_rate = late_count / submitted if submitted > 0 else 0.0

        now = datetime.now(timezone.utc)
        if last_submitted:
            if last_submitted.tzinfo is None:
                last_submitted = last_submitted.replace(tzinfo=timezone.utc)
            days_since_last = (now - last_submitted).days
        else:
            days_since_last = int(weeks_elapsed * 7)

        # ── Quality scores from analyses ───────────────────────
        cur.execute(
            """
            SELECT
                la.quality_score,
                la.task_depth_score,
                la.tech_vocab_score,
                la.reflection_score,
                la.plagiarism_similarity,
                la.is_plagiarism_flagged,
                la.is_relevance_flagged,
                ls.week_number
            FROM logbook_analyses la
            JOIN logbook_submissions ls ON la.submission_id = ls.id
            WHERE ls.placement_id = %s AND ls.student_id = %s
            ORDER BY ls.week_number ASC
            """,
            (placement_id, student_id),
        )
        analyses = cur.fetchall()

        quality_scores   = [float(a["quality_score"]) for a in analyses if a["quality_score"]]
        task_depth_scores = [float(a["task_depth_score"]) for a in analyses if a["task_depth_score"]]
        tech_scores      = [float(a["tech_vocab_score"]) for a in analyses if a["tech_vocab_score"]]
        reflection_scores = [float(a["reflection_score"]) for a in analyses if a["reflection_score"]]
        plagiarism_flags = sum(1 for a in analyses if a["is_plagiarism_flagged"])
        relevance_flags  = sum(1 for a in analyses if a["is_relevance_flagged"])

        avg_quality      = float(np.mean(quality_scores))   if quality_scores   else 50.0
        quality_std      = float(np.std(quality_scores))    if quality_scores   else 0.0
        tech_vocab_avg   = float(np.mean(tech_scores))      if tech_scores      else 0.0
        reflection_avg   = float(np.mean(reflection_scores)) if reflection_scores else 0.0
        task_depth_avg   = float(np.mean(task_depth_scores)) if task_depth_scores else 0.0

        # Trend: slope of linear regression over week numbers
        def trend_slope(values: list[float]) -> float:
            if len(values) < 2:
                return 0.0
            x = np.arange(len(values), dtype=float)
            slope = np.polyfit(x, values, 1)[0]
            return float(slope)

        quality_trend    = trend_slope(quality_scores)

        # ── Supervisor feedback count ──────────────────────────
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM supervisor_feedback sf
            JOIN logbook_submissions ls ON sf.submission_id = ls.id
            WHERE ls.placement_id = %s AND ls.student_id = %s
            """,
            (placement_id, student_id),
        )
        feedback_count = int(cur.fetchone()["cnt"] or 0)

        # ── Consecutive late streak ────────────────────────────
        cur.execute(
            """
            SELECT is_late FROM logbook_submissions
            WHERE placement_id = %s AND student_id = %s
              AND submission_status NOT IN ('draft')
            ORDER BY week_number DESC
            LIMIT 10
            """,
            (placement_id, student_id),
        )
        late_rows = cur.fetchall()
        streak = 0
        for row in late_rows:
            if row["is_late"]:
                streak += 1
            else:
                break

        # Word count and hours — fetched from MongoDB via avg stored values
        # Using quality scores as proxy if not available
        word_count_avg   = max(avg_quality * 5, 50.0)  # rough proxy until real Mongo stats
        word_count_trend = quality_trend * 2

        features = {
            "submission_rate":            submission_rate,
            "late_submission_rate":       late_submission_rate,
            "avg_quality_score":          avg_quality,
            "quality_score_std":          quality_std,
            "avg_hours_worked":           40.0,        # default until Mongo integration
            "word_count_avg":             word_count_avg,
            "word_count_trend":           word_count_trend,
            "quality_trend":              quality_trend,
            "days_since_last_submission": float(days_since_last),
            "consecutive_late_streak":    float(streak),
            "tech_vocab_score_avg":       tech_vocab_avg,
            "reflection_score_avg":       reflection_avg,
            "task_depth_score_avg":       task_depth_avg,
            "plagiarism_flag_count":      float(plagiarism_flags),
            "relevance_flag_count":       float(relevance_flags),
            "feedback_received_count":    float(feedback_count),
            "flagged_submission_count":   float(flagged_count),
            "weeks_elapsed":              weeks_elapsed,
        }
        return features

    finally:
        conn.close()
