# Say It, Slay It — Build Spec and Context for Claude Code

Final name: **Say It, Slay It** (shipped). Earlier working title was MIC DROP; some internal identifiers (the WS room code "MICDROP", `MICDROP_*` env vars, `micdrop_*` localStorage keys, the `micdrop/` folder) keep the old slug on purpose, since renaming them is risky and not player-visible.

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

### 2026-06-19  P24: LLM-restyled webcam faces, strict tutorial gate, offline model loads

- Webcam faces (controller lobby) reverted from the in-browser bulge/posterise caricature (it looked bad) to an LLM image path. The lobby grabs one webcam frame, crops each player's face (left/right halves), and POSTs it to a new backend `POST /cartoonify`. There SD-Turbo img2img restyles it with a RANDOM treatment (cartoon, anime, pencil sketch, comic, pop art, claymation) and returns a PNG that becomes the round-masked fighter head. It reuses the SAME loaded SD-Turbo weights via `AutoPipelineForImage2Image.from_pipe` (no extra VRAM), serialises on the existing GPU lock, and runs ONLY in the lobby (never during a fight, so it cannot contend with weapon forging). Verified end to end: HTTP 200 in about 0.34s, faithful restyle. Graceful fallback to the default fighter on no webcam, declined permission, or image gen off (204).
- Body trait reverted to "previous": the fighter body is the accent colour again (`bodyTint` removed from `FighterProfile`, `game.profiles`, and `gamepadLobby`). Only the FACE is webcam-driven now, per the user.
- Tutorial gating fixed (the reported "moves forward even without doing anything"): the warmup no longer auto-skips a step on a per-step timeout, and the page no longer advances on a `WARMUP_MAX` cap. It advances ONLY when BOTH players have actually performed every control (move, jump, attack). The dropped-phone auto-skip and the host ENTER skip stay as the only escape hatches; `GLOBAL_CAP` raised 82 to 150 as a pure hard backstop. Verified headless: 25s of no input stays on warmup; it reaches shoutintro only after both finish all three steps.
- Offline model loads (ops, important): `main.py` now sets `HF_HUB_OFFLINE` / `TRANSFORMERS_OFFLINE` by default. Without it, `from_pretrained` / faster-whisper hang for minutes on an HF Hub network check at warm time on a blocked or flaky venue network (observed: GPU stuck at 0 MiB, `/cartoonify` timed out). With it, the model loads in about 8s offline from the local cache. This also de-risks sprite and ASR warm at the venue. Set the env to 0 only to add a NEW (uncached) model.

### 2026-06-19  P25: pickup on any-dry, tutorial throwable, 3-2-1 controller countdown, face revert

- Rescue pickup reworked (`match.ts` tickPickup). It now drops the moment EITHER player runs dry (was: only when BOTH were out), after a short random 1-3s beat (was 10-30s), carrying a generous 5-10 shots scaled by the weapon's damage (heavy hitters get fewer; was a flat min(3, ammo)). A 4s cooldown after a grab/expiry stops it flooding the stage. Verified headless: with ONE player dry it dropped at 1.45s with 9 ammo in the upper area.
- Tutorial THROW practice now visibly flings a weapon (`tutorial.ts` spawnTutThrow). The tutorial has no Match, so this is a purely cosmetic projectile (no hitbox): a previously-forged sprite if the booth session has one (borrowSprite), else the weapon's emoji; it arcs under gravity and is culled after 1.8s. Verified: exactly one node spawns on a throw and is culled cleanly (no leak).
- Controller shout now has the 3..2..1 countdown like phone mode, in BOTH the game and the tutorial. `fight.ts` gamepad `G_READY` 1.5 -> 3.0 with a "GET READY!" + 3/2/1 display; tutorial `READY_SECS` 1.5 -> 3.0 (phone and controller paths). Verified the in-game gamepad prompt renders GET READY! 3, 2, 1.
- Tutorial shout explainer trimmed: dropped the "FIRE / ICE / ELECTRIC ... BURN / FREEZE / SHOCK" line (too long to read); `SHOUTINTRO_SECS` 6 -> 4.5.
- Webcam fighter faces FULLY REVERTED to the original static procedural fighter (the cartoonify looked bad). Removed the controller-lobby webcam capture, deleted client `util/face.ts`, and removed the backend `/cartoonify` route + `cartoonify_face`/img2img helpers. KEPT the HF offline-load fix (de-risks sprite/ASR warm) and the phone-mode selfie head in `lobby.ts` (untouched). Gamepad profiles are username-only now.

### 2026-06-19  P26: lobby controller gate, in-your-face shout prompt + rumble, higher pickups

- Controller lobby now REFUSES to start without two CLAIMED controllers (`gamepadLobby.ts` start guard on `claimed.length < 2`); the status line says so and stays until both join. Fixes starting with no controllers connected. Verified headless: no pads -> ENTER does nothing; two pads claimed -> starts.
- Shout prompt is now impossible to miss. Both the in-game prompt cards (`fight.ts` pOv, phone + gamepad) and the tutorial shout bubbles (`tutorial.ts`, phone + controller) gained a bright animated border that BLINKS, FLASHES yellow<->red, and a scale PULSE, plus a blinking headline (`animatePrompt` / the bubble animate loop, driven by `performance.now()` each frame). Verified runs cleanly with a visible prompt; no console errors.
- Controllers VIBRATE for the shout. New `rumblePad(index, ms, strong, weak)` in `input/gamepad.ts` (tries `vibrationActuator.playEffect("dual-rumble")`, falls back to `hapticActuators[0].pulse`, no-op + never throws on a pad without haptics). In-game gamepad: a short nudge when the window opens (ready) + a sustained buzz for the whole record window. Tutorial controller: a buzz for the record window. Real vibration needs real pads (Chrome/Xbox/Pro support it); the no-pad path is verified safe.
- Rescue pickup spawns HIGHER: `match.ts` y range 4.2-6.6 -> 5.6-8.2 (y is up). Verified spawns landed 6.08-7.85, still reachable with a jump / double jump / platform.

- (set up by handoff) Locked: side-view, controlled-chaos items, web client + Python backend, phones as controller and mic with gamepad fallback, Solo Score Attack plus Versus winner-stays-on.
- (2026-06-17) Control scheme settled: TWO PHONES for movement and actions, not webcam body-tracking. Reasons: (a) a precise physics platformer needs low-latency discrete input, which body-pose cannot deliver (pose is laggy and gross-grained, which would make the brawl feel mushy and break the juice bar); (b) two people in one webcam frame is genuinely hard (single-person pose tracks one body only; multi-pose is slower and loses player identity under occlusion as the two cross each other in a cramped shot); (c) two phones give clean per-player input isolation AND two close-up microphones, which materially improves Whisper accuracy in a loud showcase room. Embodiment now lives in the VOICE forge ("your voice forges your arsenal"), which is the crowd-readable hook and aligns with past summer-school winners that used voice. Webcam stays OUT of the control path. Keep one USB gamepad or keyboard mapping as the dead-simple fallback for a hotspot hiccup (the one remaining single point of failure).
- (2026-06-18) Re-decisions from a deep code/prior-art search (see Section 17): planck.js confirmed over matter.js (matter is floatier, wall-sticks). SD-Turbo is the live default, SDXL-Turbo only for a "hero" preview (latency on a shared GPU). LLM stays local (Ollama), not an API (offline LAN flex, zero per-play cost). Use the Pixi v8 particle port (spd789562/pixi-v8-particle-emitter), NOT the official @pixi/particle-emitter (it targets v6/v7 and breaks on Pixi 8). faster-whisper MUST use compute_type='float16' on the 5090 (int8 crashes on Blackwell). Fairness firewall is now structural: the ItemSpec JSON schema has ONLY string/enum fields, so grammar-constrained decoding makes it impossible for the LLM to emit numbers.
- (2026-06-19) BUILD REALITY on this Blackwell/Ollama box (measured, these override earlier guesses):
  - LLM: Ollama 7B ran at ~5 tok/s and 3B at ~10 tok/s here (kernel/Blackwell issue, NOT torch), so weapon forges were 8-14s. Switched default to qwen2.5:1.5b-instruct (~2.5s/forge, names + archetype variety still good). Also dropped JSON-SCHEMA grammar for loose format="json" (the schema grammar was not the bottleneck but loose json is a touch faster); fairness preserved by validating archetype against the enum server-side (no numeric fields ever requested). Override with MICDROP_MODEL.
  - Forge UX (per playtest feedback that upfront gen felt slow): forge is now NON-BLOCKING. Type all phrases instantly; each forges in the background; cards fill in; weapons stream into the arsenal during the countdown/early fight. Generation overlaps play instead of being a loading screen.
  - ASR: faster-whisper on CUDA HARD-CRASHES the uvicorn process on Blackwell (native ctranslate2 abort Python cannot catch). Run it on CPU (base.en, ~0.5s per clip, stable). This reverses the 2026-06-18 float16 note. Override with MICDROP_ASR_DEVICE=cuda.
  - Torch/sprites: torch 2.11+cu128 confirmed working on the 5090 (get_device_capability()==(12,0)); SD-Turbo ~1.5s warm (the only slow part was the one-time HF model download). rembg needs onnxruntime and raises SystemExit if missing, so the image path catches BaseException and degrades to an opaque sprite.
  - Windows networking: the client must hit 127.0.0.1 (not "localhost", which can resolve to IPv6 ::1 that uvicorn's 0.0.0.0 bind does not serve). Endpoints centralised in client/src/net/config.ts; HTTPS for the phone mic is a one-flag switch (set VITE_API=https://... + run setup_certs.ps1; run_show.ps1 auto-detects certs).
  - Added a CONTROLS screen to the home menu. P0-P5 + P6 polish + P4 (phones/voice) are all built; phone touch + voice verified via a simulated controller over the relay (real-device mic needs the HTTPS + CA-on-phone step).
- (2026-06-19) P7 feature pass, from playtest feedback (forge should happen at playtime, melee was dead, weapons felt samey, characters looked plain):
  - Melee was not actually broken, just mis-tuned: it tested centre-distance < 1.5m against bodies that sit ~0.84m apart, the hit knocked the foe out of that thin band, and there was no cooldown or feedback. Now reach is edge-to-edge (MELEE_REACH), there is a cooldown (MELEE_CD), and a pose + whoosh + puff fire on every press. Dropped the "generate a swing archetype" idea (firewall + net-new rendering for little gain).
  - LIVE mid-fight forge loop (the headline): you start with 1 weapon, then a completion-gated scheduler in fight.ts prompts ONE random player ON SCREEN, pops their phone mic for 3s (PhoneHub.send -> controller {type:'record'} auto-record, which replaced the old no-op ws.onmessage stub), forges, and injects it as their NEXT weapon (Match.injectWeapon + a nextItem queue jump). Gate on forge COMPLETION, not a fixed clock (record+ASR+LLM round-trip is ~6s, longer than the 3-5s gap). Phone-versus only; keyboard/solo keep the upfront forge so the booth-safe path is untouched. The phone forge beat now seeds 1 weapon and grants mic permission (both players must shout once).
  - Weapon IS the ammo: the sprite prompt is built from the RAW spoken phrase (not the funny name), and every projectile renders the weapon EMOJI as a bundled fallback so a throw always reads as a thing even with zero AI / safe mode / no GPU (client/src/content/nouns.ts noun->emoji map, content/style.ts as the shared color+emoji source of truth). Fixed the sprite objectURL/texture leak (releaseAllSprites() on each forge enter).
  - Ammo recentred toward ~10 (spread preserved) in BOTH tables; added baseKB/growthKB to shared/archetypes.json so it matches the client table (killed the drift). Running dry is now a felt beat: a RELOAD_TIME disarm window ("OUT OF AMMO! RUN!", red HUD + burst) then auto re-arm, and a shout re-arms instantly. Floor widened so dodging while disarmed is fun.
  - The 4 previously-dead specials now differ: cloud = lingering damage-over-time zone, sticky_trap = slow zone, light_spam = stagger (extra hitstun), scatter already multi. Zones live in Match.zones, tick in tickZones(), render in fight.ts under the fighters.
  - Characters: procedural glow-up (tapered silhouette, 2-tone head, rim highlight, squash/stretch, contact shadow, username name tag, persistent-head node) + OPT-IN selfie head. The selfie is stylized ON THE PHONE (square crop, posterize, circular mask, accent ring) so the raw photo never leaves it; sent as a {type:'profile'} ws message and turned into a fighter head texture on the laptop. Privacy: local-only, deleted after the match, procedural fighter stays the default. Dropped the heavy SD img2img head (privacy + GPU contention + uncanny).
  - WEBCAM ARENA (title menu): grabs one laptop-webcam frame, extracts a room palette, and washes it over the living parallax backdrop (animated orbs + grid recolor). Non-collidable backdrop only, so zero fairness risk. Dropped LLM-authored collidable geometry (firewall + scope).
  - Verified: tsc --noEmit strict is clean; drove the sim headless via the window.__fight debug hook (melee connects and knocks back; disarm -> auto reload -> shout re-arm; slow + DoT zones apply; throw/ammo edge-detection correct). Controller script syntax-checked. Real-phone voice + selfie still need a live device test over HTTPS.
- (2026-06-19) P8 phone-experience pass (more playtest feedback). Focus was the phone game logic:
  - Removed the forge beat. Phones now start with ONE quick weapon (randomMockItem, seeded in lobby) and forge the rest by shouting mid-fight; lobby Enter goes straight to "fight" (forge_phone scene is now unused). First live prompt comes ~2.5-4s in; prompts alternate fairly between players (promptCount).
  - Controller rebuilt (server/controller/index.html): dropped the big "HOLD TO SHOUT" header AND the JUMP button; joystick pushed UP now jumps (flick again to double-jump), which frees space; SPECIAL button renamed MELEE (still rides the `special` input field). The mic is granted ONCE at JOIN (a user gesture) and kept open, so the mid-fight auto-record needs no tap; a slim "SHOUT!" strip shows while recording.
  - Voice quality overhaul (asr.py): default model is now small.en (was base.en), beam_size 5, VAD tuned, and segments with high no_speech_prob / low avg_logprob are DROPPED so room noise stops getting transcribed; initial_prompt biases to short object names; output capped to ~6 words and empty results return "". ASR is warmed at startup (main.py) so the first shout is not a cold load. NOTE: small.en downloads ~480MB once on first run.
  - Usernames: the chosen name now shows in the HUD tag and the win/score messages (passed into Hud + Match). Defaults to P1/P2 when no profile.
  - Deferred per user ("others can be ignored"): #1 animated-face selfie (still the cheap on-phone posterize for now; wants a real generated/animated avatar later) and #6 projectile rules (throws already go in the facing direction; homing is the intended per-weapon exception).
  - Verified: tsc strict clean; controller script syntax-checked; client smoke-tested headless (names propagate into Match, fight runs, no console errors). Relaunched via run_show.ps1 (HTTPS).
- (2026-06-18) P9 pass (playtest feedback). Root-caused #1 "never see a generated sprite": sprite gen is fine (curl /forge/sprite returns a ~290KB transparent PNG; LLM forge returns real weapons), the problem was TIMING: each shouted weapon is unique, the sprite takes ~1.5-4s, but the weapon was assigned and thrown instantly so the short-lived projectiles were gone before the sprite arrived. Fixed by reworking the live forge into a state machine (idle -> record -> forge -> reveal): after the LLM returns we WAIT for the sprite (preload its texture, capped at SPRITE_WAIT=5s), then a dramatic reveal (juice.freeze+slowmo+shake+flash + the weapon name and sprite shown on screen) before injectWeapon. Now the thrown projectile shows the generated art, the on-screen overlay clearly reads "<name>: FORGING <weapon>" then "FORGED! <emoji> <name>" (#2), and the assignment has a paced dramatic beat (#3) that only pauses briefly (record/forge keep the game flowing).
  - Logging (#4): new server/app/log.py writes a per-run session-<stamp>.jsonl plus saved audio clips (server/logs/audio) and generated sprites (server/logs/sprites). main.py logs forge_item / forge_sprite / asr (with timings + saved file paths) and exposes POST /log for client events. ws.py logs the raw input + voice + profile action stream. Client net/log.ts batches events to /log; fight.ts logs forge_prompt/voice/forge_result/weapon_assigned/forge_missed/forge_timeout + match_start/end; match.ts logs throw/hit/ko/disarm + a 0.5s state snapshot. Together = (state stream + action stream + generations) for later review and CPU-AI training. Verified end to end: a forge + a client event both landed in the session jsonl and the audio/sprites dirs were created.
  - Deferred (user said optional): #5 weapon-characteristic effects (icecream -> freeze, etc.) and the proper animated-face selfie.
- (2026-06-18) P10: "no generation at all in-game" + movement freezes during a shout. The logs diagnosed it: latest session had 0 forge_sprite, 0 weapon_assigned, 2 forge_timeout, and 1590 input events. ROOT CAUSE was the logging I added in P9: log.event() did a synchronous file open/write/close PER event, called from the async WS handler on EVERY controller input (~50/s) -> it blocked the event loop, which (a) froze player movement (inputs stopped relaying) and (b) starved the backend so the in-game LLM forge overran the client's 12s abort -> MockProvider fallback (no fetchSprite, no sprite) -> and the live-forge phase hit its hard timeout and DISCARDED the weapon. Fixes: (1) log.py rewritten to a background writer thread + queue, event() only enqueues (never blocks, file kept open). (2) /asr now runs the blocking transcribe via asyncio.to_thread so the WS relay keeps flowing during a shout; ASR beam_size 5 -> 1 to cut CPU + latency. (3) forge robustness: never discard a forged weapon (on hard timeout, assign it if the item resolved); client forge abort 12s -> 25s and FORGE_HARD -> 28s (user is fine waiting). (4) sprite quality: the sprite prompt now uses the LLM's cleaned name/visualPrompt, NOT the garbled ASR text (which made nonsense like a banana scatter); SD prompt forces "a single object, one item, centered, flat white background" and steps 2 -> 4. Verified after restart: standalone forge_item back to ~1.5s, /forge/sprite from a name returns a recognizable SINGLE object (clean ice cream cone) in ~1s. NOTE: qwen-1.5b often just echoes the name into visualPrompt (fine, the name is object-like). The blob-load fix from P9b (loadTex) plus this means in-game projectiles should finally show the generated art.
- (2026-06-18) P11 (generation confirmed working; these are improvements): (1) the shouted weapon is now equipped THE INSTANT it forges, replacing the current weapon (Match.injectWeapon sets items[p]/ammo[p] directly; fight.ts assigns in the forge phase the moment the item resolves), with the dramatic reveal (freeze+slowmo+shake+flash, name + sprite) firing at that moment. (2) The generated sprite now also shows in the bottom HUD next to the weapon name (hud.ts loads it via loadTex), not just the emoji. (3) Throw rebalance: REMOVED the homing auto-aim (it was an unfair lock-on) so all weapons fly in the FACING direction; "homing" is now a fast straight dart; buffed lob/place speeds so heavy/placed weapons travel forward instead of dropping at the thrower's feet (projectile.ts). (4) WRAP-AROUND stage (snake-style) replaces ring-out death: a fighter that crosses a screen edge reappears on the opposite side (Match.wrap, velocity preserved), the floor is now full-width for seamless horizontal wrap (stage.ts), and KO is by DAMAGE now: percent >= KO_PERCENT (150, config.ts) -> ko, since there is no ring-out. Verified headless: immediate equip/replace, x=30->3.33 + y=-2->14.99 wrap, and percent 160 -> roundover. tsc clean, no console errors. NOTE: wrap + damage-KO is a real feel change; KO_PERCENT is the tuning knob. #5 (weapon-characteristic effects, e.g. icecream->freeze) still deferred.
- (2026-06-18) P12 (logs showed generation working well now: good visualPrompts like "a glowing red missile shaped like a cat's paws", good names). Fixes: (1) BUG from the logs: a weapon_assigned fired 109s after its forge_result, i.e. a forge that resolved during a round transition got orphaned ("shouted but got nothing"), because assignment lived in the forge-phase tick which only runs in the 'fight' state. Moved injectWeapon into the forgeItem.then callback so the weapon is equipped the INSTANT it resolves regardless of round state; the forge phase now just plays the reveal beat. (2) Guaranteed fallback: Match.refill now hands a synchronous randomMockItem (emoji weapon) when the arsenal is empty, so a player who never shouts always has something to throw (verified: empty arsenal -> re-armed with a mock weapon). (3) Scale: projectile radius 0.22 -> 0.26, projectile sprite display *3.4 -> *6, emoji size up (the thrown weapon was ~36px, barely visible). (4) HUD bottom row: weapon sprite icon 40 -> 56 at the outer edge, name left/right-aligned flowing inward (was centered + overflowing for long names) and truncated to 22 chars. Reveal is text-only now (sprite shows reliably in the HUD + on the throw instead, avoiding load-timing misses). Verified: tsc clean, fallback re-arm works, no console errors.
- (2026-06-18) P13: (1) End screen: result.ts now shows the WINNER BY NAME (was "PLAYER X WINS"), computes a score (roundsWon*1000 + damageDealt*5; Match tracks dealt[] per player), saves it to the leaderboard, shows the leaderboard inline with the new entry highlighted, and offers REMATCH / EXIT TO MENU. (2) Run-dry-until-shout: Match.liveForge flag (set true in phone mode by fight.ts); when true the update loop does NOT auto-refill, so a player who runs out stays disarmed (melee/jump) until they SHOUT (injectWeapon) a new weapon; isDisarmed simplified to !items[p]. (3) Shout window 3s -> 5s (RECORD_SECS, sent to the controller as record ms; RECORD_WAIT -> 11s). Adds ~2s per shout. (4) Weapon ON-HIT EFFECTS from the shouted words (content/nouns.ts weaponEffect, on ItemSpec.effect, set in remote.ts + mock.ts): freeze (2s slow via slowT), burn (DoT ticked in Match.tickBurn), shock (extra hitstun); applied in Match.applyEffect from resolveHits; reset per round. Firewall-safe (deterministic keyword map, bounded). (5) HUD emoji dedup: bottom row shows the sprite if loaded ELSE the emoji (never both); text is name + ammo only; disarmed shows "NO WEAPON! SHOUT or MELEE". Verified headless: run-dry stays disarmed in live mode + shout re-arms, effect flows onto the weapon, tsc clean, no console errors. NEXT: #4 runtime level regeneration (deferred, biggest item). #6 sprite-reuse: the disk cache (server/cache/sprites, sha1(prompt)) ALREADY persists across games + restarts (cached hit ~2ms); gen is ~1-1.5s warm so it is not the bottleneck; cross-game hits are limited because the LLM visualPrompt varies per shout.
- (2026-06-18) P14: (1) iPhone "never forged" root-caused from logs: iOS Safari MediaRecorder produced 5-BYTE empty .webm clips (slot 0 / Shivang in session 174002), so /asr got empty audio -> forge_missed every time, while the Android player recorded 70-80KB fine. FIX: controller no longer uses MediaRecorder; it captures PCM via the Web Audio API (AudioContext created + resumed on the JOIN tap = the iOS user gesture; ScriptProcessorNode 4096 -> Float32 chunks -> 16-bit PCM WAV via encodeWav; re-acquires getUserMedia if the track dropped; silent gain node to keep the processor pulling). Sends clip.wav. Verified: a generated WAV POSTed to /asr returns 200 (faster-whisper decodes WAV natively). Players must RE-SCAN the QR / reload the controller to get the new page. (2) Trimmed the shout prompts: removed the redundant "LISTENING" beat, now GET READY -> SHOUT NOW -> FORGING.
- (2026-06-18) P15: RUNTIME LEVEL GENERATION + a Codex-review bug pass. Level gen: stage.ts split into buildFloor (permanent full-width floor) + randomLayout (1-2 symmetric one-way side pairs + optional center, bounded/fair, no LLM) + buildPlatforms; fight.ts owns a 15-20s timer that destroys the platform bodies, rebuilds them + their view, telegraphs ("STAGE SHIFT!" + flash + shake), logs stage_shift. Verified headless: static-body count stable across regens (no leak), floor permanent (fighter stays grounded through shifts), match keeps running. Codex fixes: P0 phone.ts resets state to NEUTRAL on leave AND on socket close + auto-reconnects (closing flag stops it on intentional close), so a dropped phone stops moving; requirements.txt now lists faster-whisper + cryptography + onnxruntime. P1 Fighter.reset now clears groundContacts/coyote/buffer/prevJump/prevDash/dashCd/slowT/throw+meleeTimer; live-forge cleaned (removed dead sT/SPRITE_WAIT) and the reveal now actually shows the generated sprite (polls spriteUrl during the 1.3s reveal); async forgeItem().then guarded by an `alive` flag (set false in exit) so a late LLM resolve cannot mutate a stale match. P2 .gitignore ignores server/logs/; llm.py serializes ollama.chat under a lock so typed/concurrent forges queue instead of piling up. tsc clean, py_compile clean, no console errors.
- (2026-06-18) P16: fixed 9 bugs from a 4-agent adversarial review (3 false positives dropped). P1s: (1) llm.py ollama.chat had NO timeout while holding _lock -> one hung Blackwell/Ollama request would stall ALL forges for the session; now uses ollama.Client(timeout=20) so it raises + releases the lock + falls back. (2)+(3) sprite leak was TOTAL on the phone path: releaseAllSprites was only called from the forge scenes (which lobby->fight and REMATCH->fight skip), AND it used Assets.unload which is a no-op for our Texture.from textures. Fix: tex.ts exports release(url) that destroys the texture + drops the cache entry; releaseAllSprites uses it + revokes the blob; it is now called at lobby.enter and on the phone REMATCH. (4) advance() now also resets prevThrow/prevSpecial/cdThrow/cdMelee so a button held across a round boundary is not swallowed. P2s: advance() refill is gated on !liveForge (run-dry-until-shout now holds across rounds); llm.warm runs in a daemon thread (no longer blocks startup); asr.py has load + inference locks (CTranslate2 is not concurrent-safe, generator consumed inside the lock); wrap() is horizontal-only (vertical wrap could drop a fighter under the full-width floor); log.save_audio uses an os.urandom suffix (no same-ms overwrite). Verified post-restart: forge 200 + ASR(WAV) 200, no deadlock; tsc + py_compile clean. user still saw only emojis. The new logs nailed it: forge_sprite ALWAYS succeeds (real PNGs saved under server/logs/sprites, bytes 5k-360k) but weapon_assigned always had hadSprite:false. TWO client bugs: (1) Pixi `Assets.load()` cannot load `blob:` object URLs (it picks a parser by file extension; blob URLs have none), so every generated-sprite texture load silently failed and fell back to the emoji. Fixed with client/src/util/tex.ts `loadTex()` (Image element + Texture.from, the same path the working selfie uses), used in fight.ts (projectile swap + reveal preload) and forge.ts/forge_phone.ts cards. (2) the sprite-wait timer started at the forge-phase START, but the in-game LLM forge is taking 5-12s, so the 5s wait was already exhausted by the time the weapon resolved and it revealed before the sprite arrived; fixed with a separate `sT` timer that only counts AFTER the weapon resolves. Verified: blob->Image loads (24x24) in preview, tsc strict clean, no console errors. NOTE: in-game LLM forge latency is 5-12s (was ~1.5s solo) likely from CPU contention with small.en beam5 ASR; the reveal now waits correctly but the forge itself is slow, a candidate to tune (ASR beam_size / LLM num_predict) next. ASR transcripts in noisy rooms are still rough.
- (2026-06-18) P17, two playtest feature changes:
  - HEALTH BAR + DAMAGE-SHRINK comeback (P17-1): replaced the hard-to-read damage % with a small depleting health bar per player in the top corners (hud.ts full rewrite, lerpCol green->red, p0 drains left, p1 drains toward centre; names moved to the top corners, weapon row stays at the bottom). New experimental mechanic: as a fighter's damage climbs to KO_PERCENT they SHRINK to MIN_SIZE (0.62) and gain up to +MAX_SPEED_BOOST (0.45) run speed and +MAX_JUMP_BOOST (0.32) jump (config.ts). Fighter.size drives both the hitbox (rebuilt via destroy/createFixture between physics steps when it shifts >=0.04, with a per-fighter filterGroupIndex so own projectiles still pass through) and the FighterView scale; the feet stay planted (position uses halfH*size). Capped so it never gets infinite/chaotic. Verified headless: at 120% size 0.69 + grounded + can still jump, at 150% size 0.62 speedMul 1.45 jumpMul 1.32 + KO fires; never falls through the floor.
  - PER-HEAD SHOUT PROMPT + AMMO-ZERO TRIGGER + SIMULTANEOUS (P17-2): the live forge in fight.ts was converted from a SINGLE-slot state machine to PER-SLOT arrays (phase/fT/fItem/fTex/spriteLoading/revealT/revealShown/gapT all [2]), so BOTH players can forge at the same time. The big centred overlay is gone; each player now has a compact prompt card (makeOverlay) anchored ABOVE THEIR OWN HEAD every frame (C.px(f.pos.x), clamped C.sy(f.pos.y + f.halfH*f.size + 1.25)) since that is where their focus is. A prompt is now MANDATORY and immediate the moment a player runs dry (idle + !match.items[slot] -> startPrompt), with only an occasional random swap prompt (gapT 12-18s) while still armed. The reveal is a punchy shake+flash+burst at the head (NOT a full slow-mo) because running dry triggers it often and pausing the sim each time would kill the flow. Verified headless via a fake phoneHub driving the scene's own update: both cards appear in the same frame exactly above each fighter (card x/y === computed head x/y), both slots independently send the record command (ammo-zero, simultaneous), and both re-arm with their exact shouted weapon (onVoice -> forgeItem -> injectWeapon). Confirmed it interacts cleanly with the shrink (card tracks the lowered head of a shrunken fighter). tsc strict clean, no console errors. Relaunched the full HTTPS stack (health ok). Phones must RE-SCAN the QR / reload the controller.
- (2026-06-18) P18, two changes:
  - FULL-USERNAME LEADERBOARD (P18-1): the real bug was in util/leaderboard.ts `addScore`, which did `name.slice(0,3).toUpperCase()`, so EVERY name (including the full phone username that result.ts already passes) was chopped to 3 upper-case letters at the storage layer. Now it keeps the complete name (`name.trim().slice(0, NAME_MAX=14) || "ANON"`). The solo arcade entry (LeaderboardEntryScene) was upgraded from typing 3 fixed initials to free-text full-name entry (A-Z, digits, space, backspace, Enter; capped at NAME_MAX). Verified: solo stores "SHIVANG THE GR" (capped), versus stores the mixed-case "Shivang".
  - PRE-FIGHT INTERACTIVE TUTORIAL "SOUND CHECK" (P18-2): a new scene client/src/scenes/tutorial.ts slotted lobby(ENTER) -> tutorial -> fight (one-line change in lobby.ts, registered in main.ts). Designed via a 4-design panel + 3-judge adversarial workflow (winner: robust overlay-checklist, avg 49). ~30s, screen-driven, ZERO controller changes: two split lanes (one per player) where each player clears four verb cards by actually doing the action on their phone, read live from hub.state[slot] (MOVE axisX>0.4; JUMP/THROW/MELEE as RISING EDGES tracked every frame for both slots) plus the headline SHOUT step (hub.send {type:record} then hub.onVoice). The shouted phrase is forged fire-and-forget and handed to the fight via a new `game.pendingWeapon[slot]` seam (NOT a direct arsenals write). Booth-proof by design: per-step caps (4+5+5+11s), a hard 30s global cap, host ENTER/Space skip, dropped-phone + relay-blip auto-advance, and not-joined slots auto-complete (so a one-phone booth runs solo). exit() clears hub.onVoice (fight.enter re-binds it). Verified headless via a fake phoneHub driving the scene's own update: full happy path (both players do all 4 verbs, both record sends fire, both re-arm with their exact shouted weapon "Flaming Sword" / "Rubber Chicken Cannon", hands off to fight), plus all four backstops (the no-input path self-completes at 26s via the per-step caps before the 30s cap is even needed). tsc strict clean, no console errors.
  - P18 REVIEW PASS (3-lens adversarial Workflow) caught a HIGH bug I missed and I fixed it: the original tutorial wrote the forged weapon to `game.arsenals[slot]` after handoff, but in liveForge `Match.refill` runs ONLY at init and is NEVER called again (update loop `continue`s on liveForge, advance() gates on !liveForge), so a post-init arsenals write was STRANDED (the shout payoff silently failed on a real device, where the 5-12s forge resolves after the ~13s tutorial exits), and a late write could also clobber an in-fight injectWeapon. FIX = `game.pendingWeapon[slot]`: the tutorial's forge .then sets it; fight.enter folds it into `game.arsenals` BEFORE building Match if it resolved pre-handoff (so it is the literal first weapon), and fight.update injects it via `match.injectWeapon` if it resolves post-handoff (so it still pays off mid-fight). Verified both timings headless (pre -> first weapon; post -> injected one tick later; pending cleared each time). Also fixed em-dashes the review flagged in leaderboard.ts (empty-state copy) and forge.ts (3 count strings, reachable via the keyboard solo/versus path), and a cosmetic bug where a never-joined lane's "not joined" card flipped to "READY!" when the other player finished (setCard now keeps the not-joined text for `!required[s]`). LESSON: in liveForge, the ONLY way a weapon enters mid-fight is injectWeapon; the arsenal is not re-read after init.
  - P18b TUTORIAL v2 (playtest feedback): the SOUND CHECK is now a multi-page flow with the players' REAL fighters. (1) Warmup page spins up a local GameWorld + buildFloor + two real Fighters + FighterViews, one per split lane, each driven by `hub.state[slot]` via `gw.update(dt, step => fighter.update(step, input))` and clamped to its screen half (laneBound) so movement/jump/dash/double-jump feel EXACTLY like the game (no cosmetic fake). The JUMP card is a two-beat: first jump, then a 1.8s grace prompting "DOUBLE JUMP! flick UP again while in the air" (detected as an airborne jump rising edge, NOT gated on it). THROW/MELEE call fighter.triggerThrow/triggerMelee so the avatar visibly reacts. (2) SHOUT is its own page: a shared explainer ("RUN OUT OF AMMO? a SHOUT prompt pops above your head... shout FIRE, ICE, or ELECTRIC weapons: they BURN, FREEZE, and SHOCK on hit!") then a per-fighter speech bubble rendered ABOVE each fighter's head (mirrors the in-game P17-2 overhead prompt) driving the record/onVoice/pendingWeapon forge. (3) DONE page shows "TUTORIAL COMPLETE! the real match starts now" before handing off. Pages: warmup -> shoutintro (4.5s) -> shout (per-slot cap 11s) -> done (1.8s) -> fight. Backstops unchanged in spirit: per-step caps, host ENTER/Space skip, dropped-phone + not-joined auto-advance, and a hard 40s global cap. Verified headless (fake phoneHub driving the scene's update + real GameWorld stepping): full path warmup->...->fight with both shouted weapons equipped in the fight ("Flaming Sword"/"Ice Hammer" via pendingWeapon->injectWeapon), double-jump grace completes, both record sends fire, TUTORIAL COMPLETE shows, no console errors, tsc clean. Screenshot confirmed the real fighters render in their lanes.
- (2026-06-18) P19 XBOX / GAMEPAD MODE (added alongside phone mode, not replacing it). New control mode `controlMode: "gamepad"`. (1) `input/gamepad.ts` GamepadController implements Controller, reads `navigator.getGamepads()` (player N = the Nth connected pad), standard mapping: left stick = move (deadzone 0.28) + d-pad override, A = jump, X or RT = throw, B = melee (the `special` field), RB/LT = dash; returns NEUTRAL when no pad. (2) `audio/laptopMic.ts` LaptopMic: getUserMedia + Web Audio PCM -> WAV -> POST `${API}/asr` (same proven path as the phone controller; the laptop is localhost = a secure context so NO HTTPS needed; backend CORS is allow_origins=*). grant() on a user gesture, record(ms) returns text or "". (3) `scenes/gamepadLobby.ts`: players press a button so the browser reveals the pad, the HOST presses ENTER (the gesture that grants the laptop mic), seeds one mock weapon each, go fight. Registered in main.ts + a "VERSUS (XBOX)" title menu entry. (4) THE SHOUT SOLUTION (pads have no mic): ONE shared laptop mic, so fight.ts runs a SINGLE serialized forge machine (gPhase idle/ready/record/forge/reveal + a gGap cooldown) servicing whoever is DISARMED: exactly one player dry -> forge ONE weapon, injectWeapon to them; BOTH dry -> prompt "BOTH SHOUT!", open the mic once, both yell together, forge TWO weapons from the combined transcript (two forgeItem calls) and assign them to the two players AT RANDOM (Math.random swap) for chaos. match.liveForge = liveForge || gamepadForge (run-dry-until-shout). Reuses the per-head pOv prompt cards + setPrompt (mode-gated: phone tickLive vs gamepad tickGamepadForge, only one runs). result.ts REMATCH now reseeds/releases for controlMode !== "keyboard" (phone AND gamepad). Verified headless (faked mic + fast provider): one-dry forges+equips one weapon, both-dry forges TWO distinct weapons one-each (random assign), lobby + menu render, gamepadCount with no pads = 0 (no crash), phone mode untouched, tsc clean, no console errors. KNOWN CAVEAT to playtest: the laptop mic hears the laptop speakers (feedback) + both players, so noisy-room transcripts may be rough (the fairness firewall tolerates it: any noun -> a weapon). LESSON: getUserMedia works on localhost without HTTPS (secure context), unlike the LAN-IP phones which need the mkcert CA.
  - P19 REVIEW PASS (3-lens adversarial Workflow) found 1 HIGH + 2 MEDIUM, all fixed: (HIGH) GamepadController read `navigator.getGamepads().filter(Boolean)[slot]`, but getGamepads() is a SPARSE array keyed by the stable per-device gamepad.index, so filtering it re-maps a surviving pad to the wrong player when the other disconnects; fixed by pinning each player's concrete pad index ONCE in the lobby (game.padIndex, from connectedPadIndices()) and reading the RAW index `navigator.getGamepads()[padIndex]` (null -> NEUTRAL, never another player's pad); removed the dead padPressedA helper. (MEDIUM) LaptopMic.record's /asr fetch had no timeout, so one hung request left the single shared `recording` lock set and starved forging for the rest of the match; added an AbortController (9s, < the 11s record cap) so it self-heals. (MEDIUM) the gamepad forge could be corrupted by an orphaned forge that resolved after the 28s hard-timeout started a new cycle; added a gCycle token (bumped in gEnd, captured in gOnVoice, checked in gFinish) so a stale forge is dropped. Also hardened the both-dry forge with per-call .catch so one failed forge still arms the other player, and a cancelled flag so Esc during the mic-grant does not still navigate into the fight. Verified headless: one-dry equips one, both-dry two distinct one-each, both-dry-with-one-failure still arms both, GamepadController(badIndex) returns NEUTRAL no crash; tsc clean, no console errors.
- (2026-06-18) P20 playtest pass (user is FOCUSING ON CONTROLLER mode now; controller felt fun). Three fixes: (1) CONTROLLER CLAIM LOBBY: with 3 pads connected (2 Pro + 1 Xbox) the old lobby auto-picked the first 2 by index and one Pro "didn't work". Rewrote gamepadLobby.ts so each player CLAIMS their own pad by pressing ANY button on it (freshPresses() = rising-edge across all pads, mapping-agnostic), binding the exact two devices held; the unwanted 3rd is ignored; a missing claim falls back to a connected index so the host is never hard-blocked; Backspace re-picks. game.padIndex holds each player's concrete index. Verified: claiming pad 2 then pad 0 (of 0/1/2) -> padIndex=[2,0]. (2) TUTORIAL PACING (phone): it auto-blurred past; added a 1.0s "NICE!" DWELL after each warmup control (advanceStep/completeStep + dwelling[]/dwellT[]), and made the SHOUT page slower so players can actually try it (SHOUTINTRO 4.5->6s, a GET READY 1.5s countdown, RECORD 4.5->5s, SHOUT_CAP 11->13, GLOBAL_CAP 42->52). The weapon shouted IN the tutorial is forged and assigned at fight start (game.pendingWeapon -> verified the fight equips "WPN[flaming sword]"/"WPN[ice hammer]"). (3) XBOX LAPTOP MIC "did not work" was almost certainly the built-in mic hearing the laptop's OWN SPEAKERS: now game.music.stop() DUCKS the music for the record window (restored on the mic resolve AND in gEnd), logs gamepad_mic_grant + forge_missed(empty_transcript) for diagnosis; and both-dry now SPLITS the combined transcript into word-halves so the two weapons are DISTINCT (forged from different keywords) before the random deal. Verified headless: music ducks during record + restores, both-dry "fire ice" -> two distinct WPN[fire]/WPN[ice] dealt at random; tsc clean, no console errors. LESSON: a built-in laptop mic + speakers is a feedback loop; duck audio during capture.
  - P20 REVIEW PASS (3-lens Workflow) found 1 HIGH + 1 LOW, fixed: (HIGH) the gamepad laptop-mic record() promise restored music (game.music.start()) WITHOUT a liveness guard, so if the match ended (finish/Escape both stop music) during the in-flight record (~record + abort window), the late resolve turned the shared music singleton back ON over the result/title screen with no way to silence it. Fixed: the record .then now guards `if (!alive || gPhase !== "record") return;` BEFORE any game.music.start(), and the .catch is guarded too; on an empty transcript it now calls gEnd() to re-prompt immediately instead of waiting out the cap. (LOW) the record cap (was 11s) could be shorter than record()'s worst case (5s record + 9s fetch-abort = 14s), dropping a valid slow transcript; fixed by lowering the laptopMic /asr fetch abort 9000->6000 and raising G_RECORD_WAIT 11->13 (5+6=11 < 13). Verified headless: a stale record resolving after the scene exits does NOT restart music; the normal one-dry happy path still ducks+restores+forges; tsc clean, no console errors. LESSON: any async callback that mutates a shared/singleton (music, arsenals) must be guarded by the scene-alive flag, not just the in-scene state.
- (2026-06-18) P21 controller-focus pass (user is SOLELY on controller mode now; "there is no xbox mic, it is always the laptop mic" = my terminology confused them). (1) CONTROLLER TUTORIAL: generalized tutorial.ts to support gamepad (was phone-only). isPad branch: input(s) reads GamepadController(game.padIndex[s]).sample() instead of hub.state; required=[true,true]; the warmup (real fighters + MOVE/JUMP/THROW-or-MELEE checkpoints + "NICE!" dwell + double-jump grace) is unchanged (it just consumes input(s)); the SHOUT page is SERIALIZED for pads (one shared laptop mic): tickPadShout/onPadShout/nextPadSlot run P1 then P2 (ready -> record(ducks music) -> forge -> reveal), each shout forged into game.pendingWeapon so it becomes that player's FIRST weapon (replacing the seeded mock). Controller flow is now gamepadLobby -> tutorial -> fight (rematch skips it). The phone path is untouched. (2) GAMEPAD NAME ENTRY: the gamepad lobby now has a CLAIM phase (press a button to bind your pad) THEN a NAME phase where each player types with their own pad (stick L/R cycles a letter from CHARS, A appends up to 10, B deletes), stored in game.profiles[].username (used by HUD + result leaderboard + tutorial tags). Edge trackers are primed on the claim->name transition so the claim button press does not type a letter. (3) MORE-FREQUENT SHOUT: the gamepad fight forge now triggers when a player is OUT or ABOUT TO be out of ammo (items null OR ammo <= G_LOW_AMMO=1), with G_READY 3->2 and G_COOLDOWN 1.6->1.2 for a snappier loop (shouting is the fun part). (4) SPRITE FALLBACK: content/remote.ts borrowSprite() returns a random previously-generated sprite from the session library; forgeItem sets item.spriteUrl = url || borrowSprite() so a weapon whose own sprite fails shows a real (borrowed) sprite instead of the flat emoji. Verified headless (fake pads + fake mic): controller tutorial warmup->serialized shout->complete->fight with both shouts equipped as first weapons; name entry types into game.profiles + routes to the tutorial; the fight prompts at ammo<=1 (not while well-armed); tsc clean, no console errors.
  - P21 REVIEW PASS (3-lens Workflow) found 1 HIGH + 3 MEDIUM, all fixed: (HIGH) the serialized pad shout's onPadShout un-ducked music BEFORE the staleness guard (same class as the P20 fix, inverted) so a slow P1 record resolving during P2's recording un-ducked mid-capture; fixed by guarding `if (!alive || padShoutSlot !== s || padPhase !== "record") return;` BEFORE game.music.start() (and the record .catch likewise). (MED) the two players share ONE laptop mic but P2's record was gated only on READY, not on the mic being free; added LaptopMic.busy + a "GET SET! one sec..." hold so P2 never opens the mic while P1's record is in flight (would have returned "" and silently dropped P2's first-weapon shout). (MED) GLOBAL_CAP 52->82 + the pad forge backstop 12->8 so two serialized slow shouts both finish via shoutDone before the hard cap (was clipping P2). (MED) gEnd() now uses a LONG backoff (14-18s) when nothing forged AND the serviced players are still armed (merely low, not out), so a hoarder / dead-mic player is not re-prompted every 1.2s; a genuinely OUT player keeps the short cooldown. Verified headless: controller tutorial still completes with both shouts equipped; armed-low failed shout prompts ONCE then backs off, out-of-ammo keeps prompting. tsc clean, no console errors.
- (2026-06-18) P22 controller feel + rescue pickup + name entry. (1) PER-PLAYER SHOUT (fight.ts gamepad forge REWRITTEN to feel like phone mode): was a single machine that captured the dry SET at cycle start and framed it "BOTH SHOUT!" (felt forced + a late player waited a whole cycle). Now each player is prompted INDEPENDENTLY the moment they run dry (items null OR ammo<=1), shown above their own head; the ONE laptop mic opens a single window for the currently-dry set, and a player who runs dry while a window is in ready/record LATE-JOINS it (no waiting a separate cycle); both shouting together still splits into two distinct weapons dealt at random. State: micPhase/micT/micSlots/micForged/micPairs/micCycle + per-player pmtGap (long 14-18s backoff when a still-armed-low shout misses, short G_COOLDOWN when genuinely out). G_READY 2->1.5. No more "BOTH SHOUT!" text. Verified headless: only-one-out forges only that player; both-out -> two distinct, one mic call; late-join -> one window serves both. (2) BOTH-OUT RESCUE PICKUP (match.ts): when BOTH players are out of ammo (live modes), tickPickup drops ONE contested weapon at a random upper spot (y 4.2-6.6, reachable), borrowed from a session weaponLib (recent forged weapons, filled in injectWeapon; cloned with ammo=min(3,..)); first fighter within 1.2m grabs it (grabPickup -> injectWeapon + juice). Despawns on grab / 14s life / both re-armed; pickupGap cooldown; reset on advance + KO. Rendered in fight.ts syncPickup (glow + sprite-or-emoji + name + "GRAB IT!", bobbing). Verified: spawns when both out, grabbed weapon has ammo 3, clears on grab. (3) NAME ENTRY via mouse+keyboard: the gamepad lobby's pad letter-picker was replaced with two HTML <input> fields (host types), read into game.profiles on start, removed in exit/start. Verified: typed names -> profiles -> tutorial, inputs cleaned up. tsc clean, no console errors. NOTE: there is only ever the LAPTOP mic (controllers have none); "xbox mic" was just confusing terminology.
  - P22 REVIEW PASS (3-lens Workflow) found 1 HIGH + 1 MEDIUM, fixed: (HIGH) the per-player mic machine ducked music in micStartRecord but only un-ducked inside the record .then/.catch (behind the alive+cycle guard); a window torn down mid-record by a KO/roundover (micEnd via the match.state!=="fight" branch) or the G_RECORD_WAIT watchdog bumped micCycle, so the late record resolve's guard skipped the un-duck and music stayed DEAD for the rest of the match (an over-correction of the P20 guard-before-start fix). Fixed by making micEnd() the single teardown funnel that calls game.music.start() first (idempotent). (MEDIUM) when both were out the rescue pickup could be grabbed mid-window (re-arming a player), but micStartRecord captured serve=micSlots.slice() un-filtered and micReveal injected into all of them, clobbering the grabbed pickup; fixed by re-filtering serve to still-dry slots at transcript time (`micSlots.filter(gDry)`), bailing via micEnd(true) if none remain. Verified headless: music ducks at record + restores on a mid-record KO teardown (stale resolve errors cleanly); a pickup grabbed mid-window is kept while the still-dry player forges. tsc clean, no console errors. LESSON: a duck must be paired with an un-duck on the SINGLE teardown path, not only on the async success/catch (which a guard can skip).

- (2026-06-18) P23 webcam caricature faces + a fun sound system (controller focus). The design Workflow hit the session token limit and returned nothing, so both were built directly. (1) WEBCAM CARICATURE FACES (client/src/util/face.ts, new): in the CONTROLLER lobby, grab ONE laptop-webcam frame, split it left/right for the two players, and turn each face into a VERY animated funny caricature head, PURELY client-side canvas (no backend, no GPU, nothing touching the forge pipeline). Technique: crop the upper-centre of each half, a radial BULGE/fisheye warp (magnifies the centre = big-eyes/nose caricature), saturation + contrast boost, 5-level posterise, circular mask + a thick accent ring -> Texture.from(canvas) -> game.profiles[s].headTex (the existing cosmetic head slot, FighterView already wears it). Plus a BODY trait: the dominant shirt colour (lower region) -> game.profiles[s].bodyTint; FighterView now fills the body with bodyTint (kept the accent glow/ring/name for readability). Wired in gamepadLobby.ts: grabPlayerFaces([p1,p2]) on enter (faceTex/faceTint), start() builds profiles with headTex+bodyTint; graceful fallback (no webcam / declined -> [null,null] -> the procedural fighters). Privacy: in-memory, the camera is stopped immediately, nothing uploaded. (2) FUN SOUND SYSTEM (audio/mode.ts new + music.ts + sfx.ts rewritten): a new "fun" mode (default) is a warmer, less-repetitive Am-F-C-G loop (sine bass + soft triangle pad + sparse pluck, behind a master gain at 0.5) and juicier SFX (whoosh throw, layered damage-scaled hit, KO boom+sweep, plus NEW forged() sparkle, pickup() chime, bell(), ui()); the original is kept as "classic" backup, toggled from a new title menu item "SOUND: FUN/CLASSIC" (localStorage `micdrop_sound`). Both Music and Sfx read soundMode(). forged() plays on Match.injectWeapon (every new weapon), pickup() on the rescue grab. The new music still uses start()/stop(), so the existing shout-mic DUCK (game.music.stop() during record) is unchanged. Verified headless: faces degrade gracefully with no camera, the sound toggle flips, all SFX + the new music start/stop without throwing, the title SOUND item + lobby face-scan status render, a bodyTint fighter constructs; tsc clean, no console errors. The caricature visual + the sound vibe need a real-device test (camera + speakers). NOTE: did NOT use SD img2img for faces (would share + risk the forge GPU pipeline; the user asked for easy/fast/no-mechanics-risk).

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
