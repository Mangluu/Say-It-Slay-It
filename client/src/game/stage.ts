import { Vec2, Box, Body } from "planck";
import { GameWorld } from "./world";
import { WORLD_W } from "../config";

export interface PlatformView {
  x: number; y: number; w: number; h: number; oneway: boolean;
}

function addBox(gw: GameWorld, v: PlatformView): Body {
  const body = gw.world.createBody({ type: "static", position: Vec2(v.x, v.y) });
  body.createFixture({
    shape: Box(v.w / 2, v.h / 2),
    friction: 0.4,
    userData: v.oneway ? { kind: "platform", oneway: true, halfH: v.h / 2 } : { kind: "ground" },
  });
  return body;
}

// Permanent full-width floor, so horizontal screen-wrap is seamless and nobody dies.
export function buildFloor(gw: GameWorld): { body: Body; view: PlatformView } {
  const view: PlatformView = { x: WORLD_W / 2, y: 1.5, w: WORLD_W + 4, h: 1.0, oneway: false };
  return { body: addBox(gw, view), view };
}

// A random set of ONE-WAY platforms (the part that regenerates at runtime). Bounded so
// it is always fair (symmetric side pairs + an optional center) and reachable, and never
// blocks the wrap. The LLM is NOT involved, so the fairness firewall is untouched.
export function randomLayout(): PlatformView[] {
  const mid = WORLD_W / 2;
  const out: PlatformView[] = [];
  const pairs = 1 + (Math.random() < 0.6 ? 1 : 0); // 1 or 2 symmetric side pairs
  for (let i = 0; i < pairs; i++) {
    const dx = 4 + Math.random() * 5;        // 4..9 m from center
    const y = 3.8 + Math.random() * 5;       // 3.8..8.8 m high
    const w = 3.2 + Math.random() * 2.4;     // width
    out.push({ x: mid - dx, y, w, h: 0.3, oneway: true });
    out.push({ x: mid + dx, y, w, h: 0.3, oneway: true });
  }
  if (Math.random() < 0.7) out.push({ x: mid, y: 6.5 + Math.random() * 2.8, w: 4 + Math.random() * 2.4, h: 0.3, oneway: true });
  return out;
}

export function buildPlatforms(gw: GameWorld, layout: PlatformView[]): Body[] {
  return layout.map((v) => addBox(gw, v));
}

export const STAGE_SPAWN = [
  { x: WORLD_W / 2 - 3.5, y: 4 },
  { x: WORLD_W / 2 + 3.5, y: 4 },
];
