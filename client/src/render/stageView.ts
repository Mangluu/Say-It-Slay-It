import { Container, Graphics } from "pixi.js";
import * as C from "../config";
import { PlatformView } from "../game/stage";

export function buildStageView(platforms: PlatformView[]): Container {
  const c = new Container();
  const glow = new Graphics();
  const top = new Graphics();
  for (const p of platforms) {
    const x = C.px(p.x - p.w / 2), y = C.sy(p.y + p.h / 2), w = C.px(p.w), h = C.px(p.h);
    glow.roundRect(x - 5, y - 5, w + 10, h + 10, 9).fill({ color: p.oneway ? 0x5a9adf : 0x4a4d80, alpha: 0.22 });
    top.roundRect(x, y, w, h, p.oneway ? 6 : 4).fill(p.oneway ? C.COL.platform : C.COL.floor);
    top.rect(x, y, w, 3).fill(p.oneway ? 0x8fb6ff : 0x9aa0d0); // lit edge
  }
  c.addChild(glow, top);
  return c;
}
