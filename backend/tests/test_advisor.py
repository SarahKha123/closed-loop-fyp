"""Chat history is capped so small local models don't overflow their context."""

from app.services.advisor import trim_history


def test_trim_keeps_system_and_last_turns():
    msgs = [{"role": "system", "content": "s"}]
    for i in range(30):
        msgs += [{"role": "user", "content": f"q{i}"}, {"role": "assistant", "content": f"a{i}"}]
    msgs.append({"role": "user", "content": "latest"})
    out = trim_history(msgs, max_turns=10)
    assert out[0] == {"role": "system", "content": "s"}
    assert len(out) == 1 + 20
    assert out[-1]["content"] == "latest"


def test_short_history_unchanged():
    msgs = [{"role": "system", "content": "s"}, {"role": "user", "content": "hi"}]
    assert trim_history(msgs) == msgs
