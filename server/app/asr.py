"""Voice -> text for the forge beat. faster-whisper on CPU by default: the GPU
ctranslate2 path can HARD-crash the uvicorn process on Blackwell (a native abort
Python can't catch), and CPU base.en transcribes a 2-4s clip in ~1-2s while
leaving VRAM for Ollama + SD-Turbo. Set MICDROP_ASR_DEVICE=cuda to try the GPU."""
import os

_model = None
_kind = "none"


def _load():
    global _model, _kind
    if _model is not None:
        return _model
    from faster_whisper import WhisperModel
    dev = os.environ.get("MICDROP_ASR_DEVICE", "cpu")
    if dev == "cuda":
        try:
            _model = WhisperModel("small.en", device="cuda", compute_type="float16")
            _kind = "cuda/float16"
        except Exception as e:
            print("[asr] CUDA load failed, falling back to CPU:", e)
    if _model is None:
        _model = WhisperModel("base.en", device="cpu", compute_type="int8")
        _kind = "cpu/int8"
    print("[asr] model ready:", _kind)
    return _model


def transcribe(path: str) -> str:
    m = _load()
    segments, _info = m.transcribe(
        path, beam_size=1, language="en", vad_filter=True, temperature=0.0,
        condition_on_previous_text=False,
        initial_prompt="A short funny weapon idea, like a flaming rubber duck or a swarm of angry bees.",
    )
    return " ".join(s.text for s in segments).strip()


def warm():
    try:
        _load()
    except Exception as e:
        print("[asr] warm failed:", e)
