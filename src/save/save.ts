import type { WorldState } from '../core/world';
import type { PlayerSave } from '../entities/Player';

/** Versione del formato: va alzata (con una migrazione) a ogni modifica incompatibile. */
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: number;
  player: PlayerSave;
  world: WorldState;
  lostXp: { x: number; y: number; amount: number } | null;
}

export function makeSave(player: PlayerSave, world: WorldState, lostXp: SaveData['lostXp']): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    player,
    world: { ...world, choices: { ...world.choices }, openedChests: [...world.openedChests] },
    lostXp: lostXp ? { ...lostXp } : null,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isSides = (v: unknown) => isObj(v) && isNum(v.light) && isNum(v.dark);

/**
 * Valida (e in futuro migra) dati letti dallo storage. Ritorna null se
 * mancanti, corrotti o di una versione sconosciuta: meglio una partita nuova
 * che un crash.
 */
export function parseSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || raw.version !== SAVE_VERSION) return null;
  const p = raw.player;
  const w = raw.world;
  if (!isObj(p) || !isObj(w)) return null;
  if (!isNum(p.level) || !isNum(p.xp) || !isStrArr(p.talents) || !isStrArr(p.inventory) || !isObj(p.equipped)) return null;
  if (p.keyItems !== undefined && !isStrArr(p.keyItems)) return null;
  if (p.cls !== undefined && typeof p.cls !== 'string') return null;
  if (!isObj(p.alignment) || !isSides(p.alignment.earned) || !isSides(p.alignment.spent)) return null;
  if (!isObj(w.choices) || !isStrArr(w.openedChests) || typeof w.bossDefeated !== 'boolean' || !isNum(w.lastBonfire)) {
    return null;
  }
  const l = raw.lostXp;
  if (l !== null && !(isObj(l) && isNum(l.x) && isNum(l.y) && isNum(l.amount))) return null;
  return raw as unknown as SaveData;
}

// ---------- Storage ----------

export interface SaveStore {
  load(): Promise<unknown>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}

// Nome storico (titolo di lavoro): cambiarlo farebbe perdere i salvataggi esistenti.
const DB_NAME = 'luce-e-ombra';
const STORE = 'saves';
const KEY = 'slot1';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

class IndexedDbStore implements SaveStore {
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db).transaction(STORE, mode).objectStore(STORE);
  }

  async load(): Promise<unknown> {
    return (await request((await this.store('readonly')).get(KEY))) ?? null;
  }

  async save(data: SaveData): Promise<void> {
    await request((await this.store('readwrite')).put(data, KEY));
  }

  async clear(): Promise<void> {
    await request((await this.store('readwrite')).delete(KEY));
  }
}

class LocalStorageStore implements SaveStore {
  async load(): Promise<unknown> {
    const s = localStorage.getItem(`${DB_NAME}:${KEY}`);
    return s ? JSON.parse(s) : null;
  }

  async save(data: SaveData): Promise<void> {
    localStorage.setItem(`${DB_NAME}:${KEY}`, JSON.stringify(data));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(`${DB_NAME}:${KEY}`);
  }
}

/** Storage in memoria: per i test e se il browser blocca ogni altro storage. */
export class MemoryStore implements SaveStore {
  data: SaveData | null = null;
  async load(): Promise<unknown> {
    return this.data ? structuredClone(this.data) : null;
  }
  async save(data: SaveData): Promise<void> {
    this.data = structuredClone(data);
  }
  async clear(): Promise<void> {
    this.data = null;
  }
}

/** Prova IndexedDB, poi localStorage, poi la memoria. */
class FallbackStore implements SaveStore {
  private stores: SaveStore[];

  constructor() {
    this.stores = [];
    try {
      if (typeof indexedDB !== 'undefined') this.stores.push(new IndexedDbStore());
    } catch {
      /* storage bloccato */
    }
    try {
      if (typeof localStorage !== 'undefined') this.stores.push(new LocalStorageStore());
    } catch {
      /* storage bloccato */
    }
    this.stores.push(new MemoryStore());
  }

  private async first<T>(op: (s: SaveStore) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (const s of this.stores) {
      try {
        return await op(s);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  load(): Promise<unknown> {
    return this.first((s) => s.load());
  }
  save(data: SaveData): Promise<void> {
    return this.first((s) => s.save(data));
  }
  clear(): Promise<void> {
    return this.first((s) => s.clear());
  }
}

let store: SaveStore | null = null;

export function saveStore(): SaveStore {
  store ??= new FallbackStore();
  return store;
}

export async function loadGame(s: SaveStore = saveStore()): Promise<SaveData | null> {
  try {
    return parseSave(await s.load());
  } catch {
    return null;
  }
}
