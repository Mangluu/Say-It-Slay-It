import { Container, Graphics } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { GameWorld } from "../game/world";
import { buildStage, STAGE_SPAWN } from "../game/stage";
import { Fighter } from "../game/fighter";
import { Match } from "../game/match";
import { Juice } from "../game/juice";
import { Projectile } from "../game/projectile";
import { KeyboardController } from "../game/controller";
import { CpuController } from "../game/cpu";
import { FighterView } from "../render/fighterView";
import { buildStageView } from "../render/stageView";
import { Hud } from "../ui/hud";

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
  const projViews = new Map<Projectile, Graphics>();
  let ended = false;
  let endT = 0;

  function syncProjectiles() {
    const live = new Set(match.projectiles);
    for (const [pr, g] of projViews) if (!live.has(pr)) { g.destroy(); projViews.delete(pr); }
    for (const pr of match.projectiles) {
      let g = projViews.get(pr);
      if (!g) {
        g = new Graphics();
        const r = C.px(pr.radius);
        g.circle(0, 0, r * 1.5).fill({ color: pr.spec.color, alpha: 0.25 }); // glow
        g.circle(0, 0, r).fill(pr.spec.color);
        g.circle(0, 0, r).stroke({ width: 2, color: 0x0a0a12 });
        projLayer.addChild(g);
        projViews.set(pr, g);
      }
      const p = pr.body.getPosition();
      g.x = C.px(p.x); g.y = C.sy(p.y);
      g.rotation += 0.2;
    }
  }

  function finish() {
    if (ended) return;
    ended = true;
    game.music.stop();
    if (game.mode === "solo") {
      game.lastScore = match.score; game.lastWave = match.wave;
      game.go("leaderboardEntry", { score: match.score, wave: match.wave });
    } else {
      game.go("result", { winner: match.winner });
    }
  }

  return {
    container,
    enter() {
      gw = new GameWorld();
      const platforms = buildStage(gw);
      container.addChild(buildStageView(platforms));

      f0 = new Fighter(gw, STAGE_SPAWN[0].x, STAGE_SPAWN[0].y, C.COL.p1, 0);
      f1 = new Fighter(gw, STAGE_SPAWN[1].x, STAGE_SPAWN[1].y, C.COL.p2, 1);
      f1.facing = -1;

      const entities = new Container();
      container.addChild(entities);
      v0 = new FighterView(C.COL.p1);
      v1 = new FighterView(C.COL.p2);
      entities.addChild(v1.node, v0.node);

      projLayer = new Container();
      container.addChild(projLayer);

      juice = new Juice();
      container.addChild(juice.layer, juice.flashG);

      hud = new Hud([C.COL.p1, C.COL.p2]);
      container.addChild(hud.node);

      const c0 = new KeyboardController(game.kb, 0);
      let c1;
      if (game.mode === "solo") { cpu = new CpuController(1); c1 = cpu; }
      else c1 = new KeyboardController(game.kb, 1);

      match = new Match(gw, [f0, f1], [c0, c1], game.provider, juice, game.sfx, game.mode);
      if (game.mode === "solo") match.onWave = (w) => { if (cpu) cpu.difficulty = 1 + (w - 1) * 0.5; };
      void match.init();
      (window as any).__fight = () => ({ match, f0, f1 }); // debug hook

    },
    exit() { for (const [, g] of projViews) g.destroy(); projViews.clear(); },
    update(dt) {
      match.update(dt);
      juice.update(dt);
      v0.sync(f0); v1.sync(f1);
      syncProjectiles();
      hud.update(match);
      const o = juice.shakeOffset();
      container.position.set(o.x, o.y);
      if (match.state === "matchover") { endT += dt; if (endT > 1.6) finish(); }
    },
    onKey(code) { if (code === "Escape") { game.music.stop(); game.go("title"); } },
  };
}
