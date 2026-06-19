import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText, Menu } from "../ui/theme";
import { soundMode, toggleSoundMode } from "../audio/mode";

export function TitleScene(game: Game): Scene {
  const container = new Container();
  let menu: Menu;
  let t = 0;
  let logo: ReturnType<typeof mkText>;
  let statusTxt: ReturnType<typeof mkText> | undefined;

  // Grab one laptop-webcam frame, pull a palette from the room, and wash it over the
  // living backdrop (animated orbs + grid). Purely cosmetic and never collidable.
  async function captureArena() {
    const set = (s: string) => { if (statusTxt) statusTxt.text = s; };
    if (!navigator.mediaDevices?.getUserMedia) { set("no webcam available"); return; }
    set("scanning the room...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const v = document.createElement("video"); v.srcObject = stream; v.muted = true; v.playsInline = true;
      await v.play().catch(() => { /* autoplay quirk; frame still grabs */ });
      await new Promise((r) => setTimeout(r, 350)); // let auto-exposure settle
      const W = 48, Hh = 27, cv = document.createElement("canvas"); cv.width = W; cv.height = Hh;
      const ctx = cv.getContext("2d")!; ctx.drawImage(v, 0, 0, W, Hh);
      stream.getTracks().forEach((tr) => tr.stop());
      game.bg.applyArena(extractPalette(ctx.getImageData(0, 0, W, Hh).data, 6));
      set("arena set from your room  (select again to rescan)");
    } catch { set("webcam blocked or unavailable"); }
  }

  function extractPalette(data: Uint8ClampedArray, n: number): number[] {
    const buckets = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] & 0xe0) << 16) | ((data[i + 1] & 0xe0) << 8) | (data[i + 2] & 0xe0);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
  }

  return {
    container,
    enter() {
      logo = mkText("SAY IT, SLAY IT", 92, C.COL.white);
      logo.anchor.set(0.5); logo.position.set(C.DESIGN_W / 2, 172);
      const sub = mkText("shout it.  forge it.  throw it.", 28, C.COL.yellow, "700");
      sub.anchor.set(0.5); sub.position.set(C.DESIGN_W / 2, 248);
      container.addChild(logo, sub);

      menu = new Menu([
        { label: "SOLO  (forge + fight)", onSelect: () => { game.mode = "solo"; game.controlMode = "keyboard"; game.arsenals = [[], []]; game.go("forge"); } },
        { label: "VERSUS  (2 players)", onSelect: () => { game.mode = "versus"; game.controlMode = "keyboard"; game.arsenals = [[], []]; game.go("forge"); } },
        { label: "VERSUS  (PHONES)", onSelect: () => game.go("lobby") },
        { label: "VERSUS  (XBOX)", onSelect: () => game.go("gamepadLobby") },
        { label: "WEBCAM ARENA", onSelect: () => void captureArena() },
        { label: "QUICK PLAY", onSelect: () => { game.mode = "solo"; game.controlMode = "keyboard"; game.arsenals = [[], []]; game.music.start(); game.go("fight"); } },
        { label: "CONTROLS", onSelect: () => game.go("controls") },
        { label: "HALL OF FAME", onSelect: () => game.go("hall") },
        { label: "LEADERBOARD", onSelect: () => game.go("leaderboard") },
        { label: `SOUND: ${soundMode().toUpperCase()}`, onSelect: () => { toggleSoundMode(); game.sfx.resume(); game.sfx.ui(); game.go("title"); } },
      ], C.DESIGN_W / 2, 288, 40);
      container.addChild(menu.node);

      statusTxt = mkText("", 18, C.COL.green, "700");
      statusTxt.anchor.set(0.5); statusTxt.position.set(C.DESIGN_W / 2, C.DESIGN_H - 64);
      container.addChild(statusTxt);

      const hint = mkText("W/S or ↑/↓ to choose  •  Enter to start  •  Esc to quit a match", 18, C.COL.grey, "700");
      hint.anchor.set(0.5); hint.position.set(C.DESIGN_W / 2, C.DESIGN_H - 38);
      container.addChild(hint);
    },
    exit() {},
    update(dt) {
      t += dt;
      logo.scale.set(1 + Math.sin(t * 2) * 0.02);
      logo.rotation = Math.sin(t * 1.3) * 0.01;
    },
    onKey(code) {
      if (code === "KeyW" || code === "ArrowUp") menu.move(-1);
      else if (code === "KeyS" || code === "ArrowDown") menu.move(1);
      else if (code === "Enter" || code === "Space") menu.confirm();
    },
  };
}
