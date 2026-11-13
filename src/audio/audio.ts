// Audio generato al volo con Web Audio: nessun file da scaricare.
// Il browser permette l'audio solo dopo un gesto dell'utente: unlock() va
// chiamato al primo tasto premuto.

export type SfxName =
  | 'swing' | 'skill' | 'hit' | 'hurt' | 'dodge' | 'windup' | 'bossWindup' | 'shoot' | 'roar'
  | 'rest' | 'levelup' | 'chest' | 'death' | 'choice' | 'victory' | 'heal' | 'ui' | 'denied';

export type MusicMode = 'none' | 'explore' | 'boss';

interface Settings {
  music: boolean;
  sfx: boolean;
}

const SETTINGS_KEY = 'luce-e-ombra:audio';

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '');
    return { music: s.music !== false, sfx: s.sfx !== false };
  } catch {
    return { music: true, sfx: true };
  }
}

// La minore naturale: progressione lenta per l'esplorazione.
const EXPLORE_CHORDS = [
  [110, 130.81, 164.81], // La min
  [87.31, 110, 130.81], // Fa
  [98, 123.47, 146.83], // Sol
  [82.41, 103.83, 123.47], // Mi
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private mode: MusicMode = 'none';
  private timer: number | null = null;
  private nextBar = 0;
  private bar = 0;
  private lastPlayed = new Map<SfxName, number>();
  settings: Settings = loadSettings();

  /** Da chiamare a un gesto dell'utente (tasto o click). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.applySettings();
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (this.mode !== 'none') this.startScheduler();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  toggle(kind: keyof Settings): boolean {
    this.settings[kind] = !this.settings[kind];
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* preferenza non salvabile: pazienza */
    }
    this.applySettings();
    return this.settings[kind];
  }

  private applySettings(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx ? 1 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music ? 0.55 : 0, t, 0.3);
  }

  // ---------- Effetti ----------

  play(name: SfxName, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sfx) return;
    // Evita che lo stesso suono si sovrapponga dieci volte nello stesso istante.
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.03) return;
    this.lastPlayed.set(name, now);
    const v = volume;
    switch (name) {
      case 'swing':
        this.noiseBurst(0.14, 'bandpass', 1800, 500, 0.35 * v);
        break;
      case 'skill':
        this.noiseBurst(0.22, 'bandpass', 900, 2600, 0.4 * v);
        this.tone(220, 0.25, 'triangle', 0.15 * v, 330);
        break;
      case 'hit':
        this.tone(140, 0.12, 'square', 0.25 * v, 50);
        this.noiseBurst(0.08, 'lowpass', 2500, 400, 0.35 * v);
        break;
      case 'hurt':
        this.tone(220, 0.25, 'sawtooth', 0.25 * v, 90);
        this.noiseBurst(0.12, 'lowpass', 1200, 200, 0.3 * v);
        break;
      case 'dodge':
        this.noiseBurst(0.22, 'highpass', 600, 2400, 0.18 * v);
        break;
      case 'windup':
        this.tone(660, 0.09, 'sine', 0.08 * v, 880);
        break;
      case 'bossWindup':
        this.tone(90, 0.5, 'sawtooth', 0.18 * v, 140);
        break;
      case 'shoot':
        this.noiseBurst(0.1, 'bandpass', 3000, 1200, 0.2 * v);
        this.tone(900, 0.08, 'triangle', 0.08 * v, 400);
        break;
      case 'roar':
        this.tone(70, 1.4, 'sawtooth', 0.35 * v, 45);
        this.tone(105, 1.2, 'sawtooth', 0.2 * v, 60);
        this.noiseBurst(1.2, 'lowpass', 600, 150, 0.35 * v);
        break;
      case 'rest':
        [392, 523.25, 659.25].forEach((f, i) => this.tone(f, 1.2, 'sine', 0.12 * v, f, i * 0.12));
        break;
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14 * v, f, i * 0.08));
        break;
      case 'chest':
        this.tone(330, 0.15, 'square', 0.08 * v, 330);
        [523.25, 783.99].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12 * v, f, 0.12 + i * 0.1));
        break;
      case 'death':
        [220, 207.65, 164.81, 110].forEach((f, i) => this.tone(f, 0.9, 'sawtooth', 0.12 * v, f * 0.98, i * 0.35));
        break;
      case 'choice':
        this.tone(293.66, 1.4, 'sine', 0.15 * v, 293.66);
        this.tone(440, 1.4, 'sine', 0.1 * v, 440, 0.1);
        break;
      case 'victory':
        [261.63, 329.63, 392, 523.25].forEach((f, i) => this.tone(f, 2.2, 'triangle', 0.13 * v, f, i * 0.18));
        break;
      case 'heal':
        this.tone(660, 0.3, 'sine', 0.08 * v, 990);
        break;
      case 'ui':
        this.tone(880, 0.05, 'sine', 0.08 * v, 880);
        break;
      case 'denied':
        this.tone(180, 0.12, 'square', 0.1 * v, 140);
        break;
    }
  }

  private envelope(g: GainNode, start: number, dur: number, peak: number, attack = 0.005): void {
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, freqEnd = freq, delay = 0, bus = this.sfxBus, attack = 0.005): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    this.envelope(g, t, dur, peak, attack);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, type: BiquadFilterType, from: number, to: number, peak: number, delay = 0, bus = this.sfxBus): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    this.envelope(g, t, dur, peak);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- Musica ----------

  music(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    if (mode === 'none') this.stopScheduler();
    else this.startScheduler();
  }

  private startScheduler(): void {
    if (this.timer !== null) return;
    this.nextBar = this.ctx!.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 200);
  }

  private stopScheduler(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Programma la battuta successiva quando si avvicina. */
  private schedule(): void {
    const ctx = this.ctx!;
    if (this.mode === 'none') return;
    while (this.nextBar < ctx.currentTime + 0.5) {
      const start = this.nextBar - ctx.currentTime;
      if (this.mode === 'explore') {
        const chord = EXPLORE_CHORDS[this.bar % EXPLORE_CHORDS.length];
        const len = 6;
        for (const f of chord) this.pad(f, len + 1.5, start, 0.05);
        // Qualche nota di campana sparsa, sopra l'accordo.
        if (Math.random() < 0.6) {
          const f = chord[Math.floor(Math.random() * chord.length)] * 4;
          this.tone(f, 2.5, 'sine', 0.03, f, start + 1 + Math.random() * 3, this.musicBus, 0.02);
        }
        this.nextBar += len;
      } else {
        const len = 2.4;
        const root = this.bar % 4 === 3 ? 49 : 55;
        this.pad(root, len + 0.3, start, 0.07, 900);
        this.pad(root * 1.5, len + 0.3, start, 0.035, 900);
        // Pulsazione da tamburo: quattro colpi per battuta.
        for (let i = 0; i < 4; i++) {
          this.tone(70, 0.35, 'sine', 0.35, 38, start + i * (len / 4), this.musicBus);
          if (i % 2 === 1) this.noiseBurst(0.1, 'highpass', 4000, 6000, 0.05, start + i * (len / 4), this.musicBus);
        }
        this.nextBar += len;
      }
      this.bar++;
    }
  }

  private pad(freq: number, dur: number, delay: number, peak: number, cutoff = 520): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.musicBus);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

export const audio = new AudioEngine();
