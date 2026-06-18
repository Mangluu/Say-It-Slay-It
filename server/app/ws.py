"""Room-based WebSocket relay. The laptop game connects as role=game; phones
connect as role=controller with a slot (0/1). Controller messages are forwarded
to the game; game messages are forwarded to controllers. One process, no second
server. Single-room LAN so this stays tiny.
"""
import json
from typing import Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect


class Room:
    def __init__(self):
        self.game: Optional[WebSocket] = None
        self.controllers: Dict[int, WebSocket] = {}


class Hub:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def room(self, code: str) -> Room:
        return self.rooms.setdefault(code, Room())


hub = Hub()


async def _send(ws: Optional[WebSocket], obj: dict):
    if ws is None:
        return
    try:
        await ws.send_text(json.dumps(obj))
    except Exception:
        pass


async def endpoint(ws: WebSocket, role: str, room: str, slot: int):
    await ws.accept()
    r = hub.room(room)
    if role == "game":
        r.game = ws
        # tell the game which controllers are already connected
        for s in list(r.controllers.keys()):
            await _send(ws, {"type": "join", "slot": s})
    else:
        r.controllers[slot] = ws
        await _send(r.game, {"type": "join", "slot": slot})
        await _send(ws, {"type": "joined", "slot": slot})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if role == "controller":
                data["slot"] = slot
                await _send(r.game, data)
            else:
                target = data.get("slot")
                if target is not None and target in r.controllers:
                    await _send(r.controllers[target], data)
                else:
                    for c in list(r.controllers.values()):
                        await _send(c, data)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if role == "game" and r.game is ws:
            r.game = None
        elif role == "controller" and r.controllers.get(slot) is ws:
            del r.controllers[slot]
            await _send(r.game, {"type": "leave", "slot": slot})
