import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText, Menu } from "../ui/theme";

export function TitleScene(game: Game): Scene {
  const container = new Container();
  let menu: Menu;
  let t = 0;
  let logo: ReturnType<typeof mkText>;

  return {
    container,
    enter() {
      logo = mkText("MIC DROP", 116, C.COL.white);
      logo.anchor.set(0.5); logo.position.set(C.DESIGN_W / 2, 172);
      const sub = mkText("shout it.  forge it.  throw it.", 28, C.COL.yellow, "700");
      sub.anchor.set(0.5); sub.position.set(C.DESIGN_W / 2, 248);
      container.addChild(logo, sub);

      menu = new Menu([
        { label: "SOLO  (forge + fight)", onSelect: () => { game.mode = "solo"; game.arsenals = [[], []]; game.go("forge"); } },
        { label: "VERSUS  (2 players, forge)", onSelect: () => { game.mode = "versus"; game.arsenals = [[], []]; game.go("forge"); } },
        { label: "QUICK PLAY  (random weapons)", onSelect: () => { game.mode = "solo"; game.arsenals = [[], []]; game.music.start(); game.go("fight"); } },
        { label: "LEADERBOARD", onSelect: () => game.go("leaderboard") },
      ], C.DESIGN_W / 2, 348, 60);
      container.addChild(menu.node);

      const hint = mkText("W/S or ↑/↓ to choose  •  Enter to start  •  Esc to quit a match", 18, C.COL.grey, "700");
      hint.anchor.set(0.5); hint.position.set(C.DESIGN_W / 2, C.DESIGN_H - 38);
      container.addChild(hint);
    },
    exit() {},
    update(dt) {
      t += dt;
      logo.scale.set(1 + Math.sin(t * 2) * 0.02);
      logo.rotation = Math.sin(t * 1.3) * 0.01;
    },
    onKey(code) {
      if (code === "KeyW" || code === "ArrowUp") menu.move(-1);
      else if (code === "KeyS" || code === "ArrowDown") menu.move(1);
      else if (code === "Enter" || code === "Space") menu.confirm();
    },
  };
}
