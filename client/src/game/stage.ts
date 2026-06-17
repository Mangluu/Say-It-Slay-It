import { Vec2, Box } from "planck";
import { GameWorld } from "./world";
import { WORLD_W } from "../config";

export interface PlatformView {
  x: number; y: number; w: number; h: number; oneway: boolean;
}

// Single-screen Smash-style stage: one solid floor + three one-way platforms.
export function buildStage(gw: GameWorld): PlatformView[] {
  const views: PlatformView[] = [];
  const add = (cx: number, cy: number, w: number, h: number, oneway: boolean) => {
    const body = gw.world.createBody({ type: "static", position: Vec2(cx, cy) });
    body.createFixture({
      shape: Box(w / 2, h / 2),
      friction: 0.4,
      userData: oneway
        ? { kind: "platform", oneway: true, halfH: h / 2 }
        : { kind: "ground" },
    });
    views.push({ x: cx, y: cy, w, h, oneway });
  };

  const mid = WORLD_W / 2;
  add(mid, 1.5, 18, 1.0, false);      // floor (solid)
  add(mid - 5.5, 5.6, 4.2, 0.3, true); // left platform
  add(mid + 5.5, 5.6, 4.2, 0.3, true); // right platform
  add(mid, 8.9, 4.6, 0.3, true);       // top platform
  return views;
}

export const STAGE_SPAWN = [
  { x: WORLD_W / 2 - 3, y: 4 },
  { x: WORLD_W / 2 + 3, y: 4 },
];
