import { Container, Graphics, Sprite, Text } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { GameWorld } from "../game/world";
import { buildFloor, randomLayout, buildPlatforms, STAGE_SPAWN } from "../game/stage";
import { Fighter } from "../game/fighter";
import { Match } from "../game/match";
import { Juice } from "../game/juice";
import { Projectile } from "../game/projectile";
import { KeyboardController } from "../game/controller";
import { CpuController } from "../game/cpu";
import { GamepadController, rumblePad } from "../input/gamepad";
import { FighterView } from "../render/fighterView";
import { buildStageView } from "../render/stageView";
import { Hud } from "../ui/hud";
import { mkText } from "../ui/theme";
import { record } from "../util/hall";
import { logEvent, flush } from "../net/log";
import { loadTex } from "../util/tex";
import { ItemSpec } from "../content/types";

export function FightScene(game: Game): Scene {
  const container = new Container();
  let gw: GameWorld;
  let match: Match;
  let juice: Juice;
  let hud: Hud;
  let f0: Fighter, f1: Fighter;
  let v0: FighterView, v1: FighterView;
  let cpu: CpuController | undefined;
  let projLayer: Container;
  let zoneG: Graphics;
  let pickupView: Container | undefined; // the both-out rescue pickup (created when one drops)
  let platLayer: Container;            // one-way platforms (regenerated at runtime)
  let platformBodies: import("planck").Body[] = [];
  let stageT = 0;                      // seconds until the next stage shift
  let shiftTxt: Text;                  // "STAGE SHIFT!" telegraph
  let shiftT = 0;
  let alive = true;                    // false after exit(): drop in-flight async forges
  interface PView { c: Container; g: Graphics; emoji?: Text; sprited: boolean; }
  const projViews = new Map<Projectile, PView>();
  let ended = false;
  let endT = 0;

  // Live mid-fight forge loop (phone mode only). A PER-PLAYER state machine on a paced,
  // completion-gated cadence: a prompt card pops ABOVE THAT PLAYER'S HEAD, opens their
  // phone mic, forges the shouted weapon, then a punchy reveal (shake + flash + name +
  // sprite) as it drops into play. Both players can forge AT THE SAME TIME. A prompt is
  // mandatory the moment a player runs dry (ammo zero), with the occasional swap prompt
  // while still armed. The game keeps flowing throughout (no full slow-mo).
  type LivePhase = "idle" | "ready" | "record" | "forge" | "reveal";
  let liveForge = false;
  interface POverlay { node: Container; txt: Text; sub: Text; sprites: Container; ring: Graphics; }
  let pOv: POverlay[] = [];          // one prompt card per player, anchored above their head
  let pnames = ["P1", "P2"];
  const phase: LivePhase[] = ["idle", "idle"];
  const fT = [0, 0];                 // timer within the current phase, per slot
  const fItem: (ItemSpec | null)[] = [null, null];
  const fTex: any[] = [null, null];  // preloaded sprite texture (null = none / not ready)
  const spriteLoading = [false, false];
  const revealT = [0, 0];
  const revealShown = [false, false];
  const gapT = [0, 0];               // seconds until the next *random* (still-armed) prompt
  const READY_SECS = 3.0;  // get-ready countdown (3..2..1) BEFORE the mic opens
  const FORGE_HARD = 28.0; // give up only if the LLM never returns (covers the 25s provider abort)
  const RECORD_SECS = 5.0; // how long the mic records once it opens
  const RECORD_WAIT = 11.0; // seconds to wait for a transcript before re-prompting

  // GAMEPAD (Xbox) mode forges through ONE shared laptop mic, so unlike phone mode this is a
  // single serialized machine that services whoever is disarmed: one player -> one weapon;
  // both players -> they shout together, two weapons are forged and dealt out at random.
  let gamepadForge = false;
  // Controller mode shares ONE laptop mic but PROMPTS PER PLAYER (like phone mode): each player
  // is asked to shout the moment they run dry, shown above their own head. The mic opens one
  // window at a time; a player who goes dry while a window is open JOINS it (so nobody waits a
  // whole other cycle) and both can shout together (split into two weapons). Not forced-together.
  type GPhase = "idle" | "ready" | "record" | "forge" | "reveal";
  let micPhase: GPhase = "idle";
  let micT = 0;
  let micSlots: number[] = [];                      // players the current window serves
  let micForged = false;
  let micPairs: { slot: number; item: ItemSpec }[] = [];
  let micCycle = 0;                                 // invalidates a forge that resolves after its window ended
  const pmtGap = [0, 0];                            // per-player: do not (re)prompt until this elapses
  const gLabel: (string | null)[] = [null, null];
  const G_READY = 3.0, G_RECORD_MS = 5000, G_RECORD_WAIT = 13.0, G_FORGE_HARD = 28.0, G_REVEAL = 1.3, G_COOLDOWN = 1.2; // G_READY = 3..2..1 countdown, like phone mode
  const G_LOW_AMMO = 1; // prompt when a player is OUT or about to be out (<= this many shots): shouting is the fun part

  function makeOverlay(): POverlay {
    const node = new Container(); node.visible = false;
    const bg = new Graphics();
    bg.roundRect(-150, -40, 300, 74, 14).fill({ color: 0x0a0a12, alpha: 0.82 });
    bg.roundRect(-150, -40, 300, 74, 14).stroke({ width: 2, color: 0xffffff, alpha: 0.14 });
    const ring = new Graphics(); // bright animated border that blinks / flashes colour
    ring.roundRect(-150, -40, 300, 74, 14).stroke({ width: 4, color: 0xffffff, alpha: 1 });
    const sprites = new Container(); // holds the generated sprite during the reveal
    const txt = mkText("", 28, C.COL.yellow, "900"); txt.anchor.set(0.5); txt.position.set(0, -12);
    const sub = mkText("", 24, C.COL.white, "900"); sub.anchor.set(0.5); sub.position.set(0, 16);
    node.addChild(bg, ring, sprites, txt, sub);
    return { node, txt, sub, sprites, ring };
  }

  // Make a shout prompt impossible to miss: a fast blink + scale pulse, the border flashing
  // yellow<->red, and the headline blinking. Called every frame for any visible prompt.
  function animatePrompt(o: POverlay) {
    const t = performance.now();
    const blink = 0.5 + 0.5 * Math.sin(t / 90);   // ~5 Hz
    o.node.scale.set(1 + 0.08 * Math.sin(t / 110));
    o.ring.alpha = 0.25 + 0.75 * blink;
    o.ring.tint = blink > 0.5 ? 0xffe14a : 0xff4d4d; // flash yellow <-> red
    o.txt.alpha = 0.55 + 0.45 * blink;
  }

  function setPrompt(slot: number, big: string, sub: string) {
    const o = pOv[slot];
    o.node.visible = true;
    o.txt.text = big;
    (o.txt.style as any).fill = slot === 0 ? C.COL.p1 : C.COL.p2;
    o.sub.text = sub;
  }

  function startPrompt(slot: number) {
    phase[slot] = "ready"; fT[slot] = 0; // count 3..2..1 FIRST; the mic only opens when it hits zero
    fItem[slot] = null; fTex[slot] = null; spriteLoading[slot] = false; revealShown[slot] = false;
    pOv[slot].sprites.removeChildren();
    logEvent("forge_prompt", { slot, name: pnames[slot] });
  }

  function startRecording(slot: number) {
    phase[slot] = "record"; fT[slot] = 0;
    logEvent("forge_record", { slot });
    game.phoneHub!.send(slot, { type: "record", ms: RECORD_SECS * 1000 }); // phone buzzes + records NOW
  }

  function onLiveVoice(slot: number, text: string) {
    if (!liveForge || phase[slot] !== "record" || !text) return;
    logEvent("voice", { slot, text });
    phase[slot] = "forge"; fT[slot] = 0; fItem[slot] = null; fTex[slot] = null; spriteLoading[slot] = false; revealShown[slot] = false;
    game.provider.forgeItem(text, slot).then((item) => {
      if (!alive) return; // scene exited mid-forge; drop it (no stale match mutation)
      fItem[slot] = item; record(item);
      match.injectWeapon(slot, item); // assign the MOMENT it resolves, regardless of phase/round transition
      logEvent("forge_result", { slot, text, name: item.name, archetype: item.archetype });
      logEvent("weapon_assigned", { slot, name: item.name, archetype: item.archetype });
    }).catch(() => { /* LocalProvider already returns a mock fallback item on error */ });
  }

  function startReveal(slot: number) {
    phase[slot] = "reveal"; revealT[slot] = 1.2;
    // a quick punchy pop (shake + flash + burst at the head), NOT a full slow-mo: a player
    // running dry triggers this often, so pausing the whole sim each time would kill the flow.
    const f = match.fighters[slot];
    juice.shake(0.35); juice.doFlash(0.26, 0.12);
    juice.burst(C.px(f.pos.x), C.sy(f.pos.y + f.halfH * f.size), slot === 0 ? C.COL.p1 : C.COL.p2, 16, 240);
    setPrompt(slot, "FORGED!", fItem[slot] ? `${fItem[slot]!.emoji} ${fItem[slot]!.name}` : "");
    pOv[slot].sprites.removeChildren();
    revealShown[slot] = false; spriteLoading[slot] = false; fTex[slot] = null;
  }

  function endForge(slot: number) {
    pOv[slot].sprites.removeChildren();
    pOv[slot].node.visible = false;
    phase[slot] = "idle"; fItem[slot] = null; fTex[slot] = null; spriteLoading[slot] = false;
    gapT[slot] = 12 + Math.random() * 6; // next *random* swap prompt; running dry re-prompts at once
  }

  function tickLive(dt: number) {
    if (!liveForge) return;
    for (let s = 0; s < 2; s++) tickSlot(s, dt);
  }

  function tickSlot(slot: number, dt: number) {
    const o = pOv[slot];
    if (match.state !== "fight") { if (phase[slot] !== "idle") endForge(slot); else o.node.visible = false; return; }

    // anchor the card just above this fighter's head each frame (where their eyes are)
    if (phase[slot] !== "idle") {
      const f = match.fighters[slot];
      o.node.position.set(C.px(f.pos.x), Math.max(46, C.sy(f.pos.y + f.halfH * f.size + 1.25)));
    }

    if (phase[slot] === "idle") {
      o.node.visible = false;
      if (!game.phoneHub?.joined[slot]) return;             // no phone on this slot
      if (!match.items[slot]) { startPrompt(slot); return; } // AMMO ZERO -> shout NOW (mandatory)
      gapT[slot] -= dt;
      if (gapT[slot] <= 0) startPrompt(slot);                // occasional swap prompt while still armed
      return;
    }
    if (phase[slot] === "ready") {
      fT[slot] += dt;
      const rem = Math.ceil(Math.max(0, READY_SECS - fT[slot]));
      setPrompt(slot, "GET READY!", rem > 0 ? String(rem) : "GO!");
      if (fT[slot] >= READY_SECS) startRecording(slot); // countdown done -> open the mic
      return;
    }
    if (phase[slot] === "record") {
      fT[slot] += dt;
      const rem = Math.max(0, RECORD_SECS - fT[slot]);
      if (rem > 0) setPrompt(slot, "SHOUT NOW!", String(Math.ceil(rem)));
      else setPrompt(slot, "FORGING...", ""); // no separate "listening" beat; goes straight to forging
      if (fT[slot] > RECORD_WAIT) { logEvent("forge_missed", { slot }); endForge(slot); } // nothing heard
      return;
    }
    if (phase[slot] === "forge") {
      fT[slot] += dt;
      setPrompt(slot, "FORGING", fItem[slot] ? fItem[slot]!.name : "...");
      if (fItem[slot]) { startReveal(slot); return; } // weapon already equipped in onLiveVoice; play the beat
      if (fT[slot] > FORGE_HARD) { logEvent("forge_timeout", { slot }); endForge(slot); }
      return;
    }
    // reveal: weapon is already equipped; this is the dramatic beat. The sprite finishes
    // loading a beat after the forge, so swap it into the card when it arrives.
    const it = fItem[slot];
    if (it?.spriteUrl && !spriteLoading[slot]) { spriteLoading[slot] = true; loadTex(it.spriteUrl).then((t) => { fTex[slot] = t; }).catch(() => {}); }
    if (fTex[slot] && !revealShown[slot]) {
      revealShown[slot] = true;
      const s = new Sprite(fTex[slot]); s.anchor.set(0.5); s.width = s.height = 64; s.position.set(0, -66);
      o.sprites.addChild(s);
    }
    revealT[slot] -= dt;
    if (revealT[slot] <= 0) endForge(slot);
  }

  // ---- gamepad mode: one shared laptop mic, services the disarmed player(s) ----
  function posPrompt(s: number) {
    const f = match.fighters[s];
    pOv[s].node.position.set(C.px(f.pos.x), Math.max(46, C.sy(f.pos.y + f.halfH * f.size + 1.25)));
  }

  const gDry = (s: number) => !match.items[s] || match.ammo[s] <= G_LOW_AMMO; // out, or about to be

  function micEnd(served: boolean) {
    game.music.start(); // restore the bed: this is the single teardown funnel, so a window torn
                        // down mid-record (KO/roundover, or the watchdog) can never leave it ducked
    // back off any serviced-but-not-armed player: long if they merely hoarded a low weapon /
    // could not be heard (do not nag), short if they are genuinely OUT (they need one).
    for (const s of micSlots) {
      if (!gDry(s)) continue;                       // got re-armed this window
      pmtGap[s] = (!served && !!match.items[s]) ? 14 + Math.random() * 4 : G_COOLDOWN;
    }
    micPhase = "idle"; micT = 0; micSlots = []; micForged = false; micPairs = []; micCycle++;
    gLabel[0] = gLabel[1] = null;
    for (let s = 0; s < 2; s++) pOv[s].node.visible = false;
  }

  function micForge(slots: number[], text: string, cyc: number) {
    micPhase = "forge"; micT = 0;
    logEvent("voice", { slots, text, mode: "gamepad" });
    if (slots.length <= 1) {
      const s = slots[0];
      game.provider.forgeItem(text, s).then((it) => { if (micCycle === cyc) { micPairs = [{ slot: s, item: it }]; micForged = true; } }).catch(() => {});
    } else {
      // both shouted into the ONE mic: split the transcript so the two weapons are DISTINCT,
      // then deal them out at random. .catch -> null so one failed forge still arms the other.
      const words = text.split(/\s+/).filter(Boolean), h = Math.ceil(words.length / 2);
      const t1 = words.length >= 2 ? words.slice(0, h).join(" ") : text;
      const t2 = words.length >= 2 ? words.slice(h).join(" ") : text;
      logEvent("voice_split", { text, t1, t2, mode: "gamepad" });
      Promise.all([game.provider.forgeItem(t1, slots[0]).catch(() => null), game.provider.forgeItem(t2, slots[1]).catch(() => null)]).then(([a, b]) => {
        if (micCycle !== cyc) return;
        const got = [a, b].filter(Boolean) as ItemSpec[];
        if (!got.length) return;
        if (got.length === 1) micPairs = [{ slot: slots[0], item: got[0] }, { slot: slots[1], item: got[0] }];
        else { const sw = Math.random() < 0.5; micPairs = [{ slot: slots[0], item: sw ? b! : a! }, { slot: slots[1], item: sw ? a! : b! }]; }
        micForged = true;
      });
    }
  }

  function micStartRecord() {
    micPhase = "record"; micT = 0; micForged = false; micPairs = [];
    const cyc = ++micCycle;
    logEvent("forge_record", { slots: micSlots.slice(), mode: "gamepad" });
    for (const s of micSlots) rumblePad(game.padIndex[s], G_RECORD_MS, 0.45, 0.85); // buzz for the whole shout window
    game.music.stop(); // duck so the laptop mic does not just hear its own speakers
    game.laptopMic!.record(G_RECORD_MS).then((text) => {
      // guard BEFORE touching music: a late resolve must never un-duck a dead/other window.
      if (!alive || micCycle !== cyc || micPhase !== "record") return;
      game.music.start();
      // serve only players who are STILL dry: drop anyone re-armed mid-window (e.g. grabbed the
      // rescue pickup) so the forge does not clobber the weapon they just picked up.
      const serve = micSlots.filter((s) => gDry(s));
      if (!serve.length) { micEnd(true); return; }
      if (!text) { logEvent("forge_missed", { slots: serve, mode: "gamepad", reason: "empty_transcript" }); micEnd(false); return; }
      micForge(serve, text, cyc);
    }).catch(() => { if (alive && micCycle === cyc && micPhase === "record") { game.music.start(); micEnd(false); } });
  }

  function micReveal() {
    for (const { slot, item } of micPairs) {
      match.injectWeapon(slot, item); record(item);
      gLabel[slot] = `${item.emoji} ${item.name}`;
      logEvent("weapon_assigned", { slot, name: item.name, archetype: item.archetype, mode: "gamepad" });
    }
    micPhase = "reveal"; micT = 0;
    juice.shake(0.35); juice.doFlash(0.26, 0.12);
    for (const { slot } of micPairs) { const f = match.fighters[slot]; juice.burst(C.px(f.pos.x), C.sy(f.pos.y + f.halfH * f.size), slot === 0 ? C.COL.p1 : C.COL.p2, 16, 240); }
  }

  function tickGamepadForge(dt: number) {
    if (!gamepadForge) return;
    if (match.state !== "fight") { if (micPhase !== "idle") micEnd(false); else for (let s = 0; s < 2; s++) pOv[s].node.visible = false; return; }
    for (let s = 0; s < 2; s++) if (pmtGap[s] > 0) pmtGap[s] -= dt;

    if (micPhase === "idle") {
      const want = [0, 1].filter((s) => gDry(s) && pmtGap[s] <= 0);
      if (want.length && game.laptopMic && !game.laptopMic.busy) {
        micSlots = want; micPhase = "ready"; micT = 0;
        for (const s of want) rumblePad(game.padIndex[s], 250, 0.3, 0.5); // a "get ready" nudge
        logEvent("forge_prompt", { slots: micSlots, mode: "gamepad", names: micSlots.map((s) => pnames[s]) });
      }
    } else {
      micT += dt;
      // late join: a player who runs dry while this window is still open shouts into it too
      if (micPhase === "ready" || micPhase === "record") for (const s of [0, 1]) if (gDry(s) && pmtGap[s] <= 0 && !micSlots.includes(s)) micSlots.push(s);
      if (micPhase === "ready") { if (micT >= G_READY) micStartRecord(); }
      else if (micPhase === "record") { if (micT > G_RECORD_WAIT) micEnd(false); }
      else if (micPhase === "forge") { if (micForged) micReveal(); else if (micT > G_FORGE_HARD) micEnd(false); }
      else if (micT > G_REVEAL) micEnd(true);
    }

    // a prompt floats above EVERY player who needs a weapon (independent, like phone mode)
    for (let s = 0; s < 2; s++) {
      const inWin = micPhase !== "idle" && micSlots.includes(s);
      const waiting = gDry(s) && pmtGap[s] <= 0 && !inWin; // dry but the shared mic is busy with the other window
      if (!inWin && !waiting) { pOv[s].node.visible = false; continue; }
      posPrompt(s);
      if (!inWin) setPrompt(s, "SHOUT A WEAPON", "ready...");
      else if (micPhase === "ready") { const r = Math.ceil(Math.max(0, G_READY - micT)); setPrompt(s, "GET READY!", r > 0 ? String(r) : "GO!"); }
      else if (micPhase === "record") setPrompt(s, "SHOUT NOW!", "");
      else if (micPhase === "forge") setPrompt(s, "FORGING", gLabel[s] || "...");
      else setPrompt(s, "FORGED!", gLabel[s] || "");
    }
  }

  function regenStage() {
    for (const b of platformBodies) gw.world.destroyBody(b);
    const layout = randomLayout();
    platformBodies = buildPlatforms(gw, layout);
    platLayer.removeChildren();
    platLayer.addChild(buildStageView(layout));
    juice.shake(0.4); juice.doFlash(0.22, 0.18);
    shiftTxt.visible = true; shiftT = 1.1;
    logEvent("stage_shift", { platforms: layout.length });
  }

  function syncProjectiles() {
    const live = new Set(match.projectiles);
    for (const [pr, v] of projViews) if (!live.has(pr)) { v.c.destroy(); projViews.delete(pr); }
    for (const pr of match.projectiles) {
      let v = projViews.get(pr);
      if (!v) {
        const c = new Container();
        const g = new Graphics();
        const r = C.px(pr.radius);
        g.circle(0, 0, r * 1.6).fill({ color: pr.spec.color, alpha: 0.28 }); // glow halo
        c.addChild(g);
        // Bundled fallback: render the weapon's emoji so the throw ALWAYS reads as
        // a thing (the keyboard you shouted), even with zero AI / safe mode / no GPU.
        let emoji: Text | undefined;
        if (pr.spec.emoji) {
          emoji = new Text({ text: pr.spec.emoji, style: { fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial", fontSize: Math.max(34, r * 4.5) } });
          emoji.anchor.set(0.5);
          c.addChild(emoji);
        } else {
          g.circle(0, 0, r).fill(pr.spec.color);
          g.circle(0, 0, r).stroke({ width: 2, color: 0x0a0a12 });
        }
        projLayer.addChild(c);
        v = { c, g, emoji, sprited: false };
        projViews.set(pr, v);
      }
      // swap to the AI sprite once it arrives (the literal thing you said)
      if (pr.spec.spriteUrl && !v.sprited) {
        v.sprited = true;
        const view = v;
        loadTex(pr.spec.spriteUrl).then((tex) => {
          const s = new Sprite(tex); s.anchor.set(0.5);
          const sz = C.px(pr.radius) * 6; s.width = sz; s.height = sz;
          view.c.addChild(s);
          if (view.emoji) view.emoji.visible = false; // keep the glow halo behind it
        }).catch(() => { /* keep the emoji/circle fallback */ });
      }
      const p = pr.body.getPosition();
      v.c.x = C.px(p.x); v.c.y = C.sy(p.y);
      if (!v.sprited) { if (v.emoji) v.emoji.rotation += 0.12; else v.g.rotation += 0.2; }
    }
  }

  function syncZones() {
    zoneG.clear();
    for (const z of match.zones) {
      const col = z.kind === "slow" ? 0xff9ad2 : 0x9ad84a;
      const pulse = 0.10 + 0.06 * (0.5 + 0.5 * Math.sin(z.x * 3 + performance.now() / 220));
      zoneG.circle(C.px(z.x), C.sy(z.y), C.px(z.r)).fill({ color: col, alpha: pulse });
      zoneG.circle(C.px(z.x), C.sy(z.y), C.px(z.r)).stroke({ width: 2, color: col, alpha: 0.4 });
    }
  }

  function syncPickup() {
    const pk = match.pickup;
    if (!pk) { if (pickupView) { pickupView.destroy(); pickupView = undefined; } return; }
    if (!pickupView) {
      pickupView = new Container();
      const g = new Graphics();
      g.circle(0, 0, 30).fill({ color: C.COL.yellow, alpha: 0.20 });
      g.circle(0, 0, 30).stroke({ width: 3, color: C.COL.yellow, alpha: 0.75 });
      pickupView.addChild(g);
      if (pk.item.spriteUrl) {
        loadTex(pk.item.spriteUrl).then((tex) => { if (!pickupView) return; const s = new Sprite(tex); s.anchor.set(0.5); s.width = s.height = 50; pickupView.addChildAt(s, 1); }).catch(() => { /* keep the emoji */ });
      } else {
        const em = new Text({ text: pk.item.emoji || "🎁", style: { fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial", fontSize: 40 } });
        em.anchor.set(0.5); pickupView.addChild(em);
      }
      const lbl = mkText(pk.item.name.slice(0, 16), 16, C.COL.white, "900"); lbl.anchor.set(0.5, 0); lbl.position.set(0, 34); pickupView.addChild(lbl);
      const grab = mkText("GRAB IT!", 15, C.COL.yellow, "900"); grab.anchor.set(0.5, 1); grab.position.set(0, -34); pickupView.addChild(grab);
      projLayer.addChild(pickupView);
    }
    pickupView.position.set(C.px(pk.x), C.sy(pk.y) + Math.sin(performance.now() / 240) * 6);
    pickupView.scale.set(1 + 0.06 * Math.sin(performance.now() / 150));
  }

  function finish() {
    if (ended) return;
    ended = true;
    logEvent("match_end", { winner: match.winner, mode: game.mode });
    flush();
    game.music.stop();
    if (game.mode === "solo") {
      game.lastScore = match.score; game.lastWave = match.wave;
      game.go("leaderboardEntry", { score: match.score, wave: match.wave });
    } else {
      game.go("result", {
        winner: match.winner,
        names: pnames,
        scores: [match.scores[0], match.scores[1]],
        dealt: [Math.round(match.dealt[0]), Math.round(match.dealt[1])],
      });
    }
  }

  return {
    container,
    enter() {
      gw = new GameWorld();
      alive = true;
      const floor = buildFloor(gw);
      container.addChild(buildStageView([floor.view])); // permanent full-width floor (wrap-around)
      platLayer = new Container(); container.addChild(platLayer);
      const layout0 = randomLayout();
      platformBodies = buildPlatforms(gw, layout0);
      platLayer.addChild(buildStageView(layout0));
      stageT = 15 + Math.random() * 5; // first stage shift ~15-20s in

      zoneG = new Graphics(); // lingering cloud / sticky-trap zones, under the fighters
      container.addChild(zoneG);

      f0 = new Fighter(gw, STAGE_SPAWN[0].x, STAGE_SPAWN[0].y, C.COL.p1, 0);
      f1 = new Fighter(gw, STAGE_SPAWN[1].x, STAGE_SPAWN[1].y, C.COL.p2, 1);
      f1.facing = -1;

      const entities = new Container();
      container.addChild(entities);
      v0 = new FighterView(C.COL.p1, game.profiles[0]);
      v1 = new FighterView(C.COL.p2, game.profiles[1]);
      entities.addChild(v1.node, v0.node);

      projLayer = new Container();
      container.addChild(projLayer);

      juice = new Juice();
      container.addChild(juice.layer, juice.flashG);

      const nm = (p: number) => game.profiles[p]?.username?.trim() || (game.mode === "solo" && p === 1 ? "CPU" : `P${p + 1}`);
      hud = new Hud([C.COL.p1, C.COL.p2], [nm(0), nm(1)]);
      container.addChild(hud.node);

      pOv = [makeOverlay(), makeOverlay()]; // per-player prompt cards, anchored above each head
      container.addChild(pOv[0].node, pOv[1].node);

      shiftTxt = mkText("STAGE SHIFT!", 56, C.COL.yellow, "900");
      shiftTxt.anchor.set(0.5); shiftTxt.position.set(C.DESIGN_W / 2, 110); shiftTxt.visible = false;
      container.addChild(shiftTxt);

      let c0, c1;
      if (game.controlMode === "gamepad") {
        c0 = new GamepadController(game.padIndex[0]);
        c1 = new GamepadController(game.padIndex[1]);
      } else if (game.controlMode === "phone" && game.phoneHub) {
        c0 = game.phoneHub.controller(0);
        c1 = game.phoneHub.controller(1);
      } else {
        c0 = new KeyboardController(game.kb, 0);
        if (game.mode === "solo") { cpu = new CpuController(1); c1 = cpu; }
        else c1 = new KeyboardController(game.kb, 1);
      }

      // A weapon shouted in the tutorial that resolved BEFORE this build: fold it into the
      // arsenal so init() equips it as the player's first weapon. (Late ones inject in update.)
      for (let s = 0; s < 2; s++) { const pw = game.pendingWeapon[s]; if (pw) { game.arsenals[s] = [pw]; game.pendingWeapon[s] = null; } }

      match = new Match(gw, [f0, f1], [c0, c1], game.provider, juice, game.sfx, game.mode, game.arsenals, [nm(0), nm(1)]);
      if (game.mode === "solo") match.onWave = (w) => { if (cpu) cpu.difficulty = 1 + (w - 1) * 0.5; };
      void match.init();
      (window as any).__fight = () => ({ match, f0, f1, regen: regenStage }); // debug hook

      // Live forge loop is phone-versus only; keyboard/solo keep the upfront forge
      // and auto-cycling arsenal, so the booth-safe path is never touched by this.
      pnames = [nm(0), nm(1)];
      liveForge = game.controlMode === "phone" && !!game.phoneHub;
      gamepadForge = game.controlMode === "gamepad";
      match.liveForge = liveForge || gamepadForge; // live mode: run dry -> disarmed until you shout
      if (liveForge) {
        for (let s = 0; s < 2; s++) {
          phase[s] = "idle"; fT[s] = 0; fItem[s] = null; fTex[s] = null;
          spriteLoading[s] = false; revealShown[s] = false;
          gapT[s] = 8 + Math.random() * 5; // first random swap prompt; ammo-zero overrides it
        }
        game.phoneHub!.onVoice = (slot, text) => onLiveVoice(slot, text);
        logEvent("match_start", { mode: game.mode, p0: pnames[0], p1: pnames[1] });
      } else if (gamepadForge) {
        micPhase = "idle"; micT = 0; micSlots = []; micForged = false; micPairs = []; pmtGap[0] = pmtGap[1] = 0; gLabel[0] = gLabel[1] = null;
        logEvent("match_start", { mode: "gamepad", p0: pnames[0], p1: pnames[1] });
      }
    },
    exit() {
      alive = false;
      if (liveForge && game.phoneHub) game.phoneHub.onVoice = undefined;
      flush();
      for (const [, v] of projViews) v.c.destroy();
      projViews.clear();
      if (pickupView) { pickupView.destroy(); pickupView = undefined; }
    },
    update(dt) {
      match.update(dt * juice.timeScale()); // slow-mo on KO
      juice.update(dt);
      v0.sync(f0); v1.sync(f1);
      syncZones();
      syncProjectiles();
      syncPickup();
      hud.update(match);
      // A tutorial-shouted weapon that resolved AFTER the fight started: inject it live so
      // the phrase still pays off (liveForge never re-reads the arsenal on its own).
      for (let s = 0; s < 2; s++) { const pw = game.pendingWeapon[s]; if (pw) { match.injectWeapon(s, pw); logEvent("weapon_assigned", { slot: s, name: pw.name, archetype: pw.archetype, src: "tutorial" }); game.pendingWeapon[s] = null; } }
      tickLive(dt);
      tickGamepadForge(dt);
      for (let s = 0; s < 2; s++) if (pOv[s].node.visible) animatePrompt(pOv[s]); // blink/flash the shout prompt
      if (match.state === "fight") { stageT -= dt; if (stageT <= 0) { stageT = 15 + Math.random() * 5; regenStage(); } }
      if (shiftT > 0) { shiftT -= dt; shiftTxt.alpha = Math.min(1, shiftT * 2.2); if (shiftT <= 0) shiftTxt.visible = false; }
      const o = juice.shakeOffset();
      container.position.set(o.x, o.y);
      if (match.state === "matchover") { endT += dt; if (endT > 1.6) finish(); }
    },
    onKey(code) { if (code === "Escape") { game.music.stop(); game.go("title"); } },
  };
}
