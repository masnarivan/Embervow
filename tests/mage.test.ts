import { describe, expect, it } from 'vitest';
import type { AttackEvent } from '../src/combat/damage';
import { projectileHits, spawnProjectiles, stepProjectile } from '../src/combat/projectiles';
import { createTestMap } from '../src/core/map';
import { newWorld } from '../src/core/world';
import { CLASSES, MAGE, WARRIOR, classById } from '../src/data/classes';
import { SKILLS } from '../src/data/skills';
import { TALENT_CONFIG } from '../src/data/talents';
import { MINION, Minion } from '../src/entities/Minion';
import { Player, type PlayerInput } from '../src/entities/Player';
import { makeSave, parseSave } from '../src/save/save';

const idle: PlayerInput = { moveX: 0, moveY: 0, aimAngle: 0, attack: false, dodge: false, skill: null };
const use = (index: number): PlayerInput => ({ ...idle, skill: index });
const map = createTestMap();
const T = TALENT_CONFIG.tierThreshold;

/** Avanza la simulazione e raccoglie i colpi emessi. */
function run(p: Player, seconds: number): AttackEvent[] {
  const events: AttackEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 120) {
    const ev = p.update(1 / 120, idle, map);
    if (ev) events.push(ev);
  }
  return events;
}

describe('dati delle classi', () => {
  it('ogni classe ha 4 skill di base esistenti e un albero ben formato', () => {
    expect(new Set(CLASSES.map((c) => c.id)).size).toBe(CLASSES.length);
    for (const c of CLASSES) {
      expect(c.skills).toHaveLength(4);
      for (const id of c.skills) expect(SKILLS[id]).toBeDefined();
      const ids = new Set(c.talents.map((n) => n.id));
      expect(ids.size).toBe(c.talents.length);
      const cells = c.talents.map((n) => `${n.branch}:${n.tier}:${n.col}`);
      expect(new Set(cells).size).toBe(cells.length);
      for (const side of ['light', 'dark'] as const) {
        const branch = c.talents.filter((n) => n.branch === side);
        expect(branch).toHaveLength(8);
        // Ogni via potenzia tutti e quattro i tasti, una volta ciascuno.
        expect(branch.flatMap((n) => (n.replaces ? [n.replaces.slot] : [])).sort()).toEqual([0, 1, 2, 3]);
      }
      for (const n of c.talents) {
        for (const r of n.requires) {
          const req = c.talents.find((x) => x.id === r)!;
          expect(req.branch).toBe(n.branch);
          expect(req.tier).toBeLessThan(n.tier);
        }
        if (n.replaces) expect(SKILLS[n.replaces.skill]).toBeDefined();
      }
    }
  });

  it('i talenti delle due classi non condividono id', () => {
    const all = CLASSES.flatMap((c) => c.talents.map((n) => n.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('classById: classe sconosciuta o assente = Guerriero', () => {
    expect(classById('mago')).toBe(MAGE);
    expect(classById(undefined)).toBe(WARRIOR);
    expect(classById('boh')).toBe(WARRIOR);
  });
});

describe('mago', () => {
  it('parte con il mana pieno, che si rigenera da solo', () => {
    const p = new Player(5, 5, MAGE);
    expect(p.rage).toBe(MAGE.rage.max);
    p.update(0.01, use(0), map);
    expect(p.rage).toBeCloseTo(MAGE.rage.max - SKILLS.globo_arcano.cost.rage!, 0);
    const before = p.rage;
    run(p, 2);
    expect(p.rage).toBeCloseTo(before + 2 * MAGE.rage.regenPerSec!, 0);
    p.reset(5, 5);
    expect(p.rage).toBe(MAGE.rage.max);
  });

  it('l’attacco base lancia un dardo invece di un fendente', () => {
    const p = new Player(5, 5, MAGE);
    p.update(0.016, { ...idle, attack: true }, map);
    expect(p.stamina.current).toBe(MAGE.base.stamina - MAGE.attack.cost);
    const [ev, ...rest] = run(p, 1);
    expect(rest).toHaveLength(0);
    expect(ev.projectile?.speed).toBe(MAGE.attack.projectile!.speed);
    expect(ev.damage).toBe(MAGE.base.damage);
    expect(p.swing).toBeNull();
    const [shot] = spawnProjectiles(ev);
    expect(shot.vx).toBeGreaterThan(0);
    // Vola fino a un bersaglio a 4 tile e lo tocca.
    let hit = false;
    for (let t = 0; t < 1 && !hit; t += 1 / 120) {
      if (!stepProjectile(shot, 1 / 120, map)) break;
      hit = projectileHits(shot, 9, 5, 0.3);
    }
    expect(hit).toBe(true);
  });

  it('Traslazione: sposta lontano ed è intoccabile durante il passaggio', () => {
    const p = new Player(5, 5, MAGE);
    p.update(0.01, use(2), map);
    const s = SKILLS.traslazione;
    p.update(s.windup + 0.02, idle, map);
    expect(p.invulnerable).toBe(true);
    expect(p.takeDamage(50, 0)).toBe(0);
    run(p, 1);
    expect(p.x).toBeGreaterThan(8);
    expect(p.invulnerable).toBe(false);
    expect(p.takeDamage(50, 0)).toBe(50);
  });

  it('Elementalista: la Palla di Fuoco esplode, la via del Negromante è preclusa', () => {
    const p = new Player(5, 5, MAGE);
    p.alignment.gain('light', T[1]);
    p.alignment.gain('dark', T[1]);
    expect(p.learnTalent('ele_fuoco')).toBe(true);
    expect(p.skills[0].id).toBe('palla_di_fuoco');
    expect(p.learnTalent('neg_lancia')).toBe(false);
    p.update(0.01, use(0), map);
    const [ev] = run(p, 1);
    expect(ev.projectile?.explode).toBeGreaterThan(1);
    expect(ev.breakPoise).toBe(true);
    expect(spawnProjectiles(ev)[0].explode).toBe(ev.projectile!.explode);
  });

  it('Negromante: la Lancia d’Ossa trapassa, Evoca Spettri chiede due alleati', () => {
    const p = new Player(5, 5, MAGE);
    p.alignment.gain('dark', T[2]);
    p.learnTalent('neg_lancia');
    p.learnTalent('neg_spettri');
    p.update(0.01, use(0), map);
    const [ev] = run(p, 1);
    expect(spawnProjectiles(ev)[0].pierce).toBe(true);
    expect(ev.damage).toBe(Math.round(MAGE.base.damage * 2.4));

    expect(p.takeSummons()).toHaveLength(0);
    p.update(0.01, use(3), map);
    run(p, 1);
    const [req, ...more] = p.takeSummons();
    expect(more).toHaveLength(0);
    expect(req.count).toBe(2);
    expect(p.takeSummons()).toHaveLength(0); // una sola volta
  });

  it('Mietitore d’Anime cura a ogni uccisione', () => {
    const p = new Player(5, 5, MAGE);
    p.alignment.gain('dark', T[2]);
    p.learnTalent('neg_tocco');
    p.learnTalent('neg_mietitore');
    p.hp = 20;
    p.onKill();
    expect(p.hp).toBeCloseTo(20 + p.maxHp * 0.06);
  });

  it('il salvataggio ricorda la classe; quelli vecchi restano Guerriero', () => {
    const p = new Player(5, 5, MAGE);
    p.alignment.gain('dark', T[1]);
    p.learnTalent('neg_tocco');
    const data = parseSave(JSON.parse(JSON.stringify(makeSave(p.snapshot(), newWorld(), null))))!;
    expect(data.player.cls).toBe('mago');
    const q = new Player(0, 0, classById(data.player.cls));
    q.restore(data.player);
    expect(q.cls).toBe(MAGE);
    expect(q.tree.isLearned('neg_tocco')).toBe(true);

    const old = makeSave(new Player(0, 0).snapshot(), newWorld(), null);
    delete old.player.cls;
    expect(classById(parseSave(old)!.player.cls)).toBe(WARRIOR);
  });
});

describe('spettri', () => {
  const dummy = (x: number, y: number) => ({ x, y, radius: 0.3, dead: false });

  it('insegue il nemico più vicino e lo colpisce, poi svanisce', () => {
    const owner = { x: 5, y: 5 };
    const m = new Minion(5, 6, 3, 9);
    const enemy = dummy(8, 6);
    const hits: AttackEvent[] = [];
    for (let t = 0; t < 2.5; t += 1 / 60) {
      const ev = m.update(1 / 60, owner, [enemy], map);
      if (ev) hits.push(ev);
    }
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].damage).toBe(9);
    expect(Math.hypot(enemy.x - m.x, enemy.y - m.y)).toBeLessThanOrEqual(MINION.attackRange + enemy.radius + 0.1);
    expect(m.expired).toBe(false);
    m.update(1, owner, [enemy], map);
    expect(m.expired).toBe(true);
  });

  it('senza nemici resta vicino al padrone e ignora quelli lontani o morti', () => {
    const owner = { x: 5, y: 5 };
    const m = new Minion(5, 6, 10, 9);
    const far = dummy(20, 20);
    const dead = { ...dummy(6, 6), dead: true };
    owner.x = 9;
    for (let t = 0; t < 2; t += 1 / 60) expect(m.update(1 / 60, owner, [far, dead], map)).toBeNull();
    expect(Math.hypot(owner.x - m.x, owner.y - m.y)).toBeLessThanOrEqual(MINION.followDistance + 0.05);
  });
});
