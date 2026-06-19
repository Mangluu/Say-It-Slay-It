import { API } from "../net/config";

// The laptop's own microphone, used by GAMEPAD mode for the shout-to-forge (Xbox pads
// have no mic). One shared mic, so the fight serializes recordings. Captures PCM via the
// Web Audio API and uploads a WAV to /asr (the same proven path as the phone controller;
// MediaRecorder is avoided because it is broken on some browsers). On localhost the page
// is a secure context, so getUserMedia needs no HTTPS. Grant once on a user gesture (the
// lobby start key), then record() can be called whenever the game needs a weapon.
export class LaptopMic {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private recording = false;

  get granted(): boolean { return !!this.stream && this.stream.active; }
  get busy(): boolean { return this.recording; } // one shared mic: callers serialize on this

  async grant(): Promise<boolean> {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx!.state === "suspended") await this.ctx!.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch { return false; }
  }

  // Record for ms, transcribe, return the text ("" on any failure: blocked mic, silence,
  // or relay down). Never throws, never blocks the game loop (awaited off the ticker).
  async record(ms: number): Promise<string> {
    if (this.recording) return "";
    if (!this.granted || !this.ctx) { if (!(await this.grant())) return ""; }
    this.recording = true;
    try {
      const ctx = this.ctx!;
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* noop */ } }
      if (!this.stream || !this.stream.active) this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = ctx.createMediaStreamSource(this.stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const gain = ctx.createGain(); gain.gain.value = 0; // silent: keeps the processor pulling, no speaker feedback loop
      const chunks: Float32Array[] = []; let len = 0;
      proc.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); const c = new Float32Array(d.length); c.set(d); chunks.push(c); len += d.length; };
      src.connect(proc); proc.connect(gain); gain.connect(ctx.destination);
      await new Promise((r) => setTimeout(r, ms));
      proc.disconnect(); src.disconnect(); gain.disconnect();
      const wav = encodeWav(chunks, len, ctx.sampleRate);
      const fd = new FormData(); fd.append("audio", wav, "clip.wav");
      // abort a hung /asr so the single shared `recording` lock always clears (else one
      // stuck fetch would starve forging for the rest of the match).
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 6000); // keep 5s record + this < the fight's record cap so a valid transcript is never dropped
      try {
        const r = await fetch(`${API}/asr`, { method: "POST", body: fd, signal: ac.signal });
        const j = await r.json();
        return (j.text || "").trim();
      } finally { clearTimeout(to); }
    } catch { return ""; } finally { this.recording = false; }
  }
}

function encodeWav(chunks: Float32Array[], len: number, rate: number): Blob {
  const pcm = new Float32Array(len); let o = 0;
  for (const c of chunks) { pcm.set(c, o); o += c.length; }
  const buf = new ArrayBuffer(44 + pcm.length * 2), view = new DataView(buf);
  const wstr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); wstr(8, "WAVE"); wstr(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wstr(36, "data"); view.setUint32(40, pcm.length * 2, true);
  let p = 44; for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true); p += 2; }
  return new Blob([view], { type: "audio/wav" });
}
