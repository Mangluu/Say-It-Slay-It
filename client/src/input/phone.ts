import { InputState, NEUTRAL } from "./types";
import { Controller } from "../game/controller";
import { WS } from "../net/config";

// The game (laptop) connects to the backend relay as role=game; phones connect
// as role=controller. The hub keeps the latest InputState per slot and surfaces
// voice transcripts (for the forge).
export class PhoneHub {
  ws?: WebSocket;
  connected = false;
  state: InputState[] = [{ ...NEUTRAL }, { ...NEUTRAL }];
  joined = [false, false];
  onVoice?: (slot: number, text: string) => void;
  onChange?: () => void;

  constructor(readonly room: string) {}

  connect() {
    try {
      this.ws = new WebSocket(`${WS}/ws?role=game&room=${this.room}`);
      this.ws.onopen = () => { this.connected = true; this.onChange?.(); };
      this.ws.onclose = () => { this.connected = false; this.onChange?.(); };
      this.ws.onmessage = (e) => {
        let d: any;
        try { d = JSON.parse(e.data); } catch { return; }
        if (d.type === "input" && typeof d.slot === "number" && d.state) {
          this.state[d.slot] = {
            axisX: +d.state.axisX || 0,
            jump: !!d.state.jump, throw: !!d.state.throw,
            dash: !!d.state.dash, special: !!d.state.special,
          };
        } else if (d.type === "voice" && typeof d.slot === "number") {
          this.onVoice?.(d.slot, d.text || "");
        } else if (d.type === "join" && typeof d.slot === "number") {
          this.joined[d.slot] = true; this.onChange?.();
        } else if (d.type === "leave" && typeof d.slot === "number") {
          this.joined[d.slot] = false; this.onChange?.();
        }
      };
    } catch { /* relay unavailable; lobby will show "offline" */ }
  }

  controller(slot: number): Controller { return new PhoneController(this, slot); }
  close() { try { this.ws?.close(); } catch { /* noop */ } }
}

export class PhoneController implements Controller {
  constructor(private hub: PhoneHub, private slot: number) {}
  sample(): InputState { return this.hub.state[this.slot] ?? NEUTRAL; }
}
