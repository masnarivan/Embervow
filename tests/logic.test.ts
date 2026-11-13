import { describe, expect, it } from 'vitest';
import { Alignment } from '../src/alignment/alignment';
import { angleDiff, computeDamage, hitsArc, type AttackEvent } from '../src/combat/damage';
import { Stamina } from '../src/combat/stamina';
import { LOCK_RANGE, canKeep, cycleTarget, pickTarget } from '../src/combat/targeting';
import { screenDirToWorld, toScreen, toWorld } from '../src/core/iso';
import { collides, createTestMap, moveWithCollision } from '../src/core/map';
import { ENEMIES } from '../src/data/enemies';
import { WARRIOR } from '../src/data/classes';
import { PLAYER } from '../src/data/player';
import { SKILLS } from '../src/data/skills';
import { applyXp, statsForLevel, xpToNext } from '../src/progression/leveling';
import { Cooldowns } from '../src/skills/cooldowns';
import { Enemy } from '../src/entities/Enemy';
import { Player, type PlayerInput } from '../src/entities/Player';

const idle: PlayerInput = { moveX: 0, moveY: 0, aimAngle: 0, attack: false, dodge: false, skill: null };

describe('iso', () => {
  it('toWorld inverte toScreen', () => {
    const s = toScreen(3.25, 7.5);
    const w = toWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(3.25);
    expect(w.y).toBeCloseTo(7.5);
  });

  it('W (su schermo) muove verso l’alto', () => {
    const d = screenDirToWorld(0, -1);
    expect(toScreen(d.x, d.y).y).toBeLessThan(0);
    expect(toScreen(d.x, d.y).x).toBeCloseTo(0);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
});

describe('stamina', () => {
  it('rifiuta la spesa se non basta', () => {
    const s = new Stamina(100, 40, 0.5);
    expect(s.trySpend(80)).toBe(true);
    expect(s.trySpend(30)).toBe(false);
    expect(s.current).toBe(20);
  });

  it('rigenera solo dopo il ritardo e non supera il massimo', () => {
    const s = new Stamina(100, 40, 0.5);
    s.trySpend(50);
    s.update(0.4);
    expect(s.current).toBe(50);
    s.update(0.6); // 0.1 di ritardo residuo + 0.5 di rigenerazione
    expect(s.current).toBeCloseTo(70);
    s.update(10);
    expect(s.current).toBe(100);
  });
});

describe('danni', () => {
  const atk: AttackEvent = { x: 0, y: 0, angle: 0, range: 2, halfArc: Math.PI / 4, damage: 10 };

  it('colpisce dentro arco e portata', () => {
    expect(hitsArc(atk, 1.5, 0, 0.3)).toBe(true);
    expect(hitsArc(atk, 1, 0.8, 0.3)).toBe(true);
  });

  it('manca dietro, di lato e fuori portata', () => {
    expect(hitsArc(atk, -1, 0, 0.3)).toBe(false);
    expect(hitsArc(atk, 0, 1.5, 0.3)).toBe(false);
    expect(hitsArc(atk, 2.5, 0, 0.3)).toBe(false);
  });

  it('angleDiff gestisce il wrap', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
  });

  it('il danno è almeno 1', () => {
    expect(computeDamage(20, 5)).toBe(15);
    expect(computeDamage(3, 50)).toBe(1);
  });
});

describe('allineamento', () => {
  it('la soglia usa il totale guadagnato, non il saldo', () => {
    const a = new Alignment();
    a.gain('light', 20);
    expect(a.trySpend('light', 15)).toBe(true);
    expect(a.balance('light')).toBe(5);
    expect(a.meetsThreshold('light', 20)).toBe(true);
    expect(a.meetsThreshold('dark', 1)).toBe(false);
  });

  it('non spende più del saldo; il respec restituisce i punti', () => {
    const a = new Alignment();
    a.gain('dark', 10);
    expect(a.trySpend('dark', 11)).toBe(false);
    a.trySpend('dark', 10);
    a.refund('dark');
    expect(a.balance('dark')).toBe(10);
    expect(Alignment.fromJSON(a.toJSON()).totalEarned('dark')).toBe(10);
  });
});

describe('mappa', () => {
  it('i muri bloccano il movimento, anche ad alta velocità', () => {
    const map = createTestMap();
    const pos = { x: 1.5, y: 1.5 };
    moveWithCollision(map, pos, -5, 0, 0.3);
    expect(pos.x).toBeGreaterThanOrEqual(1.3 - 1e-9);
    expect(collides(map, pos.x, pos.y, 0.3)).toBe(false);
  });
});

describe('giocatore', () => {
  const map = createTestMap();

  it('l’attacco costa stamina ed emette un colpo dopo il wind-up', () => {
    const p = new Player(5, 5);
    expect(p.update(0.016, { ...idle, attack: true }, map)).toBeNull();
    expect(p.state).toBe('attack');
    expect(p.stamina.current).toBe(WARRIOR.base.stamina - PLAYER.attack.cost);
    const ev = p.update(PLAYER.attack.windup, idle, map);
    expect(ev?.damage).toBe(WARRIOR.base.damage);
    expect(p.update(0.016, idle, map)).toBeNull(); // un solo colpo per attacco
  });

  it('la schivata dà i-frame e poi torna vulnerabile', () => {
    const p = new Player(5, 5);
    p.update(0.016, { ...idle, dodge: true, moveX: 1 }, map);
    p.update(0.1, idle, map);
    expect(p.invulnerable).toBe(true);
    expect(p.takeDamage(50, 0)).toBe(0);
    expect(p.hp).toBe(WARRIOR.base.maxHp);
    p.update(PLAYER.dodge.duration, idle, map);
    expect(p.state).toBe('idle');
    expect(p.x).toBeGreaterThan(6);
    expect(p.takeDamage(50, 0)).toBe(50);
    expect(p.hp).toBe(WARRIOR.base.maxHp - 50);
  });

  it('senza stamina non si agisce', () => {
    const p = new Player(5, 5);
    p.stamina.current = 5;
    p.update(0.016, { ...idle, dodge: true }, map);
    expect(p.state).toBe('idle');
  });

  it('muore a 0 HP e reset lo ripristina', () => {
    const p = new Player(5, 5);
    p.takeDamage(999, 0);
    expect(p.state).toBe('dead');
    p.reset(3, 3);
    expect(p.hp).toBe(WARRIOR.base.maxHp);
    expect(p.state).toBe('idle');
  });
});

describe('nemico', () => {
  const map = createTestMap();
  const target = { x: 5, y: 5, radius: 0.3, state: 'idle' };

  it('insegue, carica il colpo e colpisce', () => {
    const e = new Enemy(ENEMIES.predone, 5, 8);
    let strike: AttackEvent | null = null;
    for (let i = 0; i < 600 && !strike; i++) strike = e.update(1 / 60, target, map);
    expect(strike).not.toBeNull();
    expect(hitsArc(strike!, target.x, target.y, target.radius)).toBe(true);
  });

  it('resta fermo fuori dal raggio di aggro', () => {
    const e = new Enemy(ENEMIES.predone, 5, 18);
    e.update(1 / 60, target, map);
    expect(e.state).toBe('idle');
  });

  it('il Bruto non viene interrotto durante il wind-up, il Predone sì', () => {
    const near = { ...target, y: 6 };
    for (const [id, expected] of [['bruto', 'windup'], ['predone', 'stagger']] as const) {
      const e = new Enemy(ENEMIES[id], 5, 7);
      for (let i = 0; i < 120 && e.state !== 'windup'; i++) e.update(1 / 60, near, map);
      expect(e.state).toBe('windup');
      e.takeDamage(10, 0);
      expect(e.state).toBe(expected);
    }
  });
});

describe('livelli', () => {
  it('applyXp gestisce più livelli in un colpo e conserva il resto', () => {
    const r = applyXp(1, 0, xpToNext(1) + xpToNext(2) + 5);
    expect(r).toEqual({ level: 3, xp: 5, gained: 2 });
  });

  it('le statistiche crescono col livello', () => {
    const s = statsForLevel(WARRIOR, 3);
    expect(s.maxHp).toBe(WARRIOR.base.maxHp + 2 * WARRIOR.perLevel.maxHp);
    expect(s.damage).toBe(WARRIOR.base.damage + 2 * WARRIOR.perLevel.damage);
  });

  it('salire di livello aumenta vita e danno e cura in parte', () => {
    const p = new Player(5, 5);
    p.takeDamage(60, 0);
    expect(p.gainXp(xpToNext(1))).toBe(1);
    expect(p.level).toBe(2);
    const max = WARRIOR.base.maxHp + WARRIOR.perLevel.maxHp;
    expect(p.hp).toBeCloseTo(WARRIOR.base.maxHp - 60 + WARRIOR.perLevel.maxHp + max * PLAYER.levelUpHeal);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(p.maxHp).toBe(WARRIOR.base.maxHp + WARRIOR.perLevel.maxHp);
    expect(p.attackDamage).toBe(WARRIOR.base.damage + WARRIOR.perLevel.damage);
    expect(p.stamina.max).toBe(WARRIOR.base.stamina + WARRIOR.perLevel.stamina);
  });
});

describe('skill', () => {
  const map = createTestMap();
  const use = (index: number): PlayerInput => ({ ...idle, skill: index });
  /** Avanza la simulazione e raccoglie i colpi emessi. */
  const run = (p: Player, seconds: number) => {
    const events: AttackEvent[] = [];
    for (let t = 0; t < seconds; t += 1 / 120) {
      const ev = p.update(1 / 120, idle, map);
      if (ev) events.push(ev);
    }
    return events;
  };

  it('cooldown: scala e si azzera', () => {
    const c = new Cooldowns();
    c.start('a', 2);
    c.update(1.5);
    expect(c.remaining('a')).toBeCloseTo(0.5);
    c.update(1);
    expect(c.ready('a')).toBe(true);
  });

  it('Colpo Poderoso: costa stamina, va in cooldown, colpisce forte e spezza la guardia', () => {
    const p = new Player(5, 5);
    p.update(0.01, use(0), map);
    expect(p.state).toBe('skill');
    expect(p.stamina.current).toBe(WARRIOR.base.stamina - SKILLS.colpo_poderoso.cost.stamina!);
    const [ev, ...rest] = run(p, 1.2);
    expect(rest).toHaveLength(0);
    expect(ev.damage).toBe(Math.round(WARRIOR.base.damage * 2.2));
    expect(ev.breakPoise).toBe(true);
    expect(p.state).toBe('idle');
    p.update(0.01, use(0), map); // ancora in cooldown
    expect(p.state).toBe('idle');
  });

  it('le skill a rabbia richiedono rabbia', () => {
    const p = new Player(5, 5);
    p.update(0.01, use(1), map);
    expect(p.state).toBe('idle');
    expect(p.cooldowns.ready('turbine')).toBe(true);
    p.rage = 30;
    p.update(0.01, use(1), map);
    expect(p.state).toBe('skill');
    expect(p.rage).toBeCloseTo(5);
    const [ev] = run(p, 1);
    expect(hitsArc(ev, p.x - 1, p.y, 0.3)).toBe(true); // colpisce anche alle spalle
  });

  it('Carica: scatta in avanti e colpisce all’arrivo', () => {
    const p = new Player(5, 5);
    p.update(0.01, use(2), map);
    const [ev] = run(p, 1);
    expect(p.x).toBeGreaterThan(8);
    expect(ev.x).toBeCloseTo(p.x, 1);
  });

  it('Grido di Guerra: aumenta i danni per la durata del buff', () => {
    const p = new Player(5, 5);
    p.rage = 20;
    p.update(0.01, use(3), map);
    expect(run(p, 0.5)).toHaveLength(0);
    expect(p.attackDamage).toBe(Math.round(WARRIOR.base.damage * 1.35));
    run(p, 8);
    expect(p.attackDamage).toBe(WARRIOR.base.damage);
  });

  it('la rabbia sale colpendo e cala fuori dal combattimento', () => {
    const p = new Player(5, 5);
    p.onHitLanded();
    expect(p.rage).toBe(WARRIOR.rage.onHit);
    run(p, WARRIOR.rage.decayDelay + 1);
    expect(p.rage).toBeLessThan(WARRIOR.rage.onHit);
  });

  it('un colpo che spezza la guardia interrompe anche il Bruto', () => {
    const e = new Enemy(ENEMIES.bruto, 5, 7);
    const near = { x: 5, y: 6, radius: 0.3, state: 'idle' };
    for (let i = 0; i < 120 && e.state !== 'windup'; i++) e.update(1 / 60, near, map);
    e.takeDamage(10, 0, true);
    expect(e.state).toBe('stagger');
  });
});

describe('mira automatica', () => {
  const mk = (x: number, y: number, dead = false) => ({ x, y, dead });

  it('aggancia il nemico vivo più vicino entro la portata', () => {
    const far = mk(0, LOCK_RANGE + 1);
    const corpse = mk(1, 0, true);
    const near = mk(3, 0);
    const mid = mk(0, 4);
    expect(pickTarget(0, 0, [far, corpse, mid, near], null)).toBe(near);
    expect(pickTarget(0, 0, [far, corpse], null)).toBeNull();
  });

  it('resta sul bersaglio corrente se un altro è solo poco più vicino', () => {
    const a = mk(3, 0);
    const b = mk(0, 2.5);
    expect(pickTarget(0, 0, [a, b], a)).toBe(a);
  });

  it('cambia bersaglio se un altro è molto più vicino, o se il corrente muore', () => {
    const a = mk(4, 0);
    const b = mk(0, 1);
    expect(pickTarget(0, 0, [a, b], a)).toBe(b);
    const c = mk(0, 3);
    a.dead = true;
    expect(pickTarget(0, 0, [a, c], a)).toBe(c);
  });

  it('ignora un bersaglio che non esiste più (respawn)', () => {
    const old = mk(1, 0);
    const fresh = mk(2, 0);
    expect(pickTarget(0, 0, [fresh], old)).toBe(fresh);
  });
});

describe('cambio bersaglio', () => {
  const mk = (x: number, y: number, dead = false) => ({ x, y, dead });

  it('scorre i nemici in ordine di distanza e ricomincia', () => {
    const a = mk(1, 0);
    const b = mk(0, 2);
    const c = mk(3, 0);
    const all = [c, a, b, mk(2, 0, true), mk(0, LOCK_RANGE + 1)];
    expect(cycleTarget(0, 0, all, null)).toBe(a);
    expect(cycleTarget(0, 0, all, a)).toBe(b);
    expect(cycleTarget(0, 0, all, b)).toBe(c);
    expect(cycleTarget(0, 0, all, c)).toBe(a);
  });

  it('senza nemici a portata non seleziona nulla', () => {
    expect(cycleTarget(0, 0, [mk(0, LOCK_RANGE + 1)], null)).toBeNull();
  });

  it('canKeep: valido finché vivo, presente e vicino', () => {
    const a = mk(3, 0);
    expect(canKeep(0, 0, [a], a)).toBe(true);
    expect(canKeep(0, 0, [], a)).toBe(false);
    expect(canKeep(20, 0, [a], a)).toBe(false);
    a.dead = true;
    expect(canKeep(0, 0, [a], a)).toBe(false);
  });
});
