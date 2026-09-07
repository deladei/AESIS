"""POST /ai/enrich/entry + /ai/enrich/placement — the v2 contract the Node
worker consumes. Mounts ONLY the enrich router: importing main.py would drag
in routers.chat → services.chatbot → sentence-transformers, which the test
env deliberately lacks."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.enrich as enrich
from routers.enrich import router
from tests.conftest import TEST_API_KEY

app = FastAPI()
app.include_router(router)
client = TestClient(app)

HEADERS = {"X-API-Key": TEST_API_KEY}

RICH_ACTIVITY = (
    "Refactored the payments API endpoint in Express, fixed a database "
    "migration bug and wrote unit tests to raise coverage."
)


def entry_body(**overrides):
    body = {
        "entry_id": "entry-1",
        "week_number": 3,
        "activities": [
            {"description": RICH_ACTIVITY, "competency_tags": ["backend", "testing"]},
            {"description": "Attended the weekly standup meeting and updated tickets."},
        ],
        "reflection": {
            "learning": "I learned how database indexing improves query performance "
                        "and how to structure Express middleware for reuse.",
            "challenges": "Debugging the async migration was difficult.",
        },
        "corpus": [],
    }
    body.update(overrides)
    return body


class TestAuth:
    def test_missing_key_401(self):
        assert client.post("/ai/enrich/entry", json=entry_body()).status_code == 401

    def test_wrong_key_401(self):
        r = client.post("/ai/enrich/entry", json=entry_body(),
                        headers={"X-API-Key": "wrong"})
        assert r.status_code == 401

    def test_placement_also_guarded(self):
        r = client.post("/ai/enrich/placement",
                        json={"placement_id": "p1", "entries": []})
        assert r.status_code == 401


class TestEnrichEntry:
    def test_v2_contract_shape(self):
        r = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["model_name"] == "aesis-entry-enrichment/v2"
        assert 0.0 <= data["relevance"] <= 1.0
        q = data["quality"]
        for dim in ("overall", "task_depth", "tech_vocab", "reflection",
                    "temporal_consistency", "relevance"):
            assert 0.0 <= q[dim] <= 100.0
        assert data["plagiarism"]["checked"] is False  # empty corpus
        assert data["feedback_draft"] is None  # Groq key pinned empty
        # The tests pin GROQ_API_KEY empty, so the model classifier cannot run
        # and the word list is the floor. The response says so rather than
        # presenting a degraded signal as the model's judgement.
        assert data["classifier"] == "keywords"

    def test_enrichment_still_returns_when_the_model_is_unreachable(self):
        # The whole pipeline must survive a dead Groq. Competency classification
        # falls back to the word list, and quality, plagiarism and the summary
        # are unaffected — a degraded score beats a failed enrichment pass.
        r = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["classifier"] == "keywords"
        assert data["summary"]["activity_relevance"]
        # The word list has no reasoning to offer, and says nothing rather than
        # inventing a justification.
        assert all(a["reason"] == "" for a in data["summary"]["activity_relevance"])

    def test_classifier_marks_technical_vs_nontechnical(self):
        r = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS)
        acts = r.json()["summary"]["activity_relevance"]
        technical = next(a for a in acts if "Refactored" in a["description"])
        assert technical["on_topic"] is True
        assert "software_engineering" in technical["themes"]

    def test_empty_entry_scores_zero_and_flags(self):
        r = client.post("/ai/enrich/entry",
                        json={"entry_id": "e0", "activities": [], "reflection": None},
                        headers=HEADERS)
        data = r.json()
        assert data["relevance"] == 0.0
        assert data["summary"]["headline"] == "No activities recorded for this week."
        assert "No reflection provided." in data["summary"]["concerns"]
        assert data["quality"]["overall"] == 0.0
        assert "low_cs_relevance" in data["quality"]["flags"]

    def test_off_topic_activity_raises_concern(self):
        body = entry_body(activities=[
            {"description": "Watered the office plants and tidied the storeroom."},
        ], reflection=None)
        r = client.post("/ai/enrich/entry", json=body, headers=HEADERS)
        concerns = r.json()["summary"]["concerns"]
        assert any("little" in c for c in concerns)
        assert "No reflection provided." in concerns

    def test_plagiarism_stage_wired_end_to_end(self):
        candidate_text = enrich._entry_text(
            [enrich.ActivityIn(**a) for a in entry_body()["activities"]],
            enrich.ReflectionIn(**entry_body()["reflection"]),
        )
        body = entry_body(corpus=[
            {"entry_id": "other", "text": candidate_text, "same_student": False},
        ])
        r = client.post("/ai/enrich/entry", json=body, headers=HEADERS)
        p = r.json()["plagiarism"]
        assert p["checked"] and p["flagged"]
        assert p["matches"][0]["entry_id"] == "other"

    def test_out_of_range_rubric_never_leaves_the_api(self, monkeypatch):
        """Hard rule: even a broken scorer cannot push >100 or negative scores
        into the response — _bounded clamps at the API boundary."""
        real = enrich.compute_quality

        def poisoned(**kw):
            q = real(**kw)
            q.quality_score = 730.0
            q.task_depth_score = -12.0
            return q

        monkeypatch.setattr(enrich, "compute_quality", poisoned)
        r = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS)
        assert r.status_code == 200
        assert r.json()["quality"]["overall"] == 100.0
        assert r.json()["quality"]["task_depth"] == 0.0


class TestRubricAdapter:
    """_score_quality maps the weekly-entry shape onto the legacy scorer
    contract: descriptions→tasks, competency tags→technologies,
    learning→reflection, challenges→challenges."""

    def test_field_mapping(self, monkeypatch):
        seen = {}
        real = enrich.compute_quality

        def spy(**kw):
            seen.update(kw)
            return real(**kw)

        monkeypatch.setattr(enrich, "compute_quality", spy)
        client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS)
        assert RICH_ACTIVITY in seen["tasks"]
        assert "standup" in seen["tasks"]
        assert seen["technologies"] == "backend testing"  # deduped, sorted
        assert seen["reflection"].startswith("I learned how database indexing")
        assert seen["challenges"] == "Debugging the async migration was difficult."

    def test_tags_deduped_across_activities(self, monkeypatch):
        seen = {}
        real = enrich.compute_quality

        def spy(**kw):
            seen.update(kw)
            return real(**kw)

        monkeypatch.setattr(enrich, "compute_quality", spy)
        body = entry_body(activities=[
            {"description": "a", "competency_tags": ["sql", "backend"]},
            {"description": "b", "competency_tags": ["backend"]},
        ])
        client.post("/ai/enrich/entry", json=body, headers=HEADERS)
        assert seen["technologies"] == "backend sql"

    def test_no_reflection_maps_to_empty_strings(self, monkeypatch):
        seen = {}
        real = enrich.compute_quality

        def spy(**kw):
            seen.update(kw)
            return real(**kw)

        monkeypatch.setattr(enrich, "compute_quality", spy)
        client.post("/ai/enrich/entry", json=entry_body(reflection=None),
                    headers=HEADERS)
        assert seen["reflection"] == "" and seen["challenges"] == ""


class TestEntryText:
    def test_composition_order_matches_contract(self):
        """Candidate text = activity descriptions then learning then challenges;
        the Node worker composes corpus docs identically — a drift here silently
        degrades every similarity score."""
        acts = [enrich.ActivityIn(description="first"),
                enrich.ActivityIn(description="second")]
        refl = enrich.ReflectionIn(learning="learned", challenges="challenged")
        assert enrich._entry_text(acts, refl) == "first second learned challenged"

    def test_empty_parts_dropped(self):
        acts = [enrich.ActivityIn(description="only")]
        assert enrich._entry_text(acts, enrich.ReflectionIn()) == "only"
        assert enrich._entry_text([], None) == ""


class TestClassifyActivity:
    def test_relevance_saturates_at_one(self):
        a = enrich._classify_activity(
            "api endpoint backend refactor bug debug deploy code", [])
        assert a.relevance == 1.0 and a.on_topic

    def test_tags_count_as_soft_evidence_capped_at_three(self):
        no_signal = enrich._classify_activity("did things", [])
        assert no_signal.relevance == 0.0 and not no_signal.on_topic
        tagged = enrich._classify_activity("did things", ["a", "b", "c", "d", "e"])
        assert tagged.relevance == 1.0  # min(5,3)/3 — tags alone cannot exceed 1.0

    def test_description_truncated_to_140(self):
        a = enrich._classify_activity("x" * 500, [])
        assert len(a.description) == 140


class TestEnrichPlacement:
    def test_empty_placement(self):
        r = client.post("/ai/enrich/placement",
                        json={"placement_id": "p1", "entries": []}, headers=HEADERS)
        assert r.status_code == 200
        s = r.json()["summary"]
        assert s["week_count"] == 0
        assert s["headline"] == "No acknowledged weeks to summarize."

    def test_themes_ranked_and_recommendations(self):
        entries = [{
            "week_number": w,
            "activities": [{"description": "Fixed a bug in the api endpoint code"}],
        } for w in (1, 2)]
        r = client.post("/ai/enrich/placement",
                        json={"placement_id": "p1", "entries": entries},
                        headers=HEADERS)
        s = r.json()["summary"]
        assert s["week_count"] == 2
        assert s["themes"][0] == "software_engineering"
        recs = " ".join(s["recommendations"])
        assert "narrow" in recs  # single theme
        assert "testing/QA" in recs  # no testing evidence


class TestStagesDegradeIndependently:
    """One model stage failing must not take the others down with it.

    The three model calls now run concurrently, so a raised exception in any of
    them arrives through `asyncio.gather` rather than through the service's own
    try/except. If that escape were not contained, a single bad Groq response
    would fail the whole enrichment pass instead of degrading one stage — and
    the entry would go to the supervisor with no assessment at all.
    """

    @staticmethod
    def _boom(*_a, **_k):
        async def _raise():
            raise RuntimeError("groq exploded")
        return _raise()

    def test_a_raising_classifier_falls_back_to_the_word_list(self, monkeypatch):
        monkeypatch.setattr(enrich.competency, "classify", self._boom)
        data = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS).json()
        assert data["classifier"] == "keywords"
        assert len(data["summary"]["activity_relevance"]) == 2

    def test_a_raising_summarizer_falls_back_to_the_template(self, monkeypatch):
        monkeypatch.setattr(enrich.summary_service, "summarize_week", self._boom)
        data = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS).json()
        assert data["summarizer"] == "template"
        assert data["summary"]["headline"]

    def test_a_raising_assessor_falls_back_to_the_rubric(self, monkeypatch):
        monkeypatch.setattr(enrich.quality_service, "assess", self._boom)
        data = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS).json()
        assert data["scorer"] == "rubric"
        assert 0.0 <= data["quality"]["overall"] <= 100.0

    def test_all_three_failing_still_returns_a_complete_response(self, monkeypatch):
        monkeypatch.setattr(enrich.competency, "classify", self._boom)
        monkeypatch.setattr(enrich.summary_service, "summarize_week", self._boom)
        monkeypatch.setattr(enrich.quality_service, "assess", self._boom)
        r = client.post("/ai/enrich/entry", json=entry_body(), headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert (data["classifier"], data["summarizer"], data["scorer"]) == (
            "keywords", "template", "rubric",
        )
