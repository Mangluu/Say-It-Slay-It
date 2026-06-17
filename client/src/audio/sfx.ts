// Tiny procedural Web Audio SFX (no asset files). resume() must be called from a
// user gesture (browser autoplay policy).
export class Sfx {
  private ctx?: AudioContext;

  resume() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private blip(freq: number, dur: number, type: OscillatorType = "square", vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(dur: number, vol = 0.3) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(this.ctx.destination);
    s.start();
  }

  throwItem() { this.blip(420, 0.08, "triangle", 0.12); }
  hit(dmg: number) { this.noise(0.12, 0.22); this.blip(Math.max(80, 200 - dmg * 3), 0.10, "square", 0.16); }
  ko() { this.noise(0.4, 0.32); this.blip(90, 0.5, "sawtooth", 0.18); }
}
