import { Assets, Container, Sprite, Text } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";
import { ItemSpec } from "../content/types";
import { record } from "../util/hall";

const PER = 3;

// Phone forge: both players hold the mic on their phone and SHOUT weapons at the
// same time. Voice transcripts arrive via the hub and forge in the background,
// filling each player's column. Host presses Enter to start the fight.
export function PhoneForgeScene(game: Game): Scene {
  const container = new Container();
  const arsenals: ItemSpec[][] = [[], []];
  const submitted = [0, 0];
  const colX = [C.DESIGN_W * 0.3, C.DESIGN_W * 0.7];
  const rows: { item: ItemSpec | null; row: Container; nameTxt: Text; sprited: boolean }[] = [];
  const countTxt: Text[] = [];

  function onVoice(slot: number, text: string) {
    if (!text || submitted[slot] >= PER) return;
    const idx = submitted[slot];
    submitted[slot]++;
    if (countTxt[slot]) countTxt[slot].text = `${submitted[slot]} / ${PER}`;
    const row = new Container(); row.position.set(colX[slot], 256 + idx * 74);
    const nameTxt = mkText(`forging "${text}"...`, 19, C.COL.grey, "700"); nameTxt.anchor.set(0.5); row.addChild(nameTxt);
    container.addChild(row);
    const r = { item: null as ItemSpec | null, row, nameTxt, sprited: false };
    rows.push(r);
    game.provider.forgeItem(text, slot).then((item) => {
      arsenals[slot].push(item); record(item); r.item = item;
      r.nameTxt.text = `${item.emoji}  ${item.name}`;
      (r.nameTxt.style as any).fill = C.COL.white;
      const fl = mkText(`[${item.archetype}]`, 14, C.COL.grey, "700"); fl.anchor.set(0.5); fl.position.set(0, 22); r.row.addChild(fl);
    }).catch(() => { r.nameTxt.text = "(forge failed)"; });
  }

  return {
    container,
    enter() {
      const t = mkText("SHOUT YOUR WEAPONS", 46, C.COL.yellow); t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 66); container.addChild(t);
      const sub = mkText("hold the MIC on your phone and shout 3 weapons each", 22, C.COL.white, "700"); sub.anchor.set(0.5); sub.position.set(C.DESIGN_W / 2, 112); container.addChild(sub);
      for (let s = 0; s < 2; s++) {
        const lbl = mkText(`PLAYER ${s + 1}`, 28, s === 0 ? C.COL.p1 : C.COL.p2); lbl.anchor.set(0.5); lbl.position.set(colX[s], 184); container.addChild(lbl);
        const cnt = mkText(`0 / ${PER}`, 22, C.COL.grey, "700"); cnt.anchor.set(0.5); cnt.position.set(colX[s], 218); container.addChild(cnt); countTxt[s] = cnt;
      }
      const start = mkText("HOST: press ENTER to FIGHT  •  Esc to cancel", 24, C.COL.green, "900");
      start.anchor.set(0.5); start.position.set(C.DESIGN_W / 2, C.DESIGN_H - 44); container.addChild(start);

      if (game.phoneHub) game.phoneHub.onVoice = (slot, text) => onVoice(slot, text);
      game.arsenals = arsenals; // Match reads these live; late forges stream in
    },
    exit() { if (game.phoneHub) game.phoneHub.onVoice = undefined; },
    update() {
      for (const r of rows) {
        if (r.item && r.item.spriteUrl && !r.sprited) {
          r.sprited = true;
          Assets.load(r.item.spriteUrl).then((tex) => {
            const s = new Sprite(tex); s.anchor.set(0.5); s.width = 46; s.height = 46; s.position.set(-140, 4); r.row.addChild(s);
          }).catch(() => { /* keep text */ });
        }
      }
    },
    onKey(k) {
      if (k === "Escape") { game.controlMode = "keyboard"; game.phoneHub?.close(); game.phoneHub = undefined; game.go("title"); }
      else if (k === "Enter") { game.arsenals = arsenals; game.music.start(); game.go("fight"); }
    },
  };
}
