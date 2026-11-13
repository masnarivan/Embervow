import { describe, expect, it } from 'vitest';
import { Alignment } from '../src/alignment/alignment';
import { createTestMap } from '../src/core/map';
import { WARRIOR } from '../src/data/classes';
import { RESPEC_ITEM } from '../src/data/items';
import { SKILLS } from '../src/data/skills';
import { TALENTS, TALENT_CONFIG } from '../src/data/talents';
import { Player, type PlayerInput } from '../src/entities/Player';
import { SkillTree } from '../src/skills/tree';
import { navigate } from '../src/ui/treeNav';

const map = createTestMap();
const T = TALENT_CONFIG.tierThreshold;
const idle: PlayerInput = { moveX: 0, moveY: 0, aimAngle: 0, attack: false, dodge: false, skill: null };
const newTree = () => {
  const a = new Alignment();
  return { a, t: new SkillTree(TALENTS, a, TALENT_CONFIG) };
};
const run = (p: Player, seconds: number, input = idle) => {
  for (let t = 0; t < seconds; t += 1 / 120) p.update(1 / 120, input, map);
};

describe('dati dei talenti', () => {
  it('ogni ramo ha 8 nodi, id unici, prerequisiti e skill esistenti', () => {
    const ids = new Set(TALENTS.map((n) => n.id));
    expect(ids.size).toBe(TALENTS.length);
    for (const side of ['light', 'dark'] as const) {
      expect(TALENTS.filter((n) => n.branch === side)).toHaveLength(8);
    }
    for (const n of TALENTS) {
      for (const r of n.requires) {
        expect(ids.has(r)).toBe(true);
        const req = TALENTS.find((x) => x.id === r)!;
        expect(req.branch).toBe(n.branch);
        expect(req.tier).toBeLessThan(n.tier);
      }
      if (n.replaces) expect(SKILLS[n.replaces.skill]).toBeDefined();
    }
  });

  it('nessuna cella della griglia è occupata due volte', () => {
    const cells = TALENTS.map((n) => `${n.branch}:${n.tier}:${n.col}`);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe('albero dei talenti', () => {
  it('serve la soglia di allineamento guadagnato', () => {
    const { a, t } = newTree();
    a.gain('light', T[1] - 1);
    expect(t.check('pal_fede').ok).toBe(false);
    a.gain('light', 1);
    expect(t.learn('pal_fede')).toBe(true);
    expect(a.balance('light')).toBe(T[1] - 1);
  });

  it('spendere non fa perdere l’accesso ai livelli superiori', () => {
    const { a, t } = newTree();
    a.gain('light', T[2]);
    t.learn('pal_fede');
    t.learn('pal_martello');
    // Il saldo scende sotto la soglia, ma conta il guadagnato: il livello II resta accessibile.
    expect(a.balance('light')).toBe(T[2] - 2);
    expect(t.learn('pal_aura')).toBe(true);
  });

  it('richiede i prerequisiti', () => {
    const { a, t } = newTree();
    a.gain('light', 20);
    const c = t.check('pal_aura');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toContain('Fede Incrollabile');
    t.learn('pal_fede');
    expect(t.check('pal_aura').ok).toBe(true);
  });

  it('il primo talento blocca l’altro ramo finché non si fa il respec', () => {
    const { a, t } = newTree();
    a.gain('light', 5);
    a.gain('dark', 5);
    t.learn('pal_fede');
    expect(t.committedBranch()).toBe('light');
    expect(t.check('ber_sete').ok).toBe(false);
    t.respec();
    expect(a.balance('light')).toBe(5);
    expect(t.committedBranch()).toBeNull();
    expect(t.learn('ber_sete')).toBe(true);
  });

  it('non spende oltre il saldo', () => {
    const { a, t } = newTree();
    a.gain('dark', T[2]);
    a.trySpend('dark', T[2] - 2); // restano 2 punti
    t.learn('ber_sete');
    t.learn('ber_squarcio');
    expect(a.balance('dark')).toBe(0);
    const c = t.check('ber_furia');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toContain('Servono');
  });

  it('i talenti attivi sostituiscono la skill sullo slot', () => {
    const { a, t } = newTree();
    a.gain('dark', 20);
    t.learn('ber_squarcio');
    t.learn('ber_frenesia');
    expect(t.slots(WARRIOR.skills)).toEqual(['squarcio', 'turbine', 'carica', 'frenesia']);
  });

  it('i modificatori si combinano', () => {
    const { a, t } = newTree();
    a.gain('light', 20);
    t.learn('pal_fede');
    t.learn('pal_aura');
    t.learn('pal_baluardo');
    const m = t.modifiers();
    expect(m.maxHpMult).toBeCloseTo(1.15);
    expect(m.hpRegen).toBe(1.5);
    expect(m.damageTakenMult).toBeCloseTo(0.85);
    expect(m.cheatDeath).toBe(false);
  });
});

describe('talenti sul giocatore', () => {
  const learnAll = (p: Player, side: 'light' | 'dark', ids: string[]) => {
    p.alignment.gain(side, 30);
    for (const id of ids) expect(p.learnTalent(id)).toBe(true);
  };

  it('Fede Incrollabile alza vita massima e attuale', () => {
    const p = new Player(5, 5);
    learnAll(p, 'light', ['pal_fede']);
    expect(p.maxHp).toBe(Math.round(WARRIOR.base.maxHp * 1.15));
    expect(p.hp).toBe(p.maxHp);
    expect(p.respec()).toBe(false); // senza l'Acqua del Lete la via è definitiva
    expect(p.maxHp).toBe(Math.round(WARRIOR.base.maxHp * 1.15));
    p.addKeyItem(RESPEC_ITEM);
    expect(p.respec()).toBe(true);
    expect(p.maxHp).toBe(WARRIOR.base.maxHp);
    expect(p.hp).toBe(WARRIOR.base.maxHp);
  });

  it('Baluardo riduce i danni subiti', () => {
    const p = new Player(5, 5);
    learnAll(p, 'light', ['pal_fede', 'pal_baluardo']);
    expect(p.takeDamage(40, 0)).toBe(34);
  });

  it('Ultima Luce salva una volta per riposo', () => {
    const p = new Player(5, 5);
    learnAll(p, 'light', ['pal_fede', 'pal_aura', 'pal_martire']);
    p.takeDamage(999, 0);
    expect(p.state).toBe('stagger');
    expect(p.hp).toBe(Math.round(p.maxHp * 0.3));
    expect(p.consumeLastStand()).toBe(true);
    expect(p.consumeLastStand()).toBe(false);
    run(p, 0.5);
    p.takeDamage(999, 0);
    expect(p.state).toBe('dead');
    p.reset(5, 5);
    p.takeDamage(999, 0);
    expect(p.state).toBe('stagger');
  });

  it('Martello Sacro sostituisce Colpo Poderoso e cura col danno', () => {
    const p = new Player(5, 5);
    learnAll(p, 'light', ['pal_martello']);
    expect(p.skills[0].id).toBe('martello_sacro');
    p.hp = 50;
    p.update(0.01, { ...idle, skill: 0 }, map);
    let ev = null;
    for (let i = 0; i < 120 && !ev; i++) ev = p.update(1 / 120, idle, map);
    expect(ev?.lifesteal).toBe(0.3);
    p.onHitLanded(ev!.damage, ev!.lifesteal);
    expect(p.hp).toBeCloseTo(50 + ev!.damage * 0.3);
    expect(p.takeHealText()).toBe(Math.round(ev!.damage * 0.3));
  });

  it('Scudo di Luce cura e riduce i danni per la durata', () => {
    const p = new Player(5, 5);
    learnAll(p, 'light', ['pal_martello', 'pal_scudo']);
    p.hp = 50;
    p.rage = 20;
    p.update(0.01, { ...idle, skill: 3 }, map);
    run(p, 0.5);
    expect(p.hp).toBeCloseTo(50 + WARRIOR.base.maxHp * 0.15);
    expect(p.takeDamage(50, 0)).toBe(30);
  });

  it('Furia Cieca: più danni con meno vita', () => {
    const p = new Player(5, 5);
    learnAll(p, 'dark', ['ber_sete', 'ber_furia']);
    expect(p.attackDamage).toBe(WARRIOR.base.damage);
    p.hp = p.maxHp / 2;
    expect(p.attackDamage).toBe(Math.round(WARRIOR.base.damage * 1.25));
  });

  it('Sete di Battaglia e Sangue per Sangue', () => {
    const p = new Player(5, 5);
    learnAll(p, 'dark', ['ber_sete', 'ber_vampiro']);
    p.hp = 50;
    p.onHitLanded(40);
    expect(p.rage).toBe(WARRIOR.rage.onHit * 1.5);
    expect(p.hp).toBeCloseTo(54);
  });

  it('Indomito: attacco base gratis con rabbia alta', () => {
    const p = new Player(5, 5);
    learnAll(p, 'dark', ['ber_sete', 'ber_furia', 'ber_indomito']);
    p.rage = 80;
    p.update(0.01, { ...idle, attack: true }, map);
    expect(p.state).toBe('attack');
    expect(p.stamina.current).toBe(p.stamina.max);
  });

  it('Frenesia: più danni ma più danni subiti', () => {
    const p = new Player(5, 5);
    learnAll(p, 'dark', ['ber_squarcio', 'ber_frenesia']);
    p.rage = 20;
    p.update(0.01, { ...idle, skill: 3 }, map);
    run(p, 0.5);
    expect(p.attackDamage).toBe(Math.round(WARRIOR.base.damage * 1.6));
    expect(p.takeDamage(20, 0)).toBe(26);
  });

  it('Vortice d’Acciaio colpisce due volte', () => {
    const p = new Player(5, 5);
    learnAll(p, 'dark', ['ber_sete', 'ber_vampiro', 'ber_vortice']);
    p.rage = 30;
    p.update(0.01, { ...idle, skill: 1 }, map);
    let hits = 0;
    for (let i = 0; i < 240; i++) if (p.update(1 / 120, idle, map)) hits++;
    expect(hits).toBe(2);
  });
});

describe('navigazione dell’albero', () => {
  const g = (gx: number, gy: number) => ({ gx, gy });
  // Come nei dati: riga 0 con le colonne 0 e 2, righe 1–2 piene; secondo ramo da gx 3.
  const nodes = [g(0, 0), g(2, 0), g(0, 1), g(1, 1), g(2, 1), g(3, 0), g(5, 0)];

  it('si muove nella direzione e preferisce la stessa riga', () => {
    expect(navigate(nodes, nodes[0], 1, 0)).toBe(nodes[1]);
    expect(navigate(nodes, nodes[1], 1, 0)).toBe(nodes[5]);
    expect(navigate(nodes, nodes[0], 0, 1)).toBe(nodes[2]);
  });

  it('salta i buchi e resta fermo ai bordi', () => {
    expect(navigate(nodes, nodes[3], 0, -1)).not.toBe(nodes[3]);
    expect(navigate(nodes, nodes[0], -1, 0)).toBe(nodes[0]);
    expect(navigate(nodes, nodes[0], 0, -1)).toBe(nodes[0]);
  });
});
