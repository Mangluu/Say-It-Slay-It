// Design-space constants. The game world is authored in METERS (planck, y-up);
// we render to a fixed 1280x720 design canvas (y-down) scaled to fit the window.

export const DESIGN_W = 1280;
export const DESIGN_H = 720;
export const PPM = 48; // pixels per meter
export const WORLD_W = DESIGN_W / PPM; // ~26.7 m
export const WORLD_H = DESIGN_H / PPM; // ~15 m

// Physics / movement feel (high gravity = snappy, Smash-like)
export const GRAVITY = -34;
export const RUN_SPEED = 7.5;
export const GROUND_ACCEL = 90;
export const AIR_ACCEL = 38;
export const GROUND_FRICTION = 0.80; // velocity retained per fixed step when no input
export const JUMP_SPEED = 13.4;
export const DOUBLE_JUMP_SPEED = 11.8;
export const JUMP_CUT = 0.5; // velocity kept when jump released early (variable height)
export const COYOTE = 0.10; // s after leaving ground you can still jump
export const JUMP_BUFFER = 0.12; // s before landing a jump press is remembered
export const DASH_SPEED = 14;
export const DASH_CD = 0.7;

// Blast zones (ring-out happens beyond these, in meters)
export const BLAST_X = 4;       // past left/right stage edges
export const BLAST_TOP = 9;     // above the top of the screen
export const BLAST_BOT = 5;     // below the floor

// Palette
export const COL = {
  bgTop: 0x16122e,
  bgBot: 0x09090f,
  floor: 0x2a2c3e,
  platform: 0x3a3d57,
  grid: 0x1b1d2e,
  p1: 0x3ce6f0,
  p2: 0xf03caa,
  white: 0xf0f0fa,
  grey: 0x8a8ea4,
  yellow: 0xface46,
};

// Meters -> design pixels
export const px = (m: number) => m * PPM;
export const sy = (m: number) => DESIGN_H - m * PPM; // world y-up -> screen y-down
