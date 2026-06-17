import { World, Vec2, Contact } from "planck";
import { GRAVITY } from "../config";

// Fixed-timestep physics (Gaffer "Fix Your Timestep!"). Also routes contacts:
// grounded counting (foot sensor), one-way platforms, and projectile hits, which
// the Match drains each frame. Uses userData duck-typing to avoid import cycles.
export class GameWorld {
  readonly world: World;
  readonly step = 1 / 60;
  private acc = 0;

  projHits: Array<{ proj: any; target: any }> = [];
  projGround: any[] = [];

  constructor() {
    this.world = new World(Vec2(0, GRAVITY));
    this.world.on("begin-contact", (c) => this.onBegin(c));
    this.world.on("end-contact", (c) => this.onEnd(c));
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

  private pair(c: Contact) {
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    return { fa, fb, a: fa.getUserData() as any, b: fb.getUserData() as any };
  }

  private onBegin(c: Contact) {
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const ua = fa.getUserData() as any, ub = fb.getUserData() as any;            // fixture: foot/ground/platform
    const ba = fa.getBody().getUserData() as any, bb = fb.getBody().getUserData() as any; // body: fighter/projectile

    // grounded counting (foot sensor vs ground/platform)
    let foot: any = null, ground: any = null;
    if (ua?.kind === "foot") { foot = ua; ground = ub; }
    else if (ub?.kind === "foot") { foot = ub; ground = ua; }
    if (foot && (ground?.kind === "ground" || ground?.kind === "platform")) foot.fighter.addGround(+1);

    // projectile contacts (projectile kind lives on the BODY userData)
    const projUD = ba?.kind === "projectile" ? ba : bb?.kind === "projectile" ? bb : null;
    if (projUD) {
      const proj = projUD.proj;
      const otherFix = ba?.kind === "projectile" ? fb : fa;
      const otherBody = otherFix.getBody().getUserData() as any;
      const otherFixUD = otherFix.getUserData() as any;
      if (otherBody?.kind === "fighter" && otherBody.fighter.index !== proj.owner.index) {
        this.projHits.push({ proj, target: otherBody.fighter });
      } else if (otherFixUD?.kind === "ground" || otherFixUD?.kind === "platform") {
        this.projGround.push(proj);
      }
    }
  }

  private onEnd(c: Contact) {
    const { a, b } = this.pair(c);
    let foot: any = null, other: any = null;
    if (a?.kind === "foot") { foot = a; other = b; }
    else if (b?.kind === "foot") { foot = b; other = a; }
    if (foot && other && (other.kind === "ground" || other.kind === "platform")) {
      foot.fighter.addGround(-1);
    }
  }

  private onPreSolve(c: Contact) {
    const { fa, fb, a, b } = this.pair(c);
    const aPlat = a?.kind === "platform" && a.oneway;
    const bPlat = b?.kind === "platform" && b.oneway;
    if (!aPlat && !bPlat) return;
    const otherBody = (aPlat ? fb : fa).getBody();
    const bud = otherBody.getUserData() as any;
    if (bud?.kind !== "fighter") return;
    if (otherBody.getLinearVelocity().y > 0.2) c.setEnabled(false); // moving up -> pass through
  }
}
