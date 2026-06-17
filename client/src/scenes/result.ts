import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText, Menu } from "../ui/theme";

export function ResultScene(game: Game): Scene {
  const container = new Container();
  let menu: Menu;
  return {
    container,
    enter(params) {
      const winner = params?.winner ?? 0;
      const col = winner === 0 ? C.COL.p1 : C.COL.p2;
      const title = mkText(`PLAYER ${winner + 1} WINS`, 86, col);
      title.anchor.set(0.5); title.position.set(C.DESIGN_W / 2, 210);
      container.addChild(title);
      menu = new Menu([
        { label: "REMATCH", onSelect: () => { game.music.start(); game.go("fight"); } },
        { label: "TITLE", onSelect: () => game.go("title") },
      ], C.DESIGN_W / 2, 370);
      container.addChild(menu.node);
    },
    exit() {},
    update() {},
    onKey(code) {
      if (code === "KeyW" || code === "ArrowUp") menu.move(-1);
      else if (code === "KeyS" || code === "ArrowDown") menu.move(1);
      else if (code === "Enter" || code === "Space") menu.confirm();
    },
  };
}
