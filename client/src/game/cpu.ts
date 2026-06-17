import { Controller } from "./controller";
import { InputState } from "../input/types";
import { Fighter } from "./fighter";
import { Projectile } from "./projectile";

// A simple, FUN (not smart) opponent FSM: hold spacing, throw on a cadence,
// dodge incoming projectiles, retreat at high percent. Scales with difficulty.
export class CpuController implements Controller {
  private throwCd = 1.4; // grace before the first shot
  private jumpCd = 0;
  difficulty: number;

  constructor(difficulty = 1) { this.difficulty = difficulty; }

  sample(self: Fighter, foe: Fighter, projectiles: Projectile[], dt: number): InputState {
    this.throwCd -= dt;
    this.jumpCd -= dt;
    const s: InputState = { axisX: 0, jump: false, throw: false, dash: false, special: false };

    const dx = foe.pos.x - self.pos.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || 1;
    const desired = 4.5;

    if (dist > desired + 0.8) s.axisX = dir;
    else if (dist < desired - 0.8) s.axisX = -dir;
    else s.axisX = dir * 0.02; // keep facing the foe

    // dodge incoming enemy projectiles
    for (const pr of projectiles) {
      if (pr.owner.index === self.index) continue;
      const p = pr.body.getPosition();
      const v = pr.body.getLinearVelocity();
      const approaching = Math.sign(p.x - self.pos.x) !== Math.sign(v.x || dir);
      const near = Math.abs(p.x - self.pos.x) < 3.2 && Math.abs(p.y - self.pos.y) < 2.0;
      if (near && approaching && Math.random() < 0.05 * this.difficulty + 0.02) {
        if (Math.random() < 0.5 && this.jumpCd <= 0) { s.jump = true; this.jumpCd = 0.5; }
        else s.dash = true;
      }
    }

    // chase to a platform when the foe is above
    if (foe.pos.y - self.pos.y > 1.6 && self.grounded && this.jumpCd <= 0 && Math.random() < 0.03) {
      s.jump = true; this.jumpCd = 0.6;
    }

    // throw on a cadence (faster at higher difficulty)
    if (this.throwCd <= 0) {
      s.throw = true;
      this.throwCd = Math.max(0.45, 1.6 - 0.2 * this.difficulty); // gentler wave 1, ramps up
    }

    if (self.percent > 95 && dist < 3) s.axisX = -dir; // bail when about to die

    return s;
  }
}
