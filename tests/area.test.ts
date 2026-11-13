import { describe, expect, it } from 'vitest';
import { hitsArc, type AttackEvent } from '../src/combat/damage';
import { projectileHits, spawnProjectiles, stepProjectile } from '../src/combat/projectiles';
import { insideArena, parseLevel, setGate, tileIndex } from '../src/core/level';
import { collides, createTestMap, isWall, moveWithCollision } from '../src/core/map';
import { CUSTODE } from '../src/data/boss';
import { CHOICES } from '../src/data/choices';
import { ENEMIES } from '../src/data/enemies';
import { ITEMS } from '../src/data/items';
import { TALENT_CONFIG } from '../src/data/talents';
import { LEVEL1_CHESTS, LEVEL1_ROWS } from '../src/data/level1';
import { Boss } from '../src/entities/Boss';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';

const level = () => parseLevel(LEVEL1_ROWS, LEVEL1_CHESTS);

/** Ricerca in ampiezza sui tile di pavimento: da `from` si arriva a `to`? */
function reachable(lv: ReturnType<typeof level>, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const { w, h } = lv.map;
  const start = tileIndex(lv, from.x, from.y);
  const goal = tileIndex(lv, to.x, to.y);
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    if (i === goal) return true;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(ni) || isWall(lv.map, nx + 0.5, ny + 0.5)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return false;
}

describe('area', () => {
  it('contiene tutto il necessario', () => {
    const lv = level();
    expect(lv.bonfires).toHaveLength(2);
    expect(lv.boss).not.toBeNull();
    expect(lv.choices.map((c) => c.id).sort()).toEqual(['1', '2', '3']);
    expect(lv.chests).toHaveLength(1);
    expect(new Set(lv.enemies.map((e) => e.type))).toEqual(new Set(['predone', 'bruto', 'arciere']));
    expect(lv.gate.length).toBeGreaterThan(0);
    for (const c of lv.chests) expect(ITEMS[c.item]).toBeDefined();
    for (const c of lv.choices) expect(CHOICES[c.id]).toBeDefined();
  });

  it('dalla partenza si raggiunge ogni cosa, e il cancello chiuso isola l’arena', () => {
    const lv = level();
    const targets = [...lv.bonfires, ...lv.chests, ...lv.choices, ...lv.enemies, lv.boss!];
    for (const t of targets) expect(reachable(lv, lv.start, t)).toBe(true);
    setGate(lv, true);
    expect(reachable(lv, lv.start, lv.boss!)).toBe(false);
    setGate(lv, false);
    expect(reachable(lv, lv.start, lv.boss!)).toBe(true);
  });

  it('nessuna entità nasce dentro un muro', () => {
    const lv = level();
    for (const e of lv.enemies) expect(collides(lv.map, e.x, e.y, ENEMIES[e.type].radius)).toBe(false);
    expect(collides(lv.map, lv.start.x, lv.start.y, 0.3)).toBe(false);
    for (const b of lv.bonfires) expect(collides(lv.map, b.x, b.y - 1, 0.3)).toBe(false); // punto di respawn
  });

  it('entrando dal cancello, quando il boss si sveglia ci si può ancora muovere', () => {
    const lv = level();
    const g = lv.gate[1];
    const r = 0.3;
    // Si cammina dal cancello verso l'arena finché il corpo non è tutto dentro.
    let y = g.ty + 0.5;
    while (!insideArena(lv, g.tx + 0.5, y, r)) y -= 0.05;
    expect(y).toBeLessThan(g.ty - r);
    setGate(lv, true);
    expect(collides(lv.map, g.tx + 0.5, y, r)).toBe(false);
    const pos = { x: g.tx + 0.5, y };
    moveWithCollision(lv.map, pos, 0, -0.5, r);
    expect(pos.y).toBeCloseTo(y - 0.5);
  });

  it('l’arena è riconosciuta', () => {
    const lv = level();
    expect(lv.arena.has(tileIndex(lv, lv.boss!.x, lv.boss!.y))).toBe(true);
    expect(lv.arena.has(tileIndex(lv, lv.start.x, lv.start.y))).toBe(false);
  });
});

describe('scelte morali', () => {
  it('ogni scelta ha una via della Luce e una dell’Oscurità', () => {
    for (const c of Object.values(CHOICES)) {
      expect(c.options.map((o) => o.side).sort()).toEqual(['dark', 'light']);
      for (const o of c.options) if (o.item) expect(ITEMS[o.item]).toBeDefined();
    }
  });

  it('la prima area apre solo il livello I dell’albero, qualunque via si scelga', () => {
    const t = TALENT_CONFIG.tierThreshold;
    for (const side of ['light', 'dark'] as const) {
      const total = Object.values(CHOICES).reduce((s, c) => s + c.options.find((o) => o.side === side)!.points, 0);
      expect(total).toBeGreaterThanOrEqual(t[1]);
      expect(total).toBeLessThan(t[2]);
      // Gli oggetti a soglia sono per le aree successive: qui non bastano i punti.
      const gated = Object.values(ITEMS).filter((i) => i.requires?.side === side);
      for (const i of gated) expect(total).toBeLessThan(i.requires!.earned);
    }
  });

  it('la prima area dà pochi oggetti', () => {
    const lv = level();
    const fromChoices = Object.values(CHOICES).flatMap((c) => c.options.filter((o) => o.item));
    expect(lv.chests.length + fromChoices.length + 1).toBeLessThanOrEqual(2); // +1: il bottino del boss
  });

  it('livello atteso: circa 2 a fine area, 3 dopo il boss', () => {
    const xpArea = level().enemies.reduce((s, e) => s + ENEMIES[e.type].xp, 0);
    const p = new Player(0, 0);
    p.gainXp(xpArea);
    expect(p.level).toBe(2);
    p.gainXp(CUSTODE.xp);
    expect(p.level).toBe(3);
  });
});

describe('equipaggiamento', () => {
  it('gli oggetti cambiano le statistiche', () => {
    const p = new Player(5, 5);
    const dmg = p.attackDamage;
    p.addItem('spada_lunga');
    expect(p.equip('spada_lunga')).toBe(true);
    expect(p.attackDamage).toBe(dmg + 5);
    p.addItem('cotta_di_maglia');
    p.equip('cotta_di_maglia');
    expect(p.defense).toBe(3);
    expect(p.maxHp).toBe(110);
    p.unequip('arma');
    expect(p.attackDamage).toBe(dmg);
  });

  it('non si equipaggia ciò che non si possiede', () => {
    const p = new Player(5, 5);
    expect(p.equip('spada_lunga')).toBe(false);
  });

  it('gli oggetti a soglia richiedono allineamento guadagnato, anche se speso', () => {
    const p = new Player(5, 5);
    p.addItem('armatura_lucente');
    const c = p.canEquip('armatura_lucente');
    expect(c.ok).toBe(false);
    const need = ITEMS.armatura_lucente.requires!.earned;
    p.alignment.gain('light', need);
    p.learnTalent('pal_fede');
    p.learnTalent('pal_martello');
    expect(p.alignment.balance('light')).toBe(need - 2);
    expect(p.equip('armatura_lucente')).toBe(true);
    expect(p.modifiers.hpRegen).toBe(0.5);
  });

  it('uno slot alla volta: equipaggiare sostituisce', () => {
    const p = new Player(5, 5);
    p.addItem('rosario_del_pellegrino');
    p.addItem('amuleto_strappato');
    p.equip('rosario_del_pellegrino');
    p.equip('amuleto_strappato');
    expect(p.equipped.amuleto).toBe('amuleto_strappato');
    expect(p.isEquipped('rosario_del_pellegrino')).toBe(false);
  });
});

describe('arciere e proiettili', () => {
  const map = createTestMap();

  it('l’arciere tira un proiettile da lontano', () => {
    const e = new Enemy(ENEMIES.arciere, 5, 11);
    const target = { x: 5, y: 5.5, radius: 0.3, state: 'idle' };
    let ev: AttackEvent | null = null;
    for (let i = 0; i < 600 && !ev; i++) ev = e.update(1 / 60, target, map);
    expect(ev?.projectile).toBeDefined();
    expect(Math.hypot(e.x - target.x, e.y - target.y)).toBeGreaterThan(3);
  });

  it('l’arciere indietreggia se gli si sta addosso', () => {
    const e = new Enemy(ENEMIES.arciere, 5, 7);
    const target = { x: 5, y: 6, radius: 0.3, state: 'idle' };
    for (let i = 0; i < 30; i++) e.update(1 / 60, target, map);
    expect(e.y).toBeGreaterThan(7);
  });

  it('il proiettile vola, colpisce e si ferma sui muri', () => {
    const [pr] = spawnProjectiles({ x: 3, y: 3, angle: 0, range: 10, halfArc: 0, damage: 10, projectile: { speed: 10 } });
    expect(stepProjectile(pr, 0.1, map)).toBe(true);
    expect(projectileHits(pr, pr.x + 0.3, pr.y, 0.3)).toBe(true);
    expect(projectileHits(pr, pr.x, pr.y + 2, 0.3)).toBe(false);
    // A fine gittata sparisce...
    let alive = true;
    for (let i = 0; i < 100 && alive; i++) alive = stepProjectile(pr, 0.05, map);
    expect(alive).toBe(false);
    expect(pr.x).toBeCloseTo(13, 0);
    // ...e un muro lo ferma prima: il pilastro nel tile (8, 8).
    const [wallShot] = spawnProjectiles({ x: 5, y: 8.5, angle: 0, range: 20, halfArc: 0, damage: 10, projectile: { speed: 10 } });
    alive = true;
    for (let i = 0; i < 100 && alive; i++) alive = stepProjectile(wallShot, 0.02, map);
    expect(wallShot.x).toBeGreaterThan(8);
    expect(wallShot.x).toBeLessThan(8.3);
  });

  it('un anello di proiettili si apre in tutte le direzioni', () => {
    const ring = spawnProjectiles({ x: 5, y: 5, angle: 0, range: 6, halfArc: 0, damage: 5, projectile: { speed: 6, count: 8 } });
    expect(ring).toHaveLength(8);
    const angles = ring.map((p) => Math.atan2(p.vy, p.vx));
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(8);
  });
});

describe('boss', () => {
  const map = createTestMap();
  const near = { x: 5, y: 6, radius: 0.3, state: 'idle' };
  const tick = (b: Boss, seconds: number, target = near) => {
    const events: AttackEvent[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      const ev = b.update(1 / 60, target, map);
      if (ev) events.push(ev);
    }
    return events;
  };

  it('dorme finché non viene svegliato e intanto non subisce danni', () => {
    const b = new Boss(CUSTODE, 5, 8);
    expect(tick(b, 1)).toHaveLength(0);
    b.takeDamage(100, 0);
    expect(b.hp).toBe(CUSTODE.maxHp);
    b.wake();
    expect(b.awake).toBe(true);
  });

  it('da vicino attacca in mischia, da lontano carica', () => {
    const close = new Boss(CUSTODE, 5, 7.5, () => 0);
    close.wake();
    tick(close, 0.05);
    expect(['fendente', 'doppio', 'schianto']).toContain(close.current?.id);

    const far = new Boss(CUSTODE, 5, 13, () => 0);
    far.wake();
    tick(far, 0.05, { ...near, y: 7 });
    expect(far.current?.id).toBe('carica');
  });

  it('la combo doppia colpisce due volte e il colpo raggiunge il giocatore', () => {
    const b = new Boss(CUSTODE, 5, 7.6, () => 0.6); // 4,2 su 7: dopo 'fendente' (3) viene 'doppio'
    b.wake();
    const events = tick(b, 2.5);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(hitsArc(events[0], near.x, near.y, near.radius)).toBe(true);
  });

  it('a metà vita ruggisce, è invulnerabile e passa alla seconda fase', () => {
    const b = new Boss(CUSTODE, 5, 8);
    b.wake();
    b.takeDamage(CUSTODE.maxHp * 0.55, 0);
    expect(b.state).toBe('transition');
    expect(b.phaseIndex).toBe(1);
    const hp = b.hp;
    b.takeDamage(100, 0);
    expect(b.hp).toBe(hp);
    const [wave] = tick(b, CUSTODE.transition.duration + 0.05);
    expect(wave.halfArc).toBe(Math.PI);
    expect(wave.range).toBe(CUSTODE.transition.range);
    expect(b.phase.moves).toContain('onda');
  });

  it('non viene stordito e reset lo riporta all’inizio', () => {
    const b = new Boss(CUSTODE, 5, 8);
    b.wake();
    b.takeDamage(50, 0, true);
    expect(b.state).not.toBe('stagger');
    b.takeDamage(CUSTODE.maxHp * 0.6, 0);
    b.reset();
    expect(b.hp).toBe(CUSTODE.maxHp);
    expect(b.phaseIndex).toBe(0);
    expect(b.awake).toBe(false);
  });

  it('muore e ha un bottino', () => {
    const b = new Boss(CUSTODE, 5, 8);
    b.wake();
    b.takeDamage(CUSTODE.maxHp * 0.55, 0);
    tick(b, 3);
    b.takeDamage(CUSTODE.maxHp, 0);
    expect(b.dead).toBe(true);
    expect(ITEMS[CUSTODE.drop]).toBeDefined();
  });
});

describe('pathfinding', () => {
  it('aggira un muro invece di incastrarsi', async () => {
    const { parseLevel } = await import('../src/core/level');
    const { findPath } = await import('../src/core/path');
    const { Enemy } = await import('../src/entities/Enemy');
    const { ENEMIES } = await import('../src/data/enemies');
    // Muro a U aperto verso l'alto: il predone è dentro, il bersaglio sotto.
    const level = parseLevel(
      [
        '###########',
        '#.........#',
        '#..#...#..#',
        '#..#...#..#',
        '#..#####..#',
        '#.........#',
        '#.........#',
        '###########',
      ],
      {},
    );
    const map = level.map;
    const path = findPath(map, 5.5, 3.5, 5.5, 6.5);
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 5.5, y: 6.5 });

    const e = new Enemy(ENEMIES.predone, 5.5, 3.5);
    e.state = 'chase';
    const target = { x: 5.5, y: 6.5, radius: 0.3, state: 'idle' };
    let reached = false;
    for (let i = 0; i < 60 * 8 && !reached; i++) {
      e.update(1 / 60, target, map);
      reached = (e.state as string) === 'windup';
    }
    expect(reached).toBe(true);
  });

  it('non trova percorsi verso zone chiuse', async () => {
    const { parseLevel } = await import('../src/core/level');
    const { findPath } = await import('../src/core/path');
    const level = parseLevel(['#####', '#.#.#', '#####'], {});
    expect(findPath(level.map, 1.5, 1.5, 3.5, 1.5)).toBeNull();
  });
});
