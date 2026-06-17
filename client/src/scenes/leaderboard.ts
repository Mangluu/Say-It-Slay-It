import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText, Menu } from "../ui/theme";
import { addScore, getScores, qualifies } from "../util/leaderboard";

export function LeaderboardEntryScene(game: Game): Scene {
  const container = new Container();
  let score = 0, wave = 1;
  let initials = ["A", "A", "A"];
  let cur = 0;
  let canEnter = false;
  let initialsText: ReturnType<typeof mkText>;

  const refresh = () => { initialsText.text = initials.join(""); };

  return {
    container,
    enter(params) {
      score = params?.score ?? 0; wave = params?.wave ?? 1;
      const t = mkText("GAME OVER", 76, C.COL.p2); t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 120);
      const s = mkText(`SCORE  ${score}      WAVE  ${wave}`, 32, C.COL.white, "700"); s.anchor.set(0.5); s.position.set(C.DESIGN_W / 2, 196);
      container.addChild(t, s);
      canEnter = qualifies(score);
      if (canEnter) {
        const p = mkText("NEW HIGH SCORE!  type initials, Enter to save", 22, C.COL.yellow, "700");
        p.anchor.set(0.5); p.position.set(C.DESIGN_W / 2, 286); container.addChild(p);
        initialsText = mkText("AAA", 84, C.COL.p1); initialsText.anchor.set(0.5); initialsText.position.set(C.DESIGN_W / 2, 372);
        container.addChild(initialsText);
      } else {
        const p = mkText("press Enter to continue", 24, C.COL.grey, "700");
        p.anchor.set(0.5); p.position.set(C.DESIGN_W / 2, 320); container.addChild(p);
      }
    },
    exit() {},
    update() {},
    onKey(code) {
      if (!canEnter) { if (code === "Enter" || code === "Space") game.go("leaderboard"); return; }
      if (code === "Enter") { addScore(initials.join(""), score); game.go("leaderboard"); return; }
      if (code === "Backspace") { cur = Math.max(0, cur - 1); initials[cur] = "A"; refresh(); return; }
      const m = code.match(/^Key([A-Z])$/);
      if (m) { initials[cur] = m[1]; cur = Math.min(2, cur + 1); refresh(); }
    },
  };
}

export function LeaderboardScene(game: Game): Scene {
  const container = new Container();
  let menu: Menu;
  return {
    container,
    enter() {
      const t = mkText("LEADERBOARD", 64, C.COL.yellow); t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 92);
      container.addChild(t);
      const rows = getScores();
      if (rows.length === 0) {
        const none = mkText("no scores yet — play Solo Score Attack!", 24, C.COL.grey, "700");
        none.anchor.set(0.5); none.position.set(C.DESIGN_W / 2, 250); container.addChild(none);
      }
      rows.forEach((r, i) => {
        const rank = mkText(`${i + 1}.`, 30, C.COL.grey, "700"); rank.anchor.set(0, 0.5); rank.position.set(C.DESIGN_W / 2 - 220, 170 + i * 42);
        const nm = mkText(r.name, 30, C.COL.white); nm.anchor.set(0, 0.5); nm.position.set(C.DESIGN_W / 2 - 150, 170 + i * 42);
        const sc = mkText(`${r.score}`, 30, C.COL.p1, "700"); sc.anchor.set(1, 0.5); sc.position.set(C.DESIGN_W / 2 + 220, 170 + i * 42);
        container.addChild(rank, nm, sc);
      });
      menu = new Menu([
        { label: "PLAY SOLO", onSelect: () => { game.mode = "solo"; game.music.start(); game.go("fight"); } },
        { label: "TITLE", onSelect: () => game.go("title") },
      ], C.DESIGN_W / 2, C.DESIGN_H - 150, 56);
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
