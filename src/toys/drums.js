// Drum Pads: nine glowing rubber pads on a dark console. Finger-drum with several fingers, slide
// across pads for rolls, or start the backing groove and jam along. Each style is a different kit.
import { Toy } from './_base.js';
import * as G from '../gfx.js';
import { midi } from '../audio.js';

const N = 9;
const KINDS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom', 'tomHi', 'rim', 'cowbell'];
const KITS = ['classic', 'chip', 'lofi', 'bubble', 'classic', 'lofi']; // drum voices (styles 4–5: groove only)
const PALETTES = [
  ['#ff2fb3', '#ff8a1f', '#ffd60a', '#7ae82a', '#19d3f0', '#2f7bff', '#a24dff', '#ff4fd8', '#ff5a36'], // classic
  ['#3ddc84', '#29b6f6', '#ffca28', '#ef5350', '#ab47bc', '#9ccc65', '#ff7043', '#26c6da', '#ec407a'], // chiptune
  ['#c8a2c8', '#e5989b', '#b5c99a', '#e9c46a', '#84a59d', '#f4a261', '#9fc5e8', '#cdb4db', '#ffb4a2'], // lo-fi
  ['#4cc9f0', '#ff8fcf', '#72efdd', '#a0c4ff', '#80ffdb', '#ffb3d9', '#64b5f6', '#b8a1ff', '#90e0ef'], // bubble
  ['#ff006e', '#8338ec', '#3a86ff', '#fb5607', '#ff4ecd', '#00f5d4', '#9b5de5', '#f15bb5', '#00bbf9'], // neon synth
  ['#bde0fe', '#cdb4db', '#ffc8dd', '#a2d2ff', '#caffbf', '#fdffb6', '#ffd6a5', '#9bf6ff', '#ffadad'], // glass chimes
];
const BACKGROUNDS = [
  ['#ffd1ec', '#b98bff'],
  ['#dcffe6', '#79cfa0'],
  ['#f6e7f1', '#c3a1c3'],
  ['#d9f6ff', '#78c3e8'],
  ['#4a2380', '#140733'],
  ['#fff3d1', '#e7b75f'],
];
// Console colors: top face gradient, lip (thickness), pad deck, pad wells, trim accent.
const BODIES = [
  { top: '#3a3c4c', bottom: '#24252f', lip: '#15161c', deck: '#1b1c24', well: '#0d0e13', trim: 'rgba(255,255,255,0.14)' },
  { top: '#36423d', bottom: '#202925', lip: '#111714', deck: '#18201c', well: '#0b100d', trim: 'rgba(160,255,200,0.18)' },
  { top: '#5a3d2b', bottom: '#38251a', lip: '#1d130c', deck: '#24201f', well: '#121011', trim: 'rgba(255,220,180,0.16)' },
  { top: '#22345a', bottom: '#141f38', lip: '#0a1020', deck: '#111a2e', well: '#080d18', trim: 'rgba(140,230,255,0.2)' },
  { top: '#1d1430', bottom: '#0e0a19', lip: '#05030a', deck: '#120d1f', well: '#07050d', trim: '#ff4ecd' },
  { top: '#1e2a4a', bottom: '#111a30', lip: '#080c18', deck: '#141d33', well: '#0a0f1c', trim: '#ffd23f' },
];
const RADIUS = [0.2, 0.1, 0.22, 0.32, 0.18, 0.24]; // pad corner radius per style (× pad size)
const BTN_COLORS = ['#ff2fb3', '#2fbf6e', '#b07fb0', '#2fa9d8', '#8338ec', '#e0a82e'];
// Neon synth chords (3 voices each): C, Am, F, G, Em, Dm, and the top row an octave up.
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59], [50, 53, 57], [64, 67, 72], [65, 69, 72], [67, 71, 74]];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91]; // C-major pentatonic bells
const PROGRESSION = [0, 1, 2, 3]; // groove chord pads in neon mode: C – Am – F – G
const BELL_LINE = [0, 2, 4, 2, 3, 1, 4, 2]; // groove bells in glass mode (one per half bar)
const KEYMAP = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, q: 0, w: 1, e: 2, a: 3, s: 4, d: 5, z: 6, x: 7, c: 8 };
const BPM = 92;
const GAP = 0.16, MARGIN = 0.3, STRIP = 0.5, LIP = 0.1; // layout, in pad sizes
const LABEL = { en: 'hits', vi: 'lần gõ', es: 'golpes', pt: 'batidas', fr: 'coups', de: 'Schläge', id: 'ketukan', it: 'colpi', tr: 'vuruş', ru: 'ударов' };
const LABEL_ONE = { en: 'hit', vi: 'lần gõ', es: 'golpe', pt: 'batida', fr: 'coup', de: 'Schlag', id: 'ketukan', it: 'colpo', tr: 'vuruş', ru: 'удар' };
const RU_FEW = 'удара';

/** Picks the singular / plural counter label (Russian has a third "few" form). */
function countLabel(app, n, one, many, ruFew) {
  n = Math.floor(n);
  if (app.lang === 'ru' && n < 10000) {
    const d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return one.ru;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return ruFew;
    return many.ru;
  }
  return app.tr(n === 1 || (n === 0 && app.lang === 'fr') ? one : many);
}

/** Damped spring step, sub-stepped so it stays stable at low frame rates. */
function spring(o, key, vel, target, k, d, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.012));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    o[vel] += ((target - o[key]) * k - o[vel] * d) * h;
    o[key] += o[vel] * h;
  }
}

const _glows = new Map();
/** Soft round light sprite (resolution independent, drawn scaled with 'lighter'). */
function glowSprite(color) {
  let c = _glows.get(color);
  if (c) return c;
  c = G.makeCanvas(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, G.alpha(color, 0.9));
  gr.addColorStop(0.3, G.alpha(color, 0.45));
  gr.addColorStop(0.65, G.alpha(color, 0.12));
  gr.addColorStop(1, G.alpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glows.set(color, c);
  return c;
}

export class DrumsToy extends Toy {
  static id = 'drums';

  constructor(app) {
    super(app);
    this.pads = Array.from({ length: N }, (_, i) => ({ i, x: 0, y: 0, flash: 0, soft: 0, press: 0, pv: 0, held: 0, ripples: [], wave: -1 }));
    this.drags = new Map();
    this.groove = null;
    this.s = 10;
    this.L = null;
    this.layer = null;
    this.sprites = null;
    this.sideGlow = 0;
    this.sideColor = '#ffffff';
    this.beatLed = 0;
    this.activity = 0;
    this.btn = { icon: 'play', color: BTN_COLORS[0], onTap: () => this.toggleGroove() };
    this.buttons = [this.btn];
  }

  enter() {
    this.btn.icon = this.groove ? 'stop' : 'play';
    this.btn.color = BTN_COLORS[this.variant];
    this.sideColor = PALETTES[this.variant][4];
    this.startWave();
  }
  exit() {
    this.stopGroove();
    this.drags.clear();
    for (const p of this.pads) p.held = 0;
    this.layer = null; // free the full-screen cache while the toy is closed
    this.sprites = null;
  }
  setVariant() {
    this.layer = null;
    this.sprites = null;
    this.btn.color = BTN_COLORS[this.variant];
    this.sideColor = PALETTES[this.variant][4];
    this.app.audio.whoosh(0.5);
    this.startWave();
  }

  /** Little light-up sweep across the pads (on open and on kit change). */
  startWave() {
    for (const p of this.pads) p.wave = 0.05 + p.i * 0.045;
  }

  // ---------------------------------------------------------------- layout
  /** Picks the pad grid that gives the biggest pads for this area, then centers the console. */
  resize(area) {
    let best = null;
    for (let cols = 1; cols <= N; cols++) {
      const rows = Math.ceil(N / cols);
      const empty = cols * rows - N;
      if (empty >= cols) continue;
      const kw = cols + (cols - 1) * GAP + 2 * MARGIN;
      const kh = rows + (rows - 1) * GAP + 2 * MARGIN + STRIP + LIP;
      const s = Math.min(area.w / kw, area.h / kh) * 0.97;
      const score = s * (1 - 0.04 * empty) * (cols === 3 && rows === 3 ? 1.04 : 1);
      if (!best || score > best.score) best = { cols, rows, s, kw, kh, score };
    }
    const s = Math.max(4, best.s);
    const gap = s * GAP, M = s * MARGIN;
    const bw = best.kw * s, bh = (best.kh - LIP) * s;
    const bx = area.x + (area.w - bw) / 2;
    const by = area.y + (area.h - (bh + LIP * s)) / 2;
    const gx = bx + M, gy = by + M + STRIP * s;
    const gw = best.cols * s + (best.cols - 1) * gap, gh = best.rows * s + (best.rows - 1) * gap;
    this.s = s;
    this.L = { cols: best.cols, rows: best.rows, gap, M, bx, by, bw, bh, gx, gy, gw, gh };
    for (const p of this.pads) {
      const r = Math.floor(p.i / best.cols), c = p.i % best.cols;
      const inRow = Math.min(best.cols, N - r * best.cols);
      const off = ((best.cols - inRow) * (s + gap)) / 2; // center a short last row
      p.x = gx + off + c * (s + gap);
      p.y = gy + r * (s + gap);
    }
    this.layer = null;
    this.sprites = null;
  }

  padAt(x, y, slop = 0) {
    const s = this.s;
    for (const p of this.pads) {
      if (x >= p.x - slop && x <= p.x + s + slop && y >= p.y - s * 0.07 - slop && y <= p.y + s + slop) return p.i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    const i = this.padAt(p.x, p.y, this.L ? this.L.gap * 0.45 : 0);
    this.drags.set(p.id, { pad: i, x: p.x, y: p.y });
    if (i >= 0) {
      this.pads[i].held++;
      this.hit(i);
    }
  }
  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    // walk the segment so a fast swipe still plays every pad it crosses, in order
    const n = Math.max(1, Math.ceil(G.dist(d.x, d.y, p.x, p.y) / Math.max(4, this.s * 0.2)));
    for (let k = 1; k <= n; k++) this.slideTo(d, this.padAt(G.lerp(d.x, p.x, k / n), G.lerp(d.y, p.y, k / n)));
    d.x = p.x;
    d.y = p.y;
  }
  slideTo(d, i) {
    if (i === d.pad) return;
    if (d.pad >= 0) this.pads[d.pad].held = Math.max(0, this.pads[d.pad].held - 1);
    d.pad = i;
    if (i >= 0) {
      this.pads[i].held++;
      this.hit(i);
    }
  }
  pointerUp(p) {
    const d = this.drags.get(p.id);
    if (d && d.pad >= 0) this.pads[d.pad].held = Math.max(0, this.pads[d.pad].held - 1);
    this.drags.delete(p.id);
  }
  keyDown(e) {
    if (e.key === ' ') {
      if (!e.repeat) this.toggleGroove();
      return true;
    }
    const i = KEYMAP[String(e.key).toLowerCase()];
    if (i === undefined) return false;
    if (!e.repeat) this.hit(i);
    return true;
  }

  /** A player hit: sound, light, ripple, star progress. */
  hit(i) {
    const app = this.app, pad = this.pads[i], v = this.variant, s = this.s;
    const color = PALETTES[v][i];
    const cx = pad.x + s / 2, cy = pad.y + s / 2;
    const pan = G.clamp((cx / Math.max(1, app.w) - 0.5) * 0.9, -0.8, 0.8);
    if (v <= 3) app.audio.drum(KINDS[i], KITS[v], pan);
    else if (v === 4) this.chord(i, pan, 1, 0);
    else app.audio.chime(midi(PENTA[i]) * G.rand(0.998, 1.002), 1, pan);
    pad.flash = 1;
    pad.press = 1;
    pad.pv = 0;
    if (pad.ripples.length < 3) pad.ripples.push(0);
    this.sideGlow = 1;
    this.sideColor = color;
    this.activity = Math.min(1, this.activity + 0.34);
    app.haptic(10);
    app.fx.burst(cx, cy - s * 0.05, { count: 5, colors: [G.shade(color, 0.5), '#ffffff'], shape: 'sparkle', speed: [90, 230], gravity: 0, drag: 0.9, size: [2.5, 4.5], life: [0.25, 0.45], vr: 4 });
    app.addProgress(0.04, cx, cy);
    app.stat('hits');
  }

  /** Neon synth pad: a 3-voice chord, saw root + triangle upper voices. */
  chord(i, pan, v, when) {
    const A = this.app.audio;
    CHORDS[i].forEach((n, k) => {
      A.tone({
        freq: midi(n) * G.rand(0.997, 1.003), type: k === 0 ? 'sawtooth' : 'triangle', dur: k === 0 ? 0.55 : 0.8,
        vol: (k === 0 ? 0.055 : 0.1) * v, attack: 0.006, pan: G.clamp(pan + (k - 1) * 0.18, -1, 1), reverb: 0.3, when,
      });
    });
  }

  /** Schedulable bell (same recipe as audio.chime, which cannot be scheduled ahead). */
  bell(freq, v, pan, when) {
    const A = this.app.audio;
    A.tone({ freq, dur: 1.4, vol: 0.18 * v, attack: 0.002, pan, reverb: 0.5, when });
    A.tone({ freq: freq * 2.01, dur: 0.8, vol: 0.07 * v, attack: 0.002, pan, reverb: 0.5, when });
  }

  // ---------------------------------------------------------------- groove
  toggleGroove() {
    if (this.groove) this.stopGroove();
    else {
      this.groove = { t: 0, next: 0, vis: [] };
      this.btn.icon = 'stop';
    }
  }
  stopGroove() {
    this.groove = null;
    this.btn.icon = 'play';
  }

  /** Quieter copies of the kit's kick / snare / hat, scheduled `when` seconds ahead. */
  grooveVoice(kind, kit, when, accent) {
    const A = this.app.audio, chip = kit === 'chip', bub = kit === 'bubble';
    const cut = kit === 'lofi' ? 0.45 : 1;
    const soft = this.variant === 5 ? 0.7 : 1;
    if (kind === 'kick') {
      if (bub) A.tone({ freq: 300, freqEnd: 60, dur: 0.22, vol: 0.4 * soft, when });
      else {
        A.tone({ freq: chip ? 200 : 140, freqEnd: 42, dur: 0.32, vol: (chip ? 0.28 : 0.5) * soft, type: chip ? 'square' : 'sine', when });
        A.noise({ dur: 0.005, vol: 0.12 * soft, type: 'highpass', freq: 3000, when });
      }
    } else if (kind === 'snare') {
      if (bub) {
        A.tone({ freq: 900, freqEnd: 270, dur: 0.09, vol: 0.24, when, pan: -0.1 });
        A.noise({ dur: 0.035, vol: 0.12, type: 'bandpass', freq: 2400, q: 1.3, when, pan: -0.1 });
      } else {
        A.noise({ dur: 0.15, vol: 0.22 * soft, type: chip ? 'bandpass' : 'highpass', freq: 1300 * cut, q: chip ? 0.5 : 0.7, when, pan: -0.1 });
        A.tone({ freq: 200, freqEnd: 150, dur: 0.08, vol: 0.13 * soft, type: chip ? 'square' : 'triangle', when, pan: -0.1 });
      }
    } else if (bub) {
      A.noise({ dur: 0.012, vol: accent ? 0.2 : 0.13, type: 'highpass', freq: 6000, q: 0.8, when, pan: 0.25 });
    } else {
      A.noise({ dur: 0.04, vol: (accent ? 0.12 : 0.075) * soft, type: 'highpass', freq: 7200 * cut, q: 0.7, when, pan: 0.25 });
    }
  }

  /** One 8th-note step: hats on every 8th, kick on beats 1 & 3, snare on 2 & 4. */
  grooveStep(n, when, at) {
    const v = this.variant, kit = KITS[v], st = n % 8;
    const lights = [];
    this.grooveVoice('hat', kit, when, st % 2 === 0);
    if (v <= 3) lights.push(3);
    if (st === 0 || st === 4) {
      this.grooveVoice('kick', kit, when);
      if (v <= 3) lights.push(0);
    }
    if (st === 2 || st === 6) {
      this.grooveVoice('snare', kit, when);
      if (v <= 3) lights.push(1);
    }
    if (v === 4 && st === 0) {
      const pad = PROGRESSION[Math.floor(n / 8) % PROGRESSION.length];
      this.chord(pad, 0, 0.42, when);
      lights.push(pad);
    }
    if (v === 5 && (st === 0 || st === 4)) {
      const pad = BELL_LINE[Math.floor(n / 4) % BELL_LINE.length];
      this.bell(midi(PENTA[pad]), 0.45, 0, when);
      lights.push(pad);
    }
    this.groove.vis.push({ at, pads: lights, beat: st % 2 === 0 });
  }

  update(dt) {
    for (const p of this.pads) {
      p.flash = p.flash > 0.01 ? p.flash * Math.exp(-dt * 4.2) : 0;
      p.soft = p.soft > 0.01 ? p.soft * Math.exp(-dt * 5) : 0;
      // springy rubber: held pads stay down, released ones bounce back up
      spring(p, 'press', 'pv', p.held > 0 ? 1 : 0, 900, 26, dt);
      for (let k = p.ripples.length - 1; k >= 0; k--) {
        p.ripples[k] += dt / 0.5;
        if (p.ripples[k] >= 1) p.ripples.splice(k, 1);
      }
      if (p.wave >= 0) {
        p.wave -= dt;
        if (p.wave < 0) p.soft = Math.max(p.soft, 0.85);
      }
    }
    this.sideGlow *= Math.exp(-dt * 3);
    this.beatLed *= Math.exp(-dt * 7);
    this.activity *= Math.exp(-dt * 2.2);
    const g = this.groove;
    if (g) {
      g.t += dt;
      const step = 30 / BPM; // one 8th note
      // schedule a little ahead so every hit lands exactly on the grid
      while (g.next * step < g.t + 0.07) {
        const at = g.next * step;
        this.grooveStep(g.next, Math.max(0, at - g.t), at);
        g.next++;
      }
      while (g.vis.length && g.vis[0].at <= g.t) {
        const e = g.vis.shift();
        for (const i of e.pads) {
          const p = this.pads[i];
          p.soft = Math.max(p.soft, 1);
          if (p.held === 0) {
            p.press = Math.max(p.press, 0.35);
            p.pv = 0;
          }
        }
        if (e.beat) this.beatLed = 1;
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  /** Pre-renders background + console body into one full-screen layer. */
  renderLayer() {
    const app = this.app, dpr = app.dpr, w = app.w, h = app.h, v = this.variant;
    const c = G.makeCanvas(w * dpr, h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const bg = BACKGROUNDS[v];
    G.drawSoftBackground(g, w, h, bg[0], bg[1], v === 4 ? { glow: 'rgba(255,80,200,0.16)' } : undefined);
    this.drawBackdrop(g, w, h);
    this.drawBody(g);
    this.layer = { c, w, h, dpr };
  }

  /** Style flavor behind the console: synthwave grid, 8-bit pixels, bubbles, sparkles. */
  drawBackdrop(g, w, h) {
    const v = this.variant, L = this.L;
    if (v === 4) {
      // synthwave: stars, a glowing horizon and a perspective grid floor
      const hy = L.by + L.bh * 0.62;
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 0; k < 40; k++) {
        const x = (Math.sin(k * 12.9898) * 0.5 + 0.5) * w, y = (Math.sin(k * 78.233) * 0.5 + 0.5) * hy;
        G.circle(g, x, y, 0.6 + (k % 3) * 0.5);
        g.fill();
      }
      const hg = g.createLinearGradient(0, hy - h * 0.12, 0, hy + h * 0.04);
      hg.addColorStop(0, 'rgba(255,60,200,0)');
      hg.addColorStop(0.75, 'rgba(255,90,210,0.35)');
      hg.addColorStop(1, 'rgba(255,90,210,0)');
      g.fillStyle = hg;
      g.fillRect(0, hy - h * 0.12, w, h * 0.16);
      g.strokeStyle = 'rgba(255,90,220,0.24)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 14; k++) {
        const y = hy + Math.pow(k / 13, 1.8) * (h - hy);
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      for (let k = -12; k <= 12; k++) {
        g.moveTo(w / 2 + k * w * 0.02, hy);
        g.lineTo(w / 2 + k * w * 0.16, h);
      }
      g.stroke();
      g.restore();
    } else if (v === 1) {
      // chiptune: scattered 8-bit pixels
      g.save();
      const px = Math.max(3, Math.min(w, h) * 0.012);
      const cols = PALETTES[1];
      for (let k = 0; k < 34; k++) {
        const x = (Math.sin(k * 12.9898) * 0.5 + 0.5) * w, y = (Math.sin(k * 78.233) * 0.5 + 0.5) * h;
        g.fillStyle = G.alpha(cols[k % cols.length], 0.35);
        const n = 1 + (k % 3);
        for (let a = 0; a < n; a++) g.fillRect(Math.round(x + a * px), Math.round(y), px, px);
        if (k % 2) g.fillRect(Math.round(x + px), Math.round(y - px), px, px);
      }
      g.restore();
    } else if (v === 3) {
      g.save();
      for (let k = 0; k < 26; k++) {
        const x = (Math.sin(k * 12.9898) * 0.5 + 0.5) * w, y = (Math.sin(k * 78.233) * 0.5 + 0.5) * h;
        const r = 4 + ((k * 37) % 23);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = Math.max(1, r * 0.12);
        G.circle(g, x, y, r);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        G.circle(g, x - r * 0.35, y - r * 0.35, r * 0.2);
        g.fill();
      }
      g.restore();
    } else if (v === 5) {
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 30; k++) {
        const x = (Math.sin(k * 91.7) * 0.5 + 0.5) * w, y = (Math.sin(k * 47.3) * 0.5 + 0.5) * h;
        const r = 2 + (k % 4) * 1.6;
        g.beginPath();
        G.softStarPath(g, x, y, 4, r, r * 0.3, 0);
        g.fill();
      }
      g.restore();
    }
  }

  drawBody(g) {
    const L = this.L, s = this.s, v = this.variant, B = BODIES[v], dpr = this.app.dpr;
    const { bx, by, bw, bh } = L;
    const R = Math.min(s * 0.45, bw / 2, bh / 2);
    G.groundShadow(g, bx + bw / 2, by + bh + s * LIP, bw * 0.56, s * 0.3, 0.3);
    // thickness / lip with a soft drop shadow
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.4)';
    g.shadowBlur = s * 0.3 * dpr;
    g.shadowOffsetY = s * 0.1 * dpr;
    G.roundRect(g, bx, by + s * LIP, bw, bh, R);
    g.fillStyle = B.lip;
    g.fill();
    g.restore();
    // top face
    const body = new Path2D();
    G.roundRectPath(body, bx, by, bw, bh, R);
    const lg = g.createLinearGradient(0, by, 0, by + bh);
    lg.addColorStop(0, B.top);
    lg.addColorStop(1, B.bottom);
    g.fillStyle = lg;
    g.fill(body);
    g.save();
    g.clip(body);
    if (v === 2) {
      // lo-fi: walnut wood grain
      g.strokeStyle = 'rgba(0,0,0,0.13)';
      g.lineWidth = Math.max(1, s * 0.012);
      g.beginPath();
      for (let k = 0; k < 40; k++) {
        const y = by + (k / 40) * bh;
        g.moveTo(bx, y);
        g.bezierCurveTo(bx + bw * 0.3, y + Math.sin(k * 1.7) * s * 0.08, bx + bw * 0.7, y - Math.sin(k * 2.3) * s * 0.08, bx + bw, y);
      }
      g.stroke();
    }
    // soft top sheen
    const sh = g.createLinearGradient(0, by, 0, by + Math.min(bh, s * 1.2));
    sh.addColorStop(0, 'rgba(255,255,255,0.12)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(bx, by, bw, bh);
    g.restore();
    // bevel: light top edge, dark inner rim
    g.save();
    g.clip(body);
    g.lineWidth = s * 0.05;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.translate(0, -s * 0.02);
    g.stroke(body);
    g.restore();
    g.lineWidth = Math.max(1, s * 0.022);
    g.strokeStyle = v >= 4 ? B.trim : 'rgba(255,255,255,0.16)';
    if (v === 4) {
      g.save();
      g.shadowColor = B.trim;
      g.shadowBlur = s * 0.15 * dpr;
      g.stroke(body);
      g.restore();
    } else g.stroke(body);
    // recessed deck around the pads
    const p0 = L.gap * 0.7;
    const deck = new Path2D();
    G.roundRectPath(deck, L.gx - p0, L.gy - p0 - s * 0.05, L.gw + p0 * 2, L.gh + p0 * 2 + s * 0.05, s * 0.28);
    g.fillStyle = B.deck;
    g.fill(deck);
    g.save();
    g.clip(deck);
    g.lineWidth = s * 0.07;
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.translate(0, s * 0.03);
    g.stroke(deck);
    g.restore();
    g.lineWidth = Math.max(1, s * 0.015);
    g.strokeStyle = v === 5 ? 'rgba(255,210,63,0.7)' : 'rgba(255,255,255,0.08)';
    g.stroke(deck);
    // pad wells
    const r = s * RADIUS[v], wo = s * 0.035;
    for (const p of this.pads) {
      G.roundRect(g, p.x - wo, p.y - wo - s * 0.05, s + wo * 2, s + wo * 2 + s * 0.05, r + wo);
      g.fillStyle = B.well;
      g.fill();
      if (v === 5) {
        g.lineWidth = Math.max(1, s * 0.012);
        g.strokeStyle = 'rgba(255,210,63,0.45)';
        g.stroke();
      }
    }
    // side light strips (lit dynamically)
    if (L.M > 6) {
      const sw = Math.max(2, s * 0.07);
      for (const sx of this.sideXs()) {
        G.roundRect(g, sx - sw / 2, L.gy, sw, L.gh, sw / 2);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fill();
      }
    }
    // decorative knobs + LED sockets in the top strip
    const { knobs, leds, lr } = this.stripLayout();
    const pal = PALETTES[v];
    knobs.forEach((k, j) => this.drawKnob(g, k.x, k.y, k.r, pal[[0, 4, 6][j % 3]], [-0.7, 0.25, 1.05][j % 3]));
    for (const l of leds) {
      G.circle(g, l.x, l.y, lr * 1.35);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fill();
      G.circle(g, l.x, l.y + lr * 0.1, lr * 1.35);
      g.lineWidth = Math.max(1, lr * 0.2);
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.stroke();
    }
  }

  sideXs() {
    const L = this.L;
    const inner = L.gap * 0.7;
    const off = (L.M - inner) / 2 + inner;
    return [L.gx - off, L.gx + L.gw + off];
  }

  /** Knob / LED positions in the strip above the pads (fewer when the console is narrow). */
  stripLayout() {
    const L = this.L, s = this.s;
    const top = L.by, bottom = L.gy - L.gap * 0.7 - s * 0.05;
    const cy = (top + bottom) / 2 + s * 0.02;
    const kr = Math.max(2, Math.min((bottom - top) * 0.36, s * 0.17));
    const lr = kr * 0.34;
    const x0 = L.bx + L.M + kr * 0.2, x1 = L.bx + L.bw - L.M - kr * 0.2;
    const avail = x1 - x0;
    const knobW = kr * 2.7, ledW = lr * 3.6;
    let nk = 3, nl = 3;
    while (nk + nl > 0 && nk * knobW + nl * ledW > avail) {
      if (nl >= nk) nl--;
      else nk--;
    }
    const knobs = [], leds = [];
    for (let j = 0; j < nk; j++) knobs.push({ x: x0 + kr * 1.1 + j * knobW, y: cy, r: kr });
    for (let j = 0; j < nl; j++) leds.push({ x: x1 - lr * 1.6 - j * ledW, y: cy });
    return { knobs, leds, lr };
  }

  drawKnob(g, x, y, r, ringColor, ang) {
    const dpr = this.app.dpr;
    g.save();
    g.shadowColor = ringColor;
    g.shadowBlur = r * 0.6 * dpr;
    G.circle(g, x, y, r * 1.22);
    g.lineWidth = r * 0.16;
    g.strokeStyle = ringColor;
    g.stroke();
    g.restore();
    G.circle(g, x, y + r * 0.16, r);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fill();
    const kg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    kg.addColorStop(0, '#5a5c66');
    kg.addColorStop(1, '#16171c');
    G.circle(g, x, y, r);
    g.fillStyle = kg;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * G.TAU;
      g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
      g.lineTo(x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96);
    }
    g.stroke();
    G.circle(g, x, y, r * 0.62);
    g.fillStyle = '#2a2b33';
    g.fill();
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.5, r * 0.14);
    g.strokeStyle = '#f4f4f8';
    g.beginPath();
    g.moveTo(x + Math.sin(ang) * r * 0.2, y - Math.cos(ang) * r * 0.2);
    g.lineTo(x + Math.sin(ang) * r * 0.58, y - Math.cos(ang) * r * 0.58);
    g.stroke();
  }

  /** Pre-renders each pad's top face (normal + fully lit). */
  buildSprites() {
    const pal = PALETTES[this.variant];
    this.sprites = pal.map((color) => ({ face: this.renderFace(color, false), lit: this.renderFace(color, true), glow: glowSprite(color), lip: G.shade(color, this.variant === 4 ? -0.62 : -0.45) }));
  }

  renderFace(color, lit) {
    const v = this.variant, s = this.s, dpr = this.app.dpr;
    const b = Math.ceil(s * (v === 4 ? 0.2 : 0.06));
    const size = s + b * 2;
    const c = G.makeCanvas(size * dpr, size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(b, b);
    const r = s * RADIUS[v];
    const path = new Path2D();
    G.roundRectPath(path, 0, 0, s, s, r);
    if (v === 4) {
      // neon synth: dark glassy pad with a glowing rim; lit = fully bright
      if (lit) {
        const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.72);
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.35, G.shade(color, 0.45));
        rg.addColorStop(1, color);
        g.fillStyle = rg;
      } else g.fillStyle = G.shade(color, -0.78);
      g.fill(path);
      g.save();
      g.clip(path);
      g.strokeStyle = G.alpha(color, lit ? 0 : 0.18);
      g.lineWidth = Math.max(1, s * 0.012);
      g.beginPath();
      for (let k = 1; k < 6; k++) {
        g.moveTo(0, (k * s) / 6);
        g.lineTo(s, (k * s) / 6);
        g.moveTo((k * s) / 6, 0);
        g.lineTo((k * s) / 6, s);
      }
      g.stroke();
      g.restore();
      g.save();
      g.shadowColor = color;
      g.shadowBlur = s * 0.14 * dpr;
      g.lineWidth = s * 0.05;
      g.strokeStyle = lit ? '#ffffff' : color;
      const inset = new Path2D();
      G.roundRectPath(inset, s * 0.025, s * 0.025, s * 0.95, s * 0.95, r * 0.9);
      g.stroke(inset);
      g.restore();
    } else if (v === 5) {
      // glass chime: translucent pastel glass with reflections
      const lg = g.createLinearGradient(0, 0, s, s);
      lg.addColorStop(0, G.alpha(G.shade(color, 0.4), lit ? 1 : 0.88));
      lg.addColorStop(1, G.alpha(color, lit ? 0.95 : 0.55));
      g.fillStyle = lg;
      g.fill(path);
      g.save();
      g.clip(path);
      const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.62);
      rg.addColorStop(0, lit ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath();
      g.moveTo(s * 0.12, s);
      g.lineTo(s * 0.42, 0);
      g.lineTo(s * 0.56, 0);
      g.lineTo(s * 0.26, s);
      g.closePath();
      g.moveTo(s * 0.34, s);
      g.lineTo(s * 0.64, 0);
      g.lineTo(s * 0.69, 0);
      g.lineTo(s * 0.39, s);
      g.closePath();
      g.fill();
      g.restore();
      g.lineWidth = Math.max(1, s * 0.03);
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.stroke(path);
    } else {
      // rubber pad: body gradient, light glowing from inside, glossy top
      const lg = g.createLinearGradient(0, 0, 0, s);
      lg.addColorStop(0, G.shade(color, lit ? 0.5 : 0.06));
      lg.addColorStop(1, G.shade(color, lit ? 0.12 : -0.3));
      g.fillStyle = lg;
      g.fill(path);
      g.save();
      g.clip(path);
      const rg = g.createRadialGradient(s / 2, s * 0.52, 0, s / 2, s * 0.52, s * 0.64);
      rg.addColorStop(0, lit ? 'rgba(255,255,255,1)' : G.shade(color, 0.62, 0.95));
      rg.addColorStop(0.45, lit ? G.shade(color, 0.6, 0.85) : G.shade(color, 0.3, 0.45));
      rg.addColorStop(1, G.alpha(color, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, s, s);
      if (v === 1) {
        // chiptune: 8-bit pixel grid
        g.fillStyle = 'rgba(0,0,0,0.1)';
        const st = s / 8;
        for (let k = 1; k < 8; k++) {
          g.fillRect(k * st - 0.5, 0, 1, s);
          g.fillRect(0, k * st - 0.5, s, 1);
        }
      } else if (v === 2) {
        // lo-fi: dusty speckles
        g.fillStyle = 'rgba(60,30,20,0.12)';
        for (let k = 0; k < 70; k++) {
          const x = (Math.sin(k * 12.9898 + color.length) * 0.5 + 0.5) * s, y = (Math.sin(k * 78.233) * 0.5 + 0.5) * s;
          g.fillRect(x, y, s * 0.012 + 0.5, s * 0.012 + 0.5);
        }
      } else if (v === 3) {
        // bubble: little air bubbles inside the jelly
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = Math.max(1, s * 0.018);
        for (const [bx, by, br] of [[0.25, 0.68, 0.09], [0.7, 0.3, 0.06], [0.62, 0.72, 0.12], [0.36, 0.4, 0.045], [0.82, 0.58, 0.04]]) {
          G.circle(g, bx * s, by * s, br * s);
          g.stroke();
        }
      }
      // glossy top highlight
      const hg = g.createLinearGradient(0, 0, 0, s * 0.45);
      hg.addColorStop(0, 'rgba(255,255,255,0.42)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hg;
      G.roundRect(g, s * 0.07, s * 0.05, s * 0.86, s * 0.4, r * 0.8);
      g.fill();
      // darker bottom edge for a rubbery bulge
      const bg2 = g.createLinearGradient(0, s * 0.7, 0, s);
      bg2.addColorStop(0, 'rgba(0,0,0,0)');
      bg2.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = bg2;
      g.fillRect(0, s * 0.7, s, s * 0.3);
      g.restore();
      g.lineWidth = Math.max(1, s * 0.028);
      g.strokeStyle = G.shade(color, -0.35, 0.85);
      g.stroke(path);
    }
    return { c, b, size };
  }

  draw(ctx) {
    const app = this.app;
    if (!this.L) this.resize(this.area);
    const ly = this.layer;
    if (!ly || ly.w !== app.w || ly.h !== app.h || ly.dpr !== app.dpr) this.renderLayer();
    if (!this.sprites) this.buildSprites();
    ctx.drawImage(this.layer.c, 0, 0, app.w, app.h);
    const s = this.s, L = this.L, v = this.variant, t = app.time;
    const pal = PALETTES[v];
    const lift = s * 0.07;

    // light bleeding onto the console (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pads) {
      const breathe = 0.2 + 0.06 * Math.sin(t * 1.6 + p.i * 0.9);
      const a = G.clamp(breathe + p.flash + p.soft * 0.4, 0, 1);
      const gs = s * (2.1 + p.flash * 0.9 + p.soft * 0.2);
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprites[p.i].glow, p.x + s / 2 - gs / 2, p.y + s / 2 - gs / 2, gs, gs);
    }
    // side strips + LEDs
    if (L.M > 6) {
      const sw = Math.max(2, s * 0.07);
      const a = 0.14 + this.sideGlow * 0.86;
      for (const sx of this.sideXs()) {
        ctx.globalAlpha = a;
        ctx.fillStyle = this.sideColor;
        G.roundRect(ctx, sx - sw / 2, L.gy, sw, L.gh, sw / 2);
        ctx.fill();
        ctx.globalAlpha = a * 0.6;
        ctx.drawImage(glowSprite(this.sideColor), sx - s * 0.3, L.gy - s * 0.15, s * 0.6, L.gh + s * 0.3);
      }
    }
    const { leds, lr } = this.stripLayout();
    leds.forEach((l, j) => {
      const on = j === 0 ? this.beatLed : G.clamp(this.activity * 1.6 - j * 0.35, 0, 1);
      const col = j === 0 ? (this.groove ? '#ff3b5c' : '#ff9f1c') : pal[(j * 4) % N];
      const a = j === 0 && !this.groove ? 0.18 : 0.15 + on * 0.85;
      ctx.globalAlpha = a;
      ctx.drawImage(glowSprite(col), l.x - lr * 4, l.y - lr * 4, lr * 8, lr * 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = G.mixColor(G.shade(col, -0.55), G.shade(col, 0.35), a);
      G.circle(ctx, l.x, l.y, lr);
      ctx.fill();
    });
    ctx.restore();

    // pads
    const r = s * RADIUS[v];
    for (const p of this.pads) {
      const sp = this.sprites[p.i];
      const press = G.clamp(p.press, -0.2, 1);
      const yTop = p.y - lift * (1 - press);
      G.roundRect(ctx, p.x, p.y, s, s, r);
      ctx.fillStyle = sp.lip;
      ctx.fill();
      const sq = 1 - 0.035 * Math.max(0, press);
      const fs = sp.face.size * sq;
      const fx = p.x + s / 2 - fs / 2, fy = yTop + s / 2 - fs / 2;
      ctx.drawImage(sp.face.c, fx, fy, fs, fs);
      const lit = Math.max(p.flash, p.soft * 0.5);
      if (lit > 0.01) {
        ctx.globalAlpha = G.clamp(lit, 0, 1);
        ctx.drawImage(sp.lit.c, fx, fy, fs, fs);
        ctx.globalAlpha = 1;
      }
    }
    // bloom over freshly hit pads
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pads) {
      if (p.flash < 0.05) continue;
      const gs = s * 1.5;
      ctx.globalAlpha = p.flash * 0.55;
      ctx.drawImage(this.sprites[p.i].glow, p.x + s / 2 - gs / 2, p.y + s / 2 - lift * 0.6 - gs / 2, gs, gs);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // ripple rings
    ctx.lineJoin = 'round';
    for (const p of this.pads) {
      if (!p.ripples.length) continue;
      ctx.strokeStyle = G.shade(pal[p.i], 0.55);
      for (const k of p.ripples) {
        const e = G.ease.outCubic(k);
        const grow = s * 0.32 * e;
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.lineWidth = Math.max(1, s * 0.045 * (1 - k));
        G.roundRect(ctx, p.x - grow, p.y - lift * 0.5 - grow, s + grow * 2, s + grow * 2, r + grow);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  hud() {
    const n = this.app.getStat('hits');
    return `${G.formatNum(n)} ${countLabel(this.app, n, LABEL_ONE, LABEL, RU_FEW)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const pal = PALETTES[i], B = BODIES[i];
    ctx.fillStyle = B.top;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const cell = r * 0.5, s = cell * 0.8;
    for (let k = 0; k < N; k++) {
      const cx = x + ((k % 3) - 1) * cell, cy = y + (Math.floor(k / 3) - 1) * cell;
      G.roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * RADIUS[i] * 1.2);
      if (i === 4) {
        ctx.fillStyle = G.shade(pal[k], -0.6);
        ctx.fill();
        ctx.lineWidth = Math.max(1, s * 0.16);
        ctx.strokeStyle = pal[k];
        ctx.stroke();
      } else {
        ctx.fillStyle = pal[k];
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        G.roundRect(ctx, cx - s * 0.32, cy - s * 0.36, s * 0.64, s * 0.24, s * 0.12);
        ctx.fill();
      }
    }
  }
}
