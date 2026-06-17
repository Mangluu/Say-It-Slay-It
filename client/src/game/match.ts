import * as C from "../config";
import { GameWorld } from "./world";
import { Fighter } from "./fighter";
import { Projectile } from "./projectile";
import { ContentProvider, ItemSpec } from "../content/types";
import { InputSource } from "../input/types";
import { Juice } from "./juice";
import { Sfx } from "../audio/sfx";
import { knockback, launchVelocity, hitstunFor } from "./combat";
import { STAGE_SPAWN } from "./stage";

export type MatchState = "fight" | "roundover" | "matchover";
const ROUNDS_TO_WIN = 2;

export class Match {
  projectiles: Projectile[] = [];
  state: MatchState = "fight";
  message = "";
  scores = [0, 0];
  round = 1;
  winner = -1;

  items: (ItemSpec | null)[] = [null, null];
  ammo = [0, 0];
  private cdThrow = [0, 0];
  private forging = [false, false];
  private prevThrow = [false, false];
  private prevSpecial = [false, false];
  private stateT = 0;

  constructor(
    private gw: GameWorld,
    readonly fighters: Fighter[],
    private input: InputSource,
    private provider: ContentProvider,
    private juice: Juice,
    private sfx: Sfx,
  ) {}

  async init() { await Promise.all([this.refill(0), this.refill(1)]); }

  private async refill(p: number) {
    if (this.forging[p]) return;
    this.forging[p] = true;
    try {
      const item = await this.provider.forgeItem("", p);
      this.items[p] = item;
      this.ammo[p] = item.stats.ammo;
    } finally { this.forging[p] = false; }
  }

  update(dt: number) {
    if (this.juice.hitstop > 0) { this.juice.hitstop -= dt; return; } // sim freeze

    if (this.state !== "fight") {
      this.stateT -= dt;
      if (this.stateT <= 0) this.advance();
      return;
    }

    const ins = [this.input.sample(0), this.input.sample(1)];
    for (let p = 0; p < 2; p++) {
      const ip = ins[p];
      if (ip.throw && !this.prevThrow[p] && this.cdThrow[p] <= 0 && this.ammo[p] > 0) this.spawnThrow(p);
      if (ip.special && !this.prevSpecial[p]) this.melee(p);
      this.prevThrow[p] = ip.throw;
      this.prevSpecial[p] = ip.special;
    }

    this.gw.update(dt, (step) => {
      this.fighters[0].update(step, ins[0]);
      this.fighters[1].update(step, ins[1]);
      this.cdThrow[0] = Math.max(0, this.cdThrow[0] - step);
      this.cdThrow[1] = Math.max(0, this.cdThrow[1] - step);
      for (const pr of this.projectiles) pr.update(step, this.fighters[1 - pr.owner.index]);
    });

    this.resolveHits();
    this.resolveGround();
    this.cull();
    for (let p = 0; p < 2; p++) if (this.ammo[p] <= 0 && !this.items[p]) void this.refill(p);
    this.checkRingout();
  }

  private spawnThrow(p: number) {
    const f = this.fighters[p];
    const item = this.items[p]!;
    const dir = f.facing;
    const ox = f.pos.x + dir * 0.7, oy = f.pos.y + 0.3;
    if (item.stats.trajectory === "spread") {
      const n = item.stats.pellets ?? 5;
      for (let i = 0; i < n; i++) this.projectiles.push(new Projectile(this.gw, item, f, ox, oy, dir, (i - (n - 1) / 2) * 0.16));
    } else {
      this.projectiles.push(new Projectile(this.gw, item, f, ox, oy, dir, 0));
    }
    this.ammo[p]--;
    this.cdThrow[p] = item.stats.throwCooldown;
    this.sfx.throwItem();
    this.juice.burst(C.px(ox), C.sy(oy), item.color, 5, 150);
    if (this.ammo[p] <= 0) { this.items[p] = null; void this.refill(p); }
  }

  private melee(p: number) {
    const f = this.fighters[p], g = this.fighters[1 - p];
    const dx = g.pos.x - f.pos.x;
    if (Math.sign(dx) === f.facing && Math.abs(dx) < 1.5 && Math.abs(g.pos.y - f.pos.y) < 1.2) {
      this.applyHit(g, f, 5, 4, 0.08, f.facing);
    }
  }

  private resolveHits() {
    for (const { proj, target } of this.gw.projHits) {
      if (!proj.alive) continue;
      const s = proj.spec.stats;
      this.applyHit(target as Fighter, proj.owner, s.damage, s.baseKB, s.growthKB, proj.body.getLinearVelocity().x);
      proj.alive = false;
    }
    this.gw.projHits.length = 0;
  }

  private resolveGround() {
    for (const proj of this.gw.projGround) {
      if (!proj.alive) continue;
      const s = proj.spec.stats;
      const pos = proj.body.getPosition();
      if (s.special === "explode") {
        const foe = this.fighters[1 - proj.owner.index];
        if (Math.hypot(foe.pos.x - pos.x, foe.pos.y - pos.y) < 2.2) {
          this.applyHit(foe, proj.owner, s.damage, s.baseKB, s.growthKB, foe.pos.x - pos.x);
        }
        this.juice.burst(C.px(pos.x), C.sy(pos.y), 0xffaa33, 26, 420);
        this.juice.shake(0.5); this.juice.freeze(0.05);
        proj.alive = false;
      } else if (s.trajectory !== "place") {
        proj.alive = false;
      }
    }
    this.gw.projGround.length = 0;
  }

  private applyHit(target: Fighter, source: Fighter, damage: number, baseKB: number, growthKB: number, dirHint: number) {
    const dirX = (target.pos.x - source.pos.x) || dirHint || 1;
    const kb = knockback(target.percent + damage, damage, baseKB, growthKB);
    const v = launchVelocity(kb, dirX);
    target.takeHit(v.x, v.y, hitstunFor(kb), damage);
    this.juice.shake(Math.min(0.6, 0.12 + damage * 0.012));
    this.juice.freeze(Math.min(0.12, 0.03 + damage * 0.0025));
    this.juice.doFlash(Math.min(0.6, 0.2 + damage * 0.012), 0.07);
    this.juice.burst(C.px(target.pos.x), C.sy(target.pos.y + 0.3), 0xffe14a, 12 + Math.floor(damage), 260 + damage * 6);
    this.sfx.hit(damage);
  }

  private cull() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].alive) {
        this.gw.world.destroyBody(this.projectiles[i].body);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private checkRingout() {
    for (let p = 0; p < 2; p++) {
      const { x, y } = this.fighters[p].pos;
      if (x < -C.BLAST_X || x > C.WORLD_W + C.BLAST_X || y < -C.BLAST_BOT || y > C.WORLD_H + C.BLAST_TOP) {
        this.ko(p); return;
      }
    }
  }

  private ko(loser: number) {
    const winner = 1 - loser;
    this.scores[winner]++;
    this.sfx.ko();
    this.juice.shake(0.8); this.juice.freeze(0.1);
    this.clearProjectiles();
    if (this.scores[winner] >= ROUNDS_TO_WIN) {
      this.state = "matchover"; this.winner = winner; this.stateT = 3.5; this.message = `PLAYER ${winner + 1} WINS`;
    } else {
      this.state = "roundover"; this.stateT = 2.0; this.message = `PLAYER ${winner + 1} SCORES`;
    }
  }

  private advance() {
    if (this.state === "matchover") { this.scores = [0, 0]; this.round = 1; this.winner = -1; }
    else this.round++;
    this.fighters[0].reset(STAGE_SPAWN[0].x, STAGE_SPAWN[0].y);
    this.fighters[1].reset(STAGE_SPAWN[1].x, STAGE_SPAWN[1].y);
    this.fighters[0].facing = 1; this.fighters[1].facing = -1;
    void this.refill(0); void this.refill(1);
    this.state = "fight"; this.message = "";
  }

  private clearProjectiles() {
    for (const pr of this.projectiles) this.gw.world.destroyBody(pr.body);
    this.projectiles.length = 0;
  }
}
