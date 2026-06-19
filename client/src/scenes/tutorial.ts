import { Container, Graphics, Sprite, Text } from "pixi.js";
import { Vec2 } from "planck";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { GameWorld } from "../game/world";
import { buildFloor } from "../game/stage";
import { Fighter } from "../game/fighter";
import { FighterView } from "../render/fighterView";
import { buildStageView } from "../render/stageView";
import { mkText } from "../ui/theme";
import { NEUTRAL, InputState } from "../input/types";
import { GamepadController, rumblePad } from "../input/gamepad";
import { randomMockItem } from "../content/mock";
import { borrowSprite } from "../content/remote";
import { loadTex } from "../util/tex";
import { ItemSpec } from "../content/types";

// SOUND CHECK: the interactive warmup that runs AFTER players connect and JUST BEFORE the
// fight. Works for BOTH phone-versus and controller-versus. Each player drives their REAL
// fighter in a split lane (so movement, jump, and double jump feel exactly like the game),
// clearing verb cards by doing each action. Then a SHOUT page forges each player's first
// weapon by yelling (phone: both phones at once; controller: the shared laptop mic, one
// player at a time) and a COMPLETE screen hands off to the match. Backstops (per-step caps,
// a hard global cap, a host skip key, dropped/not-joined auto-advance) keep a booth safe.
type Page = "warmup" | "shoutintro" | "shout" | "done";
type Step = "move" | "jump" | "attack";
const STEPS: Step[] = ["move", "jump", "attack"];
const DWELL = 1.0;            // a "NICE!" beat after each control so it does not blur past
const SHOUTINTRO_SECS = 4.5;  // the short explainer (time to read + ready up)
const READY_SECS = 3.0;       // get-ready countdown (3..2..1) before the mic opens, like the in-game prompt
const RECORD_MS = 5000;       // mic record window
const SHOUT_CAP = 13;         // per-player shout cap
const DONE_SECS = 1.8;        // the COMPLETE screen
const GLOBAL_CAP = 150;       // HARD backstop ONLY (normal exit is both-done); generous now that the warmup waits on real input, never rushes an engaged pair

const laneX = [C.DESIGN_W * 0.25, C.DESIGN_W * 0.75];
const accent = [C.COL.p1, C.COL.p2];
// keep each fighter inside its own screen half (no cross-lane wandering / collision)
const laneBound = [{ lo: 2.2, hi: C.WORLD_W / 2 - 1.4 }, { lo: C.WORLD_W / 2 + 1.4, hi: C.WORLD_W - 2.2 }];
const laneSpawn = [laneX[0] / C.PPM, laneX[1] / C.PPM];

export function TutorialScene(game: Game): Scene {
  const container = new Container();
  const hub = game.phoneHub;
  const isPad = game.controlMode === "gamepad"; // controller mode: gamepad input + ONE shared laptop mic
  let padCtrl: GamepadController[] = [];

  let alive = true, finished = false, gT = 0, page: Page = "warmup", pageT = 0;
  // controller-mode shout is serialized through the one laptop mic, one player at a time
  let padShoutSlot = 0;
  let padPhase: "ready" | "record" | "forge" | "reveal" = "ready";
  let padPT = 0, padRecSent = false;
  const stepIdx = [0, 0], stepT = [0, 0];
  const prevJump = [false, false], prevThrow = [false, false], prevSpecial = [false, false];
  const warmDone = [false, false], jumped = [false, false], didDouble = [false, false];
  const dwelling = [false, false], dwellT = [0, 0]; // brief "NICE!" beat after each control
  const pip: ("todo" | "done" | "skip")[][] = [["todo", "todo", "todo"], ["todo", "todo", "todo"]];
  const recordSent = [false, false], shouted = [false, false], shoutT = [0, 0], shoutDone = [false, false], shoutDoneAt = [0, 0];
  const forgedLabel: (string | null)[] = [null, null];
  const required = [false, false];

  let gw: GameWorld;
  let fr: Fighter[] = [];
  let fv: FighterView[] = [];
  // a real throwable so practising THROW visibly flings a weapon (a previously-forged sprite if
  // this booth session has any, else the weapon's emoji). Purely cosmetic, no physics/hitbox.
  let tutWeapon: ItemSpec[] = [];
  interface TProj { node: Container; vx: number; vy: number; life: number; spin: number; }
  const tprojs: TProj[] = [];

  let banner: Text, bsub: Text;
  const cardBig: Text[] = [], cardSub: Text[] = [], pipG: Graphics[] = [];
  let bubble: { node: Container; txt: Text; sub: Text; ring: Graphics }[] = [];
  let introBox: Container, doneBox: Container;

  const nameOf = (s: number) => (game.profiles[s]?.username?.trim()) || `P${s + 1}`;
  const input = (s: number): InputState => isPad ? padCtrl[s].sample() : (required[s] && hub ? hub.state[s] : NEUTRAL);

  function makeBubble(): { node: Container; txt: Text; sub: Text; ring: Graphics } {
    const node = new Container(); node.visible = false;
    const bg = new Graphics();
    bg.roundRect(-152, -42, 304, 74, 14).fill({ color: 0x0a0a12, alpha: 0.86 });
    bg.roundRect(-152, -42, 304, 74, 14).stroke({ width: 2, color: 0xffffff, alpha: 0.16 });
    bg.poly([-12, 30, 12, 30, 0, 48]).fill({ color: 0x0a0a12, alpha: 0.86 }); // little tail
    const ring = new Graphics(); // bright animated border that blinks / flashes colour
    ring.roundRect(-152, -42, 304, 74, 14).stroke({ width: 4, color: 0xffffff, alpha: 1 });
    const txt = mkText("", 26, C.COL.yellow, "900"); txt.anchor.set(0.5); txt.position.set(0, -12);
    const sub = mkText("", 20, C.COL.white, "900"); sub.anchor.set(0.5); sub.position.set(0, 16);
    node.addChild(bg, ring, txt, sub);
    return { node, txt, sub, ring };
  }

  function setCard(s: number) {
    const big = cardBig[s], sub = cardSub[s];
    if (warmDone[s]) {
      if (!required[s]) { big.text = "not joined"; (big.style as any).fill = C.COL.grey; big.style.fontSize = 40; sub.text = "(scan the QR to join the fight)"; return; }
      big.text = "READY!"; (big.style as any).fill = C.COL.green; big.style.fontSize = 60;
      sub.text = warmDone[1 - s] ? "" : `waiting on ${nameOf(1 - s)}...`;
      return;
    }
    (big.style as any).fill = accent[s]; big.style.fontSize = 64;
    const step = STEPS[stepIdx[s]];
    if (step === "move") { big.text = "MOVE"; sub.text = "slide the stick left and right"; }
    else if (step === "jump") { big.text = "JUMP"; sub.text = "push the stick UP"; }
    else { big.text = s === 0 ? "THROW" : "MELEE"; sub.text = s === 0 ? "tap THROW to fling your weapon" : "tap MELEE, your backup when you run dry"; }
  }

  function advanceStep(s: number) {
    stepIdx[s]++; stepT[s] = 0; jumped[s] = false;
    if (stepIdx[s] >= STEPS.length) warmDone[s] = true;
    setCard(s);
  }

  function completeStep(s: number, skipped: boolean) {
    if (warmDone[s]) return;
    pip[s][stepIdx[s]] = skipped ? "skip" : "done";
    if (skipped) { advanceStep(s); return; }       // a timed-out step just moves on
    dwelling[s] = true; dwellT[s] = DWELL;          // a real success gets a brief "NICE!" beat
    cardBig[s].text = "NICE!"; (cardBig[s].style as any).fill = C.COL.green; cardSub[s].text = "";
  }

  // fling a cosmetic weapon from a fighter when they practise THROW (no hitbox, just feel)
  function spawnTutThrow(s: number) {
    const f = fr[s], dir = f.facing;
    const node = new Container();
    const emoji = new Text({ text: tutWeapon[s]?.emoji || "⭐", style: { fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial", fontSize: 42 } });
    emoji.anchor.set(0.5); node.addChild(emoji);
    const url = borrowSprite(); // use a real weapon sprite from earlier in the session if we have one
    if (url) loadTex(url).then((tex) => { if (node.destroyed) return; const sp = new Sprite(tex); sp.anchor.set(0.5); sp.width = sp.height = 56; node.addChildAt(sp, 0); emoji.visible = false; }).catch(() => { /* keep emoji */ });
    node.position.set(C.px(f.pos.x + dir * 0.7), C.sy(f.pos.y + 0.3));
    container.addChild(node);
    tprojs.push({ node, vx: dir * 560, vy: -210, life: 1.8, spin: dir * 0.34 });
    game.sfx.throwItem();
  }

  function tickTutThrows(dt: number) {
    for (let i = tprojs.length - 1; i >= 0; i--) {
      const tp = tprojs[i];
      tp.node.x += tp.vx * dt; tp.node.y += tp.vy * dt; tp.vy += 760 * dt; tp.node.rotation += tp.spin;
      tp.life -= dt;
      if (tp.life <= 0) { tp.node.destroy(); tprojs.splice(i, 1); }
    }
  }

  function tickWarmupSlot(s: number, dt: number) {
    if (warmDone[s]) return;
    if (dwelling[s]) { dwellT[s] -= dt; if (dwellT[s] <= 0) { dwelling[s] = false; advanceStep(s); } return; }
    // a DROPPED phone can never act, so it is the only thing auto-skipped; otherwise every
    // step waits for the real input (the host ENTER key / the hard global cap are the only
    // other ways out, so nobody is rushed past a control they have not actually done).
    if (required[s] && hub && (!hub.joined[s] || !hub.connected)) { while (!warmDone[s]) completeStep(s, true); return; }
    const step = STEPS[stepIdx[s]];
    stepT[s] += dt; // used only for the brief double-jump grace window below
    const st = input(s), f = fr[s];
    if (step === "move") { if (Math.abs(st.axisX) > 0.4) completeStep(s, false); }
    else if (step === "jump") {
      // two beats: first jump, then a short grace prompting the double jump (not gated on it)
      if (!jumped[s]) {
        if (!prevJump[s] && st.jump) { jumped[s] = true; stepT[s] = 0; cardBig[s].text = "DOUBLE JUMP!"; cardSub[s].text = "flick UP again while in the air"; }
      } else {
        if (!prevJump[s] && st.jump && !f.grounded) didDouble[s] = true;
        if (didDouble[s] || stepT[s] >= 1.8) completeStep(s, false);
      }
    } else {
      const throwEdge = !prevThrow[s] && st.throw, meleeEdge = !prevSpecial[s] && st.special;
      if (throwEdge) { f.triggerThrow(); spawnTutThrow(s); completeStep(s, false); }
      else if (meleeEdge) { f.triggerMelee(); completeStep(s, false); }
    }
  }

  function onShout(s: number, text: string) {
    if (!alive || finished || page !== "shout") return;
    if (!recordSent[s] || shouted[s] || !text) return;
    shouted[s] = true;
    shoutDoneAt[s] = shoutT[s] + 1.6;
    game.provider.forgeItem(text, s).then((item) => {
      // hand the weapon to the fight (see fight.ts/game.ts pendingWeapon): folded into the
      // arsenal if it resolves before handoff, injected live if after. NOT a direct arsenals
      // write (liveForge never re-reads the arsenal mid-fight).
      game.pendingWeapon[s] = item;
      if (alive) forgedLabel[s] = `${item.emoji} ${item.name}`;
    }).catch(() => { /* lobby-seeded mock stays; the fight re-prompts anyway */ });
  }

  function tickShoutSlot(s: number, dt: number) {
    if (shoutDone[s]) return;
    if (required[s] && hub && (!hub.joined[s] || !hub.connected)) { shoutDone[s] = true; return; }
    shoutT[s] += dt;
    const b = bubble[s];
    if (shouted[s]) {
      b.txt.text = "FORGED!"; (b.txt.style as any).fill = C.COL.green;
      b.sub.text = forgedLabel[s] || "weapon incoming...";
      if (shoutT[s] >= shoutDoneAt[s]) shoutDone[s] = true;
      return;
    }
    if (shoutT[s] >= SHOUT_CAP) { shoutDone[s] = true; return; }
    if (shoutT[s] < READY_SECS) { b.txt.text = "GET READY!"; (b.txt.style as any).fill = accent[s]; b.sub.text = `shout in ${Math.ceil(READY_SECS - shoutT[s])}...`; return; }
    if (!recordSent[s] && hub) { recordSent[s] = true; hub.send(s, { type: "record", ms: RECORD_MS }); }
    const rem = Math.ceil(Math.max(0, READY_SECS + RECORD_MS / 1000 - shoutT[s]));
    b.txt.text = "SHOUT NOW!"; (b.txt.style as any).fill = C.COL.yellow;
    b.sub.text = rem > 0 ? String(rem) : "listening...";
  }

  // ---- controller-mode shout: one shared laptop mic, players take turns ----
  function nextPadSlot() {
    if (padShoutSlot < 2) bubble[padShoutSlot].node.visible = false;
    padShoutSlot++; padPhase = "ready"; padPT = 0; padRecSent = false;
  }

  function onPadShout(s: number, text: string) {
    // guard FIRST: only the live, in-phase recorder un-ducks (a stale resolve must never
    // un-duck while the OTHER player is now recording, nor touch a dead scene).
    if (!alive || padShoutSlot !== s || padPhase !== "record") return;
    game.music.start(); // recording done for this slot: restore the bed
    if (!text) { shoutDone[s] = true; nextPadSlot(); return; } // nothing heard: skip this player
    padPhase = "forge"; padPT = 0;
    game.provider.forgeItem(text, s).then((item) => {
      game.pendingWeapon[s] = item; // becomes their FIRST weapon (fight folds it in / injects)
      if (alive && padShoutSlot === s) { forgedLabel[s] = `${item.emoji} ${item.name}`; padPhase = "reveal"; padPT = 0; }
    }).catch(() => { if (alive && padShoutSlot === s) { padPhase = "reveal"; padPT = 0; } });
  }

  function tickPadShout(dt: number) {
    // skip players already done / not present
    while (padShoutSlot < 2 && (shoutDone[padShoutSlot] || !required[padShoutSlot])) { shoutDone[padShoutSlot] = true; nextPadSlot(); }
    for (let s = 0; s < 2; s++) bubble[s].node.visible = (s === padShoutSlot && padShoutSlot < 2);
    if (padShoutSlot >= 2) return;
    const s = padShoutSlot, b = bubble[s];
    padPT += dt;
    if (padPhase === "ready") {
      const r = Math.ceil(Math.max(0, READY_SECS - padPT));
      b.txt.text = "GET READY!"; (b.txt.style as any).fill = accent[s];
      b.sub.text = r > 0 ? String(r) : "GO!"; // 3..2..1 then GO, like the phone/in-game prompt
      if (padPT >= READY_SECS) { padPhase = "record"; padPT = 0; padRecSent = false; }
      return;
    }
    if (padPhase === "record") {
      // the two players share ONE mic; do not open it until the other player's record has freed it
      if (!padRecSent && game.laptopMic && game.laptopMic.busy) {
        b.txt.text = "GET SET!"; (b.txt.style as any).fill = accent[s]; b.sub.text = "one sec...";
        if (padPT > SHOUT_CAP) { shoutDone[s] = true; nextPadSlot(); }
        return;
      }
      if (!padRecSent) {
        padRecSent = true; game.music.stop(); // duck so the laptop mic does not hear its own speakers
        rumblePad(game.padIndex[s], RECORD_MS, 0.45, 0.85); // buzz the pad for the shout window
        if (game.laptopMic) game.laptopMic.record(RECORD_MS).then((t) => onPadShout(s, t)).catch(() => { if (alive && padShoutSlot === s && padPhase === "record") game.music.start(); });
      }
      b.txt.text = "SHOUT NOW!"; (b.txt.style as any).fill = C.COL.yellow; b.sub.text = "(shout into the laptop)";
      if (padPT > SHOUT_CAP || !game.laptopMic) { if (alive) game.music.start(); shoutDone[s] = true; nextPadSlot(); }
      return;
    }
    if (padPhase === "forge") {
      b.txt.text = "FORGING"; (b.txt.style as any).fill = C.COL.yellow; b.sub.text = forgedLabel[s] || "...";
      if (padPT > 8) { shoutDone[s] = true; nextPadSlot(); } // slow forge: move on, pendingWeapon still lands at fight start
      return;
    }
    b.txt.text = "FORGED!"; (b.txt.style as any).fill = C.COL.green; b.sub.text = forgedLabel[s] || "weapon ready!";
    if (padPT > 1.6) { shoutDone[s] = true; nextPadSlot(); }
  }

  function setPage(p: Page) {
    page = p; pageT = 0;
    const warm = p === "warmup";
    banner.visible = p !== "done"; bsub.visible = warm;
    for (let s = 0; s < 2; s++) { cardBig[s].visible = warm; cardSub[s].visible = warm; pipG[s].visible = warm; }
    introBox.visible = p === "shoutintro";
    doneBox.visible = p === "done";
    const showBubble = (p === "shoutintro" || p === "shout");
    for (let s = 0; s < 2; s++) {
      bubble[s].node.visible = showBubble && required[s];
      if (p === "shoutintro" && required[s]) { bubble[s].txt.text = "SHOUT A WEAPON"; (bubble[s].txt.style as any).fill = accent[s]; bubble[s].sub.text = "(your voice forges it)"; }
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (hub) hub.onVoice = undefined;
    game.music.start(); // un-duck in case the controller shout left the bed stopped; the fight needs it
    game.go("fight"); // lobby already set controlMode / mode / arsenals / music
  }

  return {
    container,
    enter() {
      alive = true; finished = false; gT = 0;
      if (!isPad && !hub) { game.go("fight"); return; } // no input source: skip straight to the fight
      if (isPad) padCtrl = [new GamepadController(game.padIndex[0]), new GamepadController(game.padIndex[1])];

      // physics world + the real fighters (so the warmup feels like the actual game)
      gw = new GameWorld();
      const floor = buildFloor(gw);
      const bg = new Graphics();
      bg.rect(0, 0, C.DESIGN_W / 2, C.DESIGN_H).fill({ color: C.COL.p1, alpha: 0.06 });
      bg.rect(C.DESIGN_W / 2, 0, C.DESIGN_W / 2, C.DESIGN_H).fill({ color: C.COL.p2, alpha: 0.06 });
      bg.moveTo(C.DESIGN_W / 2, 118).lineTo(C.DESIGN_W / 2, C.DESIGN_H - 70).stroke({ width: 2, color: 0xffffff, alpha: 0.10 });
      container.addChild(bg);
      container.addChild(buildStageView([floor.view]));

      required[0] = isPad ? true : hub!.joined[0]; required[1] = isPad ? true : hub!.joined[1];
      const entities = new Container();
      fr = [new Fighter(gw, laneSpawn[0], 3.6, C.COL.p1, 0), new Fighter(gw, laneSpawn[1], 3.6, C.COL.p2, 1)];
      fr[0].facing = 1; fr[1].facing = -1;
      tutWeapon = [randomMockItem(), randomMockItem()]; // emoji-backed throwables for the THROW step
      fv = [new FighterView(C.COL.p1, game.profiles[0]), new FighterView(C.COL.p2, game.profiles[1])];
      entities.addChild(fv[0].node, fv[1].node);
      container.addChild(entities);

      banner = mkText("SOUND CHECK", 50, C.COL.yellow); banner.anchor.set(0.5); banner.position.set(C.DESIGN_W / 2, 48); container.addChild(banner);
      bsub = mkText("warm up your fighter, both of you at once", 22, C.COL.white, "700"); bsub.anchor.set(0.5); bsub.position.set(C.DESIGN_W / 2, 86); container.addChild(bsub);
      const foot = mkText("HOST: press ENTER to skip to the fight", 18, C.COL.grey, "700"); foot.anchor.set(0.5); foot.position.set(C.DESIGN_W / 2, C.DESIGN_H - 24); container.addChild(foot);

      for (let s = 0; s < 2; s++) {
        const tag = mkText(nameOf(s), 26, accent[s]); tag.anchor.set(0.5); tag.position.set(laneX[s], 128); container.addChild(tag);
        const big = mkText("", 64, accent[s]); big.anchor.set(0.5); big.position.set(laneX[s], 208); container.addChild(big); cardBig[s] = big;
        const sub = mkText("", 22, C.COL.white, "700"); sub.anchor.set(0.5); sub.position.set(laneX[s], 258);
        (sub.style as any).wordWrap = true; (sub.style as any).wordWrapWidth = C.DESIGN_W / 2 - 70; (sub.style as any).align = "center";
        container.addChild(sub); cardSub[s] = sub;
        const pg = new Graphics(); container.addChild(pg); pipG[s] = pg;
        if (!required[s]) { warmDone[s] = true; shoutDone[s] = true; }
        setCard(s);
      }

      // shout explainer page (illustrates the in-game overhead prompt + the effect detail)
      introBox = new Container(); introBox.visible = false;
      const i1 = mkText("RUN OUT OF AMMO?", 50, C.COL.yellow); i1.anchor.set(0.5); i1.position.set(C.DESIGN_W / 2, 180);
      const i2 = mkText("a SHOUT prompt pops above your head: yell anything to forge a weapon!", 26, C.COL.white, "800"); i2.anchor.set(0.5); i2.position.set(C.DESIGN_W / 2, 244);
      introBox.addChild(i1, i2); container.addChild(introBox);

      // per-fighter shout bubbles (rendered above each head, like the in-game prompt)
      bubble = [makeBubble(), makeBubble()];
      container.addChild(bubble[0].node, bubble[1].node);

      doneBox = new Container(); doneBox.visible = false;
      const d1 = mkText("TUTORIAL COMPLETE!", 64, C.COL.green); d1.anchor.set(0.5); d1.position.set(C.DESIGN_W / 2, 150);
      const d2 = mkText("the real match starts now, good luck!", 28, C.COL.white, "800"); d2.anchor.set(0.5); d2.position.set(C.DESIGN_W / 2, 214);
      doneBox.addChild(d1, d2); container.addChild(doneBox);

      if (hub) hub.onVoice = (slot, text) => onShout(slot, text); // phone path; controller uses the laptop mic
      setPage(required[0] || required[1] ? "warmup" : "done"); // both absent (lobby prevents): go straight to done -> fight
    },
    exit() { alive = false; if (hub) hub.onVoice = undefined; for (const tp of tprojs) tp.node.destroy(); tprojs.length = 0; },
    update(dt) {
      if (finished) return;
      gT += dt; pageT += dt;
      if (gT >= GLOBAL_CAP) { finish(); return; }
      tickTutThrows(dt); // advance any practice-thrown weapons

      // step the real fighters every frame (movement only, no combat), clamp to lanes, render
      gw.update(dt, (step) => { fr[0].update(step, input(0)); fr[1].update(step, input(1)); });
      for (let s = 0; s < 2; s++) {
        const p = fr[s].pos, b = laneBound[s];
        if (p.x < b.lo) fr[s].body.setPosition(Vec2(b.lo, p.y));
        else if (p.x > b.hi) fr[s].body.setPosition(Vec2(b.hi, p.y));
        fv[s].sync(fr[s]);
      }

      if (page === "warmup") {
        for (let s = 0; s < 2; s++) tickWarmupSlot(s, dt);
        for (let s = 0; s < 2; s++) {
          const g = pipG[s]; g.clear();
          const y = 304, r = 10, gap = 42, cx = laneX[s];
          for (let i = 0; i < 3; i++) {
            const x = cx - gap + i * gap, st = pip[s][i];
            const col = st === "done" ? C.COL.yellow : st === "skip" ? 0x6a6d86 : 0x2a2c3e;
            g.circle(x, y, r).fill(col); g.circle(x, y, r).stroke({ width: 2, color: 0xffffff, alpha: 0.18 });
          }
        }
        if (warmDone[0] && warmDone[1]) setPage("shoutintro"); // both must finish every control first
      } else if (page === "shoutintro") {
        if (pageT >= SHOUTINTRO_SECS) setPage("shout");
      } else if (page === "shout") {
        if (isPad) tickPadShout(dt); else for (let s = 0; s < 2; s++) tickShoutSlot(s, dt);
        const phoneCap = !isPad && pageT >= SHOUT_CAP + 2; // controller is serialized: rely on shoutDone + GLOBAL_CAP
        if ((shoutDone[0] && shoutDone[1]) || phoneCap) setPage("done");
      } else {
        if (pageT >= DONE_SECS) { finish(); return; }
      }

      // anchor each visible shout bubble above its fighter's head + blink/flash it so the
      // player cannot miss that it is their turn to shout
      const bt = performance.now(), blink = 0.5 + 0.5 * Math.sin(bt / 90);
      for (let s = 0; s < 2; s++) {
        const b = bubble[s];
        if (!b.node.visible) continue;
        const f = fr[s];
        b.node.position.set(C.px(f.pos.x), Math.max(76, C.sy(f.pos.y + f.halfH * f.size + 1.5)));
        b.node.scale.set(1 + 0.08 * Math.sin(bt / 110));
        b.ring.alpha = 0.25 + 0.75 * blink;
        b.ring.tint = blink > 0.5 ? 0xffe14a : 0xff4d4d;
        b.txt.alpha = 0.55 + 0.45 * blink;
      }
      // refresh rising-edge trackers for both slots every frame so an edge is never missed
      for (let s = 0; s < 2; s++) { const st = input(s); prevJump[s] = st.jump; prevThrow[s] = st.throw; prevSpecial[s] = st.special; }
    },
    onKey(code) {
      if (code === "Enter" || code === "Space") finish();
      else if (code === "Escape") { game.music.stop(); if (hub) hub.close(); game.phoneHub = undefined; game.go("title"); }
    },
  };
}
