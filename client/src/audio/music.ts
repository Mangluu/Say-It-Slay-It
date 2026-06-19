import { soundMode } from "./mode";

// Procedural music bed (no asset files). FUN mode (default): a warm, calm-but-driving
// arcade loop, an Am-F-C-G progression with a soft sine bass, a held triangle pad chord,
// and a sparse pluck, all behind a master gain kept low so it never fights the game. CLASSIC
// mode replays the original 124bpm kick + saw + square loop (kept as a backup). start() /
// stop() are the only controls (stop() also DUCKS it while the laptop mic records a shout).
export class Music {
  private ctx?: AudioContext;
  private master?: GainNode;
  private timer?: number;
  private step = 0;
  private on = false;

  start() {
    if (this.on) return;
    this.on = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5; // keep the bed subtle
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const bpm = soundMode() === "classic" ? 124 : 96;
    const interval = (60 / bpm) / 2 * 1000; // eighth notes
    this.timer = window.setInterval(() => this.tick(), interval);
  }

  stop() {
    this.on = false;
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  private tick() {
    if (!this.ctx || !this.master) return;
    if (soundMode() === "classic") { this.classicTick(); return; }
    const t = this.ctx.currentTime;
    // Am - F - C - G, one chord per bar (4 eighths), warm + sparse
    const roots = [220.0, 174.61, 261.63, 196.0]; // A3 F3 C4 G3
    const third = [261.63, 220.0, 329.63, 246.94]; // C4 A3 E4 B3
    const bar = Math.floor(this.step / 4) % roots.length;
    const root = roots[bar], beat = this.step % 4;
    if (beat === 0) { this.softKick(t); this.pad([root, third[bar]], t); }   // chord change: kick + pad
    if (beat === 2) this.softKick(t);                                         // backbeat kick
    if (this.step % 2 === 0) this.tone(root / 2, 0.42, "sine", 0.07, t);      // warm bass
    if (beat !== 3) this.tone(root * 2 * (beat === 1 ? 1.5 : 1), 0.16, "triangle", 0.028, t); // gentle pluck
    this.step++;
  }

  private tone(f: number, d: number, type: OscillatorType, vol: number, t: number) {
    const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + d);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + d);
  }

  private pad(freqs: number[], t: number) {
    for (const f of freqs) {
      const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0006, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.08);   // soft swell
      g.gain.exponentialRampToValueAtTime(0.0006, t + 1.0);
      o.connect(g).connect(this.master!);
      o.start(t); o.stop(t + 1.05);
    }
  }

  private softKick(t: number) {
    const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + 0.15);
  }

  // ---- the original loop, kept as the CLASSIC backup ----
  private classicTick() {
    const t = this.ctx!.currentTime;
    const roots = [55, 55, 73.42, 65.41];
    const root = roots[Math.floor(this.step / 4) % roots.length];
    if (this.step % 4 === 0) this.classicKick(t);
    if (this.step % 2 === 0) this.classicNote(root, 0.18, "sawtooth", 0.05, t);
    const arp = [root * 4, root * 6, root * 5, root * 8];
    this.classicNote(arp[this.step % arp.length], 0.10, "square", 0.022, t);
    this.step++;
  }
  private classicNote(f: number, d: number, type: OscillatorType, vol: number, t: number) {
    const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + d);
  }
  private classicKick(t: number) {
    const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.11, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + 0.15);
  }
}
