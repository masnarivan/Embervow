import Phaser from 'phaser';
import { drawActor, type ActorKind } from '../render/actors';
import { BACKGROUND, drawFlame, drawFloorTile, drawRitualCircle, drawWallTile, hash } from '../render/terrain';
import { audio } from '../audio/audio';
import { hitsArc, type AttackEvent, type Telegraph } from '../combat/damage';
import { projectileHits, spawnProjectiles, stepProjectile, type Projectile } from '../combat/projectiles';
import { canKeep, cycleTarget, pickTarget } from '../combat/targeting';
import { TILE_H, TILE_W, screenDirToWorld, toScreen, type Vec2 } from '../core/iso';
import { insideArena, parseLevel, setGate, type Level } from '../core/level';
import { WALL, hasLineOfSight } from '../core/map';
import { newWorld, type WorldState } from '../core/world';
import { CUSTODE } from '../data/boss';
import { CHOICES } from '../data/choices';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { LEVEL1_CHESTS, LEVEL1_ROWS } from '../data/level1';
import { Boss } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import { Player, type PlayerInput } from '../entities/Player';
import { Hud } from '../ui/Hud';
import { makeSave, saveStore, type SaveData } from '../save/save';
import type { DialogData } from './DialogScene';
import type { PauseData } from './PauseScene';

type Gfx = Phaser.GameObjects.Graphics;
type Walk = { x: number; y: number; phase: number; moving: boolean };
const EMBER_COUNT = 46;
type KeyName = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'Q' | 'TAB' | 'T' | 'I' | 'ESC' | 'SPACE' | 'E' | 'ONE' | 'TWO' | 'THREE' | 'FOUR';
type LevelChest = Level['chests'][number];
type LevelChoice = Level['choices'][number];
type Interaction =
  | { kind: 'bonfire'; index: number }
  | { kind: 'chest'; chest: LevelChest }
  | { kind: 'choice'; choice: LevelChoice };

const WALL_HEIGHT = 44;
/** Opacità dei muri che coprono il giocatore. */
const WALL_FADE_ALPHA = 0.28;
const RESPAWN_DELAY = 2.6;
const INTERACT_RANGE = 1.4;
/** Salvataggio automatico periodico, oltre a quelli su falò, scelte, forzieri e boss. */
const AUTOSAVE_EVERY = 15;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

export class GameScene extends Phaser.Scene {
  level!: Level;
  world: WorldState = newWorld();
  player!: Player;
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  projectiles: Projectile[] = [];

  private playerG!: Gfx;
  private enemyG = new Map<Enemy, Gfx>();
  private propG = new Map<string, Gfx>();
  private gateG: Gfx[] = [];
  /** Un Graphics per tile di muro, con il riquadro che occupa a schermo. */
  private wallG: { g: Gfx; x: number; top: number; bottom: number; alpha: number }[] = [];
  private fx!: Gfx;
  private projG!: Gfx;
  private hud!: Hud;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;
  /** XP lasciati a terra all'ultima morte: si recuperano toccandoli, si perdono morendo di nuovo. */
  lostXp: { x: number; y: number; amount: number } | null = null;
  private lostXpG!: Gfx;
  /** Nemico agganciato dalla mira automatica. */
  target: Enemy | null = null;
  /** Bersaglio scelto a mano con Tab: non cambia da solo finché resta valido. */
  private manualLock = false;
  private aimAngle = -Math.PI / 2;
  private attackQueued = false;
  private hitStop = 0;
  private deathTime = 0;
  private camX = 0;
  private camY = 0;
  private message = '';
  private messageLeft = 0;
  private bossPhaseSeen = 0;
  private pendingSave: SaveData | null = null;
  private saveTimer = 0;
  private sparks: Spark[] = [];
  private ghostG!: Gfx;
  /** Bagliori additivi a terra: lava, falò. */
  private glowG!: Gfx;
  /** Braci che salgono, in coordinate di schermo. */
  private emberG!: Gfx;
  private embers: { x: number; y: number; v: number; seed: number }[] = [];
  private vignette!: Phaser.GameObjects.Image;
  private lavaTiles: { x: number; y: number; seed: number }[] = [];
  private walks = new WeakMap<object, Walk>();
  private prevStates = new Map<Enemy, string>();
  private prevPlayerState = 'idle';
  private onHidden = (): void => {
    if (document.visibilityState === 'hidden') this.save();
  };

  constructor() {
    super('game');
  }

  /** La scena viene riavviata tornando dal titolo: ogni stato va azzerato qui. */
  init(data: { save?: SaveData | null }): void {
    this.pendingSave = data?.save ?? null;
    this.enemyG = new Map();
    this.propG = new Map();
    this.gateG = [];
    this.wallG = [];
    this.lavaTiles = [];
    this.embers = [];
    this.walks = new WeakMap();
    this.projectiles = [];
    this.sparks = [];
    this.prevStates = new Map();
    this.prevPlayerState = 'idle';
    this.lostXp = null;
    this.target = null;
    this.manualLock = false;
    this.attackQueued = false;
    this.hitStop = 0;
    this.deathTime = 0;
    this.message = '';
    this.messageLeft = 0;
    this.bossPhaseSeen = 0;
    this.saveTimer = 0;
  }

  create(): void {
    this.level = parseLevel(LEVEL1_ROWS, LEVEL1_CHESTS);
    this.world = newWorld();
    this.world.lastBonfire = this.nearestIndex(this.level.bonfires, this.level.start);
    const save = this.pendingSave;
    if (save) {
      this.world = structuredClone(save.world);
      if (!this.level.bonfires[this.world.lastBonfire]) this.world.lastBonfire = 0;
    }
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.drawMap();
    this.createAtmosphere();

    this.fx = this.add.graphics().setDepth(-0.5);
    this.projG = this.add.graphics().setDepth(80000);
    this.lostXpG = this.add.graphics();
    this.createProps();
    this.player = new Player(this.level.start.x, this.level.start.y);
    this.playerG = this.add.graphics();
    this.ghostG = this.add.graphics().setDepth(85000);
    if (save) {
      // Si riparte dall'ultimo falò, come dopo una morte.
      this.player.restore(save.player);
      this.lostXp = save.lostXp;
      const b = this.level.bonfires[this.world.lastBonfire];
      this.player.x = b.x;
      this.player.y = b.y - 1;
      this.say('Bentornato.', 2);
    }
    this.spawnEnemies();
    this.hud = new Hud(this);
    audio.music('explore');
    document.addEventListener('visibilitychange', this.onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('visibilitychange', this.onHidden));

    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,Q,TAB,T,I,ESC,SPACE,E,ONE,TWO,THREE,FOUR') as typeof this.keys;
    // Al ritorno da una schermata sovrapposta: nessun tasto deve risultare ancora premuto.
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.input.keyboard!.resetKeys();
      this.save(); // talenti o equipaggiamento possono essere cambiati
    });
    this.input.mouse?.disableContextMenu();
    this.input.off('pointerdown');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.leftButtonDown()) this.attackQueued = true;
    });

    const s = toScreen(this.player.x, this.player.y);
    this.camX = s.x;
    this.camY = s.y;
  }

  update(_time: number, deltaMs: number): void {
    const realDt = Math.min(deltaMs / 1000, 0.05);
    let dt = realDt;
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      dt = 0;
    }

    const input = this.readInput();
    if (dt > 0) this.simulate(dt, input);

    this.handleWorld(realDt);
    this.saveTimer += realDt;
    if (this.saveTimer >= AUTOSAVE_EVERY) this.save();
    this.updateSparks(realDt);
    this.updateCamera(realDt);
    this.render();
  }

  // ---------- Input ----------

  private readInput(): PlayerInput {
    const k = this.keys;
    const sx = (k.RIGHT.isDown ? 1 : 0) - (k.LEFT.isDown ? 1 : 0);
    const sy = (k.DOWN.isDown ? 1 : 0) - (k.UP.isDown ? 1 : 0);
    const move = screenDirToWorld(sx, sy);

    // Mira automatica: verso il bersaglio agganciato; senza bersaglio, dove si cammina.
    const p = this.player;
    if (p.state === 'dead') {
      this.target = null;
      this.manualLock = false;
    } else if (Phaser.Input.Keyboard.JustDown(k.TAB)) {
      this.target = cycleTarget(p.x, p.y, this.targetable(), this.target);
      this.manualLock = this.target !== null;
    } else if (!(this.manualLock && canKeep(p.x, p.y, this.targetable(), this.target))) {
      this.manualLock = false;
      this.target = pickTarget(p.x, p.y, this.targetable(), this.target);
    }
    if (this.target) {
      this.aimAngle = Math.atan2(this.target.y - p.y, this.target.x - p.x);
    } else if (sx !== 0 || sy !== 0) {
      this.aimAngle = Math.atan2(move.y, move.x);
    }

    const input: PlayerInput = {
      moveX: move.x,
      moveY: move.y,
      aimAngle: this.aimAngle,
      attack: this.attackQueued || Phaser.Input.Keyboard.JustDown(k.Q),
      dodge: Phaser.Input.Keyboard.JustDown(k.SPACE),
      skill: null,
    };
    [k.ONE, k.TWO, k.THREE, k.FOUR].forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(key)) input.skill = i;
    });
    this.attackQueued = false;
    return input;
  }

  /** Nemici agganciabili: il boss solo quando è sveglio. */
  private targetable(): Enemy[] {
    const p = this.player;
    return this.enemies.filter(
      (e) => (!(e instanceof Boss) || e.awake) && hasLineOfSight(this.level.map, p.x, p.y, e.x, e.y),
    );
  }

  // ---------- Simulazione ----------

  private simulate(dt: number, input: PlayerInput): void {
    const player = this.player;

    const swing = player.update(dt, input, this.level.map);
    if (player.state !== this.prevPlayerState) {
      if (player.state === 'attack') audio.play('swing');
      else if (player.state === 'skill') audio.play('skill');
      else if (player.state === 'dodge') audio.play('dodge');
      this.prevPlayerState = player.state;
    }
    if (swing) this.resolvePlayerAttack(swing);

    for (const e of this.enemies) {
      const strike = e.update(dt, player, this.level.map);
      this.enemySounds(e);
      if (!strike) continue;
      if (strike.projectile) {
        this.projectiles.push(...spawnProjectiles(strike));
        audio.play('shoot', this.loudness(e));
      } else if (hitsArc(strike, player.x, player.y, player.radius)) {
        this.hurtPlayer(strike.damage, strike.angle);
      }
    }
    this.updateProjectiles(dt);
    this.separateBodies();
    this.collectLostXp();
    const healed = player.takeHealText();
    if (healed > 0) {
      this.floatText(player.x + 0.4, player.y - 0.4, `+${healed}`, '#7fe08a');
      audio.play('heal');
    }
  }

  /** Volume in base alla distanza dal giocatore (0 oltre 12 tile). */
  private loudness(e: { x: number; y: number }): number {
    const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
    return Math.max(0, 1 - d / 12);
  }

  /** Suoni legati ai cambi di stato dei nemici: il wind-up si sente, così si può schivare a orecchio. */
  private enemySounds(e: Enemy): void {
    const prev = this.prevStates.get(e);
    if (prev === e.state) return;
    this.prevStates.set(e, e.state);
    const v = this.loudness(e);
    if (v <= 0) return;
    if (e.state === 'windup') audio.play(e instanceof Boss ? 'bossWindup' : 'windup', v);
    else if (e.state === 'transition') audio.play('roar');
  }

  private updateSparks(dt: number): void {
    this.sparks = this.sparks.filter((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 300 * dt;
      s.life -= dt;
      return s.life > 0;
    });
  }

  private burst(wx: number, wy: number, color: number, count: number): void {
    const c = toScreen(wx, wy);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      this.sparks.push({
        x: c.x, y: c.y - 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.25 + Math.random() * 0.25, color,
      });
    }
  }

  /** Salvataggio automatico (asincrono, non blocca il gioco). */
  save(): void {
    this.saveTimer = 0;
    const data = makeSave(this.player.snapshot(), this.world, this.lostXp);
    void saveStore()
      .save(data)
      .catch(() => this.say('Impossibile salvare: lo storage del browser è bloccato', 3));
  }

  private hurtPlayer(amount: number, angle: number): boolean {
    const player = this.player;
    const dmg = player.takeDamage(amount, angle);
    if (dmg <= 0) {
      this.floatText(player.x, player.y, 'schivato', '#9fd0ff');
      return false;
    }
    this.hitStop = 0.07;
    this.cameras.main.shake(140, 0.008);
    this.floatText(player.x, player.y, `-${dmg}`, '#ff5a4a');
    this.burst(player.x, player.y, 0xd03030, 8);
    audio.play('hurt');
    if (player.state === 'dead') {
      this.dropXp();
      audio.play('death');
      this.save();
    }
    if (player.consumeLastStand()) {
      this.floatText(player.x - 0.5, player.y - 0.5, 'Ultima Luce!', '#fff1a8');
      this.cameras.main.flash(300, 255, 240, 180);
    }
    return true;
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    this.projectiles = this.projectiles.filter((pr) => {
      if (!stepProjectile(pr, dt, this.level.map)) return false;
      if (p.state === 'dead' || !projectileHits(pr, p.x, p.y, p.radius)) return true;
      if (p.invulnerable) {
        // Rotolando ci si passa attraverso.
        if (!pr.dodged) this.floatText(p.x, p.y, 'schivato', '#9fd0ff');
        pr.dodged = true;
        return true;
      }
      this.hurtPlayer(pr.damage, Math.atan2(pr.vy, pr.vx));
      return false;
    });
  }

  /** Alla morte gli XP del livello in corso restano a terra (quelli già a terra vanno persi). */
  private dropXp(): void {
    const p = this.player;
    this.lostXp = p.xp > 0 ? { x: p.x, y: p.y, amount: p.xp } : null;
    p.xp = 0;
  }

  private collectLostXp(): void {
    const l = this.lostXp;
    const p = this.player;
    if (!l || p.state === 'dead' || Math.hypot(p.x - l.x, p.y - l.y) > 0.8) return;
    this.lostXp = null;
    this.floatText(p.x, p.y, `+${l.amount} XP recuperati`, '#8fe0c0');
    this.grantXp(l.amount);
  }

  private grantXp(amount: number): void {
    if (this.player.gainXp(amount) > 0) {
      audio.play('levelup');
      this.save();
      this.say(`Livello ${this.player.level}!`, 2.5);
      this.cameras.main.flash(250, 255, 240, 200);
    }
  }

  private say(text: string, seconds: number): void {
    this.message = text;
    this.messageLeft = seconds;
  }

  private resolvePlayerAttack(swing: AttackEvent): void {
    let hitAny = false;
    for (const e of this.targetable()) {
      if (e.dead || !hitsArc(swing, e.x, e.y, e.radius)) continue;
      if (e instanceof Boss && e.state === 'transition') continue;
      e.takeDamage(swing.damage, swing.angle, swing.breakPoise);
      this.floatText(e.x, e.y, `${swing.damage}`, '#f2e6b0');
      this.burst(e.x, e.y, 0xffe0a0, e.dead ? 14 : 6);
      this.player.onHitLanded(swing.damage, swing.lifesteal);
      if (e.dead) this.grantXp(e.def.xp);
      hitAny = true;
    }
    if (hitAny) {
      audio.play('hit');
      this.hitStop = 0.05;
      this.cameras.main.shake(70, 0.003);
    }
  }

  /** I corpi vivi non si sovrappongono: i nemici si spingono tra loro e via dal giocatore. */
  private separateBodies(): void {
    const map = this.level.map;
    const alive = this.enemies.filter((e) => !e.dead);
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const overlap = a.radius + b.radius - d;
        if (overlap > 0) {
          const px = (dx / d) * overlap * 0.5;
          const py = (dy / d) * overlap * 0.5;
          a.move(map, -px, -py);
          b.move(map, px, py);
        }
      }
      const p = this.player;
      if (p.state === 'dead' || p.state === 'dodge') continue;
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const overlap = a.radius + p.radius - d;
      if (overlap > 0) a.move(map, (dx / d) * overlap, (dy / d) * overlap);
    }
  }

  // ---------- Mondo: interazioni, falò, boss, morte ----------

  private nearestIndex(points: readonly Vec2[], from: Vec2): number {
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private near(x: number, y: number): boolean {
    return Math.hypot(this.player.x - x, this.player.y - y) < INTERACT_RANGE;
  }

  private interaction(): Interaction | null {
    for (const choice of this.level.choices) if (this.near(choice.x, choice.y)) return { kind: 'choice', choice };
    for (const chest of this.level.chests) {
      if (!this.world.openedChests.includes(chest.id) && this.near(chest.x, chest.y)) return { kind: 'chest', chest };
    }
    const index = this.level.bonfires.findIndex((b) => this.near(b.x, b.y));
    return index >= 0 ? { kind: 'bonfire', index } : null;
  }

  private nearBonfire(): boolean {
    return this.interaction()?.kind === 'bonfire';
  }

  private promptFor(it: Interaction | null): string {
    if (!it) return '';
    switch (it.kind) {
      case 'bonfire':
        return '[E] Riposa al falò · [T] Talenti';
      case 'chest':
        return '[E] Apri il forziere';
      case 'choice': {
        const c = CHOICES[it.choice.id];
        const made = this.world.choices[c.id];
        return made ? c.after[made] : c.prompt;
      }
    }
  }

  private handleWorld(dt: number): void {
    const player = this.player;
    const k = this.keys;
    this.messageLeft = Math.max(0, this.messageLeft - dt);

    if (player.state === 'dead') {
      this.deathTime += dt;
      if (this.deathTime >= RESPAWN_DELAY) this.respawn();
      return;
    }
    this.deathTime = 0;
    this.updateBossFight();

    if (Phaser.Input.Keyboard.JustDown(k.T)) return this.openOverlay('tree', { player, atBonfire: this.nearBonfire() });
    if (Phaser.Input.Keyboard.JustDown(k.I)) return this.openOverlay('inventory', { player });
    if (Phaser.Input.Keyboard.JustDown(k.ESC)) {
      const data: PauseData = {
        onQuit: () => {
          this.save();
          this.scene.start('title');
        },
      };
      return this.openOverlay('pause', data);
    }
    if (!Phaser.Input.Keyboard.JustDown(k.E)) return;

    const it = this.interaction();
    if (!it) return;
    if (it.kind === 'bonfire') {
      if (this.boss?.awake && !this.boss.dead) return;
      this.world.lastBonfire = it.index;
      this.rest(player.x, player.y);
      audio.play('rest');
      this.say('Hai riposato. I nemici sono tornati. Partita salvata.', 2.5);
    } else if (it.kind === 'chest') {
      this.world.openedChests.push(it.chest.id);
      player.addItem(it.chest.item);
      audio.play('chest');
      this.save();
      this.say(`Hai trovato: ${ITEMS[it.chest.item].name} · [I] Inventario`, 3.5);
    } else if (!this.world.choices[it.choice.id]) {
      const choice = CHOICES[it.choice.id];
      const data: DialogData = { choice, onChoose: (i) => this.resolveChoice(choice.id, i) };
      this.openOverlay('dialog', data);
    }
  }

  private openOverlay(key: string, data: object): void {
    this.scene.pause();
    this.scene.launch(key, data);
  }

  /** Applica una scelta morale; ritorna il testo del risultato. */
  resolveChoice(id: string, index: number): string {
    const opt = CHOICES[id].options[index];
    const p = this.player;
    this.world.choices[id] = opt.side;
    p.alignment.gain(opt.side, opt.points);
    if (opt.item) p.addItem(opt.item);
    if (opt.xp) this.grantXp(opt.xp);
    if (opt.hpChange) p.hp = Math.max(1, Math.min(p.maxHp, p.hp + opt.hpChange * p.maxHp));
    audio.play('choice');
    this.save();
    const side = opt.side === 'light' ? 'Luce' : 'Oscurità';
    const extra = opt.item ? `\n\nHai ottenuto: ${ITEMS[opt.item].name}.` : '';
    return `${opt.result}${extra}\n\n+${opt.points} ${side}`;
  }

  private updateBossFight(): void {
    const boss = this.boss;
    if (!boss) return;
    if (boss.dead) {
      if (!this.world.bossDefeated) this.onBossDefeated(boss);
      return;
    }
    const p = this.player;
    if (!boss.awake && insideArena(this.level, p.x, p.y, p.radius)) {
      boss.wake();
      setGate(this.level, true);
      this.bossPhaseSeen = 0;
      this.say(boss.bossDef.title, 3);
      audio.music('boss');
    }
    if (boss.phaseIndex !== this.bossPhaseSeen) {
      this.bossPhaseSeen = boss.phaseIndex;
      this.cameras.main.shake(900, 0.006);
      this.say('Il Custode ruggisce!', 2);
    }
  }

  private onBossDefeated(boss: Boss): void {
    this.world.bossDefeated = true;
    setGate(this.level, false);
    this.player.addItem(boss.bossDef.drop);
    this.cameras.main.flash(600, 255, 230, 180);
    audio.play('victory');
    audio.music('explore');
    this.save();
    this.say(`${boss.bossDef.title} è caduto · Hai ottenuto: ${ITEMS[boss.bossDef.drop].name}`, 6);
  }

  private respawn(): void {
    const b = this.level.bonfires[this.world.lastBonfire];
    this.rest(b.x, b.y - 1);
  }

  /** Falò (o morte): cura completa, nemici di nuovo al loro posto, boss azzerato. */
  private rest(x: number, y: number): void {
    this.player.reset(x, y);
    this.deathTime = 0;
    this.projectiles = [];
    setGate(this.level, false);
    this.spawnEnemies();
    audio.music('explore');
    this.save();
  }

  private spawnEnemies(): void {
    for (const g of this.enemyG.values()) g.destroy();
    this.enemyG.clear();
    this.enemies = this.level.enemies.map((s) => new Enemy(ENEMIES[s.type], s.x, s.y));
    const b = this.level.boss;
    this.boss = b && !this.world.bossDefeated ? new Boss(CUSTODE, b.x, b.y) : null;
    if (this.boss) this.enemies.push(this.boss);
    for (const e of this.enemies) this.enemyG.set(e, this.add.graphics());
    this.target = null;
    this.manualLock = false;
  }

  // ---------- Rendering ----------

  private updateCamera(dt: number): void {
    const s = toScreen(this.player.x, this.player.y);
    const t = 1 - Math.exp(-10 * dt);
    this.camX += (s.x - this.camX) * t;
    this.camY += (s.y - 20 - this.camY) * t;
    this.cameras.main.centerOn(this.camX, this.camY);
  }

  private drawMap(): void {
    const { w, h, tiles } = this.level.map;
    const hh = TILE_H / 2;
    const floor = this.add.graphics().setDepth(-1);
    const isWallAt = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === WALL;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = toScreen(x + 0.5, y + 0.5);
        if (!isWallAt(x, y)) {
          const arena = this.level.arena.has(y * w + x);
          if (drawFloorTile(floor, c.x, c.y, x, y, arena)) this.lavaTiles.push({ x: c.x, y: c.y, seed: hash(x, y, 7) * 6.28 });
          continue;
        }
        // Solo i muri che confinano con il pavimento: gli altri non si vedono.
        let visible = false;
        for (let dy = -1; dy <= 1 && !visible; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (!isWallAt(x + dx, y + dy)) visible = true;
        }
        if (!visible) continue;
        // Un Graphics per tile: così i muri che coprono il giocatore sfumano uno per uno.
        const g = this.add.graphics().setDepth(c.y);
        const top = c.y - WALL_HEIGHT;
        this.wallG.push({ g, x: c.x, top: top - hh, bottom: c.y + hh, alpha: 1 });
        drawWallTile(g, c.x, c.y, x, y, WALL_HEIGHT);
      }
    }
    if (this.level.boss) drawRitualCircle(floor, this.level.boss.x, this.level.boss.y, 4.2);
    for (const gt of this.level.gate) {
      const c = toScreen(gt.tx + 0.5, gt.ty + 0.5);
      this.gateG.push(this.add.graphics().setPosition(c.x, c.y).setDepth(c.y));
    }
  }

  /** Bagliori, braci e vignetta: strati fissi sopra o sotto il mondo. */
  private createAtmosphere(): void {
    this.glowG = this.add.graphics().setDepth(-0.8).setBlendMode(Phaser.BlendModes.ADD);
    this.emberG = this.add.graphics().setScrollFactor(0).setDepth(95000).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.embers.push({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, seed: Math.random() * 6.28 });
    }
    if (!this.textures.exists('vignette')) {
      const size = 512;
      const tex = this.textures.createCanvas('vignette', size, size)!;
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.72);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(20,2,2,0.45)');
      grad.addColorStop(1, 'rgba(6,0,0,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(96000);
    const fit = () => this.vignette.setDisplaySize(this.scale.width, this.scale.height);
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
  }

  /** Fase della camminata di un personaggio, ricavata da quanto si è spostato dall'ultimo frame. */
  private walkOf(a: { x: number; y: number }): number | undefined {
    let w = this.walks.get(a);
    if (!w) this.walks.set(a, (w = { x: a.x, y: a.y, phase: 0, moving: false }));
    const dist = Math.hypot(a.x - w.x, a.y - w.y);
    w.moving = dist > 0.002;
    if (w.moving) w.phase += Math.min(dist, 0.3) * 5.5;
    w.x = a.x;
    w.y = a.y;
    return w.moving ? w.phase : undefined;
  }

  private drawAtmosphere(now: number, dt: number): void {
    const glow = this.glowG.clear();
    const view = this.cameras.main.worldView;
    for (const t of this.lavaTiles) {
      if (t.x < view.x - 80 || t.x > view.right + 80 || t.y < view.y - 80 || t.y > view.bottom + 80) continue;
      const a = 0.1 + 0.05 * Math.sin(now / 600 + t.seed);
      glow.fillStyle(0xff5a14, a);
      glow.fillEllipse(t.x, t.y, 84, 42);
      glow.fillStyle(0xff8a30, a);
      glow.fillEllipse(t.x, t.y, 40, 20);
    }
    for (const b of this.level.bonfires) {
      const c = toScreen(b.x, b.y);
      const f = 1 + 0.06 * Math.sin(now / 90) + 0.04 * Math.sin(now / 37);
      for (let i = 0; i < 4; i++) {
        glow.fillStyle(0xff8a30, 0.07);
        glow.fillEllipse(c.x, c.y, (70 + i * 60) * f, (35 + i * 30) * f);
      }
    }

    const eg = this.emberG.clear();
    const { width, height } = this.scale;
    for (const e of this.embers) {
      e.y -= e.v * dt;
      if (e.y < -0.05) {
        e.y = 1.05;
        e.x = Math.random();
      }
      const x = (e.x + 0.02 * Math.sin(now / 900 + e.seed)) * width;
      const y = e.y * height;
      const a = 0.35 + 0.35 * Math.sin(now / 260 + e.seed * 3);
      eg.fillStyle(0xff6a20, a * 0.35);
      eg.fillCircle(x, y, 3.5);
      eg.fillStyle(0xffc060, a);
      eg.fillCircle(x, y, 1.2);
    }
  }

  private createProps(): void {
    const add = (id: string, x: number, y: number) => {
      const c = toScreen(x, y);
      this.propG.set(id, this.add.graphics().setPosition(c.x, c.y).setDepth(c.y));
    };
    this.level.bonfires.forEach((b, i) => add(`bonfire${i}`, b.x, b.y));
    for (const c of this.level.chests) add(c.id, c.x, c.y);
    for (const c of this.level.choices) add(`choice${c.id}`, c.x, c.y);
  }

  private render(): void {
    const fx = this.fx;
    fx.clear();
    const player = this.player;
    const now = this.time.now;
    this.drawAtmosphere(now, this.game.loop.delta / 1000);

    // Telegrafi dei nemici
    for (const e of this.enemies) {
      const t = e.telegraph();
      if (t) this.drawTelegraph(t);
    }
    const sw = player.swing;
    if (sw) this.sector(sw.x, sw.y, sw.angle, sw.range, sw.halfArc, sw.color, 0.55, false);
    // Carica della skill: contorno dell'area che sta per colpire.
    const sk = player.state === 'skill' ? player.activeSkill : null;
    if (sk && player.stateTime < sk.windup) {
      const arc = sk.effects.find((f) => f.type === 'arc' && f.at === 'start');
      if (arc && arc.type === 'arc') {
        this.sector(player.x, player.y, player.facing, arc.range, arc.halfArc, sk.color, 0.12, true);
      }
    }
    if (player.buffed && player.state !== 'dead') {
      const c = toScreen(player.x, player.y);
      fx.lineStyle(2, 0xff5a4a, 0.5 + 0.3 * Math.sin(now / 120));
      fx.strokeEllipse(c.x, c.y, 44, 22);
    }

    // Indicatore del bersaglio agganciato
    if (this.target && !this.target.dead) {
      const t = this.target;
      const c = toScreen(t.x, t.y);
      const r = 40 * t.def.scale + 2 * Math.sin(now / 150);
      fx.lineStyle(2, 0xf2e6b0, 0.85);
      fx.strokeEllipse(c.x, c.y, r, r / 2);
      // Doppio anello = bersaglio bloccato a mano.
      if (this.manualLock) fx.strokeEllipse(c.x, c.y, r + 10, (r + 10) / 2);
    }

    // XP perduti
    const lg = this.lostXpG;
    lg.clear();
    if (this.lostXp) {
      const c = toScreen(this.lostXp.x, this.lostXp.y);
      const bob = Math.sin(now / 300) * 3;
      lg.setPosition(c.x, c.y).setDepth(c.y);
      lg.fillStyle(0x8fe0c0, 0.15);
      lg.fillEllipse(0, 0, 40, 20);
      lg.fillStyle(0x8fe0c0, 0.9);
      lg.fillCircle(0, -18 + bob, 6);
      lg.fillStyle(0xffffff, 0.9);
      lg.fillCircle(0, -18 + bob, 2.5);
    }

    // Proiettili (in aria, sopra a tutto)
    const pg = this.projG;
    pg.clear();
    for (const s of this.sparks) {
      pg.fillStyle(s.color, Math.min(1, s.life * 4));
      pg.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    for (const pr of this.projectiles) {
      const c = toScreen(pr.x, pr.y);
      pg.fillStyle(0xffa050, 0.25);
      pg.fillCircle(c.x, c.y - 22, 9);
      pg.fillStyle(0xffd090, 1);
      pg.fillCircle(c.x, c.y - 22, 4);
    }

    // Giocatore
    const dodging = player.state === 'dodge';
    this.actor(this.playerG, player, {
      kind: 'hero',
      color: 0x3f7fd0,
      facing: player.facing,
      scale: 1,
      alpha: player.invulnerable ? 0.45 : 1,
      flash: player.hurtFlash > 0,
      squash: dodging ? 0.6 : 1,
      weapon: player.state === 'attack' || player.state === 'skill' ? 30 : 18,
      dead: player.state === 'dead',
    });

    this.fadeWalls();

    // Sagoma del giocatore sempre visibile, anche dietro ai muri.
    const gg = this.ghostG.clear();
    if (player.state !== 'dead') {
      const s = toScreen(player.x, player.y);
      const h = 30 * (dodging ? 0.6 : 1);
      gg.lineStyle(1.5, 0x9fd0ff, 0.35);
      gg.strokeRoundedRect(s.x - 9, s.y - h - 2, 18, h, 6);
      gg.strokeCircle(s.x, s.y - h - 8, 7);
    }

    // Nemici
    for (const e of this.enemies) {
      const g = this.enemyG.get(e)!;
      const isBoss = e instanceof Boss;
      if (e.dead) {
        const fade = Math.max(0, 1 - e.stateTime / (isBoss ? 2.5 : 0.8));
        if (fade <= 0) {
          g.setVisible(false);
          continue;
        }
        this.actor(g, e, {
          kind: isBoss ? 'boss' : (e.def.id as ActorKind), color: e.def.color, facing: e.facing, scale: e.def.scale,
          alpha: fade, flash: false, squash: 1, weapon: 0, dead: true,
        });
        continue;
      }
      const winding = e.state === 'windup' || e.state === 'transition';
      this.actor(g, e, {
        kind: isBoss ? 'boss' : (e.def.id as ActorKind),
        color: isBoss ? e.color : e.def.color,
        facing: e.facing,
        scale: e.def.scale,
        alpha: 1,
        flash: e.hurtFlash > 0 || (e.state === 'transition' && Math.floor(now / 80) % 2 === 0),
        squash: winding ? 1.08 : 1,
        weapon: e.def.ranged ? 0 : e.state === 'strike' ? 32 : winding ? 10 : 18,
        hpFrac: !isBoss && e.hp < e.def.maxHp ? e.hp / e.def.maxHp : undefined,
      });
    }

    this.drawProps(now);
    this.drawGate(now);

    // HUD
    let prompt = this.messageLeft > 0 ? this.message : '';
    if (!prompt && player.state !== 'dead') prompt = this.promptFor(this.interaction());
    const deathAlpha = player.state === 'dead' ? Math.min(1, this.deathTime / 1.2) : 0;
    const alive = this.enemies.filter((e) => !e.dead && !(e instanceof Boss)).length;
    const boss = this.boss && this.boss.awake && !this.boss.dead
      ? { name: this.boss.bossDef.title, frac: this.boss.hp / this.boss.maxHp }
      : null;
    this.hud.draw(player, alive > 0 ? `Nemici: ${alive}` : 'Area ripulita', prompt, deathAlpha, boss);
  }

  /** Rende semitrasparenti i muri che stanno davanti al giocatore e lo coprono. */
  private fadeWalls(): void {
    const s = toScreen(this.player.x, this.player.y);
    const hw = TILE_W / 2;
    const k = 1 - Math.exp(-14 * (this.game.loop.delta / 1000));
    for (const wl of this.wallG) {
      // Davanti = più in basso a schermo; copre = il suo riquadro tocca il corpo (largo ~20, alto ~46).
      const covers =
        wl.g.depth > s.y &&
        Math.abs(wl.x - s.x) < hw + 10 &&
        wl.top < s.y &&
        wl.bottom > s.y - 46;
      const target = covers ? WALL_FADE_ALPHA : 1;
      if (wl.alpha === target) continue;
      wl.alpha += (target - wl.alpha) * k;
      if (Math.abs(wl.alpha - target) < 0.01) wl.alpha = target;
      wl.g.setAlpha(wl.alpha);
    }
  }

  private drawTelegraph(t: Telegraph): void {
    if (t.shape === 'line') {
      const w = 0.35;
      if (t.active) return;
      this.band(t, t.range, w, 0xc02020, 0.12 + 0.1 * t.progress);
      this.band(t, t.range * t.progress, w * 0.5, 0xe03030, 0.35);
      return;
    }
    const half = t.shape === 'circle' ? Math.PI : t.halfArc;
    if (t.active) {
      this.sector(t.x, t.y, t.angle, t.range, half, 0xff7050, 0.6, false);
      return;
    }
    this.sector(t.x, t.y, t.angle, t.range, half, 0xc02020, 0.12 + 0.1 * t.progress, true);
    this.sector(t.x, t.y, t.angle, t.range * t.progress, half, 0xe03030, 0.3, false);
  }

  /** Striscia a terra lungo una direzione (scatti e frecce). */
  private band(t: Telegraph, length: number, halfWidth: number, color: number, alpha: number): void {
    const cos = Math.cos(t.angle);
    const sin = Math.sin(t.angle);
    const px = -sin * halfWidth;
    const py = cos * halfWidth;
    const pts = [
      toScreen(t.x + px, t.y + py),
      toScreen(t.x + cos * length + px, t.y + sin * length + py),
      toScreen(t.x + cos * length - px, t.y + sin * length - py),
      toScreen(t.x - px, t.y - py),
    ];
    this.fx.fillStyle(color, alpha);
    this.fx.fillPoints(pts, true);
  }

  private drawProps(now: number): void {
    const flick = Math.sin(now / 90) * 2;
    this.level.bonfires.forEach((_, i) => {
      const g = this.propG.get(`bonfire${i}`)!.clear();
      // Cerchio di pietre annerite, braci, la spada conficcata e la fiamma.
      g.fillStyle(0x000000, 0.4);
      g.fillEllipse(0, 1, 40, 18);
      g.fillStyle(0x3a302e, 1);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.fillEllipse(Math.cos(a) * 16, Math.sin(a) * 7, 9, 6);
      }
      g.fillStyle(0x8a2410, 1);
      g.fillEllipse(0, 0, 22, 9);
      g.lineStyle(2.5, 0xa8a8b4, 1);
      g.lineBetween(1, -2, 4, -38);
      g.lineStyle(2.5, 0x6a5030, 1);
      g.lineBetween(-2, -30, 9, -31);
      drawFlame(g, -5, 0, 20, now, 1 + i);
      drawFlame(g, 6, 1, 17, now, 4 + i);
      drawFlame(g, 0, 2, 28 + flick, now, i);
    });

    for (const c of this.level.chests) {
      const g = this.propG.get(c.id)!.clear();
      const open = this.world.openedChests.includes(c.id);
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(0, 2, 34, 14);
      g.fillStyle(0x3e2416, 1);
      g.fillRect(-14, -16, 28, 16);
      g.fillStyle(0x2a2a30, 1);
      g.fillRect(-14, -16, 3, 16);
      g.fillRect(11, -16, 3, 16);
      g.fillStyle(open ? 0x1c100a : 0x5a3620, 1);
      if (open) g.fillRect(-14, -26, 28, 8);
      else g.fillRect(-15, -22, 30, 8);
      g.fillStyle(0xc8a050, 1);
      if (!open) g.fillRect(-2, -18, 4, 6);
      if (!open) {
        g.fillStyle(0xffe0a0, 0.25 + 0.15 * Math.sin(now / 250));
        g.fillCircle(0, -14, 18);
      }
    }

    for (const c of this.level.choices) {
      const g = this.propG.get(`choice${c.id}`)!.clear();
      const made = this.world.choices[c.id];
      if (c.id === '1') {
        // Pellegrino incatenato (resta se lo hai derubato)
        if (made !== 'light') this.figure(g, 'pilgrim', 0x8a7a5c, 0.62, false);
        g.lineStyle(2, 0x6e6e78, 1);
        g.lineBetween(-10, -22, -18, -48);
        g.lineBetween(10, -22, 18, -48);
      } else if (c.id === '2') {
        // Altare con la coppa
        g.fillStyle(0x000000, 0.35);
        g.fillEllipse(0, 2, 44, 18);
        g.fillStyle(0x4a4a52, 1);
        g.fillRect(-18, -20, 36, 20);
        g.fillStyle(0x62626c, 1);
        g.fillRect(-20, -24, 40, 6);
        g.fillStyle(0x9a8a6a, 1);
        g.fillRect(-4, -32, 8, 8);
        const glow = made === 'light' ? 0xffe8a0 : made === 'dark' ? 0x601010 : 0x902020;
        g.fillStyle(glow, made ? 0.35 : 0.2 + 0.1 * Math.sin(now / 300));
        g.fillCircle(0, -28, made === 'light' ? 26 : 14);
      } else if (c.id === '3') {
        // Disertore in ginocchio; cadavere se lo hai finito
        if (made === 'light') continue;
        this.figure(g, 'predone', ENEMIES.predone.color, 0.65, made === 'dark');
        if (!made) {
          g.lineStyle(3, 0xd9d9e0, 1);
          g.lineBetween(12, -2, 30, 4);
        }
      }
    }
  }

  /** Figura ferma di una scena (prigioniero, disertore): stessa grafica dei personaggi. */
  private figure(g: Gfx, kind: ActorKind, color: number, squash: number, dead: boolean): void {
    const { x, y } = g;
    drawActor(g, x, y, { kind, color, facing: Math.PI / 4, scale: 1, alpha: 1, flash: false, squash, weapon: 0, dead });
  }

  private drawGate(now: number): void {
    const closed = !!this.boss?.awake && !this.boss.dead;
    const gone = this.world.bossDefeated;
    for (const g of this.gateG) {
      g.clear();
      if (gone) continue;
      // Velo di nebbia lungo il tile (asse x del mondo), alto come un muro.
      const ex = TILE_W / 4;
      const ey = TILE_H / 4;
      const a = (closed ? 0.6 : 0.3) + 0.06 * Math.sin(now / 400);
      g.fillStyle(0xc02a10, a * 0.7);
      g.fillPoints(
        [
          { x: -ex, y: -ey }, { x: ex, y: ey },
          { x: ex, y: ey - WALL_HEIGHT }, { x: -ex, y: -ey - WALL_HEIGHT },
        ],
        true,
      );
      // Lingue di fuoco lungo il velo.
      g.setAlpha(Math.min(1, a + 0.3));
      const seed = g.x * 0.13 + g.y * 0.07;
      drawFlame(g, -ex * 0.5, -ey * 0.5, closed ? 46 : 30, now, seed);
      drawFlame(g, ex * 0.5, ey * 0.5, closed ? 40 : 26, now, seed + 2.3);
    }
  }

  /** Disegna a terra un settore circolare definito in coordinate di mondo. */
  private sector(
    x: number, y: number, angle: number, range: number, halfArc: number,
    color: number, alpha: number, outline: boolean,
  ): void {
    const fx = this.fx;
    const c = toScreen(x, y);
    const steps = halfArc > 2 ? 32 : 14;
    fx.beginPath();
    fx.moveTo(c.x, c.y);
    for (let i = 0; i <= steps; i++) {
      const a = angle - halfArc + (2 * halfArc * i) / steps;
      const p = toScreen(x + Math.cos(a) * range, y + Math.sin(a) * range);
      fx.lineTo(p.x, p.y);
    }
    fx.closePath();
    fx.fillStyle(color, alpha);
    fx.fillPath();
    if (outline) {
      fx.lineStyle(1.5, color, 0.7);
      fx.strokePath();
    }
  }

  private actor(g: Gfx, a: { x: number; y: number }, o: Omit<Parameters<typeof drawActor>[3], 'walk'>): void {
    const s = toScreen(a.x, a.y);
    drawActor(g, s.x, s.y, { ...o, walk: o.dead ? undefined : this.walkOf(a) });
  }

  private floatText(wx: number, wy: number, text: string, color: string): void {
    const s = toScreen(wx, wy);
    const t = this.add
      .text(s.x, s.y - 56, text, { fontFamily: 'Georgia, serif', fontSize: '16px', color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(90000);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }
}
