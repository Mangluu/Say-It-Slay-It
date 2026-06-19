"""Session logging: store EVERYTHING to disk under server/logs so a session can be
reviewed afterwards, and so we can later train the CPU AI on real play. Writes a
per-run JSONL event log plus the raw audio clips and generated sprite PNGs.

CRITICAL: event() must NEVER block its caller. It is called from the async WebSocket
handler on every controller input (tens of times a second); doing file IO there
stalls the relay (player movement) and starves the LLM/ASR. So event() only enqueues;
a single background thread owns the file (kept open) and drains the queue.

Layout:
  server/logs/session-<stamp>.jsonl   one JSON object per line: {t, kind, ...}
  server/logs/audio/<stamp>.<ext>     every shouted clip sent to /asr
  server/logs/sprites/<hash>.png      every generated weapon sprite
"""
import json
import os
import queue
import threading
import time

_LOGDIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "logs"))
_q: "queue.Queue" = queue.Queue(maxsize=20000)
_started = False
_start_lock = threading.Lock()
_path = None


def _ensure():
    global _started, _path
    if _started:
        return
    with _start_lock:
        if _started:
            return
        os.makedirs(os.path.join(_LOGDIR, "audio"), exist_ok=True)
        os.makedirs(os.path.join(_LOGDIR, "sprites"), exist_ok=True)
        _path = os.path.join(_LOGDIR, f"session-{time.strftime('%Y%m%d-%H%M%S')}.jsonl")
        threading.Thread(target=_writer, daemon=True).start()
        _started = True


def _writer():
    with open(_path, "a", encoding="utf-8") as f:
        while True:
            rec = _q.get()
            try:
                f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
                # drain a burst then flush once, so high-rate input logging is cheap
                for _ in range(500):
                    try:
                        f.write(json.dumps(_q.get_nowait(), ensure_ascii=False, default=str) + "\n")
                    except queue.Empty:
                        break
                f.flush()
            except Exception as e:
                print("[log] write failed:", e)


def event(kind: str, **data):
    """Enqueue one event. Never blocks; drops the event if the queue is somehow full."""
    try:
        _ensure()
        rec = {"t": round(time.time(), 3), "kind": kind}
        data.pop("t", None)  # never let a payload clobber the server timestamp
        rec.update(data)
        _q.put_nowait(rec)
    except queue.Full:
        pass  # logging must never block gameplay
    except Exception as e:
        print("[log] event failed:", e)


def save_audio(data: bytes, ext: str) -> str:
    # called once per shout (infrequent), safe to write directly
    try:
        _ensure()
        name = f"{time.strftime('%H%M%S')}-{os.urandom(3).hex()}{ext or '.webm'}"  # unique: no same-ms overwrite
        p = os.path.join(_LOGDIR, "audio", name)
        with open(p, "wb") as f:
            f.write(data)
        return os.path.relpath(p, _LOGDIR).replace("\\", "/")
    except Exception as e:
        print("[log] save_audio failed:", e)
        return ""


def save_sprite(prompt: str, data: bytes) -> str:
    # called once per unique forge (infrequent), safe to write directly
    try:
        _ensure()
        import hashlib
        h = hashlib.sha1(prompt.encode("utf-8")).hexdigest()[:10]
        p = os.path.join(_LOGDIR, "sprites", f"{h}.png")
        with open(p, "wb") as f:
            f.write(data)
        return os.path.relpath(p, _LOGDIR).replace("\\", "/")
    except Exception as e:
        print("[log] save_sprite failed:", e)
        return ""
