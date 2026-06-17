import { World, Vec2, Contact } from "planck";
import { GRAVITY } from "../config";

// Fixed-timestep physics (Gaffer "Fix Your Timestep!"). planck wants small,
// constant steps; variable dt tunnels through walls. We accumulate real time and
// step at exactly 1/60, running the per-step game logic via an onStep callback.
export class GameWorld {
  readonly world: World;
  readonly step = 1 / 60;
  private acc = 0;

  constructor() {
    this.world = new World(Vec2(0, GRAVITY));
    this.world.on("begin-contact", (c) => this.onContact(c, +1));
    this.world.on("end-contact", (c) => this.onContact(c, -1));
    this.world.on("pre-solve", (c) => this.onPreSolve(c));
  }

  update(dt: number, onStep: (step: number) => void) {
    this.acc += Math.min(dt, 0.05);
    let n = 0;
    while (this.acc >= this.step && n < 5) {
      onStep(this.step);
      this.world.step(this.step);
      this.acc -= this.step;
      n++;
    }
  }

  // Foot-sensor grounded counting: a fighter's foot sensor touching ground/platform.
  private onContact(c: Contact, delta: number) {
    const a = c.getFixtureA().getUserData() as any;
    const b = c.getFixtureB().getUserData() as any;
    let foot: any = null;
    let other: any = null;
    if (a?.kind === "foot") { foot = a; other = b; }
    else if (b?.kind === "foot") { foot = b; other = a; }
    if (foot && other && (other.kind === "ground" || other.kind === "platform")) {
      foot.fighter.addGround(delta);
    }
  }

  // One-way platforms: let fighters pass UP through, land on top when falling.
  private onPreSolve(c: Contact) {
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    const a = fa.getUserData() as any;
    const b = fb.getUserData() as any;
    const aPlat = a?.kind === "platform" && a.oneway;
    const bPlat = b?.kind === "platform" && b.oneway;
    if (!aPlat && !bPlat) return;
    const otherBody = (aPlat ? fb : fa).getBody();
    const bud = otherBody.getUserData() as any;
    if (bud?.kind !== "fighter") return;
    if (otherBody.getLinearVelocity().y > 0.2) c.setEnabled(false); // moving up -> pass through
  }
}
