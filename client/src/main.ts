import { Application } from "pixi.js";
import * as C from "./config";
import { Game } from "./app/game";
import { TitleScene } from "./scenes/title";
import { ForgeScene } from "./scenes/forge";
import { FightScene } from "./scenes/fight";
import { ResultScene } from "./scenes/result";
import { LeaderboardScene, LeaderboardEntryScene } from "./scenes/leaderboard";

async function main() {
  const app = new Application();
  await app.init({
    background: C.COL.bgBot, resizeTo: window, antialias: true,
    autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById("app")!.appendChild(app.canvas);

  const game = new Game(app);
  game.register("title", TitleScene);
  game.register("forge", ForgeScene);
  game.register("fight", FightScene);
  game.register("result", ResultScene);
  game.register("leaderboard", LeaderboardScene);
  game.register("leaderboardEntry", LeaderboardEntryScene);
  game.go("title");

  (window as any).__micdrop = { app, game };
}

main();
