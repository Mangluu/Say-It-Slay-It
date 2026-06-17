"""MIC DROP backend: forging (P3), later ASR (P4) + sprites (P5). One process."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import llm

app = FastAPI(title="MIC DROP backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


class ForgeReq(BaseModel):
    phrase: str
    playerId: int = 0


@app.on_event("startup")
def _startup():
    llm.warm()  # pre-warm Qwen so the first forge isn't slow


@app.get("/health")
def health():
    return {"ok": True, "model": llm.MODEL}


@app.post("/forge/item")
def forge_item(req: ForgeReq):
    return llm.forge_item(req.phrase)
