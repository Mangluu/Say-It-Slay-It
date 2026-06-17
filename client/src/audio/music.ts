// Subtle procedural music bed (low volume): a 4-on-the-floor kick + alternating
// bass + light arpeggio. No assets. start()/stop() from a user gesture.
export class Music {
  private ctx?: AudioContext;
  private timer?: number;
  private step = 0;
  private on = false;

  start() {
    if (this.on) return;
    this.on = true;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const interval = (60 / 124) / 2 * 1000; // eighth notes at 124bpm
    this.timer = window.setInterval(() => this.tick(), interval);
  }

  stop() {
    this.on = false;
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  private tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const roots = [55, 55, 73.42, 65.41]; // A1 A1 D2 C2
    const root = roots[Math.floor(this.step / 4) % roots.length];
    if (this.step % 4 === 0) this.kick(t);
    if (this.step % 2 === 0) this.note(root, 0.18, "sawtooth", 0.05, t);
    const arp = [root * 4, root * 6, root * 5, root * 8];
    this.note(arp[this.step % arp.length], 0.10, "square", 0.022, t);
    this.step++;
  }

  private note(f: number, d: number, type: OscillatorType, vol: number, t: number) {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g).connect(this.ctx!.destination);
    o.start(t); o.stop(t + d);
  }

  private kick(t: number) {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.ctx!.destination);
    o.start(t); o.stop(t + 0.15);
  }
}
