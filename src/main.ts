import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { DialogScene } from './scenes/DialogScene';
import { InventoryScene } from './scenes/InventoryScene';
import { PauseScene } from './scenes/PauseScene';
import { TitleScene } from './scenes/TitleScene';
import { TreeScene } from './scenes/TreeScene';

function startGame(width: number, height: number): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#080405',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width,
      height,
    },
    scene: [TitleScene, GameScene, TreeScene, InventoryScene, DialogScene, PauseScene],
  });

  // Solo in sviluppo: accesso da console per debug e smoke test.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
  }
}

// Il gioco nasce solo quando il contenitore ha una dimensione reale: con un
// pannello appena aperto o una scheda in background il contenitore è 0×0 e,
// in modalità RESIZE, Phaser creerebbe un canvas 0×0 facendo fallire WebGL
// ("Framebuffer status: Incomplete Attachment").
const parent = document.getElementById('app')!;

function tryStart(): boolean {
  const { width, height } = parent.getBoundingClientRect();
  if (width < 1 || height < 1) return false;
  startGame(Math.floor(width), Math.floor(height));
  return true;
}

if (!tryStart()) {
  const observer = new ResizeObserver(() => {
    if (tryStart()) observer.disconnect();
  });
  observer.observe(parent);
}
