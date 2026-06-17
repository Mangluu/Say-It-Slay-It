import { Application, Container, Graphics, Text } from "pixi.js";
import * as C from "./config";
import { GameWorld } from "./game/world";
import { buildStage, STAGE_SPAWN, PlatformView } from "./game/stage";
import { Fighter } from "./game/fighter";
import { KeyboardSource } from "./input/keyboard";
import { MockProvider } from "./content/mock";
import { Match } from "./game/match";
import { Juice } from "./game/juice";
import { Sfx } from "./audio/sfx";
import { Projectile } from "./game/projectile";
import { Hud } from "./ui/hud";

async function main() {
  const app = new Application();
  await app.init({
    background: C.COL.bgBot, resizeTo: window, antialias: true,
    autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById("app")!.appendChild(app.canvas);

  const root = new Container();
  app.stage.addChild(root);
  let scale = 1, baseX = 0, baseY = 0;
  const layout = () => {
    scale = Math.min(app.renderer.width / C.DESIGN_W, app.renderer.height / C.DESIGN_H);
    root.scale.set(scale);
    baseX = (app.renderer.width - C.DESIGN_W * scale) / 2;
    baseY = (app.renderer.height - C.DESIGN_H * scale) / 2;
    root.position.set(baseX, baseY);
  };
  layout();
  window.addEventListener("resize", layout);

  const gw = new GameWorld();
  const platforms = buildStage(gw);
  root.addChild(drawBackground());
  root.addChild(drawStage(platforms));

  const f0 = new Fighter(gw, STAGE_SPAWN[0].x, STAGE_SPAWN[0].y, C.COL.p1, 0);
  const f1 = new Fighter(gw, STAGE_SPAWN[1].x, STAGE_SPAWN[1].y, C.COL.p2, 1);
  f1.facing = -1;

  const entities = new Container();
  root.addChild(entities);
  const v0 = new FighterView(C.COL.p1);
  const v1 = new FighterView(C.COL.p2);
  entities.addChild(v0.node, v1.node);

  const projLayer = new Container();
  root.addChild(projLayer);

  const juice = new Juice();
  root.addChild(juice.layer);
  root.addChild(juice.flashG);

  const hud = new Hud([C.COL.p1, C.COL.p2]);
  root.addChild(hud.node);

  const title = new Text({ text: "MIC DROP", style: { fontFamily: "Arial Black, Arial", fontSize: 30, fontWeight: "900", fill: C.COL.white, letterSpacing: 3 } });
  title.anchor.set(0.5, 0); title.position.set(C.DESIGN_W / 2, 14);
  hud.node.addChild(title);
  const hint = new Text({ text: "P1 A/D W F(throw) G(dash) T(melee)   P2 ←→ ↑ ,(throw) .(dash) /(melee)", style: { fontFamily: "Arial", fontSize: 16, fill: C.COL.grey } });
  hint.anchor.set(0.5, 0); hint.position.set(C.DESIGN_W / 2, 50);
  hud.node.addChild(hint);

  const sfx = new Sfx();
  window.addEventListener("keydown", () => sfx.resume(), { once: true });
  const kb = new KeyboardSource();
  const provider = new MockProvider();

  const match = new Match(gw, [f0, f1], kb, provider, juice, sfx);
  await match.init();

  const projViews = new Map<Projectile, Graphics>();
  const syncProjectiles = () => {
    const live = new Set(match.projectiles);
    for (const [pr, g] of projViews) if (!live.has(pr)) { g.destroy(); projViews.delete(pr); }
    for (const pr of match.projectiles) {
      let g = projViews.get(pr);
      if (!g) {
        g = new Graphics();
        const r = C.px(pr.radius);
        g.circle(0, 0, r).fill(pr.spec.color);
        g.circle(0, 0, r).stroke({ width: 2, color: 0x0a0a12 });
        projLayer.addChild(g);
        projViews.set(pr, g);
      }
      const p = pr.body.getPosition();
      g.x = C.px(p.x); g.y = C.sy(p.y);
    }
  };

  app.ticker.add(() => {
    const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
    match.update(dt);
    juice.update(dt);
    v0.sync(f0); v1.sync(f1);
    syncProjectiles();
    hud.update(match);
    const o = juice.shakeOffset();
    root.position.set(baseX + o.x * scale, baseY + o.y * scale);
  });

  (window as any).__micdrop = { app, gw, match, f0, f1 };
}

class FighterView {
  node = new Container();
  private body = new Graphics();
  constructor(public accent: number) {
    const w = C.px(0.84), h = C.px(1.8);
    this.body.roundRect(-w / 2, -h / 2, w, h, 10).fill(0xffffff);
    this.body.circle(w * 0.16, -h * 0.22, 5).fill(0x0a0a12);
    this.body.circle(w * 0.30, -h * 0.22, 5).fill(0x0a0a12);
    this.node.addChild(this.body);
    this.node.tint = accent;
  }
  sync(f: Fighter) {
    this.node.x = C.px(f.pos.x);
    this.node.y = C.sy(f.pos.y);
    this.node.scale.x = f.facing;
    this.node.tint = f.flash > 0 ? 0xffffff : this.accent;
  }
}

function drawBackground(): Graphics {
  const g = new Graphics();
  const bands = 36;
  for (let i = 0; i < bands; i++) {
    g.rect(0, (C.DESIGN_H / bands) * i, C.DESIGN_W, C.DESIGN_H / bands + 1).fill(lerpColor(C.COL.bgTop, C.COL.bgBot, i / (bands - 1)));
  }
  for (let i = -12; i <= 12; i++) {
    g.moveTo(C.DESIGN_W / 2 + i * 38, C.sy(2)).lineTo(C.DESIGN_W / 2 + i * 70, C.DESIGN_H).stroke({ width: 1, color: C.COL.grid });
  }
  return g;
}

function drawStage(platforms: PlatformView[]): Graphics {
  const g = new Graphics();
  for (const p of platforms) {
    const x = C.px(p.x - p.w / 2), y = C.sy(p.y + p.h / 2), w = C.px(p.w), h = C.px(p.h);
    g.roundRect(x, y, w, h, p.oneway ? 6 : 4).fill(p.oneway ? C.COL.platform : C.COL.floor);
    g.rect(x, y, w, 3).fill(0x55597a);
  }
  return g;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

main();
