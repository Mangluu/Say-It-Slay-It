import { Application, Container, Graphics, Text } from "pixi.js";
import * as C from "../src/config";
import { GameWorld } from "./game/world";
import { buildStage, STAGE_SPAWN, PlatformView } from "./game/stage";
import { Fighter } from "./game/fighter";
import { KeyboardSource } from "./input/keyboard";

async function main() {
  const app = new Application();
  await app.init({
    background: C.COL.bgBot,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById("app")!.appendChild(app.canvas);

  // Root is the fixed 1280x720 design space, scaled to fit the window (letterboxed).
  const root = new Container();
  app.stage.addChild(root);
  const layout = () => {
    const s = Math.min(app.renderer.width / C.DESIGN_W, app.renderer.height / C.DESIGN_H);
    root.scale.set(s);
    root.x = (app.renderer.width - C.DESIGN_W * s) / 2;
    root.y = (app.renderer.height - C.DESIGN_H * s) / 2;
  };
  layout();
  window.addEventListener("resize", layout);

  drawBackground(root);

  const gw = new GameWorld();
  const platforms = buildStage(gw);
  drawStage(root, platforms);

  const p1 = new Fighter(gw, STAGE_SPAWN[0].x, STAGE_SPAWN[0].y, C.COL.p1);
  const view1 = new FighterView(C.COL.p1);
  root.addChild(view1.node);

  const kb = new KeyboardSource();

  // HUD / title
  const title = new Text({
    text: "MIC DROP",
    style: { fontFamily: "Arial", fontSize: 40, fontWeight: "900", fill: C.COL.white, letterSpacing: 4 },
  });
  title.position.set(40, 28);
  root.addChild(title);
  const hint = new Text({
    text: "P0 - A/D run   W jump (double jump in air)",
    style: { fontFamily: "Arial", fontSize: 20, fill: C.COL.grey },
  });
  hint.position.set(40, 78);
  root.addChild(hint);

  app.ticker.add(() => {
    const dt = app.ticker.deltaMS / 1000;
    const in1 = kb.sample(0);
    gw.update(dt, (step) => p1.update(step, in1));
    view1.sync(p1);
  });

  // expose for debugging / screenshot harness
  (window as any).__micdrop = { app, gw, p1 };
}

class FighterView {
  node: Container;
  private body: Graphics;
  constructor(accent: number) {
    this.node = new Container();
    this.body = new Graphics();
    const w = C.px(0.42 * 2);
    const h = C.px(0.9 * 2);
    this.body.roundRect(-w / 2, -h / 2, w, h, 10).fill(accent);
    // eyes (face the +x direction; flipped via node.scale.x)
    this.body.circle(w * 0.18, -h * 0.22, 5).fill(0x0a0a12);
    this.body.circle(w * 0.32, -h * 0.22, 5).fill(0x0a0a12);
    this.node.addChild(this.body);
  }
  sync(f: Fighter) {
    const p = f.pos;
    this.node.x = C.px(p.x);
    this.node.y = C.sy(p.y);
    this.node.scale.x = f.facing;
  }
}

function drawBackground(root: Container) {
  const g = new Graphics();
  // simple vertical gradient via stacked bands
  const bands = 36;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const col = lerpColor(C.COL.bgTop, C.COL.bgBot, t);
    g.rect(0, (C.DESIGN_H / bands) * i, C.DESIGN_W, C.DESIGN_H / bands + 1).fill(col);
  }
  // floor grid lines for depth
  for (let i = -12; i <= 12; i++) {
    const x = C.DESIGN_W / 2 + i * 70;
    g.moveTo(C.DESIGN_W / 2 + i * 38, C.sy(2)).lineTo(x, C.DESIGN_H).stroke({ width: 1, color: C.COL.grid });
  }
  root.addChild(g);
}

function drawStage(root: Container, platforms: PlatformView[]) {
  const g = new Graphics();
  for (const p of platforms) {
    const x = C.px(p.x - p.w / 2);
    const y = C.sy(p.y + p.h / 2);
    const w = C.px(p.w);
    const h = C.px(p.h);
    g.roundRect(x, y, w, h, p.oneway ? 6 : 4).fill(p.oneway ? C.COL.platform : C.COL.floor);
    g.rect(x, y, w, 3).fill(0x55597a); // top highlight
  }
  root.addChild(g);
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

main();
