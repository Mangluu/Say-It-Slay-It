import { Vec2 } from "planck";
import * as C from "../config";
import { GameWorld } from "./world";
import { Fighter } from "./fighter";
import { Projectile } from "./projectile";
import { ContentProvider, ItemSpec } from "../content/types";
import { randomMockItem } from "../content/mock";
import { Controller } from "./controller";
import { NEUTRAL } from "../input/types";
import { Juice } from "./juice";
import { Sfx } from "../audio/sfx";
import { knockback, launchVelocity, hitstunFor } from "./combat";
import { STAGE_SPAWN } from "./stage";
import { logEvent } from "../net/log";

export type MatchState = "ready" | "fight" | "roundover" | "matchover";

// A lingering ground effect left by a weapon (cloud = damage-over-time, sticky = slow).
export interface MatchZone { x: number; y: number; r: number; life: number; kind: "slow" | "dot"; owner: number; tick: number; }

const ROUNDS_TO_WIN = 2;
const COUNTDOWN = 3.0;

export class Match {
  projectiles: Projectile[] = [];
  zones: MatchZone[] = [];
  state: MatchState = "ready";
  message = "";
  scores = [0, 0];
  round = 1;
  winner = -1;
  score = 0;            // solo Score-Attack points
  wave = 1;             // solo wave counter
  onWave?: (wave: number) => void;

  items: (ItemSpec | null)[] = [null, null];
  ammo = [0, 0];
  dealt = [0, 0];      // damage dealt per player (for end-of-match scoring)
  liveForge = false;   // phone live mode: run dry -> disarmed until you SHOUT (no auto re-arm)
  weaponLib: ItemSpec[] = []; // recently forged weapons, borrowed for the both-out rescue pickup
  pickup: { x: number; y: number; item: ItemSpec; life: number } | null = null; // contested stopgap weapon
  private pickupGap = 0;      // post-grab/expiry cooldown before another pickup may drop
  private pickupArm = -1;     // when >= 0, seconds left on the 1-3s "someone is dry" drop timer
  private reloadT = [0, 0];
  private burnT = [0, 0];
  private burnTick = [0, 0];
  private snapT = 0;
  private nextItem: (ItemSpec | null)[] = [null, null];
  private cdThrow = [0, 0];
  private cdMelee = [0, 0];
  private forging = [false, false];
  private prevThrow = [false, false];
  private prevSpecial = [false, false];
  private refillIdx = [0, 0];
  private stateT = COUNTDOWN;

  constructor(
    private gw: GameWorld,
    readonly fighters: Fighter[],
    private controllers: Controller[],
    private provider: ContentProvider,
    private juice: Juice,
    private sfx: Sfx,
    public mode: "versus" | "solo" = "versus",
    private arsenals: ItemSpec[][] = [[], []],
    private names: string[] = ["Player 1", "Player 2"],
  ) {}

  async init() { await Promise.all([this.refill(0), this.refill(1)]); }

  private async refill(p: number) {
    // A weapon shouted mid-fight jumps the queue: it is the very next one drawn.
    if (this.nextItem[p]) {
      const it = this.nextItem[p]!; this.nextItem[p] = null;
      this.items[p] = it; this.ammo[p] = it.stats.ammo; return;
    }
    if (this.forging[p]) return;
    // Pre-forged arsenal (from the Forge beat): cycle through the player's picks.
    const ars = this.arsenals[p];
    if (ars && ars.length > 0) {
      const item = ars[this.refillIdx[p] % ars.length];
      this.refillIdx[p]++;
      this.items[p] = item;
      this.ammo[p] = item.stats.ammo;
      return;
    }
    // Empty arsenal: hand a basic random weapon INSTANTLY (emoji fallback) so a
    // player who never shouts always has something to throw, never just melee.
    const item = randomMockItem();
    this.arsenals[p].push(item);
    this.items[p] = item;
    this.ammo[p] = item.stats.ammo;
  }

  // Hand a freshly shouted weapon to a player mid-fight (the live-forge loop). It
  // joins the normal cycle AND becomes the next weapon drawn; if the player is
  // currently disarmed it is equipped at once so the shout pays off immediately.
  injectWeapon(p: number, item: ItemSpec) {
    this.arsenals[p].push(item);
    this.nextItem[p] = null;
    this.reloadT[p] = 0;
    this.items[p] = item;          // equip the shouted weapon RIGHT NOW, replacing whatever they hold
    this.ammo[p] = item.stats.ammo;
    this.rememberWeapon(item);
    this.sfx.forged(); // a bright sparkle when a new weapon arrives
  }

  private rememberWeapon(it: ItemSpec) {
    this.weaponLib.push(it);
    if (this.weaponLib.length > 8) this.weaponLib.shift();
  }

  // As soon as EITHER player runs dry (live modes), drop ONE contested weapon after a short
  // 1-3s beat at a random upper spot: a previously-forged weapon (or a curated one) with a
  // generous 5-10 shots scaled by its damage (heavy hitters get fewer). First to touch it gets
  // it. A brief cooldown after a grab/expiry keeps the stage from flooding.
  private tickPickup(dt: number) {
    if (!this.liveForge) return;
    if (this.pickup) {
      this.pickup.life -= dt;
      for (let p = 0; p < 2; p++) {
        const f = this.fighters[p];
        if (Math.hypot(f.pos.x - this.pickup.x, f.pos.y - this.pickup.y) < 1.2) { this.grabPickup(p); return; }
      }
      if (this.pickup.life <= 0 || (this.items[0] && this.items[1])) { this.pickup = null; this.pickupGap = 4; this.pickupArm = -1; }
      return;
    }
    const anyDry = !this.items[0] || !this.items[1];
    if (!anyDry) { this.pickupArm = -1; return; }     // nobody needs one
    if (this.pickupGap > 0) { this.pickupGap -= dt; return; } // post-grab cooldown
    if (this.pickupArm < 0) this.pickupArm = 1 + Math.random() * 2; // arm a 1-3s drop the moment someone is dry
    this.pickupArm -= dt;
    if (this.pickupArm > 0) return;
    this.pickupArm = -1;
    const base = this.weaponLib.length ? this.weaponLib[(Math.random() * this.weaponLib.length) | 0] : randomMockItem();
    const dmg = base.stats.damage;
    const heavy = Math.max(0, Math.min(1, (dmg - 6) / 22));          // 0 (weak) .. 1 (heavy-hitting)
    const ammo = Math.max(5, Math.min(10, Math.round(10 - heavy * 5 + (Math.random() * 2 - 1)))); // 5-10, fewer for hard hitters
    const item: ItemSpec = { ...base, stats: { ...base.stats, ammo } };
    // higher up the screen (y is up): floats around head height and above, reachable with a jump / double jump
    this.pickup = { x: 4 + Math.random() * (C.WORLD_W - 8), y: 5.6 + Math.random() * 2.6, item, life: 14 };
    logEvent("pickup_spawn", { name: item.name, ammo, x: +this.pickup.x.toFixed(1), y: +this.pickup.y.toFixed(1) });
  }

  private grabPickup(p: number) {
    const it = this.pickup!.item;
    this.pickup = null; this.pickupGap = 4; this.pickupArm = -1;
    this.injectWeapon(p, it);
    const f = this.fighters[p];
    this.juice.burst(C.px(f.pos.x), C.sy(f.pos.y + 0.5), it.color || 0xffe14a, 16, 260);
    this.sfx.pickup();
    logEvent("pickup_grab", { slot: p, name: it.name });
  }

  update(dt: number) {
    if (this.juice.hitstop > 0) { this.juice.hitstop -= dt; return; } // sim freeze

    if (this.state === "ready") {
      this.stateT -= dt;
      // settle the fighters with no control while the countdown runs
      this.gw.update(dt, (step) => { this.fighters[0].update(step, NEUTRAL); this.fighters[1].update(step, NEUTRAL); });
      this.message = this.stateT > 0 ? String(Math.ceil(this.stateT)) : "FIGHT!";
      if (this.stateT <= -0.5) { this.state = "fight"; this.message = ""; }
      return;
    }

    if (this.state !== "fight") {
      this.stateT -= dt;
      if (this.stateT <= 0 && this.state === "roundover") this.advance(); // matchover is handled by the scene
      return;
    }

    const ins = [
      this.controllers[0].sample(this.fighters[0], this.fighters[1], this.projectiles, dt),
      this.controllers[1].sample(this.fighters[1], this.fighters[0], this.projectiles, dt),
    ];
    for (let p = 0; p < 2; p++) {
      const ip = ins[p];
      if (ip.throw && !this.prevThrow[p] && this.cdThrow[p] <= 0 && this.ammo[p] > 0) this.spawnThrow(p);
      if (ip.special && !this.prevSpecial[p] && this.cdMelee[p] <= 0) this.melee(p);
      this.prevThrow[p] = ip.throw;
      this.prevSpecial[p] = ip.special;
    }

    this.gw.update(dt, (step) => {
      this.fighters[0].update(step, ins[0]);
      this.fighters[1].update(step, ins[1]);
      this.cdThrow[0] = Math.max(0, this.cdThrow[0] - step);
      this.cdThrow[1] = Math.max(0, this.cdThrow[1] - step);
      this.cdMelee[0] = Math.max(0, this.cdMelee[0] - step);
      this.cdMelee[1] = Math.max(0, this.cdMelee[1] - step);
      for (const pr of this.projectiles) pr.update(step, this.fighters[1 - pr.owner.index]);
    });

    this.wrap(this.fighters[0]); this.wrap(this.fighters[1]);
    this.resolveHits();
    this.resolveGround();
    this.cull();
    for (let p = 0; p < 2; p++) {
      if (this.liveForge) continue; // live mode: stay disarmed until you SHOUT a new weapon (or melee)
      if (this.reloadT[p] > 0) {
        this.reloadT[p] -= dt;
        if (this.reloadT[p] <= 0 && !this.items[p]) void this.refill(p); // reload done, re-arm
      } else if (this.ammo[p] <= 0 && !this.items[p]) {
        void this.refill(p);
      }
    }
    this.tickZones(dt);
    this.tickBurn(dt);
    this.tickPickup(dt);
    this.snapT += dt;
    if (this.snapT >= 0.5) {
      this.snapT = 0;
      logEvent("state", { p: this.fighters.map((f, i) => ({
        x: +f.pos.x.toFixed(2), y: +f.pos.y.toFixed(2),
        vx: +f.body.getLinearVelocity().x.toFixed(2),
        pct: Math.round(f.percent), face: f.facing,
        arch: this.items[i]?.archetype ?? null, ammo: this.ammo[i],
      })) });
    }
    this.checkKO();
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
    f.triggerThrow();
    this.ammo[p]--;
    this.cdThrow[p] = item.stats.throwCooldown;
    this.sfx.throwItem();
    this.juice.burst(C.px(ox), C.sy(oy), item.color, 5, 150);
    logEvent("throw", { slot: p, name: item.name, arch: item.archetype, ammo: this.ammo[p] });
    if (this.ammo[p] <= 0) this.disarm(p);
  }

  // Light melee shove for spacing. The old version checked centre-distance < 1.5m,
  // but two solid fighters sit ~0.84m apart and a hit knocks the foe out of that
  // thin band with no lingering hitbox, so it read as doing nothing. Now: reach is
  // measured edge-to-edge, there is a cooldown, and a pose + whoosh + puff fire on
  // every press so a whiff and a hit both read.
  private melee(p: number) {
    const f = this.fighters[p], g = this.fighters[1 - p];
    this.cdMelee[p] = C.MELEE_CD;
    f.triggerMelee();
    this.sfx.throwItem(); // whoosh
    const dx = g.pos.x - f.pos.x;
    const edge = Math.abs(dx) - f.halfW - g.halfW;
    const inFront = Math.sign(dx) === f.facing || Math.abs(dx) < 0.2;
    if (inFront && edge < C.MELEE_REACH && Math.abs(g.pos.y - f.pos.y) < 1.4) {
      this.applyHit(g, f, 6, 7, 0.05, f.facing);
    } else {
      const hx = f.pos.x + f.facing * (f.halfW + 0.45);
      this.juice.burst(C.px(hx), C.sy(f.pos.y + 0.3), C.COL.white, 4, 120);
    }
  }

  // Running dry is a real beat: you are disarmed for a short window (survive by
  // moving!) before the arsenal re-arms, or a shouted weapon re-arms you at once.
  private disarm(p: number) {
    const f = this.fighters[p];
    this.items[p] = null;
    this.reloadT[p] = C.RELOAD_TIME;
    this.juice.burst(C.px(f.pos.x), C.sy(f.pos.y + 0.6), C.COL.red, 8, 200);
    this.juice.shake(0.12);
    logEvent("disarm", { slot: p });
  }

  isDisarmed(p: number): boolean {
    return !this.items[p];
  }

  private resolveHits() {
    for (const { proj, target } of this.gw.projHits) {
      if (!proj.alive) continue;
      const s = proj.spec.stats;
      const tgt = target as Fighter;
      this.applyHit(tgt, proj.owner, s.damage, s.baseKB, s.growthKB, proj.body.getLinearVelocity().x);
      if (s.special === "stagger") tgt.hitstun += 0.14; // light spam locks you briefly
      this.applyEffect(tgt, proj.spec.effect);            // freeze / burn / shock from the shouted words
      proj.alive = false;
    }
    this.gw.projHits.length = 0;
  }

  private applyEffect(target: Fighter, effect?: string) {
    if (effect === "freeze") { target.slowT = Math.max(target.slowT, 2.0); this.juice.burst(C.px(target.pos.x), C.sy(target.pos.y + 0.4), 0x8fdcff, 8, 160); }
    else if (effect === "shock") { target.hitstun += 0.35; this.juice.burst(C.px(target.pos.x), C.sy(target.pos.y + 0.4), 0xffe14a, 8, 220); }
    else if (effect === "burn") { this.burnT[target.index] = 1.6; this.burnTick[target.index] = 0.3; }
  }

  // Burn damage-over-time (a fiery weapon keeps hurting after the hit).
  private tickBurn(dt: number) {
    for (let p = 0; p < 2; p++) {
      if (this.burnT[p] <= 0) continue;
      this.burnT[p] -= dt;
      this.burnTick[p] -= dt;
      if (this.burnTick[p] <= 0) {
        this.burnTick[p] = 0.4;
        const f = this.fighters[p];
        f.percent += 3; f.flash = 0.1;
        this.dealt[1 - p] += 3;
        this.juice.burst(C.px(f.pos.x), C.sy(f.pos.y + 0.4), 0xff7a33, 5, 150);
      }
    }
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
      } else if (s.special === "lingering") {
        this.spawnZone(proj, "dot", 2.4, 3.0); // cloud: a damage-over-time puff
        this.juice.burst(C.px(pos.x), C.sy(pos.y), 0x9ad84a, 14, 220);
        proj.alive = false;
      } else if (s.special === "slow_zone") {
        this.spawnZone(proj, "slow", 2.0, 5.0); // sticky trap: slows whoever stands in it
        this.juice.burst(C.px(pos.x), C.sy(pos.y), 0xff9ad2, 10, 160);
        proj.alive = false;
      } else if (s.trajectory !== "place") {
        proj.alive = false;
      }
    }
    this.gw.projGround.length = 0;
  }

  private spawnZone(proj: Projectile, kind: "slow" | "dot", r: number, life: number) {
    const p = proj.body.getPosition();
    this.zones.push({ x: p.x, y: p.y, r, life, kind, owner: proj.owner.index, tick: 0 });
  }

  // Lingering ground effects (cloud DoT, sticky slow) tick every frame against the foe.
  private tickZones(dt: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      const foe = this.fighters[1 - z.owner];
      if (Math.hypot(foe.pos.x - z.x, foe.pos.y - z.y) < z.r) {
        if (z.kind === "slow") {
          foe.slowT = 0.2; // refreshed while standing in it
        } else {
          z.tick -= dt;
          if (z.tick <= 0) {
            z.tick = 0.4;
            foe.percent += 3;        // raise damage % without launching (a poison puff)
            foe.flash = 0.12;
            this.juice.burst(C.px(foe.pos.x), C.sy(foe.pos.y + 0.4), 0x9ad84a, 5, 140);
          }
        }
      }
      if (z.life <= 0) this.zones.splice(i, 1);
    }
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
    this.dealt[source.index] += damage;
    logEvent("hit", { from: source.index, to: target.index, dmg: Math.round(damage), pct: Math.round(target.percent) });
    if (source.index === 0) this.score += Math.round(damage * 10); // solo scoring (unused in versus)
  }

  private cull() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].alive) {
        this.gw.world.destroyBody(this.projectiles[i].body);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // Snake-style wrap: cross a screen edge and reappear on the opposite side (no
  // ring-out death). Velocity is preserved, so a fighter flung off the right keeps
  // flying in from the left.
  private wrap(f: Fighter) {
    const p = f.body.getPosition();
    let x = p.x;
    if (x < 0) x += C.WORLD_W; else if (x > C.WORLD_W) x -= C.WORLD_W;
    // horizontal wrap only: the floor is full-width, so a vertical wrap would drop a
    // fighter UNDER it. Knocked-up fighters just fall back down onto the floor.
    if (x !== p.x) { f.body.setPosition(Vec2(x, p.y)); f.body.setAwake(true); }
  }

  // KO is by damage now (the stage wraps, so there is no ring-out): take enough
  // hits and your percent crosses the threshold.
  private checkKO() {
    for (let p = 0; p < 2; p++) {
      if (this.fighters[p].percent >= C.KO_PERCENT) { this.ko(p); return; }
    }
  }

  private ko(loser: number) {
    this.sfx.ko();
    logEvent("ko", { loser, scores: [this.scores[0], this.scores[1]], wave: this.wave });
    this.juice.shake(0.85); this.juice.freeze(0.1); this.juice.slowmo(0.9);
    this.clearProjectiles();

    if (this.mode === "solo") {
      if (loser === 0) {
        this.state = "matchover"; this.winner = 1; this.stateT = 3.0; this.message = "GAME OVER";
      } else {
        this.score += 1500; this.wave++; this.scores[0]++;
        this.state = "roundover"; this.stateT = 1.4; this.message = `K.O.!  WAVE ${this.wave}`;
      }
      return;
    }

    const winner = 1 - loser;
    this.scores[winner]++;
    if (this.scores[winner] >= ROUNDS_TO_WIN) {
      this.state = "matchover"; this.winner = winner; this.stateT = 3.5; this.message = `${this.names[winner]} WINS`;
    } else {
      this.state = "roundover"; this.stateT = 2.0; this.message = `${this.names[winner]} SCORES`;
    }
  }

  private advance() {
    this.round++;
    this.fighters[0].reset(STAGE_SPAWN[0].x, STAGE_SPAWN[0].y);
    this.fighters[1].reset(STAGE_SPAWN[1].x, STAGE_SPAWN[1].y);
    this.fighters[0].facing = 1; this.fighters[1].facing = -1;
    this.reloadT = [0, 0]; this.burnT = [0, 0]; this.burnTick = [0, 0];
    this.cdThrow = [0, 0]; this.cdMelee = [0, 0];
    this.prevThrow = [false, false]; this.prevSpecial = [false, false]; // clear held-button latches
    this.fighters[0].slowT = 0; this.fighters[1].slowT = 0;
    this.pickup = null; this.pickupGap = 0; this.pickupArm = -1;
    if (!this.liveForge) { void this.refill(0); void this.refill(1); } // live mode: keep weapon / stay disarmed until you shout
    this.state = "ready"; this.stateT = COUNTDOWN; this.message = "";
    if (this.mode === "solo" && this.onWave) this.onWave(this.wave);
  }

  private clearProjectiles() {
    for (const pr of this.projectiles) this.gw.world.destroyBody(pr.body);
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.pickup = null; this.pickupArm = -1;
  }
}
