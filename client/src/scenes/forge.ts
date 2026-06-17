import { Container } from "pixi.js";
import * as C from "../config";
import { Scene, Game } from "../app/game";
import { mkText } from "../ui/theme";
import { ItemSpec } from "../content/types";

const PER = 3; // weapons per player

// The Forge beat: type (P4: shout) a phrase, an LLM turns it into a weapon.
// Uses a floating DOM <input> for text (works on phones later too).
export function ForgeScene(game: Game): Scene {
  const container = new Container();
  let input: HTMLInputElement;
  let forPlayers: number[] = [];
  let pi = 0;
  let arsenals: ItemSpec[][] = [[], []];
  let busy = false;

  const titleTxt = mkText("", 38, C.COL.yellow);
  const countTxt = mkText("", 22, C.COL.grey, "700");
  const statusTxt = mkText("", 24, C.COL.p1, "700");
  const cards = new Container();

  function refreshCards() {
    cards.removeChildren();
    const ars = arsenals[forPlayers[pi]];
    ars.forEach((it, i) => {
      const t = mkText(`${it.emoji}  ${it.name}   [${it.archetype}]`, 24, C.COL.white, "700");
      t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 440 + i * 56); cards.addChild(t);
      const fl = mkText(it.flavor, 16, C.COL.grey, "400");
      fl.anchor.set(0.5); fl.position.set(C.DESIGN_W / 2, 440 + i * 56 + 22); cards.addChild(fl);
    });
    countTxt.text = `weapon ${Math.min(ars.length + 1, PER)} / ${PER}`;
  }

  function setupPlayer() {
    const p = forPlayers[pi];
    titleTxt.text = `PLAYER ${p + 1} — FORGE YOUR ARSENAL`;
    (titleTxt.style as any).fill = p === 0 ? C.COL.p1 : C.COL.p2;
    input.value = "";
    input.focus();
    refreshCards();
  }

  function nextOrFight() {
    pi++;
    if (pi >= forPlayers.length) {
      game.arsenals = arsenals;
      try { input.remove(); } catch { /* noop */ }
      game.music.start();
      game.go("fight");
    } else {
      setupPlayer();
    }
  }

  async function submit() {
    if (busy) return;
    const phrase = input.value.trim();
    const ars = arsenals[forPlayers[pi]];
    if (!phrase) { if (ars.length > 0) nextOrFight(); return; }
    busy = true; statusTxt.text = "forging…";
    const item = await game.provider.forgeItem(phrase, forPlayers[pi]);
    ars.push(item);
    input.value = ""; statusTxt.text = ""; busy = false;
    refreshCards();
    if (ars.length >= PER) nextOrFight();
  }

  return {
    container,
    enter() {
      forPlayers = game.mode === "solo" ? [0] : [0, 1];
      arsenals = [[], []];
      pi = 0;

      titleTxt.anchor.set(0.5); titleTxt.position.set(C.DESIGN_W / 2, 86);
      const help = mkText("type a weapon, Enter to forge  •  empty Enter to start early", 20, C.COL.grey, "700");
      help.anchor.set(0.5); help.position.set(C.DESIGN_W / 2, 134);
      countTxt.anchor.set(0.5); countTxt.position.set(C.DESIGN_W / 2, 170);
      statusTxt.anchor.set(0.5); statusTxt.position.set(C.DESIGN_W / 2, 620);
      container.addChild(titleTxt, help, countTxt, statusTxt, cards);

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
        if (e.key === "Enter") { e.preventDefault(); void submit(); }
      });
      setTimeout(() => input.focus(), 60);
      setupPlayer();
    },
    exit() { try { input.remove(); } catch { /* noop */ } },
    update() {},
  };
}
