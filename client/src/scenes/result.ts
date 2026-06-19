import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText, Menu } from "../ui/theme";
import { addScore, getScores } from "../util/leaderboard";
import { randomMockItem } from "../content/mock";
import { releaseAllSprites } from "../content/remote";

export function ResultScene(game: Game): Scene {
  const container = new Container();
  let menu: Menu;
  return {
    container,
    enter(params) {
      const winner = params?.winner ?? 0;
      const names: string[] = params?.names ?? ["Player 1", "Player 2"];
      const scores: number[] = params?.scores ?? [0, 0];
      const dealt: number[] = params?.dealt ?? [0, 0];
      const col = winner === 0 ? C.COL.p1 : C.COL.p2;
      const winnerName = (names[winner] || `Player ${winner + 1}`).slice(0, 14);

      // Score = rounds won (heavily weighted) + total damage dealt across the match.
      const pScore = scores[winner] * 1000 + Math.round(dealt[winner] * 5);
      addScore(winnerName, pScore);

      const title = mkText(`${winnerName} WINS!`, 80, col);
      title.anchor.set(0.5); title.position.set(C.DESIGN_W / 2, 92); container.addChild(title);

      const sub = mkText(`rounds ${scores[winner]}-${scores[1 - winner]}     damage ${dealt[winner]}     score ${pScore}`, 26, C.COL.white, "700");
      sub.anchor.set(0.5); sub.position.set(C.DESIGN_W / 2, 152); container.addChild(sub);

      const lt = mkText("LEADERBOARD", 30, C.COL.yellow, "800"); lt.anchor.set(0.5); lt.position.set(C.DESIGN_W / 2, 214); container.addChild(lt);
      const rows = getScores().slice(0, 6);
      let highlighted = false;
      rows.forEach((r, i) => {
        const y = 258 + i * 40;
        const isNew = !highlighted && r.name === winnerName && r.score === pScore;
        if (isNew) highlighted = true;
        const c = isNew ? col : C.COL.white;
        const rank = mkText(`${i + 1}.`, 26, C.COL.grey, "700"); rank.anchor.set(0, 0.5); rank.position.set(C.DESIGN_W / 2 - 230, y);
        const nm = mkText(r.name, 26, c, isNew ? "900" : "700"); nm.anchor.set(0, 0.5); nm.position.set(C.DESIGN_W / 2 - 175, y);
        const sc = mkText(`${r.score}`, 26, isNew ? col : C.COL.p1, "700"); sc.anchor.set(1, 0.5); sc.position.set(C.DESIGN_W / 2 + 230, y);
        container.addChild(rank, nm, sc);
      });

      menu = new Menu([
        { label: "REMATCH", onSelect: () => {
            if (game.controlMode !== "keyboard") { releaseAllSprites(); game.arsenals = [[randomMockItem()], [randomMockItem()]]; } // phone/gamepad: free last match's sprites + fresh weapons
            game.music.start(); game.go("fight");
          } },
        { label: "EXIT TO MENU", onSelect: () => game.go("title") },
      ], C.DESIGN_W / 2, C.DESIGN_H - 92, 48);
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
