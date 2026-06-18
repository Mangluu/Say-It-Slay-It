import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";

export function ControlsScene(game: Game): Scene {
  const container = new Container();

  const lines: Array<[string, number, number]> = [
    ["CONTROLS", 56, C.COL.yellow],
    ["", 10, C.COL.grey],
    ["KEYBOARD", 30, C.COL.p1],
    ["P1:   A / D  move    W  jump (double-jump)    F  throw    G  dash    T  melee", 22, C.COL.white],
    ["P2:   ← / →  move    ↑  jump    ,  throw    .  dash    /  melee", 22, C.COL.white],
    ["", 14, C.COL.grey],
    ["PHONES  (Versus, Phones)", 30, C.COL.p2],
    ["Scan the QR on the lobby screen with each phone (same Wi-Fi / hotspot).", 22, C.COL.white],
    ["Touch stick = move   •   JUMP / THROW / DASH / SPECIAL buttons", 22, C.COL.white],
    ["Hold the MIC button and SHOUT your weapon to forge it by voice.", 22, C.COL.white],
    ["", 14, C.COL.grey],
    ["MENUS", 30, C.COL.p1],
    ["W / S  or  ↑ / ↓  to choose    •    Enter to select    •    Esc to go back", 22, C.COL.white],
  ];

  return {
    container,
    enter() {
      let y = 70;
      for (const [txt, size, color] of lines) {
        if (txt) {
          const t = mkText(txt, size, color, size >= 30 ? "900" : "700");
          t.anchor.set(0.5, 0);
          t.position.set(C.DESIGN_W / 2, y);
          container.addChild(t);
        }
        y += size + 16;
      }
      const back = mkText("press Enter / Esc to return", 18, C.COL.grey, "700");
      back.anchor.set(0.5); back.position.set(C.DESIGN_W / 2, C.DESIGN_H - 36);
      container.addChild(back);
    },
    exit() {},
    update() {},
    onKey(code) { if (code === "Escape" || code === "Enter" || code === "Space") game.go("title"); },
  };
}
