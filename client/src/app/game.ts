import { Application, Container } from "pixi.js";
import * as C from "../config";
import { Background } from "../render/background";
import { KeyboardSource } from "../input/keyboard";
import { Sfx } from "../audio/sfx";
import { Music } from "../audio/music";
import { ContentProvider, ItemSpec } from "../content/types";
import { LocalProvider } from "../content/remote";
import { PhoneHub } from "../input/phone";

export interface Scene {
  container: Container;
  enter(params?: any): void;
  exit(): void;
  update(dt: number): void;
  onKey?(code: string): void;
}
export type SceneFactory = (game: Game) => Scene;

// Owns the Pixi app, the persistent parallax background, shared services, the
// design-space scaling, and a tiny scene switcher.
export class Game {
  root = new Container();
  bg = new Background();
  sceneLayer = new Container();
  kb = new KeyboardSource();
  sfx = new Sfx();
  music = new Music();
  provider: ContentProvider = new LocalProvider();

  mode: "solo" | "versus" = "versus";
  controlMode: "keyboard" | "phone" = "keyboard";
  phoneHub?: PhoneHub;
  arsenals: ItemSpec[][] = [[], []];
  lastScore = 0;
  lastWave = 1;

  scale = 1; baseX = 0; baseY = 0;
  private factories: Record<string, SceneFactory> = {};
  private current?: Scene;

  constructor(public app: Application) {
    this.root.addChild(this.bg.node, this.sceneLayer);
    app.stage.addChild(this.root);
    this.layout();
    window.addEventListener("resize", () => this.layout());
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return; // typing in the forge box
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
      this.current?.onKey?.(e.code);
    });
    const resume = () => this.sfx.resume();
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("pointerdown", resume, { once: true });

    app.ticker.add(() => {
      const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
      this.bg.update(dt);
      this.current?.update(dt);
    });
  }

  register(name: string, f: SceneFactory) { this.factories[name] = f; }

  go(name: string, params?: any) {
    this.current?.exit();
    this.sceneLayer.removeChildren();
    const scene = this.factories[name](this);
    this.current = scene;
    this.sceneLayer.addChild(scene.container);
    scene.enter(params);
  }

  private layout() {
    const w = this.app.renderer.width, h = this.app.renderer.height;
    this.scale = Math.min(w / C.DESIGN_W, h / C.DESIGN_H);
    this.root.scale.set(this.scale);
    this.baseX = (w - C.DESIGN_W * this.scale) / 2;
    this.baseY = (h - C.DESIGN_H * this.scale) / 2;
    this.root.position.set(this.baseX, this.baseY);
  }
}
