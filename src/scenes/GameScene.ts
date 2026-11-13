import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { hitsArc, type AttackEvent, type Telegraph } from '../combat/damage';
import { projectileHits, spawnProjectiles, stepProjectile, type Projectile } from '../combat/projectiles';
import { canKeep, cycleTarget, pickTarget } from '../combat/targeting';
import { TILE_H, TILE_W, screenDirToWorld, toScreen, worldAngleToScreenDir, type Vec2 } from '../core/iso';
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
type KeyName = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'Q' | 'TAB' | 'T' | 'I' | 'ESC' | 'SPACE' | 'E' | 'ONE' | 'TWO' | 'THREE' | 'FOUR';
type LevelChest = Level['chests'][number];
type LevelChoice = Level['choices'][number];
type Interaction =
  | { kind: 'bonfire'; index: number }
  | { kind: 'chest'; chest: LevelChest }
  | { kind: 'choice'; choice: LevelChoice };

const WALL_HEIGHT = 44;
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
    this.drawMap();

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
        return '[E] Riposa al falò · [T] Talenti e respec';
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
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const floor = this.add.graphics().setDepth(-1);
    const isWallAt = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === WALL;
    // Un Graphics per diagonale (x + y costante = stessa profondità a schermo).
    const walls = new Map<number, Gfx>();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = toScreen(x + 0.5, y + 0.5);
        if (!isWallAt(x, y)) {
          const arena = this.level.arena.has(y * w + x);
          const even = (x + y) % 2 === 0;
          floor.fillStyle(arena ? (even ? 0x34302c : 0x302c29) : even ? 0x2c3038 : 0x292d34, 1);
          floor.lineStyle(1, 0x1c1f25, 1);
          floor.beginPath();
          floor.moveTo(c.x, c.y - hh);
          floor.lineTo(c.x + hw, c.y);
          floor.lineTo(c.x, c.y + hh);
          floor.lineTo(c.x - hw, c.y);
          floor.closePath();
          floor.fillPath();
          floor.strokePath();
          continue;
        }
        // Solo i muri che confinano con il pavimento: gli altri non si vedono.
        let visible = false;
        for (let dy = -1; dy <= 1 && !visible; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (!isWallAt(x + dx, y + dy)) visible = true;
        }
        if (!visible) continue;
        let g = walls.get(x + y);
        if (!g) {
          g = this.add.graphics().setDepth(c.y);
          walls.set(x + y, g);
        }
        const top = c.y - WALL_HEIGHT;
        const quad = (color: number, pts: number[]) => {
          g.fillStyle(color, 1);
          g.beginPath();
          g.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
          g.closePath();
          g.fillPath();
        };
        quad(0x3a3f4a, [c.x - hw, top, c.x, top + hh, c.x, c.y + hh, c.x - hw, c.y]);
        quad(0x2e323b, [c.x + hw, top, c.x, top + hh, c.x, c.y + hh, c.x + hw, c.y]);
        quad(0x555b68, [c.x, top - hh, c.x + hw, top, c.x, top + hh, c.x - hw, top]);
      }
    }
    for (const gt of this.level.gate) {
      const c = toScreen(gt.tx + 0.5, gt.ty + 0.5);
      this.gateG.push(this.add.graphics().setPosition(c.x, c.y).setDepth(c.y));
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
    this.drawActor(this.playerG, player.x, player.y, {
      color: player.state === 'dead' ? 0x444444 : 0x4a86c8,
      facing: player.facing,
      scale: 1,
      alpha: player.invulnerable ? 0.45 : 1,
      flash: player.hurtFlash > 0,
      squash: dodging ? 0.6 : player.state === 'dead' ? 0.3 : 1,
      weapon: player.state === 'attack' || player.state === 'skill' ? 30 : 18,
    });

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
        this.drawActor(g, e.x, e.y, {
          color: 0x555555, facing: e.facing, scale: e.def.scale, alpha: fade, flash: false, squash: 0.3, weapon: 0,
        });
        continue;
      }
      const winding = e.state === 'windup' || e.state === 'transition';
      this.drawActor(g, e.x, e.y, {
        color: isBoss ? e.color : e.def.color,
        facing: e.facing,
        scale: e.def.scale,
        alpha: 1,
        flash: e.hurtFlash > 0 || (e.state === 'transition' && Math.floor(now / 80) % 2 === 0),
        squash: winding ? 1.08 : 1,
        weapon: e.def.ranged ? 0 : e.state === 'strike' ? 32 : winding ? 10 : 18,
        bow: !!e.def.ranged,
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
      g.fillStyle(0xff8a20, 0.12);
      g.fillEllipse(0, 0, 90, 45);
      g.fillStyle(0x3a2a1c, 1);
      g.fillEllipse(0, 0, 26, 12);
      g.fillStyle(0xe8632a, 1);
      g.fillTriangle(-8, 0, 8, 0, flick, -24 - flick);
      g.fillStyle(0xffc23a, 1);
      g.fillTriangle(-4, 0, 4, 0, -flick * 0.5, -13);
      g.lineStyle(2, 0x9a9a9a, 1);
      g.lineBetween(0, 0, 3, -34);
    });

    for (const c of this.level.chests) {
      const g = this.propG.get(c.id)!.clear();
      const open = this.world.openedChests.includes(c.id);
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(0, 2, 34, 14);
      g.fillStyle(0x5a3a1e, 1);
      g.fillRect(-14, -16, 28, 16);
      g.fillStyle(open ? 0x2a1a0e : 0x7a5228, 1);
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
        g.lineStyle(2, 0x8a8a8a, 1);
        g.lineBetween(-10, -30, -16, -46);
        g.lineBetween(10, -30, 16, -46);
        if (made === 'light') continue;
        this.figure(g, 0x9a8a70, 0.6);
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
        this.figure(g, made === 'dark' ? 0x555555 : 0xb86b4b, made === 'dark' ? 0.25 : 0.65);
        if (!made) {
          g.lineStyle(3, 0xd9d9e0, 1);
          g.lineBetween(12, -2, 30, 4);
        }
      }
    }
  }

  private figure(g: Gfx, color: number, squash: number): void {
    const h = 30 * squash;
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(0, 0, 30, 14);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-9, -h - 2, 18, h, 6);
    g.fillStyle(0xe2c9a6, 1);
    g.fillCircle(0, -h - 8, 7);
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
      const a = (closed ? 0.55 : 0.28) + 0.06 * Math.sin(now / 400);
      g.fillStyle(0xd8dce8, a);
      g.fillPoints(
        [
          { x: -ex, y: -ey }, { x: ex, y: ey },
          { x: ex, y: ey - WALL_HEIGHT }, { x: -ex, y: -ey - WALL_HEIGHT },
        ],
        true,
      );
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

  private drawActor(
    g: Gfx,
    wx: number,
    wy: number,
    o: {
      color: number; facing: number; scale: number; alpha: number; flash: boolean; squash: number; weapon: number;
      bow?: boolean; hpFrac?: number;
    },
  ): void {
    const s = toScreen(wx, wy);
    const k = o.scale;
    const bodyH = 30 * k * o.squash;
    const color = o.flash ? 0xffffff : o.color;
    g.clear().setVisible(true).setPosition(s.x, s.y).setDepth(s.y).setAlpha(o.alpha);

    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(0, 0, 30 * k, 14 * k);

    g.fillStyle(color, 1);
    g.fillRoundedRect(-9 * k, -bodyH - 2, 18 * k, bodyH, 6 * k);
    g.fillStyle(o.flash ? 0xffffff : 0xe2c9a6, 1);
    g.fillCircle(0, -bodyH - 8 * k, 7 * k);

    const d = worldAngleToScreenDir(o.facing);
    const oy = -bodyH * 0.55;
    if (o.bow) {
      g.lineStyle(2.5 * k, 0x8a6a3a, 1);
      g.beginPath();
      g.arc(d.x * 10 * k, oy + d.y * 10 * k, 10 * k, Math.atan2(d.y, d.x) - 1.2, Math.atan2(d.y, d.x) + 1.2);
      g.strokePath();
    } else if (o.weapon > 0) {
      g.lineStyle(3 * k, 0xd9d9e0, 1);
      g.lineBetween(d.x * 8 * k, oy + d.y * 8 * k, d.x * (8 + o.weapon) * k, oy + d.y * (8 + o.weapon) * k);
    }

    if (o.hpFrac !== undefined) {
      const w = 36 * k;
      const y = -bodyH - 24 * k;
      g.fillStyle(0x000000, 0.8);
      g.fillRect(-w / 2 - 1, y - 1, w + 2, 6);
      g.fillStyle(0xb02a2a, 1);
      g.fillRect(-w / 2, y, w * o.hpFrac, 4);
    }
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
