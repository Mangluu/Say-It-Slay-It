import { Assets, Container, Sprite, Text } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";
import { ItemSpec } from "../content/types";
import { record } from "../util/hall";

const PER = 3; // weapons per player

// The Forge beat. NON-BLOCKING: you type phrases as fast as you like; each one
// forges in the background and its card fills in (name, then AI sprite) when ready.
// The fight starts as soon as you've entered your phrases; any still-generating
// weapons stream into your arsenal during the countdown / early fight.
interface Row { item: ItemSpec | null; row: Container; nameTxt: Text; flavorTxt: Text; sprited: boolean; }

export function ForgeScene(game: Game): Scene {
  const container = new Container();
  let input: HTMLInputElement;
  let forPlayers: number[] = [];
  let pi = 0;
  let arsenals: ItemSpec[][] = [[], []];
  let submitted = 0;
  let rows: Row[] = [];

  const titleTxt = mkText("", 38, C.COL.yellow);
  const countTxt = mkText("", 22, C.COL.grey, "700");
  const cards = new Container();

  function setupPlayer() {
    const p = forPlayers[pi];
    titleTxt.text = `PLAYER ${p + 1} — FORGE YOUR ARSENAL`;
    (titleTxt.style as any).fill = p === 0 ? C.COL.p1 : C.COL.p2;
    submitted = 0;
    rows = [];
    cards.removeChildren();
    countTxt.text = `0 / ${PER}  —  type and hit Enter`;
    input.value = "";
    input.focus();
  }

  function nextOrFight() {
    pi++;
    if (pi >= forPlayers.length) {
      game.arsenals = arsenals;            // same array refs the pending forges push into
      try { input.remove(); } catch { /* noop */ }
      game.music.start();
      game.go("fight");                    // weapons keep streaming in during the countdown
    } else {
      setupPlayer();
    }
  }

  function submit() {
    if (submitted >= PER) { nextOrFight(); return; } // arsenal full -> Enter starts the fight
    const phrase = input.value.trim();
    if (!phrase) { if (submitted > 0) nextOrFight(); return; }
    input.value = "";
    const p = forPlayers[pi];
    submitted++;
    countTxt.text = `${submitted} / ${PER}  —  forging in the background...`;

    // placeholder card, filled when the forge resolves
    const i = rows.length;
    const row = new Container();
    row.position.set(C.DESIGN_W / 2, 444 + i * 64);
    const nameTxt = mkText(`forging "${phrase}"...`, 23, C.COL.grey, "700"); nameTxt.anchor.set(0.5);
    const flavorTxt = mkText("", 16, C.COL.grey, "400"); flavorTxt.anchor.set(0.5); flavorTxt.position.set(0, 22);
    row.addChild(nameTxt, flavorTxt);
    cards.addChild(row);
    const r: Row = { item: null, row, nameTxt, flavorTxt, sprited: false };
    rows.push(r);

    game.provider.forgeItem(phrase, p).then((item) => {
      arsenals[p].push(item);
      record(item);
      r.item = item;
      r.nameTxt.text = `${item.emoji}  ${item.name}   [${item.archetype}]`;
      (r.nameTxt.style as any).fill = C.COL.white;
      r.flavorTxt.text = item.flavor;
    }).catch(() => { r.nameTxt.text = "(forge failed)"; });

    if (submitted >= PER) {
      (countTxt.style as any).fill = C.COL.yellow;
      countTxt.text = "arsenal forged — press ENTER to FIGHT!";
      input.placeholder = "press Enter to fight";
    }
  }

  return {
    container,
    enter() {
      forPlayers = game.mode === "solo" ? [0] : [0, 1];
      arsenals = [[], []];
      pi = 0;

      titleTxt.anchor.set(0.5); titleTxt.position.set(C.DESIGN_W / 2, 86);
      const help = mkText("type a weapon, Enter to forge (x3)  •  empty Enter to start now", 20, C.COL.grey, "700");
      help.anchor.set(0.5); help.position.set(C.DESIGN_W / 2, 134);
      countTxt.anchor.set(0.5); countTxt.position.set(C.DESIGN_W / 2, 170);
      container.addChild(titleTxt, help, countTxt, cards);

      input = document.createElement("input");
      input.type = "text"; input.maxLength = 60;
      input.placeholder = "e.g. flaming rubber duck of doom";
      Object.assign(input.style, {
        position: "fixed", left: "50%", top: "38%", transform: "translate(-50%,-50%)",
        width: "560px", maxWidth: "82vw", fontSize: "22px", padding: "14px 18px",
        borderRadius: "12px", border: "2px solid #3ce6f0", background: "rgba(10,10,20,0.92)",
        color: "#fff", outline: "none", fontFamily: "Arial", zIndex: "10", textAlign: "center",
      });
      document.body.appendChild(input);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); submit(); }
      });
      setTimeout(() => input.focus(), 60);
      setupPlayer();
    },
    exit() { try { input.remove(); } catch { /* noop */ } },
    update() {
      for (const r of rows) {
        if (r.item && r.item.spriteUrl && !r.sprited) {
          r.sprited = true;
          Assets.load(r.item.spriteUrl).then((tex) => {
            const s = new Sprite(tex);
            s.anchor.set(0.5); s.width = 64; s.height = 64; s.position.set(-280, 6);
            r.row.addChild(s);
          }).catch(() => { /* keep text only */ });
        }
      }
    },
  };
}
