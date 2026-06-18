"""MIC DROP backend: forging (P3), later ASR (P4) + sprites (P5). One process."""
import os
import socket
import tempfile

from fastapi import FastAPI, File, Response, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from . import llm, ws as wsmod

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

app = FastAPI(title="MIC DROP backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

SPRITES = os.environ.get("MICDROP_SPRITES", "1") == "1"


class ForgeReq(BaseModel):
    phrase: str
    playerId: int = 0


class SpriteReq(BaseModel):
    prompt: str


@app.on_event("startup")
def _startup():
    llm.warm()  # pre-warm Qwen so the first forge isn't slow
    if SPRITES:  # warm SD-Turbo in the background so the first in-game sprite is fast
        import threading
        from . import images
        threading.Thread(target=images.warm, daemon=True).start()


@app.get("/health")
def health():
    return {"ok": True, "model": llm.MODEL, "sprites": SPRITES}


@app.post("/forge/item")
def forge_item(req: ForgeReq):
    return llm.forge_item(req.phrase)


@app.post("/forge/sprite")
def forge_sprite(req: SpriteReq):
    if not SPRITES:
        return Response(status_code=204)
    from . import images  # lazy import so the forge path works without torch
    try:
        data = images.generate_sprite(req.prompt)
        return Response(content=data, media_type="image/png")
    except Exception as e:
        print("[sprite] error:", e)
        return Response(status_code=204)


@app.get("/netinfo")
def netinfo():
    return {"lan": _lan_ip(), "port": 8000}


@app.get("/controller", response_class=HTMLResponse)
def controller():
    with open(CONTROLLER_HTML, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.post("/asr")
async def asr_endpoint(audio: UploadFile = File(...)):
    from . import asr  # lazy: loads faster-whisper on first use
    data = await audio.read()
    suffix = os.path.splitext(audio.filename or "clip.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(data)
        path = f.name
    try:
        text = asr.transcribe(path)
    except Exception as e:
        print("[asr] error:", e)
        text = ""
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass
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
