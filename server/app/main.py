"""MIC DROP backend: forging (P3), later ASR (P4) + sprites (P5). One process."""
import asyncio
import os

# All model weights (SD-Turbo, faster-whisper) are already cached locally, so force
# OFFLINE loads. Without this, from_pretrained / faster-whisper do an HF Hub network
# check on load that HANGS for minutes on a blocked or flaky venue network, wedging the
# whole image/ASR warm thread (observed at startup). Must be set before any transformers
# / diffusers / faster-whisper import. Set HF_HUB_OFFLINE=0 explicitly only to add a NEW model.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import socket
import tempfile
import time

from fastapi import FastAPI, File, Response, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from . import llm, log, ws as wsmod

CONTROLLER_HTML = os.path.join(os.path.dirname(__file__), "..", "controller", "index.html")


def _lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

app = FastAPI(title="Say It, Slay It backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

SPRITES = os.environ.get("MICDROP_SPRITES", "1") == "1"


class ForgeReq(BaseModel):
    phrase: str
    playerId: int = 0


class SpriteReq(BaseModel):
    prompt: str


class LogReq(BaseModel):
    events: list = []


@app.on_event("startup")
def _startup():
    import threading
    threading.Thread(target=llm.warm, daemon=True).start()  # pre-warm Qwen OFF the startup path
    from . import asr  # warm faster-whisper so the first shout isn't a cold download/load
    threading.Thread(target=asr.warm, daemon=True).start()
    if SPRITES:  # warm SD-Turbo in the background so the first in-game sprite is fast
        from . import images
        threading.Thread(target=images.warm, daemon=True).start()


@app.get("/health")
def health():
    return {"ok": True, "model": llm.MODEL, "sprites": SPRITES}


@app.post("/forge/item")
def forge_item(req: ForgeReq):
    t0 = time.time()
    res = llm.forge_item(req.phrase)
    log.event("forge_item", phrase=req.phrase, playerId=req.playerId, result=res, ms=int((time.time() - t0) * 1000))
    return res


@app.post("/forge/sprite")
def forge_sprite(req: SpriteReq):
    if not SPRITES:
        return Response(status_code=204)
    from . import images  # lazy import so the forge path works without torch
    t0 = time.time()
    try:
        data = images.generate_sprite(req.prompt)
        path = log.save_sprite(req.prompt, data)
        log.event("forge_sprite", prompt=req.prompt, bytes=len(data), ms=int((time.time() - t0) * 1000), file=path)
        return Response(content=data, media_type="image/png")
    except Exception as e:
        print("[sprite] error:", e)
        log.event("forge_sprite_error", prompt=req.prompt, error=str(e), ms=int((time.time() - t0) * 1000))
        return Response(status_code=204)


@app.get("/netinfo")
def netinfo():
    return {"lan": _lan_ip(), "port": 8000}


@app.post("/log")
def client_log(req: LogReq):
    for e in req.events:
        if isinstance(e, dict):
            kind = e.get("kind", "client")
            log.event(kind, **{k: v for k, v in e.items() if k != "kind"})
    return {"ok": True}


@app.get("/controller", response_class=HTMLResponse)
def controller():
    with open(CONTROLLER_HTML, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.post("/asr")
async def asr_endpoint(audio: UploadFile = File(...)):
    from . import asr  # lazy: loads faster-whisper on first use
    data = await audio.read()
    suffix = os.path.splitext(audio.filename or "clip.webm")[1] or ".webm"
    audio_path = log.save_audio(data, suffix)  # keep every clip for later review
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(data)
        path = f.name
    t0 = time.time()
    try:
        # transcribe is CPU-bound and multi-second; run it OFF the event loop so the
        # WebSocket relay (player input) keeps flowing while a shout is processed.
        text = await asyncio.to_thread(asr.transcribe, path)
    except Exception as e:
        print("[asr] error:", e)
        text = ""
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass
    log.event("asr", text=text, audio=audio_path, bytes=len(data), ms=int((time.time() - t0) * 1000))
    return {"text": text}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    role = websocket.query_params.get("role", "controller")
    room = (websocket.query_params.get("room", "MICDROP") or "MICDROP").upper()
    try:
        slot = int(websocket.query_params.get("slot", "0") or 0)
    except ValueError:
        slot = 0
    await wsmod.endpoint(websocket, role, room, slot)
