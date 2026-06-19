import { Vec2, Circle, Body } from "planck";
import { GameWorld } from "./world";
import { ItemSpec } from "../content/types";
import { Fighter } from "./fighter";

// A thrown item. Behaviour is driven by the archetype trajectory; numbers come
// from spec.stats (server-owned). Owner + its projectiles share a negative
// filter group so they never collide with each other.
export class Projectile {
  readonly body: Body;
  alive = true;
  age = 0;
  readonly life: number;
  private returning = false;
  readonly radius: number;

  constructor(
    readonly gw: GameWorld,
    readonly spec: ItemSpec,
    readonly owner: Fighter,
    x: number, y: number, dir: number,
    spreadRad = 0,
  ) {
    const t = spec.stats.trajectory;
    this.radius = 0.26 * spec.stats.projectileScale; // bigger so the thrown weapon reads clearly
    this.life = t === "flat" ? 1.1 : t === "return" ? 2.4 : t === "place" ? 6 : 2.6;

    this.body = this.gw.world.createBody({
      type: "dynamic",
      position: Vec2(x, y),
      bullet: true,
      gravityScale: t === "flat" || t === "homing" ? 0 : 1,
      userData: { kind: "projectile", proj: this },
    });
    this.body.createFixture({
      shape: Circle(this.radius),
      density: 0.4,
      restitution: 0.25,
      friction: 0.3,
      filterGroupIndex: -(owner.index + 1),
    });

    // All weapons fly in the FACING direction (no auto-aim). Speeds tuned so nothing
    // just drops at the thrower's feet.
    const speed = t === "lob" ? 13 : t === "flat" ? 17 : t === "homing" ? 16 : t === "return" ? 13 : t === "spread" ? 14 : 10;
    let vx = dir * speed;
    let vy = t === "lob" ? 6 : t === "place" ? 3 : 0;
    if (spreadRad) {
      const c = Math.cos(spreadRad), s = Math.sin(spreadRad);
      const nx = vx * c - vy * s, ny = vx * s + vy * c;
      vx = nx; vy = ny;
    }
    this.body.setLinearVelocity(Vec2(vx, vy));
  }

  update(dt: number, _foe: Fighter) {
    this.age += dt;
    const t = this.spec.stats.trajectory;
    // No homing/auto-aim: it was an unfair lock-on. "homing" weapons are now just a
    // fast straight dart in the facing direction (see the speed table above).
    if (t === "return") {
      if (!this.returning && this.age > 0.55) this.returning = true;
      if (this.returning) {
        const p = this.body.getPosition();
        const dx = this.owner.pos.x - p.x, dy = this.owner.pos.y + 0.4 - p.y;
        const len = Math.hypot(dx, dy) || 1;
        this.body.setLinearVelocity(Vec2((dx / len) * 14, (dy / len) * 14));
        if (len < 0.6) this.alive = false;
      }
    }
    if (this.age > this.life) this.alive = false;
  }
}
