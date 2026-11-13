import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { DialogScene } from './scenes/DialogScene';
import { InventoryScene } from './scenes/InventoryScene';
import { PauseScene } from './scenes/PauseScene';
import { TitleScene } from './scenes/TitleScene';
import { TreeScene } from './scenes/TreeScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0b0d12',
  scale: {
    mode: Phaser.Scale.RESIZE,
    // Fallback: una scheda in background può riportare 0×0 e far fallire WebGL.
    width: window.innerWidth || 1280,
    height: window.innerHeight || 720,
  },
  scene: [TitleScene, GameScene, TreeScene, InventoryScene, DialogScene, PauseScene],
});

// Solo in sviluppo: accesso da console per debug e smoke test.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
