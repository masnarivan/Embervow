import { describe, expect, it } from 'vitest';
import { angleDiff, isBackstab, type AttackEvent } from '../src/combat/damage';
import { spawnProjectiles } from '../src/combat/projectiles';
import { createTestMap } from '../src/core/map';
import { ROGUE, WARRIOR } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { SKILLS } from '../src/data/skills';
import { TALENT_CONFIG } from '../src/data/talents';
import { Enemy } from '../src/entities/Enemy';
import { Player, type PlayerInput } from '../src/entities/Player';

const idle: PlayerInput = { moveX: 0, moveY: 0, aimAngle: 0, attack: false, dodge: false, skill: null };
const use = (index: number): PlayerInput => ({ ...idle, skill: index });
const map = createTestMap();
const T = TALENT_CONFIG.tierThreshold;

function run(p: Player, seconds: number): AttackEvent[] {
  const events: AttackEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 120) {
    const ev = p.update(1 / 120, idle, map);
    if (ev) events.push(ev);
  }
  return events;
}

function attack(p: Player): AttackEvent {
  p.update(0.01, { ...idle, attack: true }, map);
  return run(p, 0.6)[0];
}

describe('colpo alle spalle', () => {
  it('conta solo se il colpo viaggia nel verso in cui guarda il bersaglio', () => {
    expect(isBackstab(0, 0)).toBe(true); // da dietro
    expect(isBackstab(0, 0.9)).toBe(true);
    expect(isBackstab(0, Math.PI)).toBe(false); // di fronte
    expect(isBackstab(0, Math.PI / 2)).toBe(false); // di fianco
  });

  it('solo l’Assassino lo porta nei suoi colpi; il talento lo aumenta', () => {
    expect(attack(new Player(5, 5, WARRIOR)).backstab).toBeUndefined();
    const p = new Player(5, 5, ROGUE);
    const ev = attack(p);
    expect(ev.damage).toBe(ROGUE.base.damage);
    expect(ev.backstab).toBeCloseTo(1.5);
    p.alignment.gain('dark', T[2]);
    p.learnTalent('sic_veleno');
    p.learnTalent('sic_spalle');
    expect(attack(p).backstab).toBeCloseTo(2);
  });
});

describe('assassino', () => {
  it('lo slancio sale colpendo e cala presto fuori dal combattimento', () => {
    const p = new Player(5, 5, ROGUE);
    expect(p.rage).toBe(0);
    p.onHitLanded(10);
    expect(p.rage).toBe(ROGUE.rage.onHit);
    run(p, ROGUE.rage.decayDelay + 2);
    expect(p.rage).toBe(0);
  });

  it('Ventaglio di Lame: cinque coltelli aperti davanti, nessuno alle spalle', () => {
    const p = new Player(5, 5, ROGUE);
    p.rage = 100;
    p.update(0.01, use(1), map);
    const [ev] = run(p, 1);
    const shots = spawnProjectiles(ev);
    expect(shots).toHaveLength(5);
    const angles = shots.map((s) => Math.atan2(s.vy, s.vx));
    for (const a of angles) expect(Math.abs(angleDiff(a, 0))).toBeLessThanOrEqual(ev.projectile!.spread! / 2 + 1e-9);
    expect(angles[0]).toBeCloseTo(-ev.projectile!.spread! / 2);
    expect(angles[2]).toBeCloseTo(0);
    expect(shots[0].backstab).toBeCloseTo(1.5);
  });

  it('Passo Furtivo: intoccabile mentre attraversa', () => {
    const p = new Player(5, 5, ROGUE);
    p.update(0.01, use(2), map);
    p.update(SKILLS.passo_furtivo.windup + 0.02, idle, map);
    expect(p.invulnerable).toBe(true);
    run(p, 0.6);
    expect(p.x).toBeGreaterThan(7.5);
    expect(p.invulnerable).toBe(false);
  });

  it('Velo d’Ombra: i nemici non ti vedono; il primo colpo è potenziato e ti rivela', () => {
    const p = new Player(5, 5, ROGUE);
    const e = new Enemy(ENEMIES.predone, 8, 5);
    e.update(0.1, p, map);
    expect(e.state).toBe('chase');

    p.update(0.01, use(3), map);
    run(p, 0.5);
    expect(p.hidden).toBe(true);
    expect(p.buffed).toBe(false); // nessun alone da potenziamento
    e.update(0.1, p, map);
    expect(e.state).toBe('idle');
    e.update(0.1, p, map);
    expect(e.state).toBe('idle'); // e non si riaccorge di lui

    const ev = attack(p);
    expect(ev.damage).toBe(Math.round(ROGUE.base.damage * 1.5));
    expect(p.hidden).toBe(false);
    expect(attack(p).damage).toBe(ROGUE.base.damage);
    e.update(0.1, p, map);
    expect(e.state).toBe('chase');
  });

  it('la furtività finisce da sola e si rompe se vieni ferito', () => {
    const p = new Player(5, 5, ROGUE);
    p.update(0.01, use(3), map);
    run(p, 0.5);
    p.takeDamage(5, 0);
    expect(p.hidden).toBe(false);

    const q = new Player(5, 5, ROGUE);
    q.update(0.01, use(3), map);
    run(q, 4.5);
    expect(q.hidden).toBe(false);
    expect(attack(q).damage).toBe(ROGUE.base.damage);
  });

  it('Sicario: Lame Avvelenate e Morso della Vipera sommano il veleno', () => {
    const p = new Player(5, 5, ROGUE);
    p.alignment.gain('dark', T[1]);
    p.learnTalent('sic_veleno');
    const ev = attack(p);
    expect(ev.poison?.damage).toBeCloseTo(ROGUE.base.damage * 0.3);
    expect(ev.poison?.duration).toBe(4);

    p.alignment.gain('dark', 1);
    p.learnTalent('sic_vipera');
    p.update(0.01, use(0), map);
    const [stab] = run(p, 1);
    expect(stab.poison?.damage).toBeCloseTo(ROGUE.base.damage * 2 + stab.damage * 0.3);
    expect(stab.poison?.duration).toBe(5);
  });

  it('Duellante: la Guardia sostituisce la furtività', () => {
    const p = new Player(5, 5, ROGUE);
    p.alignment.gain('light', T[2]);
    p.learnTalent('due_affondo');
    p.learnTalent('due_guardia');
    p.update(0.01, use(3), map);
    run(p, 0.5);
    expect(p.hidden).toBe(false);
    expect(p.buffed).toBe(true);
    expect(p.attackDamage).toBe(Math.round(ROGUE.base.damage * 1.25));
    expect(p.takeDamage(40, 0)).toBe(20);
  });
});

describe('veleno sui nemici', () => {
  it('toglie vita senza stordire, e può uccidere', () => {
    const e = new Enemy(ENEMIES.predone, 8, 5);
    e.erode(10);
    expect(e.hp).toBe(ENEMIES.predone.maxHp - 10);
    expect(e.state).toBe('idle');
    e.erode(1000);
    expect(e.dead).toBe(true);
  });
});
