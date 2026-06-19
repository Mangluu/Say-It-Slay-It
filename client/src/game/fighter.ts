import { Vec2, Box, Body } from "planck";
import { GameWorld } from "./world";
import { InputState } from "../input/types";
import * as C from "../config";

export class Fighter {
  readonly body: Body;
  readonly halfW = 0.42;
  readonly halfH = 0.9;
  facing = 1;

  percent = 0;       // damage percent (more -> more knockback)
  hitstun = 0;       // s of lost control after a hit
  flash = 0;         // s of hit-flash (visual)
  alive = true;
  throwTimer = 0;    // s of throw-pose animation
  meleeTimer = 0;    // s of melee-shove-pose animation
  slowT = 0;         // s of movement-slow (sticky-trap slow zone)
  animT = 0;         // animation clock
  size = 1;          // shrinks with damage (comeback mechanic); FighterView + hitbox use it

  private appliedSize = 1;
  private group = 0;
  private groundContacts = 0;
  private coyote = 0;
  private buffer = 0;
  private jumpsLeft = 2;
  private prevJump = false;
  private prevDash = false;
  private dashCd = 0;

  constructor(gw: GameWorld, x: number, y: number, public accent: number, public index: number) {
    this.body = gw.world.createBody({
      type: "dynamic", position: Vec2(x, y), fixedRotation: true,
      userData: { kind: "fighter", fighter: this },
    });
    this.group = -(index + 1); // own projectiles pass through self
    this.buildFixtures(1);
  }

  // (Re)build the body + foot fixtures at a size factor. Rebuilt when damage-shrink
  // changes the size enough; runs between physics steps (from update), so it is safe.
  private buildFixtures(s: number) {
    this.body.createFixture({ shape: Box(this.halfW * s, this.halfH * s), density: 1, friction: 0, restitution: 0, filterGroupIndex: this.group });
    const foot = this.body.createFixture({ shape: Box(this.halfW * s * 0.85, 0.12, Vec2(0, -this.halfH * s)), isSensor: true, filterGroupIndex: this.group });
    foot.setUserData({ kind: "foot", fighter: this });
  }

  private resize() {
    for (let fx = this.body.getFixtureList(); fx;) { const next = fx.getNext(); this.body.destroyFixture(fx); fx = next; }
    this.buildFixtures(this.size);
    this.appliedSize = this.size;
  }

  // Smaller as damage climbs to KO_PERCENT, capped at MIN_SIZE. Rebuilds the hitbox only
  // when it shifts enough, so calling this every frame is cheap.
  private recomputeSize() {
    const t = Math.min(1, this.percent / C.KO_PERCENT);
    this.size = 1 - (1 - C.MIN_SIZE) * t;
    if (Math.abs(this.size - this.appliedSize) >= 0.04) this.resize();
  }

  get speedMul(): number { return 1 + C.MAX_SPEED_BOOST * (1 - this.size) / (1 - C.MIN_SIZE); }
  get jumpMul(): number { return 1 + C.MAX_JUMP_BOOST * (1 - this.size) / (1 - C.MIN_SIZE); }

  get grounded(): boolean { return this.groundContacts > 0; }
  addGround(d: number) { this.groundContacts = Math.max(0, this.groundContacts + d); }
  get pos() { return this.body.getPosition(); }

  takeHit(vx: number, vy: number, stun: number, damage: number) {
    this.percent += damage;
    this.body.setLinearVelocity(Vec2(vx, vy));
    this.body.setAwake(true);
    this.hitstun = stun;
    this.flash = 0.14;
  }

  reset(x: number, y: number) {
    this.body.setPosition(Vec2(x, y));
    this.body.setLinearVelocity(Vec2(0, 0));
    this.body.setAwake(true);
    this.percent = 0; this.hitstun = 0; this.flash = 0;
    this.jumpsLeft = 2; this.alive = true;
    this.groundContacts = 0; this.coyote = 0; this.buffer = 0;
    this.prevJump = false; this.prevDash = false; this.dashCd = 0;
    this.slowT = 0; this.throwTimer = 0; this.meleeTimer = 0;
    this.size = 1; this.resize();
  }

  triggerThrow() { this.throwTimer = 0.18; }
  triggerMelee() { this.meleeTimer = 0.16; }

  update(dt: number, input: InputState) {
    this.flash = Math.max(0, this.flash - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.throwTimer = Math.max(0, this.throwTimer - dt);
    this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.animT += dt;
    this.recomputeSize();

    if (this.hitstun > 0) { this.hitstun -= dt; return; } // no control while launched

    const v = this.body.getLinearVelocity();

    if (input.axisX !== 0) this.facing = input.axisX > 0 ? 1 : -1;
    const speedMul = (this.slowT > 0 ? 0.45 : 1) * this.speedMul; // sticky-trap slow + damage-shrink boost
    const target = input.axisX * C.RUN_SPEED * speedMul;
    const accel = this.grounded ? C.GROUND_ACCEL : C.AIR_ACCEL;
    let nvx: number;
    if (input.axisX === 0 && this.grounded) nvx = v.x * C.GROUND_FRICTION;
    else { const dv = target - v.x; const m = accel * dt; nvx = Math.abs(dv) <= m ? target : v.x + Math.sign(dv) * m; }

    if (this.grounded) { this.coyote = C.COYOTE; this.jumpsLeft = 2; }
    else this.coyote = Math.max(0, this.coyote - dt);

    const jumpPressed = input.jump && !this.prevJump;
    const jumpReleased = !input.jump && this.prevJump;
    if (jumpPressed) this.buffer = C.JUMP_BUFFER; else this.buffer = Math.max(0, this.buffer - dt);

    let nvy = v.y;
    if (this.buffer > 0) {
      if (this.grounded || this.coyote > 0) { nvy = C.JUMP_SPEED * this.jumpMul; this.jumpsLeft = 1; this.buffer = 0; this.coyote = 0; }
      else if (this.jumpsLeft > 0) { nvy = C.DOUBLE_JUMP_SPEED * this.jumpMul; this.jumpsLeft -= 1; this.buffer = 0; }
    }
    if (jumpReleased && nvy > 0) nvy *= C.JUMP_CUT;

    // air-dash / ground dash burst
    if (input.dash && !this.prevDash && this.dashCd <= 0) {
      nvx = this.facing * C.DASH_SPEED;
      if (!this.grounded) nvy = Math.max(nvy, 1.5);
      this.dashCd = C.DASH_CD;
    }

    this.body.setLinearVelocity(Vec2(nvx, nvy));
    this.prevJump = input.jump;
    this.prevDash = input.dash;
  }
}
