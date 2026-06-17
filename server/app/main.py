"""MIC DROP backend: forging (P3), later ASR (P4) + sprites (P5). One process."""
import os

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import llm

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
