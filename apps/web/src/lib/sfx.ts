import { ref, watch } from 'vue';
/**
 * Draft sound effects, synthesized with Web Audio so we ship no audio files.
 * Browsers only allow audio after a user gesture, so the context is created/resumed on first pointer or key press.
 */
const read = () => { try { const v = localStorage.getItem('sfx-volume'); return v === null ? 0.6 : Math.min(1, Math.max(0, Number(v))); } catch { return 0.6; } };
export const volume = ref(read());
watch(volume, (v) => { try { localStorage.setItem('sfx-volume', String(v)); } catch { /* storage unavailable */ } });

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function unlock() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
if (typeof window !== 'undefined') for (const e of ['pointerdown', 'keydown']) window.addEventListener(e, unlock, { passive: true });

function ready() { if (!ctx || !master || ctx.state !== 'running' || volume.value === 0) return null; master.gain.value = volume.value * 0.5; return ctx; }

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.4, slideTo?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!); o.start(at); o.stop(at + dur + 0.05);
}
function noise(c: AudioContext, at: number, dur: number, from: number, to: number, peak = 0.3) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!); src.start(at);
}

export const sfx = {
  /** Rising whoosh into a bright major stab. */
  pick() {
    const c = ready(); if (!c) return; const t = c.currentTime;
    noise(c, t, 0.35, 400, 4000, 0.25);
    for (const [i, f] of [523.25, 659.25, 783.99].entries()) tone(c, f, t + 0.22 + i * 0.03, 0.6, 'triangle', 0.22);
    tone(c, 130.81, t + 0.22, 0.5, 'sine', 0.35);
  },
  /** Heavy downward thud with a gritty hit. */
  ban() {
    const c = ready(); if (!c) return; const t = c.currentTime;
    tone(c, 180, t, 0.45, 'sawtooth', 0.25, 45);
    tone(c, 90, t, 0.5, 'sine', 0.5, 40);
    noise(c, t, 0.25, 2500, 300, 0.3);
  },
  /** Short click for the final seconds of a turn. */
  tick(urgent = false) { const c = ready(); if (!c) return; tone(c, urgent ? 1320 : 990, c.currentTime, 0.07, 'square', 0.12); },
  /** Two-note chime when it becomes your turn. */
  turn() { const c = ready(); if (!c) return; const t = c.currentTime; tone(c, 880, t, 0.25, 'sine', 0.3); tone(c, 1318.5, t + 0.12, 0.4, 'sine', 0.3); },
  /** Small fanfare when the draft completes. */
  complete() {
    const c = ready(); if (!c) return; const t = c.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.09, i === 4 ? 0.9 : 0.25, 'triangle', 0.22));
    noise(c, t + 0.36, 0.8, 6000, 2000, 0.08);
  },
};

/** Hero voicelines (from the Deadlock assets API). One plays at a time, a new line cuts off the previous one. */
let voice: HTMLAudioElement | null = null;
export function playVoice(lines: string[] | undefined, delayMs = 250) {
  if (!lines?.length || volume.value === 0) return;
  const url = lines[Math.floor(Math.random() * lines.length)];
  setTimeout(() => {
    voice?.pause();
    voice = new Audio(url); voice.volume = Math.min(1, volume.value * 1.2);
    void voice.play().catch(() => { /* autoplay blocked until the user interacts */ });
  }, delayMs);
}

/** Loud on purpose: the player may be waiting in another window. */
export function matchFound() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  [0, 0.18, 0.36, 0.7, 0.88, 1.06].forEach((at, i) => tone(c, i % 3 === 2 ? 1046 : 784, t + at, 0.16, 'triangle', 0.6));
}
