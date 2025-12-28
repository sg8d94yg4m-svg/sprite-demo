#!/usr/bin/env python3
"""WS+REST server per missioni (Codespaces friendly)

REST:
  POST /setMissione
    - JSON: {"scaffale":4,"posto":12,"livello":1,"missione":2}
    - oppure text/plain: "4-12-1-2"

  GET /checkMissione
    - ritorna l'ultima missione ricevuta (fallback/polling)

WS:
  GET /ws
    - broadcast a tutti i client le missioni ricevute
    - accetta anche messaggi in ingresso (JSON o "S-P-L-M") e li ribroadcasta

Static:
  GET /
    - serve index.html e assets
"""

import json, re, time
from pathlib import Path
from aiohttp import web, WSMsgType

ROOT = Path(__file__).resolve().parent
clients = set()

_last_mission = None
_last_seq = 0

def parse_mission(payload):
    if payload is None:
        return None

    if isinstance(payload, dict):
        try:
            return {
                "scaffale": int(payload["scaffale"]),
                "posto": int(payload["posto"]),
                "livello": int(payload["livello"]),
                "missione": int(payload["missione"]),
            }
        except Exception:
            return None

    if isinstance(payload, (bytes, bytearray)):
        payload = payload.decode("utf-8", "ignore")

    s = str(payload).strip()

    # JSON string?
    try:
        obj = json.loads(s)
        if isinstance(obj, dict):
            return parse_mission(obj)
    except Exception:
        pass

    m = re.match(r"^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$", s)
    if not m:
        return None

    return {
        "scaffale": int(m.group(1)),
        "posto": int(m.group(2)),
        "livello": int(m.group(3)),
        "missione": int(m.group(4)),
    }

async def broadcast(mission: dict):
    msg = json.dumps(mission, separators=(",", ":"))
    dead = []
    for ws in list(clients):
        try:
            await ws.send_str(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

async def _store_and_publish(mission: dict):
    global _last_mission, _last_seq
    _last_seq += 1
    _last_mission = {**mission, "seq": _last_seq, "ts": int(time.time() * 1000)}
    await broadcast(_last_mission)

async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    await ws.send_str(json.dumps({"type":"hello","info":"connected"}, separators=(",", ":")))

    async for msg in ws:
        if msg.type == WSMsgType.TEXT:
            m = parse_mission(msg.data)
            if m:
                await _store_and_publish(m)
        elif msg.type == WSMsgType.BINARY:
            m = parse_mission(msg.data)
            if m:
                await _store_and_publish(m)
        elif msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
            break

    clients.discard(ws)
    return ws

async def set_mission_handler(request):
    try:
        if request.content_type and request.content_type.startswith("application/json"):
            payload = await request.json()
        else:
            payload = await request.text()
    except Exception:
        payload = None

    m = parse_mission(payload)
    if not m:
        return web.json_response({"ok": False, "error": "Invalid payload. Use JSON or 'S-P-L-M'."}, status=400)

    await _store_and_publish(m)
    return web.json_response({"ok": True, "mission": _last_mission})

async def check_mission_handler(_request):
    return web.json_response({"ok": True, "mission": _last_mission})

def make_app():
    app = web.Application()
    app.router.add_post("/setMissione", set_mission_handler)
    app.router.add_get("/checkMissione", check_mission_handler)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/", lambda req: web.FileResponse(ROOT / "index.html"))
    app.router.add_static("/", ROOT, show_index=True)
    return app

if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=8080)
