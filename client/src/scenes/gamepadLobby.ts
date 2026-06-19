import { Container, Text } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";
import { LaptopMic } from "../audio/laptopMic";
import { connectedPadIndices } from "../input/gamepad";
import { randomMockItem } from "../content/mock";
import { logEvent } from "../net/log";

// Controller join screen. Each player presses a button on the controller they are holding to
// CLAIM it (binds that exact device, handling a 3rd unwanted pad). Names are typed by the host
// with the mouse + keyboard into two on-screen fields (no fiddly pad typing). The HOST then
// presses ENTER to start: that grants the laptop mic (controller mode forges through it) and
// goes to the tutorial. Fighters use the original static look (no webcam). Phone mode is untouched.
export function GamepadLobbyScene(game: Game): Scene {
  const container = new Container();
  let statusTxt: Text;
  const slotTxt: Text[] = [];
  const claimed: number[] = [];                 // pad indices in claim order (P1, P2)
  const prevPressed = new Map<number, boolean>();
  let inputs: HTMLInputElement[] = [];
  let started = false, cancelled = false;

  function freshPresses(): number[] {
    const out: number[] = [];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const now = !!(pad && pad.buttons.some((b) => b && b.pressed));
      if (now && !prevPressed.get(i)) out.push(i);
      prevPressed.set(i, now);
    }
    return out;
  }

  function refresh() {
    for (let s = 0; s < 2; s++) {
      slotTxt[s].text = claimed[s] !== undefined ? `P${s + 1}: READY  (controller ${claimed[s] + 1})` : `P${s + 1}: press a button`;
      (slotTxt[s].style as any).fill = claimed[s] !== undefined ? C.COL.green : (s === 0 ? C.COL.p1 : C.COL.p2);
    }
    if (!started) {
      const ready = claimed.length >= 2;
      statusTxt.text = ready ? "both ready! type names (optional), then press ENTER" : "press a button on BOTH controllers to join (ENTER needs two)";
      (statusTxt.style as any).fill = ready ? C.COL.green : C.COL.white;
    }
  }

  function mkInput(s: number): HTMLInputElement {
    const el = document.createElement("input");
    el.type = "text"; el.maxLength = 14; el.placeholder = `Player ${s + 1} name`; el.value = "";
    Object.assign(el.style, {
      position: "fixed", left: s === 0 ? "30%" : "70%", top: "40%", transform: "translate(-50%,-50%)",
      width: "240px", maxWidth: "40vw", fontSize: "20px", padding: "12px 14px", borderRadius: "12px",
      border: `2px solid ${s === 0 ? "#3ce6f0" : "#f03caa"}`, background: "rgba(10,10,20,0.92)", color: "#fff",
      outline: "none", fontFamily: "Arial", zIndex: "10", textAlign: "center",
    } as CSSStyleDeclaration);
    el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); el.blur(); start(); } if (e.key === "Escape") el.blur(); });
    document.body.appendChild(el);
    return el;
  }

  function removeInputs() { for (const el of inputs) { try { el.remove(); } catch { /* noop */ } } inputs = []; }

  function start() {
    if (started) return;
    if (claimed.length < 2) { // do NOT start without two real, claimed controllers
      statusTxt.text = "press a button on BOTH controllers to join before starting";
      (statusTxt.style as any).fill = C.COL.red;
      logEvent("gamepad_start_blocked", { claimed: claimed.length });
      return;
    }
    started = true;
    game.controlMode = "gamepad"; game.mode = "versus";
    const connected = connectedPadIndices();
    const p0 = claimed[0] ?? connected[0] ?? 0;
    const p1 = claimed[1] ?? connected.find((i) => i !== p0) ?? (connected[1] ?? 1);
    game.padIndex = [p0, p1];
    game.profiles = [0, 1].map((s) => ({ username: (inputs[s]?.value || "").trim() }));
    game.arsenals = [[randomMockItem()], [randomMockItem()]];
    removeInputs();
    logEvent("gamepad_start", { padIndex: game.padIndex, claimed, names: game.profiles.map((p) => p.username) });
    const go = () => { if (cancelled) return; game.music.start(); game.go("tutorial"); };
    statusTxt.text = "requesting the microphone (allow it to shout weapons)...";
    if (game.laptopMic) {
      game.laptopMic.grant().then((ok) => { statusTxt.text = ok ? "microphone ready, starting..." : "mic blocked: you can still MELEE, starting..."; logEvent("gamepad_mic_grant", { ok }); window.setTimeout(go, 700); }, () => window.setTimeout(go, 200));
    } else go();
  }

  return {
    container,
    enter() {
      game.controlMode = "gamepad"; game.mode = "versus";
      game.laptopMic = new LaptopMic();
      started = false; cancelled = false; claimed.length = 0; prevPressed.clear();

      const t = mkText("CONTROLLER VERSUS", 52, C.COL.yellow); t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 80); container.addChild(t);
      statusTxt = mkText("", 24, C.COL.white, "700"); statusTxt.anchor.set(0.5); statusTxt.position.set(C.DESIGN_W / 2, 130); container.addChild(statusTxt);
      for (let s = 0; s < 2; s++) {
        const st = mkText("", 26, s === 0 ? C.COL.p1 : C.COL.p2, "900"); st.anchor.set(0.5); st.position.set(C.DESIGN_W * (s === 0 ? 0.30 : 0.70), 200); container.addChild(st); slotTxt[s] = st;
      }

      const nameHint = mkText("type each name with the mouse + keyboard (optional)", 18, C.COL.grey, "700"); nameHint.anchor.set(0.5); nameHint.position.set(C.DESIGN_W / 2, 360); container.addChild(nameHint);
      inputs = [mkInput(0), mkInput(1)];

      const map = mkText("stick = MOVE     A = JUMP (again in air = DOUBLE JUMP)     X = THROW     B = MELEE     RB = DASH", 20, C.COL.grey, "700");
      map.anchor.set(0.5); map.position.set(C.DESIGN_W / 2, 430); container.addChild(map);
      const shout = mkText("when you run low on ammo, the LAPTOP mic opens, shout your weapon!", 21, C.COL.green, "800");
      shout.anchor.set(0.5); shout.position.set(C.DESIGN_W / 2, 470); container.addChild(shout);
      const startTxt = mkText("HOST: press ENTER to start  •  Backspace to re-pick  •  Esc to cancel", 22, C.COL.green, "900"); startTxt.anchor.set(0.5); startTxt.position.set(C.DESIGN_W / 2, C.DESIGN_H - 60); container.addChild(startTxt);
      refresh();
    },
    exit() { removeInputs(); },
    update() {
      if (started) return;
      for (const idx of freshPresses()) { if (!claimed.includes(idx) && claimed.length < 2) claimed.push(idx); }
      refresh();
    },
    onKey(code) {
      if (code === "Escape") { cancelled = true; removeInputs(); game.go("title"); }
      else if (code === "Backspace") { claimed.length = 0; prevPressed.clear(); refresh(); }
      else if (code === "Enter" || code === "Space") start();
    },
  };
}
