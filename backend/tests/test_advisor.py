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


def test_ollama_low_resource_options(monkeypatch):
    from app.services import ollama_client

    monkeypatch.delenv("OLLAMA_NUM_THREAD", raising=False)
    monkeypatch.setenv("OLLAMA_CONTEXT_LENGTH", "2048")
    opts = ollama_client._chat_options()
    assert opts["options"] == {"num_ctx": 2048, "num_predict": 1024} and opts["keep_alive"] == "10m"
    monkeypatch.setenv("OLLAMA_NUM_THREAD", "2")
    assert ollama_client._chat_options()["options"]["num_thread"] == 2
