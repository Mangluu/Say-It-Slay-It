# MIC DROP

**Shout it. Forge it. Throw it.** A local couch brawler where your weapons are
*generated from what you say*. Before each round you type (P4: shout) a few
phrases; a local LLM turns each into a funny weapon; then you brawl, lobbing your
absurd arsenal until someone gets knocked off the stage.

The hook is **comedy + spectacle + skill**: the AI *arms* you, but your skill
decides the fight — and because every weapon's numbers come from a fixed
server-side stat table (not the LLM), it can never grief the match.

Built for the **Game AI Summer School Jam 2026 (Leiden)**. Runs **fully locally**
(Ollama + SD-Turbo on the laptop GPU) — no cloud, no per-play cost, works on a
LAN with no internet.

---

## Run it
**Prereqs (one time):**
```powershell
ollama pull qwen2.5:3b-instruct
py -3.11 -m venv server\.venv
server\.venv\Scripts\pip install -r server\requirements.txt
# for sprite gen on the RTX 5090 (Blackwell), install torch from the cu128 index FIRST:
server\.venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
npm --prefix client install
```
**Launch (showcase):**
```powershell
scripts\run_show.ps1      # starts backend + client, opens the browser (F11 = fullscreen)
```
**Or manually:**
```powershell
server\.venv\Scripts\python -m uvicorn app.main:app --app-dir server --host 0.0.0.0 --port 8000
npm --prefix client run dev
# open http://localhost:5173
```

## Controls
- **P1:** `A/D` move · `W` jump (double-jump in air) · `F` throw · `G` dash · `T` melee
- **P2:** `←/→` move · `↑` jump · `,` throw · `.` dash · `/` melee
- Menus: `W/S` or `↑/↓` + `Enter`. `Esc` quits a match.

## Modes
- **Solo Score Attack** — forge an arsenal, then survive endless CPU waves; score + high-score table.
- **Versus (2 players)** — both forge, then best-of-3 on the couch.
- **Quick Play** — random weapons, straight into a fight.
- **Weapon Hall of Fame** — cycles the funniest weapons forged this session.

## How it works
```
phone/keyboard ─▶ InputState ─▶ Controller (human / CPU) ─▶ Fighter (planck physics)
                                                                   │
type a phrase ─▶ /forge/item ─▶ Ollama (Qwen2.5-3B, JSON) ─▶ ItemSpec ──▶ Match
                                  (name/archetype/flavor only)      (stats stamped
   /forge/sprite ─▶ SD-Turbo ─▶ rembg ─▶ transparent PNG ──────────▶ from archetype table)
```
- **client/** — PixiJS 8 + planck + Vite + TS. Scene system (title → forge → fight → result → leaderboard / hall). Fixed-timestep combat, damage-percent + SSBWiki knockback, ring-out, juice (hitstop, screenshake, particles, slow-mo KO, countdown).
- **server/** — FastAPI. `/forge/item` (Ollama JSON forging), `/forge/sprite` (SD-Turbo + rembg), curated-pool fallback (safe mode).
- **shared/** — `archetypes.json` (the stat table), `item_schema.json`.

### The fairness firewall
The LLM returns **only** `name`, `archetype` (a closed enum), and `flavor` —
**no numbers**. Stats are stamped from `archetypes.json`. So no matter what a
player shouts ("an invincible one-shot gun"), power is bounded and fair.

### Reliability / safe mode
Forging falls back to a curated pool on timeout/error. Set `MICDROP_SPRITES=0`
to disable image gen. The whole game is playable with **zero AI** (Quick Play +
the mock pool), so the booth always has a guaranteed fallback.

## Status
- ✅ **P0** scaffold + fighter, **P1** combat + items + juice, **P2** solo + leaderboard + game flow + graphics overhaul, **P3** backend + local LLM forging (Qwen2.5-3B), **P6 (partial)** countdown, slow-mo KO, Hall of Fame, ops.
- ⏳ **P5** SD-Turbo sprite endpoint built; client art-swap wiring is the next step.
- ⏳ **P4** phones-as-controllers + voice (faster-whisper) — designed, not yet built (needs on-site phone + HTTPS testing).

### Notes
- On this Blackwell/Ollama build the 7B ran slowly (~5 tok/s), so we use **Qwen2.5-3B** (~4s/forge). `torch 2.11+cu128` confirmed working on the 5090 (`get_device_capability() == (12,0)`). Override the model with `MICDROP_MODEL`.

## Provenance
Local models: Qwen2.5 (Apache-2.0 weights via Ollama), SD-Turbo (Stability AI Community License, free under $1M rev). Code deps MIT/Apache/BSD. Fighter art + UI drawn at runtime (ours). SFX/music procedurally synthesised (ours). Every weapon sprite is generated locally.
