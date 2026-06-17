import { Vec2, Box, Body } from "planck";
import { GameWorld } from "./world";
import { InputState } from "../input/types";
import * as C from "../config";

// A platformer character controller on planck. Velocity-driven (not impulse) so
// behaviour stays consistent across fixed substeps. Feel extras layered on top:
// coyote time, jump buffering, double jump, variable jump height.
export class Fighter {
  readonly body: Body;
  readonly halfW = 0.42;
  readonly halfH = 0.9;
  facing = 1;

  private groundContacts = 0;
  private coyote = 0;
  private buffer = 0;
  private jumpsLeft = 2;
  private prevJump = false;

  constructor(gw: GameWorld, x: number, y: number, public accent: number) {
    this.body = gw.world.createBody({
      type: "dynamic",
      position: Vec2(x, y),
      fixedRotation: true,
      userData: { kind: "fighter", fighter: this },
    });
    this.body.createFixture({
      shape: Box(this.halfW, this.halfH),
      density: 1.0,
      friction: 0.0,
      restitution: 0.0,
    });
    // foot sensor for a robust grounded check (a boolean desyncs on multi-fixture contact)
    const foot = this.body.createFixture({
      shape: Box(this.halfW * 0.85, 0.12, Vec2(0, -this.halfH)),
      isSensor: true,
    });
    foot.setUserData({ kind: "foot", fighter: this });
  }

  get grounded(): boolean { return this.groundContacts > 0; }
  addGround(d: number) { this.groundContacts = Math.max(0, this.groundContacts + d); }

  get pos() { return this.body.getPosition(); }

  update(dt: number, input: InputState) {
    const v = this.body.getLinearVelocity();

    // --- horizontal movement ---
    if (input.axisX !== 0) this.facing = input.axisX > 0 ? 1 : -1;
    const target = input.axisX * C.RUN_SPEED;
    const accel = this.grounded ? C.GROUND_ACCEL : C.AIR_ACCEL;
    let nvx: number;
    if (input.axisX === 0 && this.grounded) {
      nvx = v.x * C.GROUND_FRICTION; // settle to a stop
    } else {
      const dv = target - v.x;
      const stepMax = accel * dt;
      nvx = Math.abs(dv) <= stepMax ? target : v.x + Math.sign(dv) * stepMax;
    }

    // --- jump timers ---
    if (this.grounded) { this.coyote = C.COYOTE; this.jumpsLeft = 2; }
    else { this.coyote = Math.max(0, this.coyote - dt); }

    const jumpPressed = input.jump && !this.prevJump;
    const jumpReleased = !input.jump && this.prevJump;
    if (jumpPressed) this.buffer = C.JUMP_BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);

    let nvy = v.y;
    if (this.buffer > 0) {
      if (this.grounded || this.coyote > 0) {
        nvy = C.JUMP_SPEED; this.jumpsLeft = 1; this.buffer = 0; this.coyote = 0;
      } else if (this.jumpsLeft > 0) {
        nvy = C.DOUBLE_JUMP_SPEED; this.jumpsLeft -= 1; this.buffer = 0;
      }
    }
    // variable height: clip upward velocity once when jump is released early
    if (jumpReleased && nvy > 0) nvy *= C.JUMP_CUT;

    this.body.setLinearVelocity(Vec2(nvx, nvy));
    this.prevJump = input.jump;
  }
}
