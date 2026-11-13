import { describe, expect, it } from 'vitest';
import { createTestMap, hasLineOfSight } from '../src/core/map';
import { newWorld } from '../src/core/world';
import { ENEMIES } from '../src/data/enemies';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { MemoryStore, SAVE_VERSION, loadGame, makeSave, parseSave } from '../src/save/save';

/** Un giocatore a metà partita: livello, talenti, oggetti, allineamento. */
function midGame(): Player {
  const p = new Player(5, 5);
  p.gainXp(250);
  p.alignment.gain('light', 8);
  p.alignment.gain('dark', 4);
  p.learnTalent('pal_fede');
  p.learnTalent('pal_martello');
  p.addItem('spada_lunga');
  p.addItem('armatura_lucente');
  p.addItem('amuleto_strappato');
  p.equip('spada_lunga');
  p.equip('armatura_lucente');
  return p;
}

describe('salvataggio', () => {
  it('salva e ripristina tutti i progressi del giocatore', async () => {
    const p = midGame();
    const world = newWorld();
    world.choices['1'] = 'light';
    world.openedChests.push('S@24,31');
    world.lastBonfire = 1;
    const store = new MemoryStore();
    await store.save(makeSave(p.snapshot(), world, { x: 3, y: 4, amount: 20 }));

    const data = await loadGame(store);
    expect(data).not.toBeNull();
    const q = new Player(0, 0);
    q.restore(data!.player);
    expect(q.level).toBe(p.level);
    expect(q.xp).toBe(p.xp);
    expect(q.alignment.toJSON()).toEqual(p.alignment.toJSON());
    expect(q.tree.toJSON()).toEqual(p.tree.toJSON());
    expect(q.skills.map((s) => s.id)).toEqual(p.skills.map((s) => s.id));
    expect(q.inventory).toEqual(p.inventory);
    expect(q.equipped).toEqual(p.equipped);
    expect(q.maxHp).toBe(p.maxHp);
    expect(q.attackDamage).toBe(p.attackDamage);
    expect(q.hp).toBe(q.maxHp);
    expect(data!.world).toEqual(world);
    expect(data!.lostXp).toEqual({ x: 3, y: 4, amount: 20 });
  });

  it('salva gli oggetti chiave; i salvataggi vecchi senza il campo restano validi', () => {
    const p = midGame();
    p.addKeyItem('acqua_del_lete');
    const snap = p.snapshot();
    const q = new Player(0, 0);
    q.restore(snap);
    expect(q.canRespec().ok).toBe(true);

    const { keyItems: _omit, ...old } = snap;
    expect(parseSave(makeSave(old, newWorld(), null))).not.toBeNull();
    const r = new Player(0, 0);
    r.restore(old);
    expect(r.canRespec().ok).toBe(false);
  });

  it('il salvataggio è una copia: cambiare il mondo dopo non lo altera', () => {
    const world = newWorld();
    const s = makeSave(new Player(0, 0).snapshot(), world, null);
    world.openedChests.push('x');
    world.choices['2'] = 'dark';
    expect(s.world.openedChests).toEqual([]);
    expect(s.world.choices).toEqual({});
  });

  it('rifiuta dati mancanti, corrotti o di un’altra versione', () => {
    const good = makeSave(new Player(0, 0).snapshot(), newWorld(), null);
    expect(parseSave(good)).not.toBeNull();
    expect(parseSave(null)).toBeNull();
    expect(parseSave('ciao')).toBeNull();
    expect(parseSave({ ...good, version: SAVE_VERSION + 1 })).toBeNull();
    expect(parseSave({ ...good, player: { ...good.player, level: 'tre' } })).toBeNull();
    expect(parseSave({ ...good, world: { ...good.world, openedChests: [1, 2] } })).toBeNull();
    expect(parseSave({ ...good, lostXp: { x: 1 } })).toBeNull();
  });

  it('ignora oggetti e talenti che non esistono più', () => {
    const snap = midGame().snapshot();
    snap.inventory.push('oggetto_rimosso');
    snap.talents.push('talento_rimosso');
    snap.equipped.amuleto = 'oggetto_rimosso';
    const q = new Player(0, 0);
    q.restore(snap);
    expect(q.inventory).not.toContain('oggetto_rimosso');
    expect(q.tree.toJSON()).not.toContain('talento_rimosso');
    expect(q.equipped.amuleto).toBeNull();
  });

  it('senza salvataggio si parte da zero', async () => {
    expect(await loadGame(new MemoryStore())).toBeNull();
  });
});

describe('linea di vista', () => {
  const map = createTestMap();

  it('i muri bloccano la vista', () => {
    expect(hasLineOfSight(map, 5.5, 8.5, 7.5, 8.5)).toBe(true);
    expect(hasLineOfSight(map, 5.5, 8.5, 10.5, 8.5)).toBe(false); // pilastro in (8, 8)
  });

  it('un nemico non si accorge del giocatore dietro un muro', () => {
    const e = new Enemy(ENEMIES.predone, 10.5, 8.5);
    e.update(1 / 60, { x: 6.5, y: 8.5, radius: 0.3, state: 'idle' }, map);
    expect(e.state).toBe('idle');
    e.update(1 / 60, { x: 10.5, y: 5.5, radius: 0.3, state: 'idle' }, map);
    expect(e.state).toBe('chase');
  });
});
