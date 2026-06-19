"""Voice -> text for the live forge. faster-whisper on CPU by default: the GPU
ctranslate2 path can HARD-crash uvicorn on Blackwell (a native abort Python can't
catch), and CPU leaves VRAM for Ollama + SD-Turbo. Default model is small.en
(much better than base.en on noisy phone clips); set MICDROP_ASR_MODEL to change,
MICDROP_ASR_DEVICE=cuda to try the GPU."""
import os
import threading

_model = None
_kind = "none"
_load_lock = threading.Lock()   # one-time model construction
_infer_lock = threading.Lock()  # CTranslate2 decode state is not concurrent-safe


def _load():
    global _model, _kind
    if _model is not None:
        return _model
    with _load_lock:
        if _model is not None:  # another thread built it while we waited
            return _model
        from faster_whisper import WhisperModel
        name = os.environ.get("MICDROP_ASR_MODEL", "small.en")
        dev = os.environ.get("MICDROP_ASR_DEVICE", "cpu")
        model = None
        if dev == "cuda":
            try:
                model = WhisperModel(name, device="cuda", compute_type="float16")
                _kind = "cuda/" + name
            except Exception as e:
                print("[asr] CUDA load failed, falling back to CPU:", e)
        if model is None:
            model = WhisperModel(name, device="cpu", compute_type="int8")
            _kind = "cpu/" + name
        _model = model  # publish only once fully built
        print("[asr] model ready:", _kind)
    return _model


def transcribe(path: str) -> str:
    """Transcribe a short shout into a few words. Tuned to reject room noise: VAD
    trims silence, and segments that look like non-speech or low-confidence guesses
    (high no_speech_prob / low avg_logprob) are dropped instead of hallucinated.
    Serialized: faster-whisper cannot decode two clips at once on one model."""
    m = _load()
    with _infer_lock:
        segments, _info = m.transcribe(
            path,
            beam_size=1,  # greedy: much less CPU + latency (it was contending with the LLM)
            language="en",
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=120),
            no_speech_threshold=0.5,
            log_prob_threshold=-1.0,
            # bias toward short concrete objects/weapons, not sentences
            initial_prompt="A short funny weapon or object: a flaming rubber duck, a frying pan, a swarm of bees, a keyboard.",
        )
        parts = []
        for s in segments:  # the generator decodes lazily, so consume it INSIDE the lock
            if getattr(s, "no_speech_prob", 0.0) > 0.6:
                continue
            if getattr(s, "avg_logprob", 0.0) < -1.1:
                continue
            parts.append(s.text)
    text = " ".join(parts).strip().strip(".,!?;:").strip()
    # a weapon phrase is a few words; drop rambling / repeated noise transcriptions
    words = text.split()
    if len(words) > 6:
        text = " ".join(words[:6])
    if len(text) < 2:
        return ""
    return text


def warm():
    try:
        _load()
    except Exception as e:
        print("[asr] warm failed:", e)
