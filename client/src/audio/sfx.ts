import { soundMode } from "./mode";

// Procedural Web Audio SFX (no asset files). FUN mode (default): juicier, layered sounds
// tied to game events. CLASSIC mode keeps the original bleeps as a backup. resume() must be
// called from a user gesture (autoplay policy). Everything routes through a master gain.
export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;

  resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private out(): AudioNode { return this.master || this.ctx!.destination; }

  private blip(freq: number, dur: number, type: OscillatorType = "square", vol = 0.2, slideTo?: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out());
    o.start(t); o.stop(t + dur);
  }

  private noise(dur: number, vol = 0.3, hp = 0) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    let node: AudioNode = s;
    if (hp) { const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; s.connect(f); node = f; }
    node.connect(g).connect(this.out());
    s.start();
  }

  throwItem() {
    if (soundMode() === "classic") { this.blip(420, 0.08, "triangle", 0.12); return; }
    this.blip(680, 0.12, "triangle", 0.12, 240); // a quick downward whoosh
    this.noise(0.07, 0.06, 1200);
  }

  hit(dmg: number) {
    if (soundMode() === "classic") { this.noise(0.12, 0.22); this.blip(Math.max(80, 200 - dmg * 3), 0.10, "square", 0.16); return; }
    this.noise(0.10, 0.20 + Math.min(0.18, dmg * 0.006));            // crunch, louder with damage
    this.blip(150, 0.12, "sine", 0.22, Math.max(45, 150 - dmg * 3)); // a low thump that drops with damage
    this.blip(900, 0.04, "square", 0.10);                            // a snappy click on top
  }

  ko() {
    if (soundMode() === "classic") { this.noise(0.4, 0.32); this.blip(90, 0.5, "sawtooth", 0.18); return; }
    this.noise(0.45, 0.34);
    this.blip(220, 0.5, "sawtooth", 0.20, 50);  // big downward sweep
    this.blip(70, 0.6, "sine", 0.18);           // sub boom
  }

  // a new weapon arrives: a bright rising sparkle (the "FORGED!" fanfare)
  forged() {
    if (!this.ctx) return;
    const notes = soundMode() === "classic" ? [523, 659] : [523, 659, 784, 1047]; // C E G C
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.14, "triangle", 0.12), i * 55));
  }

  // grabbed the rescue pickup: a quick two-note chime
  pickup() { this.blip(740, 0.10, "triangle", 0.14); setTimeout(() => this.blip(988, 0.14, "triangle", 0.14), 70); }

  // round / match bell
  bell() { this.blip(880, 0.5, "sine", 0.16); this.blip(1320, 0.45, "sine", 0.07); }

  // soft UI tick (menu move / confirm)
  ui() { this.blip(660, 0.05, "square", 0.06); }
}
