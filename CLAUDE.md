# MIC DROP — Build Spec and Context for Claude Code

Working title: **MIC DROP** (alternatives: BIG MOUTH BRAWLERS, SAY IT SLAY IT). Pick the final name in Phase 6.

This document is the single source of truth for the build. It is written to be dropped into the repo root so you (Claude Code) load it automatically. Read it fully before scaffolding. When something here conflicts with a quick assumption, this file wins. When you make a design decision during the build, append it to the "Decision log" at the bottom.

Formatting rule for this project: never use em-dashes in any generated text, code comments, UI copy, or AI prompt templates. Use commas, colons, or parentheses instead.

---

## 0. TL;DR

A local 2-player, side-view physics **brawler** where your weapons are generated from what you shout. Before each round you speak a few things into your phone; a local LLM turns each phrase into a funny-but-fair weapon, a fast diffusion model paints its sprite, and then you brawl in real time, lobbing your absurd arsenal at your opponent until one of you is knocked off the stage.

Core loop, three lines:
1. **Forge beat** (calm, turn-based): each player shouts 2 to 3 things, we generate their arsenal.
2. **Brawl** (fast, simultaneous): move, jump, dash, throw items, knockback, ring-out.
3. **Result**: best of 3, leaderboard updates, rematch.

All generation happens in the calm forge beat, never mid-combat, so the fight always feels snappy.

---

## 1. The pitch and why it wins

The hook is comedy plus spectacle: two people improvise trash talk into weapons and then fight with them. It is instantly readable to a crowd, it rewards creativity, and every match is different. It is built for a summer-school showcase, so it must be walk-up friendly, fast per session, and competitive (people love chasing a score and dethroning a champion).

Award angles this targets: innovation (runtime generative content driving real gameplay), audience or people's choice (it is loud, funny, and social), and "best use of AI" (local models doing something that actually changes the game, not a gimmick).

The single most important quality bar: **juice and readability**. Hit-stop, screenshake, particles, chunky knockback, satisfying sound, and silhouettes you can read from across a room. A simple mechanic that feels incredible beats a complex one that feels mushy.

---

## 2. Hardware and environments

Two machines, two roles.

| Machine | Specs | Role |
|---|---|---|
| MacBook Air M5 | 256 GB | Prototyping the game client and the mock content pipeline. No heavy AI here. |
| MSI Stealth 18 | 64 GB RAM, RTX 5090 Laptop (24 GB VRAM) | Real AI services plus the game. This is the showcase machine. |

Hard implication for the architecture: **the game must run fully without any AI models**, using a mock content provider, so it is developable on the Air and so the showcase has a guaranteed fallback. The real models are required only on the MSI and are swapped in behind an interface (see Section 5).

RTX 5090 caution: it is Blackwell (sm_120). Use a CUDA 12.x build of PyTorch that supports it. Verify current versions at setup time; do not assume an old wheel works. If a model backend fails on the 5090, that is almost always a CUDA or torch version mismatch.

---

## 3. Locked design decisions

These are settled. Do not relitigate them mid-build.

1. **Perspective: side-view platform brawler** (Smash-like). Gravity, platforms, jump and double-jump, dash, ring-out plus an HP/damage-percent knockback model. Not Tekken (a real fighting sim is out of scope), not top-down.
2. **Items: controlled chaos.** Wild flavor, fair power. The LLM owns names, looks, effects, and voice barks. A fixed server-side stat layer owns all numbers. Chaos comes from effect variety and symmetric random events, never from stat inflation. Details in Section 6.
3. **Modes:** Solo Score Attack (the walk-up leaderboard hook) and Versus 1v1 (winner-stays-on, win-streak leaderboard). Shared combat code.
4. **Client: web (PixiJS plus a 2D physics lib).** Not Godot, because a polished Godot game needs a human in the visual editor and cannot be fully owned by an agent. Web can be written, run, screenshotted, and verified end to end with no editor. pygame-ce is the only acceptable plan B if we ever want a single-language Python app; do not switch without a strong reason.
5. **Backend: Python FastAPI** orchestrating local AI (Whisper, Ollama LLM, diffusion). It also relays controller input and persists leaderboards.
6. **Controllers: phones as controller and microphone**, connected over the local network by QR code, with USB gamepad and split keyboard as fallbacks. Input is unified behind one interface.

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Game client | PixiJS (render) + planck.js or matter.js (2D physics) + Vite + TypeScript | planck (Box2D port) preferred for stable platformer physics; matter.js is fine and simpler. Decide in P1. |
| Backend | Python 3.11+, FastAPI, uvicorn, websockets | One process hosts REST, websockets, and static controller page. |
| Speech to text | faster-whisper (CTranslate2), model "small" or "medium" | whisper.cpp is an acceptable alternative. Push-to-talk clips of 2 to 4 seconds. |
| LLM | Ollama serving Qwen2.5-7B-Instruct (Q4) | 14B if VRAM allows. Use JSON-constrained output. Llama 3.1 8B is a fine swap. |
| Image gen | SD-Turbo or SDXL-Turbo via diffusers (or ComfyUI API) | 1 to 4 steps at 512 px. Background removal via rembg. Cache by phrase hash. |
| Realtime transport | WebSocket over LAN | Fast enough for a brawler (roughly 10 to 30 ms). WebRTC not needed. |
| HTTPS for mic | mkcert or Caddy internal CA | Mobile browsers block getUserMedia over plain http. Mandatory for the phone mic. |
| Background removal | rembg (u2net) | Produces transparent PNG sprites. |

---

## 5. Architecture and data flow

```
[Player phones: controller webpage]  --ws-->  [FastAPI backend]  -->  [AI services]
        (touch input + push-to-talk mic)            |               faster-whisper
                                                     |               Ollama (LLM)
[Game client: laptop browser, fullscreen] <--ws-->   |               diffusers (images)
        (PixiJS render + physics, authoritative)     +-->  [disk cache + leaderboard json]
```

Authority split:
- **Game client is authoritative** for physics, combat, scoring, and round flow. It runs the simulation at 60 fps.
- **Backend is authoritative** for content generation, ASR, controller-input relay, and persistence.

Two abstractions are the backbone of the whole project. Build these first and never bypass them.

1. **ContentProvider** interface:
   - `forgeItem(phrase, playerId) -> ItemSpec`
   - `forgeArena(phrase) -> ArenaSpec`
   - Implementations: `MockProvider` (curated pool, instant, no models) and `LocalProvider` (calls the backend, which calls the models). The game only ever talks to the interface. A single config flag chooses the implementation, and the showcase "safe mode" forces `MockProvider`.

2. **InputSource** interface:
   - emits a normalized control state per player: `{ axisX, jump, throw, dash, special }`
   - Implementations: `KeyboardSource`, `GamepadSource`, `PhoneSource` (websocket). The game reads only the normalized state, so adding phones does not touch combat code.

This is the core de-risk of the project: the fun game loop is fully decoupled from both the AI and the networking.

---

## 6. Game design detail

### 6.1 Side-view combat
- Movement: run (axisX), jump, double-jump, air-dash. One light melee shove for spacing.
- Throw: launches the currently selected item from the arsenal as a physics projectile. Items either fly flat or lob in an arc depending on archetype.
- Damage model: Smash-style. Each fighter has a damage percent that rises as they take hits; higher percent means more knockback. KO by ring-out (knocked past the stage blast zone) or by an HP bar if you prefer a clearer readout for the crowd. Start with ring-out plus a visible damage percent; it reads best.
- Round: best of 3 in versus. 60 to 90 seconds per round target.

### 6.2 Controlled-chaos item system (the heart of the game)
Principle: **decouple funny from strong.** The LLM picks flavor and an archetype only. The server assigns every numeric stat from a fixed template for that archetype. This guarantees balance no matter what the model outputs.

LLM returns (and nothing more that affects power):
- `name` (string, capped length, PG-13)
- `archetype` (enum, from the allowed list below)
- `flavor` (one short line)
- `voiceBark` (2 to 4 words, optional)
- `visualPrompt` (string used for sprite generation)

Server owns the numbers via archetype templates. Starting values (tune in playtest, keep total power roughly equal across rows):

| Archetype | Damage | Throw cooldown | Proj size | Trajectory | Ammo | Special effect |
|---|---|---|---|---|---|---|
| heavy_bomb | 35 | 1.5 s | large | short lob | 3 | explode (AoE) |
| light_spam | 8 | 0.25 s | small | flat fast | 20 | slip / stagger |
| homing_pest | 12 | 0.7 s | small | homing | 8 | homing |
| boomerang | 18 | 1.0 s | medium | returns | 6 | hits on return |
| scatter | 5 x 6 | 1.2 s | small | spread cone | 5 | multi |
| sticky_trap | 5 | 0.9 s | medium | placed | 6 | slow zone |
| cloud | 3 / tick | 1.3 s | large | lobbed | 4 | lingering cloud |

Special effects are sidegrades, not upgrades. The "best" item depends on matchup and positioning, giving a loose rock-paper-scissors.

Symmetric chaos for big swings (fair because shared, not assigned):
- **Legendary pickup:** every 20 to 30 seconds a glowing super-item spawns center stage. Either player can sprint for it. Strong, telegraphed, contested.
- **Arena events** (hit both players equally): low gravity, item rain, a sweeping hazard, sudden darkness. Roll one occasionally for variety and laughs.

Validation and safety on every forge:
- Force the LLM to return strict JSON (Ollama `format: json` or a JSON schema). Validate server-side. If invalid, empty, off-topic, or timed out, fall back to a random item from the curated pool.
- PG-13 system prompt plus a denylist filter on names (summer-school audience). Cap name length. Basic NSFW filter on generated images, else use a placeholder sprite.

### 6.3 Modes
- **Solo Score Attack:** one human vs CPU waves. Forge your arsenal between waves. Score from damage dealt, KOs, combo multiplier, time survived, and style bonus (variety and absurdity of items used). Difficulty ramps per wave. Persistent high-score leaderboard with 3-letter initials, projected on screen. This is the walk-up-alone hook; keep runs to 60 to 90 seconds.
- **Versus 1v1:** two humans, best of 3, simultaneous real time. Winner stays on. Track win streaks as a King-of-the-Hill leaderboard so a queue forms to dethrone the champ.
- **Weapon Hall of Fame:** an attract-mode screen that cycles the funniest generated items of the session (name plus sprite). Doubles as a crowd draw and rewards creativity.

### 6.4 CPU AI (solo only)
Simple finite state machine: seek the player, strafe, dodge when a projectile is near (check incoming projectile proximity and jump or dash), throw on a cooldown, retreat when at high damage percent. Scale aggression and accuracy by wave. It only needs to be fun, not smart.

---

## 7. Generation pipeline (backend)

### 7.1 Endpoints
- `POST /forge/item` body `{ phrase, playerId }` returns `ItemSpec`.
- `POST /forge/arena` body `{ phrase }` returns `ArenaSpec`.
- `POST /asr` multipart audio clip returns `{ text }`.
- `GET /leaderboard?mode=solo|versus` and `POST /leaderboard`.
- `GET /controller` serves the phone controller page (HTTPS).
- `WS /ws?role=game|controller&room=CODE` single websocket endpoint, role-routed.

### 7.2 ItemSpec schema
```json
{
  "id": "itm_8f3a",
  "sourcePhrase": "flaming rubber duck of doom",
  "name": "Flaming Rubber Duck of Doom",
  "archetype": "heavy_bomb",
  "flavor": "Quacks once, then detonates.",
  "voiceBark": "QUACK. BOOM.",
  "visualPrompt": "a flaming rubber duck, game item sprite, sticker style, vibrant, simple background",
  "stats": { "damage": 35, "throwCooldown": 1.5, "projectileScale": 1.6, "ammo": 3, "trajectory": "lob", "special": "explode" },
  "spriteUrl": null,
  "rarity": "common"
}
```
`stats` is filled entirely by the server from the archetype template, not by the LLM. `spriteUrl` is null until image gen completes; the game shows a placeholder silhouette and swaps the sprite in when ready.

### 7.3 LLM prompt strategy
System prompt outline (keep it tight, force JSON):
- Role: "You generate game weapons from a short phrase. Output strict JSON only, matching this schema. Pick archetype from this exact list. Keep names funny and PG-13. Do not include stats; the game assigns them."
- Provide the archetype list and one or two few-shot examples.
- Set Ollama `format: json`, low max tokens, temperature around 0.9 for variety.
- Always validate and clamp server-side. Timeout at roughly 2 seconds, then fall back to the pool.

### 7.4 Image pipeline
- Prompt template: `"{name}, game item sprite, centered, sticker style, vibrant, clean simple background"`.
- SD-Turbo or SDXL-Turbo, 1 to 4 steps, 512 px, guidance off (turbo models).
- Background removal with rembg, output transparent PNG, downscale to the in-game size.
- Cache by a hash of the normalized phrase, so repeats are instant and the booth warms up over the day.
- If generation is slow under load, keep the placeholder silhouette and swap when the PNG lands. Never block the brawl on an image.

### 7.5 Concurrency
Generation is bursty (the forge beat). Serialize per model with a small queue, pre-warm all models at startup, and keep them resident. Do not load models per request.

---

## 8. Controller (phone) details

- Backend serves `/controller` over HTTPS to phones on the LAN. The page is a mobile web app: an on-screen joystick plus Jump, Throw, Dash, Special buttons, and a large push-to-talk Mic button used only in the forge beat.
- Connect flow: the game screen shows a QR code encoding the HTTPS LAN URL plus a short room code. Phone scans, opens the page, joins the room as P1 or P2.
- Transport: websocket. Controller sends input state at about 30 to 60 Hz (coalesce, send on change). Audio for the forge beat is recorded with getUserMedia on push-to-talk (2 to 4 seconds) and uploaded to `/asr`.
- Mic requires HTTPS (see stack). Touch controls alone would work over http, but do HTTPS for everything to keep it simple.
- Fallbacks: `GamepadSource` (2 USB pads) and a split keyboard (P1 = A or D, W, F, G; P2 = arrows, comma, period). All three feed the same normalized `InputSource`.
- Latency: a casual brawler tolerates LAN websocket latency. Apply inputs on the next frame. No client-side prediction or rollback needed.

---

## 9. VRAM and performance budget (24 GB)

Load once, keep resident. Comfortable baseline:

| Model | Approx VRAM | Notes |
|---|---|---|
| faster-whisper small | 1 to 2 GB | medium if accuracy needs it |
| Qwen2.5-7B-Instruct Q4 | 5 to 6 GB | 14B (~9 to 11 GB) if headroom |
| SD-Turbo / SDXL-Turbo | 3 to 5 GB | SDXL-Turbo for nicer sprites if it fits |

Baseline total is roughly 10 to 13 GB, leaving plenty of the 24 GB headroom. Prefer headroom over maxing models; a stable booth beats a prettier sprite. The 5090 is the AI workhorse here; the game rendering is trivial for it.

---

## 10. Project structure

```
micdrop/
  client/                      # web game, Vite + TS
    src/
      main.ts
      game/                    # entities, physics, combat, camera, juice
      modes/                   # solo.ts, versus.ts
      content/                 # ContentProvider: mock.ts, remote.ts
      input/                   # InputSource: keyboard.ts, gamepad.ts, phone.ts
      ui/                      # hud, menus, leaderboard, hall_of_fame
      audio/                   # web audio synth + sfx
      net/                     # ws client
    public/
    index.html
  server/                      # FastAPI backend
    app/
      main.py
      forge.py                 # /forge/item, /forge/arena
      asr.py                   # whisper
      llm.py                   # ollama client, prompt, validate, clamp
      images.py                # diffusion, rembg, cache
      ws.py                    # role-routed websocket relay
      leaderboard.py
      content_pool.py          # curated fallback items (the mock source of truth)
    controller/                # phone controller web page (static)
    certs/                     # mkcert certs
    cache/                     # sprites, arenas, item json, leaderboard
  shared/
    archetypes.json            # the stat templates, shared by client and server
    item_schema.json
  scripts/
    dev_client.sh
    dev_server.sh
    setup_models.sh            # installs/pulls Ollama model, downloads diffusion + whisper
    run_show.sh                # launches backend (https) + client + Chrome kiosk
  CLAUDE.md
```

---

## 11. Phased build plan (48 hours)

Every phase ends in something runnable. If time runs short, P1 to P3 already give a complete, fun, competitive game; P4 and P5 are the high-wow, cuttable layers.

| Phase | Hours | Deliverable |
|---|---|---|
| P0 Scaffold | 0 to 2 | Repo, run scripts, client renders a stage, one keyboard-controlled fighter that runs and jumps. |
| P1 Combat + juice | 2 to 10 | Full side-view combat using MOCK items from the curated pool. Two fighters, gamepad support, throwing, knockback, ring-out, particles, screenshake, hit-stop, synth sound. This alone is a fun game. |
| P2 Solo + leaderboard | 10 to 16 | Solo Score Attack: CPU waves, scoring, combo, style bonus, local high-score leaderboard with initials. |
| P3 LLM forging + Versus | 16 to 24 | Backend up. Forge items from TYPED text via the LLM, swap ContentProvider mock to local, validate and clamp, fallback. Versus 1v1 with winner-stays-on streak leaderboard. |
| P4 Phones + voice | 24 to 32 | Phone controller page (touch) over HTTPS, QR join, websocket input. Per-player phone mic plus Whisper, so forging is by voice. |
| P5 Image gen | 32 to 40 | Item sprite generation plus arena backdrop generation, background removal, caching. Weapon Hall of Fame attract screen. |
| P6 Polish + ops | 40 to 48 | Balance pass, audio pass, showcase ops (router, certs, kiosk, safe mode), fallback hardening, record a short trailer or gif, lock the name. |

Order matters: build the InputSource and ContentProvider interfaces in P0/P1 so P3 and P4 are clean swaps, not rewrites.

---

## 12. Showcase operations checklist

- Bring a travel router, or run the laptop hotspot, so phones and laptop share a private LAN. Do not trust venue or campus Wi-Fi (it often isolates clients).
- Install the mkcert CA and serve the controller over HTTPS. Test phone mic before the event.
- Pre-warm all models and pre-cache a starter pool of items and one or two arenas.
- "Safe mode" toggle that forces MockProvider (curated pool), in case the AI misbehaves live. Nobody should be able to tell when it flips.
- Chrome in kiosk fullscreen, system sleep disabled, screen-saver off.
- Two USB gamepads on hand as the input fallback.
- Profanity filter on, family-friendly defaults for a summer-school crowd.
- Leaderboard persists to disk, with a daily reset option.
- Print the QR code large on a card next to the booth.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Realtime networking eats time or flakes at the booth | Build keyboard/gamepad first behind InputSource; phones are an additive source; gamepad is the live fallback; local router avoids client isolation. |
| Phone mic blocked | HTTPS via mkcert from the start; test on real phones in P4, not at the venue. |
| Generation latency hurts flow | All gen is in the calm forge beat; placeholder silhouettes; cache by phrase; hard timeouts with pool fallback. |
| LLM outputs garbage or unsafe text | LLM picks only flavor plus archetype; server owns all stats; strict JSON, validation, denylist, length cap. |
| 5090 / Blackwell driver or torch mismatch | Pin a CUDA 12.x torch build that supports sm_120; verify at setup; smoke-test each model in setup_models.sh. |
| Scope creep | P1 to P3 is the shippable game; treat P4/P5 as bonus; cut ruthlessly. |
| Controller feel mushy | Tune deadzones, apply inputs next frame, keep movement forgiving; gamepad path for "serious" 1v1. |

---

## 14. First commands for Claude Code

Verify current versions as you go; these are the shape, not gospel.

Client:
```
npm create vite@latest client -- --template vanilla-ts
cd client && npm i pixi.js planck
npm run dev
```

Backend:
```
cd server
python -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" websockets faster-whisper diffusers transformers accelerate rembg pillow python-multipart
# install a CUDA 12.x torch build that supports the RTX 5090 (Blackwell), verify the current index URL
# Ollama:
ollama pull qwen2.5:7b-instruct
# HTTPS for the controller mic:
mkcert -install
mkcert <laptop-LAN-ip> localhost
uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem
```

Build P0 and P1 with `MockProvider` and `KeyboardSource` only. Do not touch the backend or any model until P3. Prove the game is fun on mocks first.

---

## 15. Open questions (decide during the build)

- Final name (P6).
- planck.js vs matter.js for physics (decide early in P1 by feel).
- Whisper "small" vs "medium" (accuracy vs VRAM, decide in P4).
- SD-Turbo vs SDXL-Turbo for sprites (quality vs speed on the 5090, decide in P5).
- HP bar vs pure ring-out for the KO readout (playtest which reads better for spectators).
- Optional non-control webcam flourish (reaction-cam, the player's face on their weapon card, or a shout-volume meter during the forge): include only if P6 has spare time. It must never touch the control or combat path. (Movement input itself is now closed: two phones, see Decision log.)

---

## 16. Decision log

Append dated entries here as you build, so context survives across sessions.

- (set up by handoff) Locked: side-view, controlled-chaos items, web client + Python backend, phones as controller and mic with gamepad fallback, Solo Score Attack plus Versus winner-stays-on.
- (2026-06-17) Control scheme settled: TWO PHONES for movement and actions, not webcam body-tracking. Reasons: (a) a precise physics platformer needs low-latency discrete input, which body-pose cannot deliver (pose is laggy and gross-grained, which would make the brawl feel mushy and break the juice bar); (b) two people in one webcam frame is genuinely hard (single-person pose tracks one body only; multi-pose is slower and loses player identity under occlusion as the two cross each other in a cramped shot); (c) two phones give clean per-player input isolation AND two close-up microphones, which materially improves Whisper accuracy in a loud showcase room. Embodiment now lives in the VOICE forge ("your voice forges your arsenal"), which is the crowd-readable hook and aligns with past summer-school winners that used voice. Webcam stays OUT of the control path. Keep one USB gamepad or keyboard mapping as the dead-simple fallback for a hotspot hiccup (the one remaining single point of failure).
- (2026-06-18) Re-decisions from a deep code/prior-art search (see Section 17): planck.js confirmed over matter.js (matter is floatier, wall-sticks). SD-Turbo is the live default, SDXL-Turbo only for a "hero" preview (latency on a shared GPU). LLM stays local (Ollama), not an API (offline LAN flex, zero per-play cost). Use the Pixi v8 particle port (spd789562/pixi-v8-particle-emitter), NOT the official @pixi/particle-emitter (it targets v6/v7 and breaks on Pixi 8). faster-whisper MUST use compute_type='float16' on the 5090 (int8 crashes on Blackwell). Fairness firewall is now structural: the ItemSpec JSON schema has ONLY string/enum fields, so grammar-constrained decoding makes it impossible for the LLM to emit numbers.

---

## 17. Reusable resources and prior art (deep search, 2026-06-18)

Verdict on reuse: there is NO clean, licensed, maintained Smash engine to fork, so the brawler stays our own thin fighter on planck.js. The big wins are libraries per layer, and patterns to learn from, not a base to clone.

### Starter kit (install in this order, dependency-correct)
1. Blackwell torch base: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128` (see Blackwell note below, verify on the laptop).
2. Client: `npm create pixi.js@latest mic-drop -- --template bundler-vite` (PixiJS 8 + Vite + TS, MIT).
3. Physics: `npm i planck` (planck.js, Box2D port, MIT). Port its /example OneSidedPlatform, CharacterCollision, RayCast.
4. LLM path: FastAPI + Ollama + ollama-python (all MIT). Pass the JSON Schema object to Ollama `format` for grammar-constrained 100% valid JSON.
5. ASR: faster-whisper (MIT), `compute_type='float16'`, model `small.en`/distil, `vad_filter=True`.
6. Sprites: diffusers (Apache-2.0) + stabilityai/sd-turbo (STAI Community License, free under $1M rev) + rembg (MIT, pre-download u2net for offline).
7. HTTPS for LAN: mkcert (BSD-3). Do this EARLY, the whole phone layer is dead without it.
8. Phone controller: nipplejs (MIT, virtual stick) + node-qrcode (MIT, encode the HTTPS hotspot URL + player slot).
9. Juice (last, additive): spd789562/pixi-v8-particle-emitter (MIT, the v8-correct one), howler.js (MIT), jsfxr (public domain, per-weapon SFX), tween.js (MIT), Kenney Impact Sounds (CC0).

### GPL / copyleft: STUDY ONLY, never copy code into the client/server
Project TUSSLE / universalSmashSystem (GPL-3.0), SuperTuxSmash (GPL), ComfyUI (GPL-3.0, we use raw diffusers anyway), AirConsole controls (GPL-2.0 + cloud-coupled). Avoid AirConsole/Playroom (paid/SaaS), HappyFunTimes (deprecated). Unstated licenses (pattern-reference only, confirm before lifting): turbokirichenko template, phonepad.js, stephendoddtech input starter.

### Learn-from references (patterns, not dependencies)
- Knockback math for the server stat-table: SmashWiki Knockback formula (https://www.ssbwiki.com/Knockback).
- Fixed-timestep loop (non-negotiable for stable physics): Gaffer "Fix Your Timestep!" (https://gafferongames.com/post/fix_your_timestep/).
- One-way platforms: iforce2d one-way walls (pre-solve `contact.setEnabled(false)`).
- Grounded check: foot-sensor or downward raycast, NOT a boolean (desyncs on multi-fixture contact). Tune linear damping, not friction.
- Game feel: "Juice it or lose it" (Jonasson/Purho) + Vlambeer "Art of Screenshake"; tie shake+hit-stop(3-8 frames, scale by damage%)+particles+sound to the SAME hit event.
- Forgiveness (huge perceived-quality, cheap): coyote time (~5 frames), jump buffering, half-gravity at apex (Celeste/Maddy Thorson).
- LLM JSON: pass the schema OBJECT not the string "json"; put name+archetype BEFORE long flavor fields; cache normalized-phrase -> ItemSpec (Infinite Craft determinism + a "first to summon" virality hook).
- Browser mic gotcha: getUserMedia needs a SECURE CONTEXT; it is undefined over http://LAN-IP (the localhost exemption does NOT apply to LAN IPs). iOS Safari records audio/mp4 (AAC), not webm/opus; probe isTypeSupported and let server ffmpeg normalize.
- Sprite prompt suffix: "single object, centered, plain white background, sticker, game icon, no shadow"; comedy hides art jank.

### Prior art (closest existing games, none identical)
- Death by AI (deathbyai.gg): closest on social format (phones, absurd prompts, AI arbitration, last-one-standing). But it is turn-based TEXT judgment, the AI IS the gameplay. Study its phone-join UX; differentiate hard (we are a skill brawler, not an AI judge).
- AI Spelcraft (Steam, 2025): closest verb ("compose phrase -> AI gives combat power"). Cautionary tale: it lets the AI own the NUMBERS, which feels like a slot machine. This is exactly why our stat-table firewall exists.
- AI Roguelite: closest full pipeline (name -> sprite -> AI-adjudicated combat), but slow, single-player, AI owns outcomes.
- Infinite Craft: the determinism/caching + first-discovery reference. Suck Up!: proof voice-as-LLM-input is a streaming hook (and our all-local stack beats its server/token model).
- HuggingFace Open-Source AI Game Jam: the directly comparable jam context; judged on fun/creativity/theme over polish, and nobody shipped a voice -> generated-weapon -> real-time versus brawler.

Sharpest one-line differentiator for judges: "MIC DROP is the first to put generative AI inside the tight, twitchy loop of a couch-competitive physics fighter where it cannot grief the match, because numbers are server-authoritative. The AI ARMS you; your SKILL decides the fight." Corollary: if the fighting does not feel good, there is no product, so the brawler feel is the real bar.

### Blackwell / RTX 5090 note (VERIFY on the showcase laptop, do not trust blindly)
PyTorch 2.7+ ships prebuilt cu128 sm_120 wheels; the 2.7 blog scoped them to Linux, and Windows-native cu128 works in practice (ComfyUI portable ships it) but a clean verbatim "stable Windows wheel" path was not confirmable. Action: on the laptop run the cu128 install, then assert `torch.cuda.get_device_capability() == (12, 0)` and run one real SD-Turbo generation. Fallbacks if needed: ComfyUI portable cu128 env, nightly cu128 index, or WSL2 + Linux cu128. Budget half a day; do not discover this on demo day. Also: install torch FIRST and pin it (pip can silently downgrade it via deps like xformers, which you should skip); keep the Studio driver current (R580+); Turbo models REQUIRE guidance_scale=0.0 + timestep_spacing='trailing'.
