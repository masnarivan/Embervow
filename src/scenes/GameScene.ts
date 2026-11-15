import Phaser from 'phaser';
import { propFrame, type PropName } from '../render/props';
import { actorFrame, type ActorKind, type Pose } from '../render/sprites';
import { BACKGROUND, WALL_VARIANTS, buildFloor, hash, wallFrame } from '../render/terrain';
import { audio } from '../audio/audio';
import { hitsArc, isBackstab, type AttackEvent, type Telegraph } from '../combat/damage';
import { projectileHits, spawnProjectiles, stepProjectile, type Projectile } from '../combat/projectiles';
import { canKeep, cycleTarget, pickTarget } from '../combat/targeting';
import { TILE_H, TILE_W, screenDirToWorld, toScreen, type Vec2 } from '../core/iso';
import { insideArena, parseLevel, setGate, type Level } from '../core/level';
import { WALL, collides, hasLineOfSight } from '../core/map';
import { newWorld, type WorldState } from '../core/world';
import { CUSTODE } from '../data/boss';
import { CHOICES } from '../data/choices';
import { classById } from '../data/classes';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { LEVEL1_CHESTS, LEVEL1_ROWS } from '../data/level1';
import { Boss } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import { Minion } from '../entities/Minion';
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
const SPECTRE_COLOR = 0x4fa890;
/** Ogni quanto il veleno toglie vita (secondi). */
const POISON_TICK = 0.5;

/** Ciò che un colpo porta con sé quando ferisce un nemico. */
type Hit = Pick<AttackEvent, 'damage' | 'breakPoise' | 'lifesteal' | 'backstab' | 'poison'>;

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
  /** Dardi e incantesimi lanciati dal giocatore. */
  playerShots: Projectile[] = [];
  /** Spettri evocati, alleati a tempo. */
  minions: Minion[] = [];
  /** Esplosioni appena avvenute, solo da disegnare. */
  private blasts: { x: number; y: number; range: number; color: number; timeLeft: number }[] = [];
  private pendingCls: string | undefined;
  /** Veleni in corso: danno al secondo e tempo rimasto per nemico. */
  private poisons = new Map<Enemy, { dps: number; timeLeft: number; acc: number; tick: number }>();

  /** Uno sprite per personaggio (o figura di scena), creato al primo disegno. */
  private sprites = new Map<unknown, Phaser.GameObjects.Image>();
  /** Sprite riusati per i proiettili in volo. */
  private shots: Phaser.GameObjects.Image[] = [];
  private propG = new Map<string, Gfx>();
  private gateG: Gfx[] = [];
  /** Un Graphics per tile di muro, con il riquadro che occupa a schermo. */
  private wallG: { g: Phaser.GameObjects.Image; x: number; top: number; bottom: number; alpha: number }[] = [];
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
  private ghost!: Phaser.GameObjects.Image;
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
  init(data: { save?: SaveData | null; cls?: string }): void {
    this.pendingSave = data?.save ?? null;
    this.pendingCls = data?.cls;
    this.playerShots = [];
    this.minions = [];
    this.blasts = [];
    this.poisons = new Map();
    this.sprites = new Map();
    this.shots = [];
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
    const cls = classById(save ? save.player.cls : this.pendingCls);
    this.player = new Player(this.level.start.x, this.level.start.y, cls);
    this.ghost = this.add.image(0, 0, '__DEFAULT').setDepth(85000).setAlpha(0.14).setTintFill(0x9fd0ff).setVisible(false);
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
      if (player.state === 'attack') audio.play(player.cls.attack.projectile ? 'shoot' : 'swing');
      else if (player.state === 'skill') audio.play('skill');
      else if (player.state === 'dodge') audio.play('dodge');
      this.prevPlayerState = player.state;
    }
    if (swing) this.resolvePlayerAttack(swing);
    for (const s of player.takeSummons()) this.summon(s);
    this.updateMinions(dt);
    this.updatePlayerShots(dt);
    this.updatePoisons(dt);

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
    if (swing.projectile) {
      this.playerShots.push(...spawnProjectiles(swing));
      return;
    }
    this.strikeEnemies(swing);
  }

  /** Nemici che un colpo del giocatore (o di un suo alleato) può ferire in questo momento. */
  private hittable(): Enemy[] {
    return this.enemies.filter((e) => !e.dead && (!(e instanceof Boss) || (e.awake && e.state !== 'transition')));
  }

  /** Applica un colpo ad arco a tutti i nemici che tocca. `heavy`: con contraccolpo a schermo. */
  private strikeEnemies(ev: AttackEvent, heavy = true): boolean {
    let hitAny = false;
    for (const e of this.hittable()) {
      if (!hitsArc(ev, e.x, e.y, e.radius) || !hasLineOfSight(this.level.map, ev.x, ev.y, e.x, e.y)) continue;
      // Direzione da cui arriva il colpo: decide se è alle spalle.
      const near = Math.hypot(e.x - ev.x, e.y - ev.y) < 0.05;
      this.damageEnemy(e, ev, ev.angle, near ? ev.angle : Math.atan2(e.y - ev.y, e.x - ev.x));
      hitAny = true;
    }
    if (hitAny) this.hitFeedback(heavy);
    return hitAny;
  }

  /** `knock`: direzione della spinta; `from`: direzione di arrivo del colpo, per i colpi alle spalle. */
  private damageEnemy(e: Enemy, hit: Hit, knock: number, from = knock): void {
    const back = !!hit.backstab && isBackstab(from, e.facing);
    const damage = back ? Math.round(hit.damage * hit.backstab!) : hit.damage;
    e.takeDamage(damage, knock, hit.breakPoise);
    this.floatText(e.x, e.y, back ? `${damage}!` : `${damage}`, back ? '#ffb040' : '#f2e6b0');
    this.burst(e.x, e.y, back ? 0xff9a30 : 0xffe0a0, e.dead ? 14 : back ? 10 : 6);
    this.player.onHitLanded(damage, hit.lifesteal);
    if (hit.poison && !e.dead) this.poison(e, hit.poison.damage, hit.poison.duration);
    if (e.dead) this.onEnemyKilled(e);
  }

  private onEnemyKilled(e: Enemy): void {
    this.poisons.delete(e);
    this.player.onKill();
    this.grantXp(e.def.xp);
  }

  // ---------- Veleno ----------

  /** Aggiunge veleno a un nemico: il danno nuovo si somma a quello ancora da scontare. */
  private poison(e: Enemy, damage: number, duration: number): void {
    const cur = this.poisons.get(e);
    const left = cur ? cur.dps * cur.timeLeft : 0;
    const time = Math.max(duration, cur?.timeLeft ?? 0);
    this.poisons.set(e, { dps: (left + damage) / time, timeLeft: time, acc: cur?.acc ?? 0, tick: cur?.tick ?? POISON_TICK });
  }

  private updatePoisons(dt: number): void {
    for (const [e, p] of this.poisons) {
      if (e.dead) {
        this.poisons.delete(e);
        continue;
      }
      // Il boss che cambia fase è intoccabile: il veleno aspetta.
      if (e instanceof Boss && e.state === 'transition') continue;
      const step = Math.min(dt, p.timeLeft);
      p.acc += p.dps * step;
      p.timeLeft -= step;
      p.tick -= dt;
      const over = p.timeLeft <= 0;
      if (p.tick > 0 && !over) continue;
      p.tick = POISON_TICK;
      const dmg = over ? Math.round(p.acc) : Math.floor(p.acc);
      p.acc -= dmg;
      if (over) this.poisons.delete(e);
      if (dmg <= 0) continue;
      e.erode(dmg);
      this.floatText(e.x + 0.3, e.y - 0.3, `${dmg}`, '#8fe060');
      if (e.dead) {
        this.burst(e.x, e.y, 0x8fe060, 12);
        this.onEnemyKilled(e);
      }
    }
  }

  private hitFeedback(heavy: boolean): void {
    audio.play('hit');
    if (!heavy) return;
    this.hitStop = 0.05;
    this.cameras.main.shake(70, 0.003);
  }

  /** Dardi del giocatore: colpiscono il primo nemico, lo trapassano o esplodono. */
  private updatePlayerShots(dt: number): void {
    const map = this.level.map;
    this.playerShots = this.playerShots.filter((pr) => {
      const alive = stepProjectile(pr, dt, map);
      if (!alive) {
        // A fine corsa o contro un muro: le palle di fuoco esplodono comunque.
        if (pr.explode) this.explode(pr, pr.x - pr.vx * dt, pr.y - pr.vy * dt);
        return false;
      }
      const angle = Math.atan2(pr.vy, pr.vx);
      for (const e of this.hittable()) {
        if (pr.hit?.has(e) || !projectileHits(pr, e.x, e.y, e.radius)) continue;
        if (pr.explode) {
          this.explode(pr, pr.x, pr.y);
          return false;
        }
        this.damageEnemy(e, pr, angle);
        this.hitFeedback(!!pr.breakPoise);
        if (!pr.pierce) return false;
        (pr.hit ??= new Set()).add(e);
      }
      return true;
    });
  }

  private explode(pr: Projectile, x: number, y: number): void {
    const color = pr.color ?? 0xff8a30;
    this.blasts.push({ x, y, range: pr.explode!, color, timeLeft: 0.22 });
    this.burst(x, y, color, 16);
    const hit = this.strikeEnemies({
      x, y, angle: Math.atan2(pr.vy, pr.vx), range: pr.explode!, halfArc: Math.PI, damage: pr.damage,
      breakPoise: pr.breakPoise, lifesteal: pr.lifesteal,
    });
    if (!hit) audio.play('hit', this.loudness({ x, y }) * 0.6);
  }

  // ---------- Spettri evocati ----------

  private summon(req: { count: number; duration: number; damageMult: number }): void {
    const p = this.player;
    const damage = Math.max(1, Math.round(p.attackDamage * req.damageMult));
    for (let i = 0; i < req.count; i++) {
      // Ai lati del giocatore; se lì c'è un muro, sopra di lui.
      const a = p.facing + Math.PI / 2 + (i * Math.PI * 2) / req.count;
      let x = p.x + Math.cos(a) * 0.9;
      let y = p.y + Math.sin(a) * 0.9;
      if (collides(this.level.map, x, y, 0.3)) {
        x = p.x;
        y = p.y;
      }
      this.minions.push(new Minion(x, y, req.duration, damage));
      this.burst(x, y, 0x7fe0b0, 10);
    }
  }

  private updateMinions(dt: number): void {
    const targets = this.hittable();
    this.minions = this.minions.filter((m) => {
      const strike = m.update(dt, this.player, targets, this.level.map);
      if (strike) this.strikeEnemies(strike, false);
      if (!m.expired) return true;
      this.burst(m.x, m.y, 0x7fe0b0, 8);
      this.dropSprite(m);
      return false;
    });
  }

  private clearMinions(): void {
    for (const m of this.minions) this.dropSprite(m);
    this.minions = [];
  }

  private dropSprite(key: unknown): void {
    this.sprites.get(key)?.destroy();
    this.sprites.delete(key);
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
      // Rotolando o traslando si passa attraverso i nemici senza spostarli.
      if (p.state === 'dead' || p.state === 'dodge' || p.invulnerable) continue;
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
    this.playerShots = [];
    this.clearMinions();
    setGate(this.level, false);
    this.spawnEnemies();
    audio.music('explore');
    this.save();
  }

  private spawnEnemies(): void {
    for (const e of this.enemies) {
      this.sprites.get(e)?.destroy();
      this.sprites.delete(e);
    }
    this.poisons.clear();
    this.enemies = this.level.enemies.map((s) => new Enemy(ENEMIES[s.type], s.x, s.y));
    const b = this.level.boss;
    this.boss = b && !this.world.bossDefeated ? new Boss(CUSTODE, b.x, b.y) : null;
    if (this.boss) this.enemies.push(this.boss);
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
    const isWallAt = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === WALL;
    this.lavaTiles = buildFloor(this, this.level);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isWallAt(x, y)) continue;
        // Solo i muri che confinano con il pavimento: gli altri non si vedono.
        let visible = false;
        for (let dy = -1; dy <= 1 && !visible; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (!isWallAt(x + dx, y + dy)) visible = true;
        }
        if (!visible) continue;
        // Uno sprite per tile: così i muri che coprono il giocatore sfumano uno per uno.
        const c = toScreen(x + 0.5, y + 0.5);
        const f = wallFrame(this, Math.floor(hash(x, y, 5) * WALL_VARIANTS), WALL_HEIGHT);
        const g = this.add.image(c.x, c.y, f.key).setOrigin(0.5, f.originY).setScale(f.displayScale).setDepth(c.y);
        this.wallG.push({ g, x: c.x, top: c.y - WALL_HEIGHT - hh, bottom: c.y + hh, alpha: 1 });
      }
    }
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

    if (!this.world.bossDefeated) {
      const hot = this.boss?.awake && !this.boss.dead ? 2 : 1;
      for (const g of this.gateG) {
        glow.fillStyle(0xff6a20, 0.035 * hot + 0.01 * Math.sin(now / 130 + g.x));
        glow.fillEllipse(g.x, g.y, 150, 75);
        glow.fillEllipse(g.x, g.y, 90, 45);
      }
    }
    if (this.lostXp) {
      const c = toScreen(this.lostXp.x, this.lostXp.y);
      glow.fillStyle(0x50e0b0, 0.07 + 0.03 * Math.sin(now / 300));
      glow.fillEllipse(c.x, c.y, 120, 60);
      glow.fillEllipse(c.x, c.y, 56, 28);
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
    if (this.lostXp) {
      const c = toScreen(this.lostXp.x, this.lostXp.y);
      lg.setPosition(c.x, c.y).setDepth(c.y);
    }
    this.prop('lostXp', lg, this.lostXp ? 'soul' : null, Math.floor(now / 100));

    // Proiettili (in aria, sopra a tutto)
    const pg = this.projG;
    pg.clear();
    for (const s of this.sparks) {
      pg.fillStyle(s.color, Math.min(1, s.life * 4));
      pg.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    this.projectiles.forEach((pr, i) => {
      const c = toScreen(pr.x, pr.y);
      const f = propFrame(this, 'fireball', Math.floor(now / 70) + i);
      let img = this.shots[i];
      if (!img) this.shots.push((img = this.add.image(0, 0, f.key).setDepth(80000).setBlendMode(Phaser.BlendModes.ADD)));
      img.setTexture(f.key).setOrigin(0.5, f.originY).setScale(f.displayScale).setPosition(c.x, c.y - 22).setVisible(true);
    });
    for (let i = this.projectiles.length; i < this.shots.length; i++) this.shots[i].setVisible(false);

    // Dardi del giocatore: una scia e un nucleo chiaro.
    for (const pr of this.playerShots) {
      const c = toScreen(pr.x, pr.y);
      const v = toScreen(pr.vx, pr.vy);
      const vl = Math.hypot(v.x, v.y) || 1;
      const k = pr.radius / 0.15;
      const color = pr.color ?? 0xa98cff;
      for (let i = 4; i >= 1; i--) {
        pg.fillStyle(color, 0.16);
        pg.fillCircle(c.x - (v.x / vl) * i * 6 * k, c.y - 22 - (v.y / vl) * i * 6 * k, (6.5 - i) * k);
      }
      pg.fillStyle(color, 0.3);
      pg.fillCircle(c.x, c.y - 22, 9 * k + Math.sin(now / 40) * 0.8);
      pg.fillStyle(color, 0.9);
      pg.fillCircle(c.x, c.y - 22, 5 * k);
      pg.fillStyle(0xffffff, 0.95);
      pg.fillCircle(c.x, c.y - 22, 2.4 * k);
    }

    // Esplosioni a terra
    const frameDt = this.game.loop.delta / 1000;
    this.blasts = this.blasts.filter((b) => (b.timeLeft -= frameDt) > 0);
    for (const b of this.blasts) {
      const t = 1 - b.timeLeft / 0.22;
      this.sector(b.x, b.y, 0, b.range * (0.5 + 0.5 * t), Math.PI, b.color, 0.55 * (1 - t), true);
    }

    // Spettri: tenui, svaniscono all'inizio e alla fine della loro vita.
    for (const m of this.minions) {
      const alpha = 0.72 * Math.min(1, m.timeLeft / 1.2) * (0.85 + 0.15 * Math.sin(now / 160 + m.x * 7));
      this.actor(m, m, {
        kind: 'spettro', color: SPECTRE_COLOR, facing: m.facing, scale: 0.95, alpha, flash: false,
        pose: m.state === 'windup' ? 'windup' : m.state === 'strike' ? 'strike' : undefined,
      });
    }

    // Giocatore
    const dodging = player.state === 'dodge';
    const acting = player.state === 'attack' || player.state === 'skill';
    const windupTime = player.state === 'skill' ? player.activeSkill?.windup ?? 0 : player.cls.attack.windup;
    this.actor(player, player, {
      kind: player.cls.look.kind,
      color: player.cls.look.color,
      facing: player.facing,
      scale: 1,
      alpha: player.invulnerable ? 0.45 : player.hidden ? 0.38 : 1,
      flash: player.hurtFlash > 0,
      pose:
        player.state === 'dead' ? 'dead'
          : dodging ? 'dodge'
            : acting ? (player.stateTime < windupTime ? 'windup' : 'strike')
              : undefined,
    });

    this.fadeWalls();

    // Sagoma del giocatore sempre visibile, anche dietro ai muri: lo stesso sprite, tenue e sopra a tutto.
    const body = this.sprites.get(player)!;
    this.ghost
      .setTexture(body.texture.key)
      .setOrigin(body.originX, body.originY)
      .setScale(body.scaleX)
      .setPosition(body.x, body.y)
      .setVisible(player.state !== 'dead');

    // Nemici
    for (const e of this.enemies) {
      const isBoss = e instanceof Boss;
      const kind: ActorKind = isBoss ? 'boss' : (e.def.id as ActorKind);
      if (e.dead) {
        const fade = Math.max(0, 1 - e.stateTime / (isBoss ? 2.5 : 1.4));
        if (fade <= 0) {
          this.sprites.get(e)?.setVisible(false);
          continue;
        }
        this.actor(e, e, { kind, color: e.def.color, facing: e.facing, scale: e.def.scale, alpha: fade, flash: false, pose: 'dead' });
        continue;
      }
      if (this.poisons.has(e)) {
        const c = toScreen(e.x, e.y);
        fx.lineStyle(2, 0x8fe060, 0.45 + 0.25 * Math.sin(now / 140));
        fx.strokeEllipse(c.x, c.y, 34 * e.def.scale, 17 * e.def.scale);
      }
      const winding = e.state === 'windup' || e.state === 'transition';
      this.actor(e, e, {
        kind,
        color: isBoss ? e.color : e.def.color,
        facing: e.facing,
        scale: e.def.scale,
        alpha: 1,
        flash: e.hurtFlash > 0 || (e.state === 'transition' && Math.floor(now / 80) % 2 === 0),
        pose: winding ? 'windup' : e.state === 'strike' ? 'strike' : undefined,
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
    this.level.bonfires.forEach((_, i) => {
      const g = this.propG.get(`bonfire${i}`)!;
      this.prop(`bonfire${i}`, g, 'bonfire', Math.floor(now / 90) + i * 3);
    });

    for (const c of this.level.chests) {
      const g = this.propG.get(c.id)!.clear();
      const open = this.world.openedChests.includes(c.id);
      this.prop(c.id, g, open ? 'chest_open' : 'chest_closed');
      if (!open) {
        // Luccichio che invita ad aprirlo.
        g.fillStyle(0xffe0a0, 0.14 + 0.1 * Math.sin(now / 250));
        g.fillCircle(0, -10, 20);
      }
    }

    for (const c of this.level.choices) {
      const g = this.propG.get(`choice${c.id}`)!.clear();
      const made = this.world.choices[c.id];
      const id = `choice${c.id}`;
      if (c.id === '1') {
        // Pellegrino incatenato: se lo liberi restano solo le catene.
        this.figure(id, g, 'pilgrim', 0x8a7a5c, made === 'light' ? null : 'kneel');
        this.prop(`${id}:chains`, g, 'shackles', 0, 0.01);
      } else if (c.id === '2') {
        // Altare con la coppa: benedetto, profanato o ancora intatto.
        this.prop(id, g, made === 'light' ? 'altar_light' : made === 'dark' ? 'altar_dark' : 'altar');
        if (!made) {
          g.fillStyle(0xb02018, 0.12 + 0.08 * Math.sin(now / 300));
          g.fillCircle(0, -26, 16);
        }
      } else if (c.id === '3') {
        // Disertore in ginocchio con la lama a terra; cadavere se lo hai finito.
        this.figure(id, g, 'predone', ENEMIES.predone.color, made === 'light' ? null : made === 'dark' ? 'dead' : 'kneel');
        this.prop(`${id}:blade`, g, made ? null : 'dropped_blade', 0, 0.01);
      }
    }
  }

  /** Sprite di un oggetto di scena, ancorato al Graphics che ne segna posizione e profondità. */
  private prop(id: string, at: Gfx, name: PropName | null, frame = 0, depthBias = -0.005): void {
    const key = `prop:${id}`;
    if (!name) {
      this.sprites.get(key)?.setVisible(false);
      return;
    }
    const f = propFrame(this, name, frame);
    let img = this.sprites.get(key);
    if (!img) this.sprites.set(key, (img = this.add.image(0, 0, f.key)));
    img.setTexture(f.key).setOrigin(0.5, f.originY).setScale(f.displayScale).setPosition(at.x, at.y).setDepth(at.depth + depthBias).setVisible(true);
  }

  /** Figura ferma di una scena (prigioniero, disertore): stessi sprite dei personaggi. `null` = sparita. */
  private figure(id: string, at: Gfx, kind: ActorKind, color: number, pose: Pose | null): void {
    if (!pose) {
      this.sprites.get(id)?.setVisible(false);
      return;
    }
    const f = actorFrame(this, { kind, color, scale: 1, facing: Math.PI / 4, pose });
    let img = this.sprites.get(id);
    if (!img) this.sprites.set(id, (img = this.add.image(0, 0, f.key)));
    // Appena dietro al Graphics dell'oggetto, così catene e spada a terra restano sopra.
    img.setTexture(f.key).setOrigin(0.5, f.originY).setScale(f.displayScale).setPosition(at.x, at.y).setDepth(at.depth - 0.01).setVisible(true);
  }

  private drawGate(now: number): void {
    const closed = !!this.boss?.awake && !this.boss.dead;
    const gone = this.world.bossDefeated;
    // Sbarre roventi e muro di fiamme durante lo scontro; prima, solo braci sulla soglia.
    this.gateG.forEach((g, i) => {
      this.prop(`gate${i}`, g, gone ? null : closed ? 'gate_closed' : 'gate_open', Math.floor(now / 90) + i * 3);
    });
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

  /** Disegna un personaggio: sceglie il fotogramma da direzione, posa e passo, e aggiorna il suo sprite. */
  private actor(
    key: unknown,
    a: { x: number; y: number },
    o: { kind: ActorKind; color: number; facing: number; scale: number; alpha: number; flash: boolean; pose?: Pose; hpFrac?: number },
  ): void {
    const s = toScreen(a.x, a.y);
    const walk = o.pose === 'dead' ? undefined : this.walkOf(a);
    const pose: Pose = o.pose ?? (walk !== undefined ? 'walk' : 'idle');
    const f = actorFrame(this, { kind: o.kind, color: o.color, scale: o.scale, facing: o.facing, pose, walk });
    let img = this.sprites.get(key);
    if (!img) this.sprites.set(key, (img = this.add.image(0, 0, f.key)));
    img.setTexture(f.key).setOrigin(0.5, f.originY).setScale(f.displayScale).setPosition(s.x, s.y).setDepth(s.y).setAlpha(o.alpha).setVisible(true);
    if (o.flash) img.setTintFill(0xffffff);
    else img.clearTint();

    if (o.hpFrac !== undefined) {
      const w = 36 * o.scale;
      const y = s.y - 56 * o.scale;
      const g = this.projG;
      g.fillStyle(0x000000, 0.8);
      g.fillRect(s.x - w / 2 - 1, y - 1, w + 2, 6);
      g.fillStyle(0xc0301c, 1);
      g.fillRect(s.x - w / 2, y, w * o.hpFrac, 4);
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
