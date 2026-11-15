import { Alignment, type AlignmentState } from '../alignment/alignment';
import { Stamina } from '../combat/stamina';
import { computeDamage, type AttackEvent } from '../combat/damage';
import { moveWithCollision, type GameMap } from '../core/map';
import { WARRIOR, type ClassDef, type Stats } from '../data/classes';
import { ITEMS, KEY_ITEMS, RESPEC_ITEM, type Slot } from '../data/items';
import { PLAYER } from '../data/player';
import { SKILLS, type BuffStat, type PoisonSpec, type SkillDef } from '../data/skills';
import { applyXp, statsForLevel, xpToNext } from '../progression/leveling';
import { Cooldowns } from '../skills/cooldowns';
import { NO_MODS, SkillTree, combineMods, type LearnCheck, type Modifiers } from '../skills/tree';

export interface PlayerSave {
  level: number;
  xp: number;
  alignment: AlignmentState;
  talents: string[];
  inventory: string[];
  equipped: Record<Slot, string | null>;
  /** Assente nei salvataggi più vecchi. */
  keyItems?: string[];
  /** Id della classe; assente nei salvataggi più vecchi (Guerriero). */
  cls?: string;
}

/** Richiesta di evocazione emessa da una skill: la scena crea gli alleati. */
export interface SummonRequest {
  count: number;
  duration: number;
  damageMult: number;
}

export type PlayerState = 'idle' | 'attack' | 'skill' | 'dodge' | 'stagger' | 'dead';

export interface PlayerInput {
  /** Direzione di movimento nel mondo (normalizzata o zero). */
  moveX: number;
  moveY: number;
  /** Angolo di mira nel mondo. */
  aimAngle: number;
  attack: boolean;
  dodge: boolean;
  /** Indice (0–3) della skill premuta in questo frame, o null. */
  skill: number | null;
}

type Action = { kind: 'attack' } | { kind: 'dodge' } | { kind: 'skill'; index: number };

interface Buff {
  stat: BuffStat;
  mult: number;
  timeLeft: number;
}

/** Scia visiva dell'ultimo colpo (solo per il rendering). */
export interface SwingFx {
  x: number;
  y: number;
  angle: number;
  range: number;
  halfArc: number;
  color: number;
  timeLeft: number;
}

interface ArcSpec {
  range: number;
  halfArc: number;
  damageMult: number;
  color: number;
  showFor: number;
  breakPoise?: boolean;
  lifesteal?: number;
  poison?: PoisonSpec;
}

/** Durata del veleno applicato dai talenti passivi (secondi). */
const PASSIVE_POISON_TIME = 4;

/** Vita a cui riporta "Ultima Luce" (frazione della massima). */
const LAST_STAND_HP = 0.3;

export class Player {
  x: number;
  y: number;
  readonly radius = PLAYER.radius;
  readonly cls: ClassDef;
  readonly cooldowns = new Cooldowns();
  readonly stamina: Stamina;
  readonly alignment = new Alignment();
  readonly tree: SkillTree;
  /** Skill sui tasti 1–4, dopo le sostituzioni dei talenti. */
  skills: SkillDef[];
  /** Oggetti posseduti (id), in ordine di raccolta. */
  readonly inventory: string[] = [];
  readonly equipped: Record<Slot, string | null> = { arma: null, armatura: null, amuleto: null };
  readonly keyItems: string[] = [];

  facing = 0;
  level = 1;
  xp = 0;
  rage = 0;
  hp: number;
  state: PlayerState = 'idle';
  stateTime = 0;
  hurtFlash = 0;
  /** Lampeggia quando si prova ad agire senza risorse. */
  noStaminaFlash = 0;
  noRageFlash = 0;
  activeSkill: SkillDef | null = null;
  swing: SwingFx | null = null;

  private stats: Stats;
  private mods: Modifiers = { ...NO_MODS };
  private buffs: Buff[] = [];
  private startDone = false;
  private endDone = false;
  private dirX = 0;
  private dirY = 0;
  private buffered: Action | null = null;
  private bufferLeft = 0;
  private sinceCombat = 0;
  private lastStandUsed = false;
  private lastStandFired = false;
  private healShown = 0;
  private summons: SummonRequest[] = [];

  constructor(x: number, y: number, cls: ClassDef = WARRIOR) {
    this.x = x;
    this.y = y;
    this.cls = cls;
    this.tree = new SkillTree(cls.talents, this.alignment, cls.talentConfig);
    this.rage = cls.rage.startFull ? cls.rage.max : 0;
    this.skills = cls.skills.map((id) => SKILLS[id]);
    this.stats = statsForLevel(cls, 1);
    this.hp = this.maxHp;
    this.stamina = new Stamina(this.stats.stamina, PLAYER.stamina.regenPerSec, PLAYER.stamina.regenDelay);
  }

  // ---------- Statistiche ----------

  get maxHp(): number {
    return Math.round(this.stats.maxHp * this.mods.maxHpMult);
  }

  get maxRage(): number {
    return this.cls.rage.max;
  }

  get xpToNext(): number {
    return xpToNext(this.level);
  }

  get modifiers(): Readonly<Modifiers> {
    return this.mods;
  }

  get attackDamage(): number {
    const missing = 1 - this.hp / this.maxHp;
    const fury = 1 + this.mods.berserk * Math.max(0, missing);
    return Math.round(this.stats.damage * this.buffMult('damage') * this.mods.damageMult * fury);
  }

  get defense(): number {
    return this.stats.defense * this.buffMult('defense');
  }

  get buffed(): boolean {
    return this.buffs.some((b) => b.stat !== 'stealth');
  }

  /** Furtivo: i nemici non lo vedono finché non colpisce o viene ferito. */
  get hidden(): boolean {
    return this.state !== 'dead' && this.buffs.some((b) => b.stat === 'stealth');
  }

  private buffMult(stat: BuffStat): number {
    let m = 1;
    for (const b of this.buffs) if (b.stat === stat) m *= b.mult;
    return m;
  }

  /** Ricalcola statistiche, passive e skill dopo un cambio di livello, talenti o equipaggiamento. */
  private refreshBuild(): void {
    const oldMax = this.maxHp;
    const stats = statsForLevel(this.cls, this.level);
    const itemMods: Partial<Modifiers>[] = [];
    for (const id of Object.values(this.equipped)) {
      if (!id) continue;
      const item = ITEMS[id];
      stats.maxHp += item.bonus.maxHp ?? 0;
      stats.stamina += item.bonus.stamina ?? 0;
      stats.damage += item.bonus.damage ?? 0;
      stats.defense += item.bonus.defense ?? 0;
      if (item.mods) itemMods.push(item.mods);
    }
    this.stats = stats;
    this.mods = combineMods([this.tree.modifiers(), ...itemMods]);
    this.skills = this.tree.slots(this.cls.skills).map((id) => SKILLS[id]);
    this.stamina.max = this.stats.stamina;
    this.stamina.current = Math.min(this.stamina.current, this.stamina.max);
    if (this.state !== 'dead') {
      this.hp = Math.min(this.maxHp, Math.max(1, this.hp + (this.maxHp - oldMax)));
    }
  }

  // ---------- Oggetti ----------

  addItem(id: string): void {
    if (ITEMS[id] && !this.inventory.includes(id)) this.inventory.push(id);
  }

  addKeyItem(id: string): void {
    if (KEY_ITEMS[id] && !this.keyItems.includes(id)) this.keyItems.push(id);
  }

  hasKeyItem(id: string): boolean {
    return this.keyItems.includes(id);
  }

  canEquip(id: string): LearnCheck {
    const item = ITEMS[id];
    if (!item || !this.inventory.includes(id)) return { ok: false, reason: 'Non lo possiedi' };
    const req = item.requires;
    if (req && !this.alignment.meetsThreshold(req.side, req.earned)) {
      const side = req.side === 'light' ? 'Luce' : 'Oscurità';
      return { ok: false, reason: `Serve ${side} guadagnata ≥ ${req.earned} (hai ${this.alignment.totalEarned(req.side)})` };
    }
    return { ok: true };
  }

  equip(id: string): boolean {
    if (!this.canEquip(id).ok) return false;
    this.equipped[ITEMS[id].slot] = id;
    this.refreshBuild();
    return true;
  }

  unequip(slot: Slot): void {
    this.equipped[slot] = null;
    this.refreshBuild();
  }

  isEquipped(id: string): boolean {
    return Object.values(this.equipped).includes(id);
  }

  /** Impara un talento (spende i punti allineamento). */
  learnTalent(id: string): boolean {
    if (!this.tree.learn(id)) return false;
    this.refreshBuild();
    return true;
  }

  /** La via scelta è definitiva: si rifà solo con l'oggetto di fine gioco. */
  canRespec(): LearnCheck {
    if (!this.hasKeyItem(RESPEC_ITEM)) {
      return { ok: false, reason: `La via scelta è definitiva: serve l’${KEY_ITEMS[RESPEC_ITEM].name}` };
    }
    if (this.tree.toJSON().length === 0) return { ok: false, reason: 'Non hai talenti da dimenticare' };
    return { ok: true };
  }

  /** Dimentica tutti i talenti e restituisce i punti. */
  respec(): boolean {
    if (!this.canRespec().ok) return false;
    this.tree.respec();
    this.refreshBuild();
    this.cooldowns.clear();
    return true;
  }

  /** Aggiunge XP; ritorna i livelli guadagnati. */
  gainXp(amount: number): number {
    const r = applyXp(this.level, this.xp, amount);
    this.level = r.level;
    this.xp = r.xp;
    // Cura parziale (non completa) per ogni livello guadagnato.
    if (r.gained > 0) {
      this.refreshBuild();
      this.heal(this.maxHp * PLAYER.levelUpHeal * r.gained);
    }
    return r.gained;
  }

  /** Da chiamare per ogni nemico colpito, con il danno inflitto. */
  onHitLanded(damage = 0, lifesteal = 0): void {
    this.addRage(this.cls.rage.onHit);
    this.heal(damage * (this.mods.lifesteal + lifesteal));
  }

  /** Da chiamare per ogni nemico ucciso. */
  onKill(): void {
    this.heal(this.maxHp * this.mods.killHeal);
  }

  /** Evocazioni richieste dall'ultima chiamata. */
  takeSummons(): SummonRequest[] {
    const s = this.summons;
    this.summons = [];
    return s;
  }

  heal(amount: number): void {
    if (this.state === 'dead' || amount <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healShown += this.hp - before;
  }

  /** Cura da mostrare a schermo dall'ultima chiamata (esclusa la rigenerazione). */
  takeHealText(): number {
    const h = Math.round(this.healShown);
    if (h >= 1) this.healShown = 0;
    return h >= 1 ? h : 0;
  }

  /** True una sola volta dopo che "Ultima Luce" ha evitato la morte. */
  consumeLastStand(): boolean {
    const f = this.lastStandFired;
    this.lastStandFired = false;
    return f;
  }

  private addRage(amount: number): void {
    this.rage = Math.min(this.maxRage, this.rage + amount * this.mods.rageGainMult);
    this.sinceCombat = 0;
  }

  // ---------- Stato ----------

  get invulnerable(): boolean {
    const s = this.activeSkill;
    if (this.state === 'skill' && s) {
      // Traslazioni: intoccabile per tutta la fase di scatto.
      const phasing = s.effects.some((fx) => fx.type === 'dash' && fx.phase);
      return phasing && this.stateTime >= s.windup && this.stateTime < s.windup + s.active;
    }
    return (
      this.state === 'dodge' &&
      this.stateTime >= PLAYER.dodge.iFrameStart &&
      this.stateTime <= PLAYER.dodge.iFrameEnd
    );
  }

  // ---------- Salvataggio ----------

  /** Progressi da salvare: tutto tranne posizione e stato del combattimento. */
  snapshot(): PlayerSave {
    return {
      level: this.level,
      xp: this.xp,
      alignment: this.alignment.toJSON(),
      talents: this.tree.toJSON(),
      inventory: [...this.inventory],
      equipped: { ...this.equipped },
      keyItems: [...this.keyItems],
      cls: this.cls.id,
    };
  }

  /** Ripristina i progressi salvati; ignora oggetti e talenti che non esistono più. */
  restore(s: PlayerSave): void {
    this.level = Math.max(1, Math.floor(s.level));
    this.xp = Math.max(0, s.xp);
    this.alignment.load(s.alignment);
    this.tree.restore(s.talents);
    this.inventory.length = 0;
    for (const id of s.inventory) this.addItem(id);
    this.keyItems.length = 0;
    for (const id of s.keyItems ?? []) this.addKeyItem(id);
    for (const slot of Object.keys(this.equipped) as Slot[]) {
      const id = s.equipped[slot];
      this.equipped[slot] = id && this.inventory.includes(id) && ITEMS[id].slot === slot ? id : null;
    }
    this.refreshBuild();
    this.hp = this.maxHp;
    this.stamina.refill();
  }

  /** Riposo al falò / respawn: ripristina tutto tranne livello, XP e talenti. */
  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.state = 'idle';
    this.hp = this.maxHp;
    this.stamina.refill();
    this.rage = this.cls.rage.startFull ? this.maxRage : 0;
    this.summons = [];
    this.buffs = [];
    this.cooldowns.clear();
    this.swing = null;
    this.buffered = null;
    this.lastStandUsed = false;
    this.healShown = 0;
    this.setState('idle');
  }

  private setState(s: PlayerState): void {
    this.state = s;
    this.stateTime = 0;
    this.startDone = false;
    this.endDone = false;
    if (s !== 'skill') this.activeSkill = null;
  }

  /** Ritorna il danno subito, o 0 se il colpo è stato schivato. */
  takeDamage(amount: number, fromAngle: number): number {
    if (this.state === 'dead' || this.invulnerable) return 0;
    const taken = amount * this.mods.damageTakenMult * this.buffMult('damageTaken');
    const dmg = computeDamage(taken, this.defense);
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0 && this.mods.cheatDeath && !this.lastStandUsed) {
      this.lastStandUsed = true;
      this.lastStandFired = true;
      this.hp = Math.round(this.maxHp * LAST_STAND_HP);
    }
    this.hurtFlash = 0.15;
    this.buffs = this.buffs.filter((b) => b.stat !== 'stealth');
    this.dirX = Math.cos(fromAngle);
    this.dirY = Math.sin(fromAngle);
    this.buffered = null;
    this.addRage(this.cls.rage.onHurt);
    this.setState(this.hp <= 0 ? 'dead' : 'stagger');
    return dmg;
  }

  update(dt: number, input: PlayerInput, map: GameMap): AttackEvent | null {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.noStaminaFlash = Math.max(0, this.noStaminaFlash - dt);
    this.noRageFlash = Math.max(0, this.noRageFlash - dt);
    if (this.swing && (this.swing.timeLeft -= dt) <= 0) this.swing = null;
    if (this.state === 'dead') return null;

    if (input.attack) this.buffer({ kind: 'attack' });
    if (input.dodge) this.buffer({ kind: 'dodge' });
    if (input.skill !== null) this.buffer({ kind: 'skill', index: input.skill });
    if (this.bufferLeft > 0) {
      this.bufferLeft -= dt;
      if (this.bufferLeft <= 0) this.buffered = null;
    }

    this.stamina.update(dt);
    this.cooldowns.update(dt);
    this.buffs = this.buffs.filter((b) => (b.timeLeft -= dt) > 0);
    if (this.mods.hpRegen > 0) this.hp = Math.min(this.maxHp, this.hp + this.mods.hpRegen * dt);
    this.sinceCombat += dt;
    const res = this.cls.rage;
    if (res.regenPerSec) this.rage = Math.min(this.maxRage, this.rage + res.regenPerSec * this.mods.rageGainMult * dt);
    if (res.decayPerSec > 0 && this.sinceCombat > res.decayDelay) {
      this.rage = Math.max(0, this.rage - res.decayPerSec * dt);
    }

    this.stateTime += dt;
    let event: AttackEvent | null = null;

    switch (this.state) {
      case 'idle': {
        this.facing = input.aimAngle;
        moveWithCollision(map, this, input.moveX * PLAYER.speed * dt, input.moveY * PLAYER.speed * dt, this.radius);
        this.tryStartBuffered(input);
        break;
      }
      case 'attack': {
        const a = this.cls.attack;
        if (this.stateTime < a.windup + a.active) this.advance(map, a.lungeSpeed * dt);
        if (!this.startDone && this.stateTime >= a.windup) {
          this.startDone = true;
          event = a.projectile
            ? this.emitBolt({ range: a.range, damageMult: 1, speed: a.projectile.speed, color: a.projectile.color })
            : this.emitArc({ range: a.range, halfArc: a.halfArc, damageMult: 1, color: a.color, showFor: a.active });
        }
        if (this.stateTime >= a.windup + a.active + a.recovery) this.finishAction(input);
        break;
      }
      case 'skill': {
        const s = this.activeSkill!;
        const activeEnd = s.windup + s.active;
        const inActive = this.stateTime >= s.windup && this.stateTime < activeEnd;
        for (const fx of s.effects) {
          if (fx.type === 'dash' && inActive) this.advance(map, fx.speed * dt);
        }
        if (!this.startDone && this.stateTime >= s.windup) {
          this.startDone = true;
          for (const fx of s.effects) {
            if (fx.type === 'buff') this.buffs.push({ stat: fx.stat, mult: fx.mult, timeLeft: fx.duration });
            else if (fx.type === 'heal') this.heal(this.maxHp * fx.percent);
            else if (fx.type === 'summon') this.summons.push({ count: fx.count, duration: fx.duration, damageMult: fx.damageMult });
          }
          event = this.emitSkillArc(s, 'start');
        } else if (!this.endDone && this.stateTime >= activeEnd) {
          this.endDone = true;
          event = this.emitSkillArc(s, 'end');
        }
        if (this.endDone && this.stateTime >= activeEnd + s.recovery) this.finishAction(input);
        break;
      }
      case 'dodge': {
        const d = PLAYER.dodge;
        // Veloce all'inizio, rallenta in uscita.
        const ease = 1.25 - 0.9 * (this.stateTime / d.duration);
        const v = d.speed * ease * dt;
        moveWithCollision(map, this, this.dirX * v, this.dirY * v, this.radius);
        if (this.stateTime >= d.duration) this.finishAction(input);
        break;
      }
      case 'stagger': {
        const k = PLAYER.knockback * (1 - this.stateTime / PLAYER.staggerTime) * dt;
        moveWithCollision(map, this, this.dirX * k, this.dirY * k, this.radius);
        if (this.stateTime >= PLAYER.staggerTime) this.setState('idle');
        break;
      }
    }
    if (event) this.dress(event);
    return event;
  }

  /** Completa un colpo appena emesso: agguato dalla furtività, colpo alle spalle, veleno dei talenti. */
  private dress(ev: AttackEvent): void {
    const stealth = this.buffs.find((b) => b.stat === 'stealth');
    if (stealth) {
      ev.damage = Math.round(ev.damage * stealth.mult);
      this.buffs = this.buffs.filter((b) => b.stat !== 'stealth');
    }
    const back = (this.cls.backstab ?? 0) + this.mods.backstab;
    if (back > 0) ev.backstab = 1 + back;
    if (this.mods.poison > 0) {
      const extra = ev.damage * this.mods.poison;
      ev.poison = {
        damage: (ev.poison?.damage ?? 0) + extra,
        duration: Math.max(ev.poison?.duration ?? 0, PASSIVE_POISON_TIME),
      };
    }
  }

  private poisonOf(p: PoisonSpec | undefined): AttackEvent['poison'] {
    return p ? { damage: this.attackDamage * p.mult, duration: p.duration } : undefined;
  }

  private advance(map: GameMap, dist: number): void {
    moveWithCollision(map, this, Math.cos(this.facing) * dist, Math.sin(this.facing) * dist, this.radius);
  }

  private finishAction(input: PlayerInput): void {
    this.setState('idle');
    this.facing = input.aimAngle;
    this.tryStartBuffered(input);
  }

  private emitArc(a: ArcSpec): AttackEvent {
    this.swing = {
      x: this.x, y: this.y, angle: this.facing, range: a.range, halfArc: a.halfArc, color: a.color,
      timeLeft: Math.max(a.showFor, 0.12),
    };
    return {
      x: this.x,
      y: this.y,
      angle: this.facing,
      range: a.range,
      halfArc: a.halfArc,
      damage: Math.round(this.attackDamage * a.damageMult),
      breakPoise: a.breakPoise,
      lifesteal: a.lifesteal,
      poison: this.poisonOf(a.poison),
    };
  }

  private emitBolt(b: {
    range: number; damageMult: number; speed: number; color: number;
    radius?: number; breakPoise?: boolean; lifesteal?: number; pierce?: boolean; explode?: number;
    count?: number; spread?: number; poison?: PoisonSpec;
  }): AttackEvent {
    return {
      x: this.x,
      y: this.y,
      angle: this.facing,
      range: b.range,
      halfArc: 0,
      damage: Math.round(this.attackDamage * b.damageMult),
      breakPoise: b.breakPoise,
      lifesteal: b.lifesteal,
      poison: this.poisonOf(b.poison),
      projectile: {
        speed: b.speed, radius: b.radius, pierce: b.pierce, explode: b.explode, color: b.color,
        count: b.count, spread: b.spread,
      },
    };
  }

  private emitSkillArc(s: SkillDef, at: 'start' | 'end'): AttackEvent | null {
    for (const fx of s.effects) {
      if (fx.type === 'bolt' && fx.at === at) return this.emitBolt({ ...fx, color: s.color });
      if (fx.type === 'arc' && fx.at === at) {
        return this.emitArc({
          range: fx.range, halfArc: fx.halfArc, damageMult: fx.damageMult, color: s.color, showFor: s.active,
          breakPoise: fx.breakPoise, lifesteal: fx.lifesteal, poison: fx.poison,
        });
      }
    }
    return null;
  }

  private buffer(action: Action): void {
    this.buffered = action;
    this.bufferLeft = PLAYER.inputBuffer;
  }

  private tryStartBuffered(input: PlayerInput): void {
    const action = this.buffered;
    if (!action) return;
    this.buffered = null;

    if (action.kind === 'skill') {
      const s = this.skills[action.index];
      if (!s || !this.cooldowns.ready(s.id)) return;
      const stam = s.cost.stamina ?? 0;
      const rage = s.cost.rage ?? 0;
      if (this.rage < rage) {
        this.noRageFlash = 0.3;
        return;
      }
      if (!this.stamina.trySpend(stam)) {
        this.noStaminaFlash = 0.3;
        return;
      }
      this.rage -= rage;
      this.cooldowns.start(s.id, s.cooldown);
      this.facing = input.aimAngle;
      this.setState('skill');
      this.activeSkill = s;
      return;
    }

    let cost = action.kind === 'attack' ? this.cls.attack.cost : PLAYER.dodge.cost;
    if (action.kind === 'attack' && this.mods.freeAttackRage > 0 && this.rage >= this.mods.freeAttackRage) cost = 0;
    if (!this.stamina.trySpend(cost)) {
      this.noStaminaFlash = 0.3;
      return;
    }
    if (action.kind === 'attack') {
      this.facing = input.aimAngle;
      this.setState('attack');
    } else {
      if (input.moveX !== 0 || input.moveY !== 0) {
        this.dirX = input.moveX;
        this.dirY = input.moveY;
      } else {
        // Nessuna direzione: passo indietro rispetto alla mira.
        this.dirX = -Math.cos(this.facing);
        this.dirY = -Math.sin(this.facing);
      }
      this.setState('dodge');
    }
  }
}
