// Switch Board: a chunky busy-board panel full of things to flip, press, turn and slide.
// Turn every switch on (3 toggles, 2 rockers, 4 keypad keys) for a rainbow light show.
import { Toy } from './_base.js';
import * as G from '../gfx.js';

const KINDS = ['toggle', 'toggle', 'toggle', 'button', 'knob', 'rocker', 'slider', 'keypad', 'rocker'];
const UNITS = 9; // on/off units on the LED meter: 3 toggles + 2 rockers + 4 keypad keys
const DETENT = Math.PI / 6; // the knob clicks every 30°
const TICKS = 8; // slider steps
const MX = 0.26, HEAD = 0.46, MB = 0.24, LIP = 0.09; // panel margins, in cell sizes
const THEMES = [
  { // mint
    bg: ['#e6fff5', '#97dcc2'], panel: '#5ad1b3', bezel: '#2f3540', screw: '#d5dde4',
    levers: ['#ff4545', '#3a7bff', '#36d05a'], button: '#ff3838', knob: '#ffd23f', dot: '#ffd23f', rockers: ['#ff9f1c', '#9b5de5'], slider: '#ff5fa2', keys: ['#ff4d6d', '#ffd23f', '#3ddc84', '#3a86ff'],
  },
  { // retro cream
    bg: ['#fff4e0', '#e3c08e'], panel: '#f2e3c6', bezel: '#4a3626', screw: '#ece6da',
    levers: ['#e76f51', '#2a9d8f', '#e9b949'], button: '#e63946', knob: '#3d405b', dot: '#ffb347', rockers: ['#e76f51', '#2a6f86'], slider: '#f4a261', keys: ['#e76f51', '#e9c46a', '#2a9d8f', '#457b9d'],
  },
  { // dark neon: parts glow
    bg: ['#2b2350', '#0d0a1f'], panel: '#22223b', bezel: '#0c0c18', screw: '#8d8fb3', glow: true,
    levers: ['#ff2e88', '#00e5ff', '#39ff14'], button: '#ff2e88', knob: '#00e5ff', dot: '#00e5ff', rockers: ['#b026ff', '#ffe600'], slider: '#39ff14', keys: ['#ff2e88', '#ffe600', '#39ff14', '#00e5ff'],
  },
  { // candy pink
    bg: ['#fff0f6', '#ffbcd3'], panel: '#ff8fab', bezel: '#8c2f52', screw: '#fff0f5', dots: true,
    levers: ['#5fe0bd', '#fff07a', '#b79cff'], button: '#5fe0bd', knob: '#fff07a', dot: '#fff07a', rockers: ['#b79cff', '#5fe0bd'], slider: '#ffffff', keys: ['#ff4d8d', '#5fe0bd', '#fff07a', '#b79cff'],
  },
  { // ocean blue
    bg: ['#e3f3ff', '#80b9ee'], panel: '#3a86ff', bezel: '#173a73', screw: '#e6f0ff', waves: true,
    levers: ['#ffd23f', '#ff6b6b', '#ffffff'], button: '#ffd23f', knob: '#ffffff', dot: '#7fdcff', rockers: ['#ff6b6b', '#00f5d4'], slider: '#00f5d4', keys: ['#ffd23f', '#ff6b6b', '#00f5d4', '#ffffff'],
  },
  { // space black with gold trim
    bg: ['#2a2f55', '#070914'], panel: '#14213d', bezel: '#070b16', screw: '#e8c35a', trim: '#d4af37', stars: true,
    levers: ['#e3b93f', '#e6e8ee', '#e3b93f'], button: '#e63946', knob: '#d4af37', dot: '#ffd23f', rockers: ['#d4af37', '#e6e8ee'], slider: '#d4af37', keys: ['#d4af37', '#fca311', '#e6e8ee', '#8ecae6'],
  },
];
const METER = ['#ff4d6d', '#ff8c42', '#ffd23f', '#a7e34b', '#3ddc84', '#2ec4e6', '#3a86ff', '#7b5cff', '#c45cff'];
const KEY_NOTES = [784, 988, 1175, 1568]; // keypad beeps: G5 B5 D6 G6
const LABEL = { en: 'clicks', vi: 'lần bấm', es: 'clics', pt: 'cliques', fr: 'clics', de: 'Klicks', id: 'klik', it: 'clic', tr: 'tık', ru: 'щелчков' };
const LABEL_ONE = { en: 'click', vi: 'lần bấm', es: 'clic', pt: 'clique', fr: 'clic', de: 'Klick', id: 'klik', it: 'clic', tr: 'tık', ru: 'щелчок' };
const RU_FEW = 'щелчка';

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
  c = G.makeCanvas(96, 96);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  gr.addColorStop(0, G.alpha(color, 0.9));
  gr.addColorStop(0.35, G.alpha(color, 0.4));
  gr.addColorStop(1, G.alpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 96, 96);
  _glows.set(color, c);
  return c;
}

export class SwitchesToy extends Toy {
  static id = 'switches';

  constructor(app) {
    super(app);
    this.ctrls = KINDS.map((kind, i) => this.makeControl(kind, i));
    this.drags = new Map();
    this.celebrated = false;
    this.chase = 0; // rainbow light show timer
    this.boot = 0; // LED sweep after a theme change
    this.meter = new Array(UNITS).fill(0);
    this.L = null;
    this.layer = null;
    this.sprites = null;
  }

  /** Every control keeps its own state here; layout only moves it around. */
  makeControl(kind, i) {
    const c = { kind, i, s: 1, cx: 0, cy: 0, x: 0, y: 0 };
    if (kind === 'toggle') Object.assign(c, { on: false, p: -1, pv: 0, led: 0 });
    else if (kind === 'rocker') Object.assign(c, { on: false, q: -1, qv: 0, led: 0 });
    else if (kind === 'button') Object.assign(c, { held: 0, keyT: 0, press: 0, pv: 0, light: 0 });
    else if (kind === 'knob') Object.assign(c, { angle: 0, shown: 0, detent: 0, drag: false, dots: new Array(12).fill(0) });
    else if (kind === 'slider') Object.assign(c, { value: 0, tick: 0, drag: false, dir: 1 });
    else if (kind === 'keypad') Object.assign(c, { keys: [0, 1, 2, 3].map(() => ({ on: false, press: 0, pv: 0, held: 0, light: 0 })), next: 0 });
    return c;
  }

  enter() {
    this.boot = 0.7;
  }
  exit() {
    this.drags.clear();
    for (const c of this.ctrls) {
      if (c.kind === 'button') c.held = 0;
      if (c.kind === 'knob' || c.kind === 'slider') c.drag = false;
      if (c.kind === 'keypad') for (const k of c.keys) k.held = 0;
    }
    this.layer = null; // free the full-screen cache while the toy is closed
    this.sprites = null;
  }
  setVariant() {
    this.layer = null;
    this.sprites = null;
    this.boot = 0.7;
    this.app.audio.whoosh(0.5);
  }

  // ---------------------------------------------------------------- layout
  /** Picks the grid with the biggest cells for this area (3×3, 5×2, 2×5, 9×1, …). */
  resize(area) {
    const N = KINDS.length;
    let best = null;
    for (let cols = 1; cols <= N; cols++) {
      const rows = Math.ceil(N / cols);
      const empty = cols * rows - N;
      if (empty >= cols) continue;
      const kw = cols + 2 * MX, kh = rows + HEAD + MB + LIP;
      const s = Math.min(area.w / kw, area.h / kh) * 0.97;
      const score = s * (1 - 0.05 * empty);
      if (!best || score > best.score) best = { cols, rows, s, kw, empty, score };
    }
    const s = Math.max(8, best.s);
    // spread the cells a little into any spare room so the panel fills more of the area
    const fitW = best.kw * s, fitH = (best.rows + HEAD + MB + LIP) * s;
    const gapX = Math.max(0, Math.min(((area.w - fitW) * 0.85) / best.cols, s * 0.22));
    const gapY = Math.max(0, Math.min(((area.h - fitH) * 0.85) / best.rows, s * 0.22));
    const pitchX = s + gapX, pitchY = s + gapY;
    const pw = best.cols * pitchX + 2 * MX * s, ph = best.rows * pitchY + (HEAD + MB) * s;
    const px = area.x + (area.w - pw) / 2;
    const py = area.y + (area.h - ph - LIP * s) / 2;
    const gx = px + MX * s, gy = py + HEAD * s;
    this.L = { cols: best.cols, rows: best.rows, s, px, py, pw, ph, gx, gy, pitchX, pitchY, empties: [] };
    const center = (k) => [gx + (k % best.cols) * pitchX + pitchX / 2, gy + Math.floor(k / best.cols) * pitchY + pitchY / 2];
    for (const c of this.ctrls) {
      [c.cx, c.cy] = center(c.i);
      c.s = s;
      c.x = c.cx - s / 2;
      c.y = c.cy - s / 2;
    }
    for (let k = N; k < best.cols * best.rows; k++) {
      const [cx, cy] = center(k);
      this.L.empties.push({ cx, cy });
    }
    this.layer = null;
    this.sprites = null;
  }

  /** Control under a point; each one owns its whole grid slot (minus an optional inset). */
  ctrlAt(x, y, inset = 0) {
    const L = this.L;
    if (!L) return null;
    for (const c of this.ctrls) {
      const hw = L.pitchX / 2 - c.s * inset, hh = L.pitchY / 2 - c.s * inset;
      if (Math.abs(x - c.cx) < hw && Math.abs(y - c.cy) < hh) return c;
    }
    return null;
  }
  keyAt(c, x, y) {
    return (x >= c.cx ? 1 : 0) + (y >= c.cy ? 2 : 0);
  }
  pan(c) {
    return G.clamp((c.cx / Math.max(1, this.app.w) - 0.5) * 0.9, -0.8, 0.8);
  }
  sliderEnds(c) {
    return { tx: c.cx - 0.07 * c.s, top: c.cy - 0.3 * c.s, bot: c.cy + 0.3 * c.s };
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    const c = this.ctrlAt(p.x, p.y);
    if (!c) return;
    const d = { c, x: p.x, y: p.y, moved: 0, key: -1, off: 0, last: c };
    this.drags.set(p.id, d);
    switch (c.kind) {
      case 'toggle':
      case 'rocker':
        this.flip(c);
        break;
      case 'button':
        c.held++;
        this.pressButton(c);
        break;
      case 'knob':
        d.a = Math.atan2(p.y - c.cy, p.x - c.cx);
        c.drag = true;
        break;
      case 'slider': {
        const { top, bot } = this.sliderEnds(c);
        const ky = bot - c.value * (bot - top);
        if (Math.abs(p.y - ky) < c.s * 0.11) d.off = p.y - ky; // grabbed the knob itself
        else this.slideTo(c, p.y);
        c.drag = true;
        break;
      }
      case 'keypad':
        d.key = this.keyAt(c, p.x, p.y);
        c.keys[d.key].held++;
        this.pressKey(c, d.key);
        break;
    }
  }
  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    const c = d.c;
    if (c.kind === 'knob') {
      const a = Math.atan2(p.y - c.cy, p.x - c.cx);
      if (G.dist(c.cx, c.cy, p.x, p.y) > c.s * 0.06) {
        const da = G.angleDiff(d.a, a);
        d.moved += Math.abs(da);
        this.turnKnob(c, da);
      }
      d.a = a;
    } else if (c.kind === 'slider') this.slideTo(c, p.y - d.off);
    else if (c.kind === 'toggle' || c.kind === 'rocker') {
      // run a finger along a row of switches to flip them all (walk the segment for fast swipes)
      const n = Math.max(1, Math.ceil(G.dist(d.x, d.y, p.x, p.y) / (c.s * 0.2)));
      for (let k = 1; k <= n; k++) {
        const o = this.ctrlAt(G.lerp(d.x, p.x, k / n), G.lerp(d.y, p.y, k / n), 0.12);
        if (o && o !== d.last) {
          d.last = o;
          if (o.kind === 'toggle' || o.kind === 'rocker') this.flip(o);
        }
      }
      d.x = p.x;
      d.y = p.y;
    }
  }
  pointerUp(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    this.drags.delete(p.id);
    const c = d.c;
    const stillHeld = () => [...this.drags.values()].some((o) => o.c === c);
    if (c.kind === 'button') {
      c.held = Math.max(0, c.held - 1);
      if (!c.held && c.keyT <= 0) this.releaseButton(c);
    } else if (c.kind === 'knob') {
      c.drag = stillHeld();
      if (!p.cancel && d.moved < 0.12) this.stepKnob(c, 1); // a tap turns it one click
    } else if (c.kind === 'slider') c.drag = stillHeld();
    else if (c.kind === 'keypad' && d.key >= 0) c.keys[d.key].held = Math.max(0, c.keys[d.key].held - 1);
  }
  keyDown(e) {
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= KINDS.length)) return false;
    if (!e.repeat) this.activate(this.ctrls[n - 1]);
    return true;
  }
  /** Keyboard / generic "use this control once". */
  activate(c) {
    switch (c.kind) {
      case 'toggle':
      case 'rocker':
        this.flip(c);
        break;
      case 'button':
        c.keyT = 0.14;
        this.pressButton(c);
        break;
      case 'knob':
        this.stepKnob(c, 1);
        break;
      case 'slider': {
        let t = c.tick + c.dir;
        if (t > TICKS || t < 0) {
          c.dir = -c.dir;
          t = c.tick + c.dir;
        }
        this.setTick(c, t);
        break;
      }
      case 'keypad': {
        const k = c.next;
        c.next = (k + 1) % 4;
        this.pressKey(c, k);
        break;
      }
    }
  }

  /** Stars + click counter for an action (knob detents / slider ticks count half). */
  action(x, y, amount = 0.04, clicks = 1) {
    this.app.addProgress(amount, x, y);
    this.app.stat('clicks', clicks);
  }

  flip(c) {
    const app = this.app, T = THEMES[this.variant], pan = this.pan(c);
    c.on = !c.on;
    if (c.kind === 'toggle') {
      app.audio.toggle(c.on, 1, pan);
      app.haptic(12);
      if (c.on) {
        const col = T.levers[c.i % 3];
        app.fx.burst(c.cx, c.cy - 0.33 * c.s, { count: 6, colors: [G.shade(col, 0.4), '#ffffff'], shape: 'sparkle', speed: [50, 150], gravity: 0, drag: 0.9, size: [2, 4], life: [0.25, 0.45] });
      }
    } else {
      app.audio.thunk(c.on ? 1.55 : 1.25, 0.5, pan);
      app.audio.click(c.on ? 0.95 : 0.78, 0.8, pan);
      app.haptic(14);
    }
    this.action(c.cx, c.cy);
    this.checkAll();
  }

  pressButton(c) {
    const app = this.app, pan = this.pan(c), T = THEMES[this.variant];
    c.press = 1;
    c.pv = 0;
    c.light = 1;
    app.audio.thunk(0.95, 0.9, pan);
    app.audio.tone({ freq: 520, freqEnd: 820, type: 'square', dur: 0.09, vol: 0.05, pan, when: 0.01 });
    app.haptic(15);
    app.fx.ring(c.cx, c.cy, G.alpha(G.shade(T.button, 0.4), 0.9), c.s * 0.3, c.s * 0.62, 0.35, 4);
    this.action(c.cx, c.cy);
  }
  releaseButton(c) {
    this.app.audio.click(0.6, 0.55, this.pan(c));
  }

  pressKey(c, k) {
    const app = this.app, key = c.keys[k], pan = this.pan(c);
    key.on = !key.on;
    key.press = 1;
    key.pv = 0;
    const f = KEY_NOTES[k];
    if (key.on) app.audio.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.13, pan, reverb: 0.1 });
    else app.audio.tone({ freq: f * 0.5, type: 'triangle', dur: 0.08, vol: 0.09, pan });
    app.audio.click(1.5, 0.45, pan);
    app.haptic(10);
    this.action(c.cx, c.cy);
    this.checkAll();
  }

  turnKnob(c, da) {
    c.angle += da;
    const det = Math.round(c.angle / DETENT);
    if (det !== c.detent) this.knobClicks(c, det);
  }
  stepKnob(c, dir) {
    this.knobClicks(c, c.detent + dir);
  }
  /** Detent clicks; a fast spin plays them as a rapid series and lights every dot it passed. */
  knobClicks(c, det) {
    const steps = det - c.detent, dir = Math.sign(steps);
    const n = Math.min(6, Math.abs(steps));
    if (!n) return;
    const pan = this.pan(c);
    for (let k = 0; k < n; k++) {
      const d = det - dir * (n - 1 - k);
      const idx = ((d % 12) + 12) % 12;
      c.dots[idx] = 1;
      this.clickAt(1.05 + idx * 0.035, 0.85, pan, k * 0.024);
    }
    c.detent = det;
    this.app.haptic(8);
    this.action(c.cx, c.cy, 0.02 * n, n);
  }
  /** Same recipe as audio.click(), but schedulable so several clicks can ripple out. */
  clickAt(p, v, pan, when) {
    const A = this.app.audio;
    A.noise({ dur: 0.012, vol: 0.4 * v, type: 'highpass', freq: 3000 * p, q: 0.8, attack: 0.0005, pan, when });
    A.tone({ freq: 1800 * p, freqEnd: 1200 * p, type: 'square', dur: 0.015, vol: 0.05 * v, pan, when });
  }

  slideTo(c, y) {
    const { top, bot } = this.sliderEnds(c);
    c.value = G.clamp((bot - y) / Math.max(1, bot - top), 0, 1);
    const t = Math.round(c.value * TICKS);
    if (t !== c.tick) this.sliderTick(c, t);
  }
  setTick(c, t) {
    this.sliderTick(c, G.clamp(t, 0, TICKS));
  }
  /** Tick clicks rising in pitch with the level; a jump zips through every tick on the way. */
  sliderTick(c, t) {
    const from = c.tick, dir = Math.sign(t - from);
    const n = Math.min(TICKS, Math.abs(t - from));
    if (!n) return;
    c.tick = t;
    const pan = this.pan(c);
    for (let k = 0; k < n; k++) {
      const tk = from + dir * (k + 1), when = k * 0.022;
      this.clickAt(0.7 + tk * 0.07, 0.7, pan, when);
      this.app.audio.tone({ freq: 420 + tk * 70, type: 'triangle', dur: 0.035, vol: 0.045, pan, when });
    }
    this.app.haptic(8);
    this.action(c.cx, c.cy, 0.02 * n, n);
  }

  onCount() {
    let n = 0;
    for (const c of this.ctrls) {
      if (c.kind === 'toggle' || c.kind === 'rocker') n += c.on ? 1 : 0;
      else if (c.kind === 'keypad') for (const k of c.keys) n += k.on ? 1 : 0;
    }
    return n;
  }
  /** Everything on → light show; it re-arms only after something is switched off again. */
  checkAll() {
    const n = this.onCount();
    if (n < UNITS) {
      this.celebrated = false;
      return;
    }
    if (this.celebrated) return;
    this.celebrated = true;
    const app = this.app, L = this.L;
    const cx = L.px + L.pw / 2, cy = L.py + L.ph / 2;
    this.chase = 3.2;
    app.audio.fanfare();
    app.audio.chime(1318.5, 0.6);
    app.haptic(40);
    for (const fx of [0.2, 0.5, 0.8]) {
      app.fx.burst(L.px + L.pw * fx, L.py + L.s * HEAD * 0.5, { count: 22, colors: METER, shape: ['confetti', 'star', 'circle'], speed: [180, 560], size: [4, 8], gravity: 700, life: [0.9, 1.7], angle: -Math.PI / 2, spread: Math.PI * 1.2 });
    }
    app.addProgress(0.5, cx, cy);
  }

  update(dt) {
    for (const c of this.ctrls) {
      switch (c.kind) {
        case 'toggle':
          spring(c, 'p', 'pv', c.on ? 1 : -1, 520, 18, dt);
          c.led = G.damp(c.led, c.on ? 1 : 0, 18, dt);
          break;
        case 'rocker':
          spring(c, 'q', 'qv', c.on ? 1 : -1, 750, 24, dt);
          c.led = G.damp(c.led, c.on ? 1 : 0, 14, dt);
          break;
        case 'button': {
          if (c.keyT > 0) {
            c.keyT -= dt;
            if (c.keyT <= 0 && !c.held) this.releaseButton(c);
          }
          const down = c.held > 0 || c.keyT > 0;
          spring(c, 'press', 'pv', down ? 1 : 0, 1100, 22, dt);
          c.light = down ? 1 : c.light * Math.exp(-dt * 3);
          break;
        }
        case 'knob': {
          if (!c.drag) c.angle = G.damp(c.angle, c.detent * DETENT, 16, dt);
          // notchy display: the cap lags inside a detent and snaps across it
          const base = c.detent * DETENT;
          c.shown = G.damp(c.shown, base + (c.angle - base) * 0.35, 40, dt);
          for (let k = 0; k < 12; k++) c.dots[k] *= Math.exp(-dt * 2.2);
          break;
        }
        case 'slider':
          if (!c.drag) c.value = G.damp(c.value, c.tick / TICKS, 18, dt);
          break;
        case 'keypad':
          for (const k of c.keys) {
            spring(k, 'press', 'pv', k.held > 0 ? 1 : 0, 1100, 24, dt);
            k.light = G.damp(k.light, k.on ? 1 : 0, 16, dt);
          }
          break;
      }
    }
    const n = this.onCount();
    for (let k = 0; k < UNITS; k++) this.meter[k] = G.damp(this.meter[k], k < n ? 1 : 0, 14, dt);
    if (this.chase > 0) this.chase = Math.max(0, this.chase - dt);
    if (this.boot > 0) this.boot = Math.max(0, this.boot - dt);
  }

  // ---------------------------------------------------------------- static layer
  renderLayer() {
    const app = this.app, dpr = app.dpr, w = app.w, h = app.h, T = THEMES[this.variant];
    const c = G.makeCanvas(w * dpr, h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    G.drawSoftBackground(g, w, h, T.bg[0], T.bg[1], T.glow || T.stars ? { glow: 'rgba(140,120,255,0.12)' } : undefined);
    if (T.glow || T.stars) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 46; k++) {
        G.circle(g, (Math.sin(k * 12.9898) * 0.5 + 0.5) * w, (Math.sin(k * 78.233) * 0.5 + 0.5) * h, 0.6 + (k % 3) * 0.5);
        g.fill();
      }
    }
    this.drawPanel(g);
    for (const ct of this.ctrls) this.drawBase(g, ct);
    for (const e of this.L.empties) this.drawGrille(g, e.cx, e.cy);
    for (const m of this.meterSpots()) this.ledHousing(g, m.x, m.y, m.r);
    this.layer = { c, w, h, dpr };
  }

  drawPanel(g) {
    const L = this.L, T = THEMES[this.variant], dpr = this.app.dpr, s = L.s;
    const { px, py, pw, ph } = L;
    const R = Math.min(s * 0.26, pw / 2, ph / 2);
    G.groundShadow(g, px + pw / 2, py + ph + s * LIP, pw * 0.56, s * 0.3, 0.32);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = s * 0.3 * dpr;
    g.shadowOffsetY = s * 0.1 * dpr;
    G.roundRect(g, px, py + s * LIP, pw, ph, R);
    g.fillStyle = G.shade(T.panel, -0.32);
    g.fill();
    g.restore();
    const face = new Path2D();
    G.roundRectPath(face, px, py, pw, ph, R);
    const lg = g.createLinearGradient(0, py, 0, py + ph);
    lg.addColorStop(0, G.shade(T.panel, 0.14));
    lg.addColorStop(1, G.shade(T.panel, -0.08));
    g.fillStyle = lg;
    g.fill(face);
    g.save();
    g.clip(face);
    if (T.stars) {
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (let k = 0; k < 70; k++) {
        G.circle(g, px + (Math.sin(k * 3.7) * 0.5 + 0.5) * pw, py + (Math.sin(k * 9.1 + 1) * 0.5 + 0.5) * ph, 0.5 + (k % 4) * 0.35);
        g.fill();
      }
    } else if (T.dots) {
      g.fillStyle = 'rgba(255,255,255,0.16)';
      const st = s * 0.22;
      for (let y = py + st / 2, r = 0; y < py + ph; y += st, r++) {
        for (let x = px + (r % 2 ? st : st / 2); x < px + pw; x += st) {
          G.circle(g, x, y, s * 0.03);
          g.fill();
        }
      }
    } else if (T.waves) {
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = Math.max(1, s * 0.03);
      for (let y = py + s * 0.3; y < py + ph; y += s * 0.32) {
        g.beginPath();
        for (let x = px; x <= px + pw + 4; x += 4) {
          const yy = y + Math.sin((x - px) / (s * 0.18)) * s * 0.04;
          if (x === px) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
    }
    // bevel: bright inner top edge, darker inner bottom edge
    g.lineWidth = s * 0.07;
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.translate(0, s * 0.03);
    g.stroke(face);
    g.translate(0, -s * 0.06);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.stroke(face);
    g.restore();
    if (T.trim) {
      const inset = new Path2D();
      G.roundRectPath(inset, px + s * 0.06, py + s * 0.06, pw - s * 0.12, ph - s * 0.12, R * 0.75);
      g.lineWidth = Math.max(1.5, s * 0.022);
      g.strokeStyle = T.trim;
      g.stroke(inset);
      g.lineWidth = Math.max(1, s * 0.012);
      g.strokeStyle = G.alpha(T.trim, 0.8);
      g.stroke(face);
    }
    if (T.glow) {
      g.save();
      g.shadowColor = '#b026ff';
      g.shadowBlur = s * 0.2 * dpr;
      g.lineWidth = Math.max(1.5, s * 0.02);
      g.strokeStyle = '#c77dff';
      g.stroke(face);
      g.restore();
    }
    // corner screws
    const sr = s * 0.065, so = s * 0.15;
    [[px + so, py + so], [px + pw - so, py + so], [px + so, py + ph - so], [px + pw - so, py + ph - so]].forEach(([x, y], k) => this.screw(g, x, y, sr, 0.4 + k * 0.7));
  }

  screw(g, x, y, r, rot) {
    const T = THEMES[this.variant];
    G.circle(g, x + r * 0.12, y + r * 0.28, r * 1.05);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fill();
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, T.screw);
    gr.addColorStop(1, G.shade(T.screw, -0.45));
    G.circle(g, x, y, r);
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.strokeStyle = G.shade(T.screw, -0.6);
    g.lineWidth = Math.max(1, r * 0.24);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.55, 0);
    g.lineTo(r * 0.55, 0);
    g.moveTo(0, -r * 0.55);
    g.lineTo(0, r * 0.55);
    g.stroke();
    g.restore();
  }

  /** A dark recess with a raised rim in a lighter panel tone. */
  recess(g, x, y, w, h, r) {
    const T = THEMES[this.variant], s = this.L.s;
    const rim = s * 0.035;
    G.roundRect(g, x - rim, y - rim + s * 0.012, w + rim * 2, h + rim * 2, r + rim);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fill();
    G.roundRect(g, x - rim, y - rim, w + rim * 2, h + rim * 2, r + rim);
    g.fillStyle = T.trim || G.shade(T.panel, T.glow ? 0.12 : 0.22);
    g.fill();
    const p = new Path2D();
    G.roundRectPath(p, x, y, w, h, r);
    g.fillStyle = T.bezel;
    g.fill(p);
    g.save();
    g.clip(p);
    g.lineWidth = s * 0.05;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.translate(0, s * 0.025);
    g.stroke(p);
    g.restore();
    if (T.glow) {
      g.save();
      g.shadowColor = '#00e5ff';
      g.shadowBlur = s * 0.1 * this.app.dpr;
      g.lineWidth = Math.max(1, s * 0.012);
      g.strokeStyle = 'rgba(0,229,255,0.6)';
      g.stroke(p);
      g.restore();
    }
  }

  ledHousing(g, x, y, r) {
    const T = THEMES[this.variant];
    G.circle(g, x, y + r * 0.15, r * 1.45);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fill();
    G.circle(g, x, y, r * 1.4);
    g.fillStyle = T.trim || G.shade(T.panel, -0.35);
    g.fill();
    G.circle(g, x, y, r * 1.1);
    g.fillStyle = T.bezel;
    g.fill();
  }

  /** Static part of each control: sockets, slots, scales. */
  drawBase(g, c) {
    const s = c.s, T = THEMES[this.variant];
    switch (c.kind) {
      case 'toggle': {
        this.ledHousing(g, c.cx, c.cy - 0.33 * s, 0.055 * s);
        this.recess(g, c.cx - 0.17 * s, c.cy - 0.17 * s, 0.34 * s, 0.5 * s, 0.1 * s);
        // pivot boot the lever pokes out of
        const by = c.cy + 0.08 * s;
        G.roundRect(g, c.cx - 0.12 * s, by - 0.05 * s, 0.24 * s, 0.1 * s, 0.05 * s);
        g.fillStyle = G.shade(T.bezel, 0.22);
        g.fill();
        G.roundRect(g, c.cx - 0.09 * s, by - 0.025 * s, 0.18 * s, 0.05 * s, 0.025 * s);
        g.fillStyle = G.shade(T.bezel, -0.4);
        g.fill();
        break;
      }
      case 'rocker':
        this.recess(g, c.cx - 0.19 * s, c.cy - 0.3 * s, 0.38 * s, 0.6 * s, 0.08 * s);
        break;
      case 'button': {
        const R = 0.38 * s;
        G.circle(g, c.cx, c.cy + s * 0.03, R);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fill();
        const gr = g.createLinearGradient(0, c.cy - R, 0, c.cy + R);
        gr.addColorStop(0, T.trim || G.shade(T.bezel, 0.35));
        gr.addColorStop(1, T.trim ? G.shade(T.trim, -0.4) : T.bezel);
        G.circle(g, c.cx, c.cy, R);
        g.fillStyle = gr;
        g.fill();
        G.circle(g, c.cx, c.cy, R * 0.83);
        g.fillStyle = G.shade(T.bezel, -0.3);
        g.fill();
        break;
      }
      case 'knob': {
        const R = 0.41 * s;
        G.circle(g, c.cx, c.cy + s * 0.025, R);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fill();
        G.circle(g, c.cx, c.cy, R);
        g.fillStyle = T.bezel;
        g.fill();
        if (T.trim) {
          g.lineWidth = Math.max(1, s * 0.02);
          g.strokeStyle = T.trim;
          g.stroke();
        }
        g.fillStyle = G.alpha(T.dot, 0.3);
        for (let k = 0; k < 12; k++) {
          const a = -Math.PI / 2 + k * DETENT;
          G.circle(g, c.cx + Math.cos(a) * 0.35 * s, c.cy + Math.sin(a) * 0.35 * s, 0.026 * s);
          g.fill();
        }
        G.circle(g, c.cx + s * 0.02, c.cy + s * 0.05, 0.27 * s);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fill();
        break;
      }
      case 'slider': {
        const { tx, top, bot } = this.sliderEnds(c);
        this.recess(g, tx - 0.04 * s, top - 0.07 * s, 0.08 * s, bot - top + 0.14 * s, 0.04 * s);
        g.strokeStyle = G.alpha(T.glow ? T.slider : T.bezel, T.glow ? 0.3 : 0.45);
        g.lineWidth = Math.max(1, 0.025 * s);
        g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k <= TICKS; k++) {
          const y = bot - (k * (bot - top)) / TICKS;
          const long = k % 4 === 0 ? 0.06 * s : 0;
          g.moveTo(c.cx + 0.07 * s, y);
          g.lineTo(c.cx + 0.15 * s + long, y);
        }
        g.stroke();
        break;
      }
      case 'keypad':
        this.recess(g, c.cx - 0.33 * s, c.cy - 0.33 * s, 0.66 * s, 0.66 * s, 0.1 * s);
        break;
    }
  }

  /** Decorative speaker grille for a spare cell. */
  drawGrille(g, cx, cy) {
    const s = this.L.s, T = THEMES[this.variant];
    G.circle(g, cx, cy + s * 0.02, 0.33 * s);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fill();
    G.circle(g, cx, cy, 0.33 * s);
    g.fillStyle = T.trim || G.shade(T.panel, 0.18);
    g.fill();
    G.circle(g, cx, cy, 0.29 * s);
    g.fillStyle = G.shade(T.panel, -0.12);
    g.fill();
    g.fillStyle = T.bezel;
    const st = 0.075 * s;
    for (let j = -4; j <= 4; j++) {
      for (let i = -4; i <= 4; i++) {
        const x = cx + (i + (j % 2 ? 0.5 : 0)) * st, y = cy + j * st * 0.87;
        if (G.dist(x, y, cx, cy) > 0.25 * s) continue;
        G.circle(g, x, y, 0.022 * s);
        g.fill();
      }
    }
  }

  /** LED meter positions in the header strip. */
  meterSpots() {
    const L = this.L, s = L.s;
    const x0 = L.px + s * 0.34, x1 = L.px + L.pw - s * 0.34;
    const step = (x1 - x0) / UNITS;
    const r = Math.max(1.5, Math.min(0.06 * s, step * 0.3));
    const y = L.py + HEAD * s * 0.48;
    return METER.map((_, k) => ({ x: x0 + step * (k + 0.5), y, r }));
  }

  // ---------------------------------------------------------------- sprites
  /** Pre-renders the round / moving parts that only change position or rotation. */
  buildSprites() {
    const T = THEMES[this.variant], s = this.L.s;
    this.sprites = {
      cap: this.dome(0.28 * s, T.button, false),
      capLit: this.dome(0.28 * s, T.button, true),
      knob: this.knobCap(0.26 * s, T.knob),
      knobGloss: this.knobGloss(0.26 * s),
      fader: this.faderCap(s, T.slider),
      keys: T.keys.map((col) => ({ face: this.keyCap(0.24 * s, col, false), lit: this.keyCap(0.24 * s, col, true) })),
    };
  }
  sprite(size, draw) {
    const dpr = this.app.dpr;
    const c = G.makeCanvas(size * dpr, size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    draw(g, size / 2);
    return { c, size };
  }
  dome(R, color, lit) {
    return this.sprite(R * 2.2, (g, m) => {
      const gr = g.createRadialGradient(m - R * 0.3, m - R * 0.4, R * 0.08, m, m, R);
      gr.addColorStop(0, lit ? '#ffffff' : G.shade(color, 0.5));
      gr.addColorStop(0.5, lit ? G.shade(color, 0.45) : color);
      gr.addColorStop(1, lit ? G.shade(color, 0.1) : G.shade(color, -0.3));
      G.circle(g, m, m, R);
      g.fillStyle = gr;
      g.fill();
      if (lit) return;
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.ellipse(m - R * 0.3, m - R * 0.42, R * 0.38, R * 0.2, -0.5, 0, G.TAU);
      g.fill();
      g.strokeStyle = G.shade(color, -0.35, 0.7);
      g.lineWidth = Math.max(1, R * 0.05);
      G.circle(g, m, m, R * 0.98);
      g.stroke();
    });
  }
  knobCap(R, color) {
    return this.sprite(R * 2.3, (g, m) => {
      // fluted rim
      g.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * G.TAU;
        const rr = R * (k % 2 ? 0.93 : 1);
        const x = m + Math.cos(a) * rr, y = m + Math.sin(a) * rr;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.fillStyle = G.shade(color, -0.22);
      g.fill();
      const gr = g.createRadialGradient(m, m, R * 0.1, m, m, R * 0.8);
      gr.addColorStop(0, G.shade(color, 0.25));
      gr.addColorStop(1, color);
      G.circle(g, m, m, R * 0.78);
      g.fillStyle = gr;
      g.fill();
      // grip bar across the cap, with a mark at the pointing end
      g.fillStyle = 'rgba(0,0,0,0.22)';
      G.roundRect(g, m - R * 0.17 + R * 0.04, m - R * 0.86 + R * 0.08, R * 0.34, R * 1.72, R * 0.17);
      g.fill();
      const bg = g.createLinearGradient(m - R * 0.17, 0, m + R * 0.17, 0);
      bg.addColorStop(0, G.shade(color, 0.55));
      bg.addColorStop(1, G.shade(color, 0.05));
      g.fillStyle = bg;
      G.roundRect(g, m - R * 0.17, m - R * 0.86, R * 0.34, R * 1.72, R * 0.17);
      g.fill();
      g.fillStyle = G.shade(color, -0.55);
      G.roundRect(g, m - R * 0.06, m - R * 0.78, R * 0.12, R * 0.34, R * 0.06);
      g.fill();
    });
  }
  knobGloss(R) {
    return this.sprite(R * 2.3, (g, m) => {
      const gr = g.createRadialGradient(m - R * 0.35, m - R * 0.4, 0, m, m, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.08)');
      gr.addColorStop(1, 'rgba(0,0,0,0.18)');
      G.circle(g, m, m, R);
      g.fillStyle = gr;
      g.fill();
    });
  }
  faderCap(s, color) {
    const w = 0.3 * s, h = 0.15 * s;
    return this.sprite(w * 1.3, (g, m) => {
      G.roundRect(g, m - w / 2 + w * 0.03, m - h / 2 + h * 0.2, w, h, h * 0.3);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fill();
      const gr = g.createLinearGradient(0, m - h / 2, 0, m + h / 2);
      gr.addColorStop(0, G.shade(color, 0.4));
      gr.addColorStop(0.5, color);
      gr.addColorStop(1, G.shade(color, -0.3));
      G.roundRect(g, m - w / 2, m - h / 2, w, h, h * 0.3);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = G.shade(color, -0.45, 0.8);
      g.lineWidth = Math.max(1, s * 0.012);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      for (const dx of [-0.25, 0, 0.25]) {
        g.moveTo(m + dx * w, m - h * 0.28);
        g.lineTo(m + dx * w, m + h * 0.28);
      }
      g.stroke();
    });
  }
  keyCap(size, color, lit) {
    return this.sprite(size * 1.2, (g, m) => {
      const x = m - size / 2, y = m - size / 2, r = size * 0.22;
      const gr = g.createLinearGradient(0, y, 0, y + size);
      gr.addColorStop(0, lit ? '#ffffff' : G.shade(color, 0.05));
      gr.addColorStop(lit ? 0.4 : 0.5, lit ? G.shade(color, 0.55) : G.shade(color, -0.2));
      gr.addColorStop(1, lit ? G.shade(color, 0.2) : G.shade(color, -0.42));
      G.roundRect(g, x, y, size, size, r);
      g.fillStyle = gr;
      g.fill();
      if (lit) return;
      g.fillStyle = 'rgba(255,255,255,0.4)';
      G.roundRect(g, x + size * 0.12, y + size * 0.08, size * 0.76, size * 0.26, r * 0.7);
      g.fill();
    });
  }

  // ---------------------------------------------------------------- drawing
  draw(ctx) {
    const app = this.app;
    if (!this.L) this.resize(this.area);
    const ly = this.layer;
    if (!ly || ly.w !== app.w || ly.h !== app.h || ly.dpr !== app.dpr) this.renderLayer();
    if (!this.sprites) this.buildSprites();
    ctx.drawImage(this.layer.c, 0, 0, app.w, app.h);
    const T = THEMES[this.variant];
    for (const c of this.ctrls) {
      if (c.kind === 'toggle') this.drawToggle(ctx, c, T);
      else if (c.kind === 'rocker') this.drawRocker(ctx, c, T);
      else if (c.kind === 'button') this.drawButton(ctx, c, T);
      else if (c.kind === 'knob') this.drawKnob(ctx, c, T);
      else if (c.kind === 'slider') this.drawSlider(ctx, c, T);
      else if (c.kind === 'keypad') this.drawKeypad(ctx, c, T);
    }
    this.drawMeter(ctx);
  }

  /** LED: additive glow + lens + specular dot. `a` = brightness 0..1. */
  led(ctx, x, y, r, color, a) {
    if (a > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(glowSprite(color), x - r * 4.5, y - r * 4.5, r * 9, r * 9);
      ctx.restore();
    }
    G.circle(ctx, x, y, r);
    ctx.fillStyle = G.mixColor(G.shade(color, -0.6), G.shade(color, 0.5), G.clamp(a, 0, 1));
    ctx.fill();
    G.circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.32);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * G.clamp(a, 0, 1)})`;
    ctx.fill();
  }

  /** Chunky paddle lever: tilts up (on) or down (off) out of its boot, with a springy flip. */
  drawToggle(ctx, c, T) {
    const s = c.s, cx = c.cx, pivot = c.cy + 0.08 * s;
    const color = T.levers[c.i % 3];
    this.led(ctx, cx, c.cy - 0.33 * s, 0.055 * s, G.shade(color, 0.25), c.led);
    const p = G.clamp(c.p, -1.2, 1.2);
    // looking down on it, the raised lever reads longer than the lowered one
    const len = (p >= 0 ? 0.27 : 0.19) * s;
    const tip = pivot - p * len;
    const w0 = 0.13 * s, w1 = 0.21 * s; // width at the boot / at the tip
    const capH = 0.12 * s + 0.03 * s * (1 - Math.min(1, Math.abs(p)));
    if (T.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.45 * c.led;
      ctx.drawImage(glowSprite(color), cx - s * 0.3, tip - s * 0.3, s * 0.6, s * 0.6);
      ctx.restore();
    }
    // soft shadow cast down-right onto the slot
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    G.roundRect(ctx, cx - w1 / 2 + s * 0.035, Math.min(pivot, tip) - capH * 0.3 + s * 0.05, w1, Math.abs(tip - pivot) + capH * 0.6, w1 * 0.4);
    ctx.fill();
    // tapered stem
    if (Math.abs(tip - pivot) > 0.5) {
      const gr = ctx.createLinearGradient(cx - w1 / 2, 0, cx + w1 / 2, 0);
      gr.addColorStop(0, G.shade(color, 0.32));
      gr.addColorStop(0.45, color);
      gr.addColorStop(1, G.shade(color, -0.35));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(cx - w0 / 2, pivot);
      ctx.lineTo(cx - w1 / 2, tip);
      ctx.lineTo(cx + w1 / 2, tip);
      ctx.lineTo(cx + w0 / 2, pivot);
      ctx.closePath();
      ctx.fill();
    }
    // the paddle end, lit from above when it points up
    const cy = tip;
    const cg = ctx.createLinearGradient(0, cy - capH / 2, 0, cy + capH / 2);
    cg.addColorStop(0, G.shade(color, p >= 0 ? 0.45 : 0.2));
    cg.addColorStop(1, G.shade(color, p >= 0 ? -0.05 : -0.3));
    ctx.fillStyle = cg;
    G.roundRect(ctx, cx - w1 / 2, cy - capH / 2, w1, capH, capH * 0.45);
    ctx.fill();
    ctx.strokeStyle = G.shade(color, -0.45, 0.55);
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    G.roundRect(ctx, cx - w1 * 0.36, cy - capH * 0.34, w1 * 0.42, capH * 0.24, capH * 0.12);
    ctx.fill();
  }

  /** I/O rocker: the pressed half sinks and darkens, the raised half catches the light. */
  drawRocker(ctx, c, T) {
    const s = c.s, w = 0.3 * s, h = 0.52 * s, x = c.cx - w / 2, y = c.cy - h / 2;
    const color = T.rockers[c.i === 5 ? 0 : 1];
    const q = G.clamp(c.q, -1.2, 1.2); // +1: top ("I") pressed in
    const split = c.cy - q * 0.05 * s;
    const r = 0.05 * s;
    const upTop = G.clamp((1 - q) / 2, 0, 1);
    G.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = G.shade(color, -0.45);
    ctx.fill();
    const half = (y0, y1, raised, litFromTop) => {
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      const hi = -0.28 + 0.62 * raised, lo = -0.32 + 0.3 * raised;
      gr.addColorStop(0, G.shade(color, litFromTop ? hi : lo));
      gr.addColorStop(1, G.shade(color, litFromTop ? lo : hi * 0.6));
      ctx.fillStyle = gr;
      G.roundRect(ctx, x + s * 0.012, y0, w - s * 0.024, y1 - y0, r * 0.8);
      ctx.fill();
    };
    half(y + s * 0.012, split - s * 0.006, upTop, true);
    half(split + s * 0.006, y + h - s * 0.012, 1 - upTop, false);
    // light inside the rocker when on
    if (c.led > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = c.led * (T.glow ? 0.85 : 0.55);
      ctx.drawImage(glowSprite(color), c.cx - s * 0.32, c.cy - s * 0.4, s * 0.64, s * 0.8);
      ctx.restore();
    } else if (T.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18;
      ctx.drawImage(glowSprite(color), c.cx - s * 0.3, c.cy - s * 0.38, s * 0.6, s * 0.76);
      ctx.restore();
    }
    // I / O marks (dark on pale rockers)
    const [cr, cg, cb] = G.parseColor(color);
    const pale = cr * 0.3 + cg * 0.59 + cb * 0.11 > 200;
    ctx.strokeStyle = pale ? 'rgba(40,40,60,0.55)' : `rgba(255,255,255,${0.6 + 0.4 * c.led})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    const ty = (y + split) / 2, by = (split + y + h) / 2;
    ctx.beginPath();
    ctx.moveTo(c.cx, ty - s * 0.055);
    ctx.lineTo(c.cx, ty + s * 0.055);
    ctx.stroke();
    ctx.strokeStyle = pale ? 'rgba(40,40,60,0.45)' : 'rgba(255,255,255,0.6)';
    G.circle(ctx, c.cx, by, s * 0.045);
    ctx.stroke();
    // crease shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + s * 0.02, split - s * 0.006, w - s * 0.04, s * 0.012);
  }

  /** Big arcade button: sinks into its ring, glows while pressed, springs back. */
  drawButton(ctx, c, T) {
    const s = c.s, sp = this.sprites;
    const depth = 0.075 * s, R = 0.28 * s;
    const pr = G.clamp(c.press, -0.25, 1.05);
    // a slow idle pulse invites a press
    const idle = (T.glow ? 0.3 : 0.1) + 0.08 * Math.sin(this.app.time * 2.2);
    const glow = Math.max(c.light, idle);
    if (glow > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glow;
      ctx.drawImage(glowSprite(T.button), c.cx - s * 0.62, c.cy - s * 0.62, s * 1.24, s * 1.24);
      ctx.restore();
    }
    G.circle(ctx, c.cx, c.cy + depth * 0.15, R);
    ctx.fillStyle = G.shade(T.button, -0.5);
    ctx.fill();
    const top = c.cy - depth * (1 - pr);
    const size = sp.cap.size * (1 - 0.03 * Math.max(0, pr));
    ctx.drawImage(sp.cap.c, c.cx - size / 2, top - size / 2, size, size);
    if (c.light > 0.02) {
      ctx.globalAlpha = c.light * 0.85;
      ctx.drawImage(sp.capLit.c, c.cx - size / 2, top - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  /** Rotary knob with 12 indicator dots that light up as it clicks past them. */
  drawKnob(ctx, c, T) {
    const s = c.s, sp = this.sprites;
    const cur = ((c.detent % 12) + 12) % 12;
    for (let k = 0; k < 12; k++) {
      const a = Math.max(c.dots[k], k === cur ? 0.75 : 0);
      if (a < 0.03) continue;
      const ang = -Math.PI / 2 + k * DETENT;
      this.led(ctx, c.cx + Math.cos(ang) * 0.35 * s, c.cy + Math.sin(ang) * 0.35 * s, 0.028 * s, T.dot, a);
    }
    if (T.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(glowSprite(T.knob), c.cx - s * 0.42, c.cy - s * 0.42, s * 0.84, s * 0.84);
      ctx.restore();
    }
    const k = sp.knob.size;
    ctx.save();
    ctx.translate(c.cx, c.cy);
    ctx.rotate(c.shown);
    ctx.drawImage(sp.knob.c, -k / 2, -k / 2, k, k);
    ctx.restore();
    ctx.drawImage(sp.knobGloss.c, c.cx - k / 2, c.cy - k / 2, k, k);
  }

  /** Fader: the scale lights up below the cap like a level meter. */
  drawSlider(ctx, c, T) {
    const s = c.s, { tx, top, bot } = this.sliderEnds(c);
    const y = bot - c.value * (bot - top);
    const col = T.slider === '#ffffff' ? '#ff4d8d' : T.slider;
    // lit groove below the cap
    if (bot - y > 1) {
      ctx.fillStyle = G.alpha(col, 0.85);
      G.roundRect(ctx, tx - 0.018 * s, y, 0.036 * s, bot - y + 0.04 * s, 0.018 * s);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, 0.03 * s);
    for (let k = 0; k <= TICKS; k++) {
      if (k > c.value * TICKS + 0.05) break;
      const ty = bot - (k * (bot - top)) / TICKS;
      const long = k % 4 === 0 ? 0.06 * s : 0;
      ctx.strokeStyle = METER[Math.min(8, k)];
      ctx.beginPath();
      ctx.moveTo(c.cx + 0.07 * s, ty);
      ctx.lineTo(c.cx + 0.15 * s + long, ty);
      ctx.stroke();
    }
    if (T.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowSprite(col), tx - s * 0.25, y - s * 0.2, s * 0.5, s * 0.4);
      ctx.restore();
    }
    const f = this.sprites.fader;
    ctx.drawImage(f.c, tx - f.size / 2, y - f.size / 2, f.size, f.size);
  }

  /** 2×2 keypad of latching light-up keys. */
  drawKeypad(ctx, c, T) {
    const s = c.s, sz = 0.24 * s, depth = 0.045 * s, sp = this.sprites.keys;
    c.keys.forEach((key, k) => {
      const kx = c.cx + (k % 2 ? 0.15 : -0.15) * s, ky = c.cy + (k < 2 ? -0.15 : 0.15) * s;
      const col = T.keys[k];
      const pr = G.clamp(key.press, -0.25, 1.05);
      if (key.light > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = key.light * 0.8;
        ctx.drawImage(glowSprite(col), kx - sz, ky - sz, sz * 2, sz * 2);
        ctx.restore();
      }
      G.roundRect(ctx, kx - sz / 2, ky - sz / 2 + depth * 0.2, sz, sz, sz * 0.22);
      ctx.fillStyle = G.shade(col, -0.5);
      ctx.fill();
      const top = ky - depth * (1 - pr);
      const f = sp[k].face;
      ctx.drawImage(f.c, kx - f.size / 2, top - f.size / 2, f.size, f.size);
      if (key.light > 0.02) {
        ctx.globalAlpha = key.light;
        ctx.drawImage(sp[k].lit.c, kx - f.size / 2, top - f.size / 2, f.size, f.size);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = key.light * 0.45;
        ctx.drawImage(glowSprite(col), kx - sz * 0.75, top - sz * 0.75, sz * 1.5, sz * 1.5);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    });
  }

  /** Header LEDs count the switches that are on; a rainbow chase plays when all are on. */
  drawMeter(ctx) {
    const t = this.app.time;
    const spots = this.meterSpots();
    const sweep = this.boot > 0 ? (0.7 - this.boot) / 0.7 : -1;
    spots.forEach((m, k) => {
      let a = this.meter[k], col = METER[k];
      if (this.chase > 0) {
        col = METER[(k + Math.floor(t * 14)) % METER.length];
        a = 0.55 + 0.45 * Math.max(0, Math.sin(t * 12 - k * 0.8));
      } else if (this.celebrated) {
        a = 0.75 + 0.25 * Math.sin(t * 3 + k * 0.6);
      }
      if (sweep >= 0) a = Math.max(a, Math.max(0, 1 - Math.abs(sweep * (UNITS + 2) - 1 - k) * 0.6));
      this.led(ctx, m.x, m.y, m.r, col, a);
    });
  }

  hud() {
    const n = this.app.getStat('clicks');
    return `${G.formatNum(n)} ${countLabel(this.app, n, LABEL_ONE, LABEL, RU_FEW)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const T = THEMES[i];
    ctx.fillStyle = T.bg[1];
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    G.roundRect(ctx, x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2, r * 0.24);
    ctx.fillStyle = T.panel;
    ctx.fill();
    if (T.trim || T.glow) {
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.strokeStyle = T.trim || '#c77dff';
      ctx.stroke();
    }
    // toggle switch
    G.roundRect(ctx, x - r * 0.58, y - r * 0.36, r * 0.32, r * 0.66, r * 0.1);
    ctx.fillStyle = T.bezel;
    ctx.fill();
    G.roundRect(ctx, x - r * 0.52, y - r * 0.44, r * 0.2, r * 0.42, r * 0.08);
    ctx.fillStyle = T.levers[0];
    ctx.fill();
    // arcade button
    G.circle(ctx, x + r * 0.28, y + r * 0.02, r * 0.36);
    ctx.fillStyle = T.bezel;
    ctx.fill();
    G.circle(ctx, x + r * 0.28, y - r * 0.03, r * 0.26);
    ctx.fillStyle = T.button;
    ctx.fill();
    G.circle(ctx, x + r * 0.2, y - r * 0.12, r * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
}
