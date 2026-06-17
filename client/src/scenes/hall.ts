import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";
import { getHall } from "../util/hall";

export function HallScene(game: Game): Scene {
  const container = new Container();
  const hall = getHall();
  let idx = 0, t = 0;

  const title = mkText("WEAPON HALL OF FAME", 50, C.COL.yellow); title.anchor.set(0.5); title.position.set(C.DESIGN_W / 2, 84);
  const emoji = mkText("", 130); emoji.anchor.set(0.5); emoji.position.set(C.DESIGN_W / 2, 290);
  const name = mkText("", 58, C.COL.white); name.anchor.set(0.5); name.position.set(C.DESIGN_W / 2, 416);
  const arch = mkText("", 26, C.COL.p1, "700"); arch.anchor.set(0.5); arch.position.set(C.DESIGN_W / 2, 466);
  const flavor = mkText("", 24, C.COL.grey, "400"); flavor.anchor.set(0.5); flavor.position.set(C.DESIGN_W / 2, 514);
  const hint = mkText("←/→ browse   •   Esc to return", 18, C.COL.grey, "700"); hint.anchor.set(0.5); hint.position.set(C.DESIGN_W / 2, C.DESIGN_H - 40);

  const show = () => {
    if (hall.length === 0) { emoji.text = "\u{1F528}"; name.text = "forge some weapons first!"; arch.text = ""; flavor.text = ""; return; }
    const e = hall[((idx % hall.length) + hall.length) % hall.length];
    emoji.text = e.emoji; name.text = e.name; (name.style as any).fill = e.color;
    arch.text = `[${e.archetype}]`; flavor.text = e.flavor;
  };

  return {
    container,
    enter() { container.addChild(title, emoji, name, arch, flavor, hint); show(); },
    exit() {},
    update(dt) {
      t += dt;
      emoji.scale.set(1 + Math.sin(t * 3) * 0.07);
      if (hall.length > 1 && t > 2.6) { t = 0; idx++; show(); }
    },
    onKey(code) {
      if (code === "Escape" || code === "Enter") game.go("title");
      else if (code === "ArrowRight" || code === "KeyD") { idx++; t = 0; show(); }
      else if (code === "ArrowLeft" || code === "KeyA") { idx--; t = 0; show(); }
    },
  };
}
