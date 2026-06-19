"""Runtime weapon sprites: SD-Turbo (1 step) -> rembg transparent PNG, cached by
prompt hash. Loaded lazily so the forge path stays up even if image gen is slow
or absent. The game never blocks on a sprite (shows a placeholder, swaps later).
"""
import hashlib
import io
import os
import threading

CACHE = os.path.join(os.path.dirname(__file__), "..", "cache", "sprites")
_pipe = None
_lock = threading.Lock()
_load_lock = threading.Lock()


def _load():
    global _pipe
    if _pipe is not None:
        return _pipe
    with _load_lock:
        if _pipe is None:
            import torch
            from diffusers import AutoPipelineForText2Image
            p = AutoPipelineForText2Image.from_pretrained(
                "stabilityai/sd-turbo", torch_dtype=torch.float16, variant="fp16")
            p = p.to("cuda")
            try:
                p.upcast_vae()  # avoid fp16 VAE artifacts
            except Exception:
                pass
            _pipe = p
    return _pipe


def warm():
    try:
        _load()
        generate_sprite("a glowing orb", _warm=True)
    except Exception as e:
        print("[images] warm failed:", e)


def generate_sprite(prompt: str, _warm: bool = False) -> bytes:
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1((prompt or "").lower().encode()).hexdigest()[:16]
    path = os.path.join(CACHE, key + ".png")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()

    pipe = _load()
    # Force ONE clean centered object (SD-Turbo otherwise scatters several copies),
    # on a flat background so the rembg cutout is clean.
    full = (f"{prompt}, a single object, one item, centered, simple cartoon sticker, "
            f"thick black outline, flat white background, no text, no words, no scene")
    with _lock:  # diffusers scheduler is not thread-safe; serialize on one GPU
        img = pipe(prompt=full, num_inference_steps=4, guidance_scale=0.0,
                   height=512, width=512).images[0]

    try:
        from rembg import remove
        img = remove(img)  # -> RGBA transparent cutout
    except BaseException as e:  # rembg can raise SystemExit if onnxruntime is missing
        print("[images] rembg unavailable, using opaque sprite:", e)

    buf = io.BytesIO()
    img.save(buf, "PNG")
    data = buf.getvalue()
    if not _warm:
        with open(path, "wb") as f:
            f.write(data)
    return data
