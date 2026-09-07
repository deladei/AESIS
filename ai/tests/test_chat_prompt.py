"""
What the assistant may say about the student it is talking to.

The record it is handed is real data about a real person, so the interesting
tests are not that the feature works but that its limits are stated: no derived
figures, no grade talk, and nothing about anybody else.
"""
from services.chat_prompt import SYSTEM_PROMPT, _system_prompt


class TestSystemPrompt:
    def test_without_a_record_it_says_it_has_no_access(self):
        p = _system_prompt(False)
        assert "no access to any individual's marks, grades or logbook" in p
        assert "THIS STUDENT'S OWN RECORD" not in p

    def test_with_a_record_the_refusal_clause_is_gone(self):
        # Left in, the model refuses to answer from figures it was just handed,
        # which is what it did for every "how am I doing?" question.
        p = _system_prompt(True)
        assert "no access to any individual's marks, grades or logbook" not in p
        assert "THIS STUDENT'S OWN RECORD" in p

    def test_with_a_record_it_still_may_not_derive_new_numbers(self):
        # The figures come from the same function that renders the dashboard.
        # Quoting them is safe; computing a new one is how the assistant starts
        # contradicting the page the student is looking at.
        p = _system_prompt(True)
        assert "Do NOT calculate new numbers" in p
        assert "quoting the figures exactly as given" in p

    def test_with_a_record_grade_talk_is_still_forbidden(self):
        p = _system_prompt(True)
        assert "is NOT a grade or a mark" in p
        assert "never tell the student whether they are passing" in p

    def test_with_a_record_other_students_remain_off_limits(self):
        assert "no access to any OTHER student's record" in _system_prompt(True)

    def test_rules_still_come_only_from_the_regulations(self):
        # Handing over the student's own figures must not loosen the rule that
        # regulations are answered from the extracts alone.
        for p in (_system_prompt(True), _system_prompt(False)):
            assert "Answer questions about RULES only from the regulation extracts" in p
            assert "Never state a rule that is not in the extracts" in p


def test_the_default_prompt_is_the_no_record_one():
    # `SYSTEM_PROMPT` is still exported for callers that never supply a record;
    # it must not quietly become the permissive variant.
    assert SYSTEM_PROMPT == _system_prompt(False)
