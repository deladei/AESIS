"""
What the assistant may say about the student it is talking to.

The record it is handed is real data about a real person, so the interesting
tests are not that the feature works but that its limits are stated: no derived
figures, no grade talk, and nothing about anybody else.
"""
from services.chat_prompt import SYSTEM_PROMPT, _system_prompt


class TestGreetings:
    """Refusing is for rules the assistant does not have. It is never the
    answer to "hello".

    The grounding work locked every reply to the retrieved extracts, so a
    greeting — which retrieves nothing — came back as "I don't have that
    information in the regulations". The prompt now sorts the message type
    before deciding whether refusing is even on the table.
    """

    def test_greetings_are_a_named_case(self):
        p = _system_prompt(False)
        assert "GREETINGS AND SMALL TALK" in p
        assert "NEVER refuse these" in p

    def test_capability_questions_are_a_named_case(self):
        assert "WHAT CAN YOU HELP ME WITH" in _system_prompt(False)

    def test_refusal_is_scoped_to_rules(self):
        p = _system_prompt(False)
        assert "Refusing is for rules you do not have. It is never the answer to \"hello\"." in p

    def test_greetings_do_not_mention_the_machinery(self):
        # "Hello! I could not find that in the regulation extracts" is the same
        # bug wearing a friendlier hat.
        assert "never mention regulations, extracts or sections in this case" in _system_prompt(False)


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
        # Making the assistant sociable must not loosen the rule that
        # regulations are answered from the extracts alone.
        for p in (_system_prompt(True), _system_prompt(False)):
            assert "answer ONLY from the regulation extracts provided" in p
            assert "Never state a rule that is not in the extracts" in p
            assert "Do not improvise a rule, a deadline, a percentage or a penalty" in p


def test_the_default_prompt_is_the_no_record_one():
    # `SYSTEM_PROMPT` is still exported for callers that never supply a record;
    # it must not quietly become the permissive variant.
    assert SYSTEM_PROMPT == _system_prompt(False)
