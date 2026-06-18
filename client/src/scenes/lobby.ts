import { Assets, Container, Sprite, Text } from "pixi.js";
import QRCode from "qrcode";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";
import { PhoneHub } from "../input/phone";
import { API, controllerOrigin } from "../net/config";

function roomCode(): string {
  const cs = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += cs[(Math.random() * cs.length) | 0];
  return s;
}

export function LobbyScene(game: Game): Scene {
  const container = new Container();
  const code = roomCode();
  let hub: PhoneHub;
  let statusTxt: Text, startTxt: Text;
  const joinTxt: Text[] = [];

  function refresh() {
    if (!statusTxt) return;
    statusTxt.text = hub.connected ? `room  ${code}` : "relay offline: start the backend (run_show.ps1)";
    if (joinTxt.length === 2) {
      for (let s = 0; s < 2; s++) {
        joinTxt[s].text = hub.joined[s] ? `P${s + 1}  CONNECTED` : `P${s + 1}  waiting...`;
        (joinTxt[s].style as any).fill = hub.joined[s] ? C.COL.green : C.COL.grey;
      }
    }
    startTxt.visible = hub.joined[0] || hub.joined[1];
  }

  async function makeQR(url: string, x: number, accent: number, label: string, slot: number) {
    const labelT = mkText(label, 26, accent); labelT.anchor.set(0.5); labelT.position.set(x, 158); container.addChild(labelT);
    const join = mkText(`P${slot + 1}  waiting...`, 20, C.COL.grey, "700"); join.anchor.set(0.5); join.position.set(x, 474); container.addChild(join); joinTxt[slot] = join;
    const urlT = mkText(url.replace("http://", ""), 14, C.COL.grey, "400"); urlT.anchor.set(0.5); urlT.position.set(x, 512); container.addChild(urlT);
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1, color: { dark: "#0a0a12", light: "#ffffff" } });
      const tex = await Assets.load(dataUrl);
      const s = new Sprite(tex); s.anchor.set(0.5); s.width = 280; s.height = 280; s.position.set(x, 312); container.addChild(s);
    } catch { /* QR failed; URL text still shown */ }
  }

  return {
    container,
    enter() {
      const t = mkText("SCAN TO JOIN  (VERSUS)", 48, C.COL.yellow); t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 66); container.addChild(t);
      statusTxt = mkText("connecting...", 22, C.COL.white, "700"); statusTxt.anchor.set(0.5); statusTxt.position.set(C.DESIGN_W / 2, 112); container.addChild(statusTxt);
      startTxt = mkText("press ENTER to start  •  Esc to cancel", 24, C.COL.green, "900"); startTxt.anchor.set(0.5); startTxt.position.set(C.DESIGN_W / 2, C.DESIGN_H - 52); startTxt.visible = false; container.addChild(startTxt);
      const note = mkText("phones must be on the same Wi-Fi / hotspot as this laptop  (voice needs the HTTPS setup; touch works now)", 15, C.COL.grey, "700");
      note.anchor.set(0.5); note.position.set(C.DESIGN_W / 2, C.DESIGN_H - 22); container.addChild(note);

      hub = new PhoneHub(code); game.phoneHub = hub; hub.onChange = refresh; hub.connect();

      (async () => {
        let lan = "127.0.0.1";
        try { const r = await fetch(`${API}/netinfo`); const j = await r.json(); lan = j.lan || lan; } catch { /* keep default */ }
        const base = `${controllerOrigin(lan)}/controller?room=${code}`;
        await makeQR(`${base}&slot=0`, C.DESIGN_W * 0.3, C.COL.p1, "PLAYER 1", 0);
        await makeQR(`${base}&slot=1`, C.DESIGN_W * 0.7, C.COL.p2, "PLAYER 2", 1);
        refresh();
      })();
    },
    exit() {},
    update() {},
    onKey(k) {
      if (k === "Escape") { hub.close(); game.phoneHub = undefined; game.go("title"); }
      else if (k === "Enter" && (hub.joined[0] || hub.joined[1])) {
        game.controlMode = "phone"; game.mode = "versus";
        game.go("forgePhone");
      }
    },
  };
}
