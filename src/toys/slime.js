// Slime: a squishy soft-body blob. Poke it, squash it, stretch it — even with two fingers at once.
import { Toy } from './_base.js';
import * as G from '../gfx.js';

const TAU = G.TAU;
const N = 48; // rim points
// Soft-body tuning, in blob radii and seconds (point mass 1).
const K_SHAPE = 38; // pull toward the rest shape around the current center
const K_EDGE = 900; // neighbour springs keep the spacing
const C_EDGE = 6; // damping along the springs (kills jitter, keeps the wobble)
const K_BEND = 160; // i ↔ i+2 springs smooth out kinks
const K_HOME = 9; // the center drifts back home
const K_AREA = 26; // pressure: squash one side and the rest bulges out
const DAMP = 2.2; // overall velocity damping per second
const K_PRESS = 70, PRESS_R = 1.3; // a pressing finger pushes the nearby rim outward
const K_GRAB = 160, MAX_PULL = 1.5, GRAB_R = 0.9; // dragging pulls the rim near the finger along (soft limit)
const K_ANCHOR = 25; // while one side is pulled, the rest sticks to the table a little, so it stretches
const K_ATTRACT = 14; // a finger just outside makes the rim reach toward it
const HL = Math.round(N * 0.625); // rim index pointing up-left (toward the light)

/** Rest shape: a soft, slightly squat and lumpy puddle rather than a perfect ball. */
const REST_X = new Float64Array(N), REST_Y = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const a = (i * TAU) / N;
  const r = 1 + 0.035 * Math.sin(3 * a + 0.7) + 0.025 * Math.sin(5 * a + 2.1) + 0.015 * Math.cos(2 * a);
  REST_X[i] = Math.cos(a) * r * 1.06;
  REST_Y[i] = Math.sin(a) * r * 0.95;
}
const EDGE_L = new Float64Array(N), BEND_L = new Float64Array(N);
let REST_AREA = 0;
for (let i = 0; i < N; i++) {
  const j = (i + 1) % N, k = (i + 2) % N;
  EDGE_L[i] = Math.hypot(REST_X[j] - REST_X[i], REST_Y[j] - REST_Y[i]);
  BEND_L[i] = Math.hypot(REST_X[k] - REST_X[i], REST_Y[k] - REST_Y[i]);
  REST_AREA += 0.5 * (REST_X[i] * REST_Y[j] - REST_X[j] * REST_Y[i]);
}

/** Per style: body colors, swirl colors, glitter, extras, backdrop and squish pitch. */
const STYLES = [
  { color: '#ff8fcf', light: '#ffd3ee', dark: '#d9549c', swirl: ['#c58cff', '#ffffff'], glitter: ['#ffffff', '#ffe0f4', '#dcb8ff'], n: 36, bg: ['#fff0f8', '#ffc0e1'], pitch: 1 },
  { color: '#4cc9f0', light: '#c4f3ff', dark: '#1a83bd', swirl: ['#2563d8', '#ecfbff'], glitter: ['#ffffff', '#c9f6ff'], n: 24, bubbles: true, bg: ['#e4f8ff', '#9bdaf0'], pitch: 0.9 },
  { color: '#9ef01a', light: '#e8ffa3', dark: '#56a800', swirl: ['#eaff70', '#2fb84a'], glitter: ['#ffffff', '#f4ffb8'], n: 24, glow: true, bg: ['#f4ffe4', '#c5ec96'], pitch: 1.1 },
  { color: '#5a189a', light: '#a259e6', dark: '#22003f', swirl: ['#f72585', '#4cc9f0'], glitter: ['#ffffff', '#ffd6ff', '#bde0fe'], n: 80, stars: true, bg: ['#ece4ff', '#ae9ce3'], pitch: 0.8 },
  { color: '#ffd166', light: '#fff2bd', dark: '#d99400', swirl: ['#fff6cc', '#ffae00'], glitter: ['#ffffff', '#fff3b0', '#ffb703', '#ff9f1c'], n: 130, sparkly: true, bg: ['#fff8e4', '#ffd996'], pitch: 1 },
  { color: '#ff70a6', light: '#ffd6e7', dark: '#7a3fa0', swirl: ['#ffffff', '#ffffff'], glitter: ['#ffffff', '#fff3b0', '#c7f9ff'], n: 40, rainbow: true, bg: ['#fff0f6', '#d6c4ff'], pitch: 1.05 },
];
const LABEL = {
  en: ['squish', 'squishes'], vi: 'lần bóp', es: ['apretón', 'apretones'], pt: ['aperto', 'apertos'], fr: ['pression', 'pressions'],
  de: ['Quetscher', 'Quetscher'], id: 'remasan', it: ['schiacciata', 'schiacciate'], tr: 'sıkma', ru: ['сжатие', 'сжатия', 'сжатий'],
};
const SEP = { en: ',', vi: '.', es: '.', pt: '.', fr: ' ', de: '.', id: '.', it: '.', tr: '.', ru: ' ' };

/** 1,234 style grouping with the separator of the current language. */
function group(n, lang) {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, SEP[lang] ?? ',');
}
/** Small deterministic PRNG so glitter and swirls are the same every time a style loads. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Things suspended in the slime, in material coordinates: s = position along the rim (in point
 * indices), rr = fraction of the way from the center to the rim. They ride along as it deforms.
 */
function makeDecor(i) {
  const st = STYLES[i], rnd = rng(100 + i * 31);
  const glitter = [];
  for (let k = 0; k < st.n; k++) {
    glitter.push({
      s: rnd() * N, rr: Math.sqrt(rnd()) * 0.9, size: (st.sparkly ? 0.011 : 0.008) + rnd() * 0.014, ph: rnd() * TAU, sp: 1.5 + rnd() * 3,
      col: st.glitter[k % st.glitter.length], star: rnd() < (st.stars || st.sparkly ? 0.3 : 0.14),
    });
  }
  // broad marbled bands curling through the blob
  const swirls = [];
  for (let k = 0; k < 3; k++) {
    const s0 = (k / 3) * N + rnd() * N * 0.15, ph = rnd() * TAU, amp = 0.12 + rnd() * 0.1, base = 0.5 + rnd() * 0.14, pts = [];
    for (let j = 0; j < 6; j++) pts.push([s0 + j * N * 0.07, G.clamp(base + amp * Math.sin(ph + j * 1.1), 0.2, 0.84)]);
    swirls.push({ pts, w: 0.22 + rnd() * 0.1, col: st.swirl[k % 2] });
  }
  const bubbles = [];
  if (st.bubbles) for (let k = 0; k < 12; k++) bubbles.push({ s: rnd() * N, rr: Math.sqrt(rnd()) * 0.82, size: 0.018 + rnd() * 0.035 });
  return { glitter, swirls, bubbles };
}

/** Open smooth curve through points (quadratic midpoints). */
function smoothOpenPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

export class SlimeToy extends Toy {
  static id = 'slime';

  constructor(app) {
    super(app);
    this.px = new Float64Array(N);
    this.py = new Float64Array(N);
    this.vx = new Float64Array(N);
    this.vy = new Float64Array(N);
    this.fx = new Float64Array(N);
    this.fy = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.px[i] = REST_X[i];
      this.py[i] = REST_Y[i];
    }
    this.sx = new Float64Array(N); // rim in screen space, refreshed every frame
    this.sy = new Float64Array(N);
    this.pts = Array.from({ length: N }, () => [0, 0]);
    this.touches = new Map();
    this.fading = []; // dimples easing out after a finger lifts
    this.squishCd = 0;
    this.decor = null;
    this.icons = new Map();
    this.sparkle = null;
    this.hx = 0;
    this.hy = 0;
    this.R = 40;
  }

  enter() {
    if (!this.decor || this.decorFor !== this.variant) this.setStyle();
  }
  exit() {
    this.touches.clear();
    this.fading.length = 0;
  }
  setVariant() {
    this.setStyle();
    this.nudge(0, -1.6); // a happy little hop
    this.app.audio.squish(1.25, 0.7);
  }
  setStyle() {
    this.decorFor = this.variant;
    this.decor = makeDecor(this.variant);
  }
  resize(area) {
    // all the physics lives in blob-radius units, so a resize only changes this mapping
    this.hx = area.x + area.w / 2;
    this.hy = area.y + area.h * 0.48;
    this.R = Math.max(10, Math.min(area.w, area.h) * 0.32);
    this.sparkle = null;
  }

  // ---------------------------------------------------------------- geometry
  center() {
    let x = 0, y = 0;
    for (let i = 0; i < N; i++) {
      x += this.px[i];
      y += this.py[i];
    }
    return { x: x / N, y: y / N };
  }
  /** Point-in-blob test (grow > 1 tests against a slightly bigger blob, for forgiving touches). */
  contains(x, y, grow = 1) {
    const c = this.center(), px = this.px, py = this.py;
    const qx = c.x + (x - c.x) / grow, qy = c.y + (y - c.y) / grow;
    let inside = false;
    for (let i = 0, j = N - 1; i < N; j = i++) {
      if ((py[i] > qy) !== (py[j] > qy) && qx < ((px[j] - px[i]) * (qy - py[i])) / (py[j] - py[i]) + px[i]) inside = !inside;
    }
    return inside;
  }
  toSlime(x, y) {
    return { x: (x - this.hx) / this.R, y: (y - this.hy) / this.R };
  }
  pan(x) {
    return (x / Math.max(1, this.app.w) - 0.5) * 0.7;
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    const app = this.app, s = this.toSlime(p.x, p.y);
    const c = this.center();
    const inside = this.contains(s.x, s.y, 1.06);
    const tc = {
      x: s.x, y: s.y, ax: s.x, ay: s.y, downX: p.x, downY: p.y, sx: p.x, sy: p.y,
      mode: inside ? 'press' : G.dist(s.x, s.y, c.x, c.y) < 1.8 ? 'attract' : 'none',
      over: inside, depth: 0, moved: 0, speed: 0, w: null, gx: null, gy: null,
    };
    this.touches.set(p.id, tc);
    if (!inside) return;
    app.audio.squish(STYLES[this.variant].pitch * G.rand(0.88, 1.12), 0.9, this.pan(p.x));
    app.haptic(10);
    app.stat('squishes');
    app.addProgress(0.05, p.x, p.y);
  }
  pointerMove(p) {
    const tc = this.touches.get(p.id);
    if (!tc) return;
    const s = this.toSlime(p.x, p.y);
    tc.moved += G.dist(tc.x, tc.y, s.x, s.y);
    tc.x = s.x;
    tc.y = s.y;
    tc.sx = p.x;
    tc.sy = p.y;
    if (tc.mode === 'press' && G.dist(p.x, p.y, tc.downX, tc.downY) > 7) this.startGrab(tc);
    if (tc.mode !== 'none' && tc.mode !== 'attract') tc.over = this.contains(s.x, s.y, 1.02);
  }
  pointerUp(p) {
    const tc = this.touches.get(p.id);
    if (!tc) return;
    this.touches.delete(p.id);
    if (tc.depth > 0.05 && tc.over) this.fading.push({ x: tc.x, y: tc.y, depth: tc.depth });
    if (p.cancel || tc.mode === 'none' || tc.mode === 'attract') return;
    // letting go: sometimes a soft suction "plop", always after a big stretch
    const pull = G.dist(tc.x, tc.y, tc.ax, tc.ay);
    if ((tc.mode === 'grab' && pull > 0.45) || Math.random() < 0.3) {
      this.app.audio.pop(G.rand(0.5, 0.7) * STYLES[this.variant].pitch, tc.mode === 'grab' ? 0.45 : 0.28, this.pan(p.x));
      this.app.haptic(6);
    }
  }

  /** The finger moved off its press point: grab the nearby part of the rim and stretch it. */
  startGrab(tc) {
    tc.mode = 'grab';
    const px = this.px, py = this.py;
    tc.w = new Float64Array(N);
    tc.gx = new Float64Array(N);
    tc.gy = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      // rim points close to where the finger pressed follow it, with a smooth falloff: pressed near
      // the edge it pulls out a stretchy lobe, pressed in the middle the whole blob comes along
      const d = Math.hypot(px[i] - tc.ax, py[i] - tc.ay);
      tc.w[i] = Math.exp(-((d / GRAB_R) ** 2));
      tc.gx[i] = px[i];
      tc.gy[i] = py[i];
    }
  }

  keyDown(e) {
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      this.poke();
      return true;
    }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[k]) {
      this.nudge(dirs[k][0] * 2.2, dirs[k][1] * 2.2);
      this.app.audio.squish(STYLES[this.variant].pitch * G.rand(1, 1.2), 0.5);
      return true;
    }
    return false;
  }
  /** Keyboard poke: a squish at a random spot with its dimple. */
  poke() {
    const app = this.app, c = this.center();
    const a = G.rand(TAU), r = G.rand(0.15, 0.6), x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    for (let i = 0; i < N; i++) {
      const dx = this.px[i] - x, dy = this.py[i] - y, d = Math.hypot(dx, dy) || 1;
      if (d < PRESS_R) {
        const f = (2.4 * (1 - d / PRESS_R) ** 2) / d;
        this.vx[i] += dx * f;
        this.vy[i] += dy * f;
      }
    }
    this.fading.push({ x, y, depth: 1 });
    const sx = this.hx + x * this.R, sy = this.hy + y * this.R;
    app.audio.squish(STYLES[this.variant].pitch * G.rand(0.88, 1.12), 0.9, this.pan(sx));
    app.haptic(10);
    app.stat('squishes');
    app.addProgress(0.05, sx, sy);
  }
  /** Shove the whole blob; the springs turn it into a wobble. */
  nudge(dx, dy) {
    const c = this.center();
    for (let i = 0; i < N; i++) {
      const along = (this.px[i] - c.x) * dx + (this.py[i] - c.y) * dy; // front side moves first
      this.vx[i] += dx * (1 + 0.25 * along);
      this.vy[i] += dy * (1 + 0.25 * along);
    }
  }

  // ---------------------------------------------------------------- simulation
  spring(i, j, L0, k, c) {
    const { px, py, vx, vy, fx, fy } = this;
    const dx = px[j] - px[i], dy = py[j] - py[i];
    const L = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / L, uy = dy / L;
    const f = k * (L - L0) + c * ((vx[j] - vx[i]) * ux + (vy[j] - vy[i]) * uy);
    fx[i] += f * ux;
    fy[i] += f * uy;
    fx[j] -= f * ux;
    fy[j] -= f * uy;
  }

  step(h, t) {
    const { px, py, vx, vy, fx, fy } = this;
    let cx = 0, cy = 0, area = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      cx += px[i];
      cy += py[i];
      area += px[i] * py[j] - px[j] * py[i];
    }
    cx /= N;
    cy /= N;
    area *= 0.5;
    const pressure = (K_AREA * (REST_AREA - area)) / REST_AREA;
    const breathe = 1 + 0.016 * Math.sin(t * 1.5); // idle: slow breathing plus a lazy wobble
    for (let i = 0; i < N; i++) {
      const a = (i * TAU) / N;
      const rr = breathe + 0.011 * Math.sin(2 * a + t * 1.2) + 0.007 * Math.sin(3 * a - t * 0.9 + 1);
      let gx = K_SHAPE * (cx + REST_X[i] * rr - px[i]) - K_HOME * cx;
      let gy = K_SHAPE * (cy + REST_Y[i] * rr - py[i]) - K_HOME * cy;
      const ip = (i + N - 1) % N, inx = (i + 1) % N;
      const nx = py[inx] - py[ip], ny = px[ip] - px[inx];
      const nl = Math.hypot(nx, ny) || 1;
      gx += (pressure * nx) / nl;
      gy += (pressure * ny) / nl;
      fx[i] = gx;
      fy[i] = gy;
    }
    for (let i = 0; i < N; i++) {
      this.spring(i, (i + 1) % N, EDGE_L[i], K_EDGE, C_EDGE);
      this.spring(i, (i + 2) % N, BEND_L[i], K_BEND, C_EDGE * 0.5);
    }
    for (const tc of this.touches.values()) this.applyTouch(tc);
    const d = Math.exp(-DAMP * h);
    for (let i = 0; i < N; i++) {
      vx[i] = (vx[i] + fx[i] * h) * d;
      vy[i] = (vy[i] + fy[i] * h) * d;
      px[i] += vx[i] * h;
      py[i] += vy[i] * h;
    }
  }

  applyTouch(tc) {
    const { px, py, fx, fy } = this;
    if (tc.mode === 'none') return;
    if (tc.mode === 'attract') {
      for (let i = 0; i < N; i++) {
        const dx = tc.x - px[i], dy = tc.y - py[i], d = Math.hypot(dx, dy);
        if (d < 1) {
          const w = K_ATTRACT * (1 - d) ** 2;
          fx[i] += dx * w;
          fy[i] += dy * w;
        }
      }
      return;
    }
    // a finger pressing into the surface: the rim around it bulges away
    const D = tc.depth * (tc.mode === 'grab' ? 0.35 : 1);
    if (D > 0.01 && tc.over) {
      for (let i = 0; i < N; i++) {
        const dx = px[i] - tc.x, dy = py[i] - tc.y, d = Math.hypot(dx, dy);
        if (d < PRESS_R && d > 1e-4) {
          const f = (K_PRESS * D * (1 - d / PRESS_R) ** 2) / d;
          fx[i] += dx * f;
          fy[i] += dy * f;
        }
      }
    }
    if (tc.mode === 'grab') {
      let dx = tc.x - tc.ax, dy = tc.y - tc.ay;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        const s = (MAX_PULL * Math.tanh(d / MAX_PULL)) / d; // stretchy, but only so far
        dx *= s;
        dy *= s;
      }
      for (let i = 0; i < N; i++) {
        const kg = K_GRAB * tc.w[i], ka = K_ANCHOR * (1 - tc.w[i]);
        fx[i] += kg * (tc.gx[i] + dx - px[i]) + ka * (tc.gx[i] - px[i]);
        fy[i] += kg * (tc.gy[i] + dy - py[i]) + ka * (tc.gy[i] - py[i]);
      }
    }
  }

  update(dt) {
    const app = this.app;
    if (!this.decor) this.setStyle();
    const steps = Math.min(6, Math.max(2, Math.ceil(dt * 120)));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) this.step(h, app.time + k * h);
    // never let a glitch poison the blob
    if (!Number.isFinite(this.px[0] + this.py[0] + this.px[N >> 1] + this.py[N >> 1])) {
      for (let i = 0; i < N; i++) {
        this.px[i] = REST_X[i];
        this.py[i] = REST_Y[i];
        this.vx[i] = this.vy[i] = 0;
      }
    }
    let dragging = null;
    this.squishCd -= dt;
    for (const tc of this.touches.values()) {
      tc.depth = G.damp(tc.depth, tc.over ? (tc.mode === 'press' ? 1 : tc.mode === 'grab' ? 0.6 : 0) : 0, 16, dt);
      tc.speed = G.damp(tc.speed, tc.moved / Math.max(1e-3, dt), 10, dt);
      tc.moved = 0;
      if (tc.mode === 'grab' && tc.speed > 0.25) dragging = tc;
      // wet squelches while dragging, faster for faster drags but never more than ~6 a second
      if (tc.mode === 'grab' && tc.speed > 1.1 && this.squishCd <= 0) {
        const k = Math.min(1, tc.speed / 8);
        app.audio.squish(STYLES[this.variant].pitch * (0.8 + 0.35 * k) * G.rand(0.92, 1.08), 0.3 + 0.45 * k, this.pan(tc.sx));
        this.squishCd = G.rand(0.17, 0.26) + 0.2 * (1 - k);
      }
    }
    if (dragging) app.addProgress(0.15 * dt, dragging.sx, dragging.sy);
    for (const f of this.fading) f.depth -= dt * 4;
    this.fading = this.fading.filter((f) => f.depth > 0);
  }

  // ---------------------------------------------------------------- drawing
  /** Maps a material coordinate (s along the rim, rr from the center) to the screen. */
  map(s, rr, C) {
    s = ((s % N) + N) % N;
    const i0 = Math.floor(s), i1 = (i0 + 1) % N, f = s - i0;
    const bx = this.sx[i0] + (this.sx[i1] - this.sx[i0]) * f, by = this.sy[i0] + (this.sy[i1] - this.sy[i0]) * f;
    return [C.x + (bx - C.x) * rr, C.y + (by - C.y) * rr];
  }

  sparkleSprite() {
    if (this.sparkle) return this.sparkle;
    const dpr = this.app.dpr, s = 32;
    const c = G.makeCanvas(s * dpr, s * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const gl = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gl.addColorStop(0, 'rgba(255,255,255,0.9)');
    gl.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffffff';
    g.beginPath();
    G.softStarPath(g, s / 2, s / 2, 4, s * 0.48, s * 0.09, 0);
    g.fill();
    this.sparkle = c;
    return c;
  }

  /** Body fill: radial gloss in the style color, or a slowly drifting rainbow. */
  bodyFill(ctx, st, C, r, t) {
    if (st.rainbow) {
      const a = t * 0.3, dx = Math.cos(a) * r * 1.2, dy = Math.sin(a) * r * 1.2;
      const lg = ctx.createLinearGradient(C.x - dx, C.y - dy, C.x + dx, C.y + dy);
      for (let k = 0; k <= 6; k++) lg.addColorStop(k / 6, G.hsl((k * 55 + t * 30) % 360, 95, 72));
      return lg;
    }
    const rg = ctx.createRadialGradient(C.x - r * 0.32, C.y - r * 0.38, r * 0.05, C.x, C.y, r * 1.2);
    rg.addColorStop(0, st.light);
    rg.addColorStop(0.5, st.color);
    rg.addColorStop(0.85, G.mixColor(st.color, st.dark, 0.55));
    rg.addColorStop(1, st.dark);
    return rg;
  }

  draw(ctx) {
    const app = this.app, st = STYLES[this.variant], t = app.time, R = this.R;
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1]);
    if (!this.decor) this.setStyle();
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) {
      const x = this.hx + this.px[i] * R, y = this.hy + this.py[i] * R;
      this.sx[i] = x;
      this.sy[i] = y;
      this.pts[i][0] = x;
      this.pts[i][1] = y;
      cx += x;
      cy += y;
    }
    const C = { x: cx / N, y: cy / N };
    let r = 0;
    for (let i = 0; i < N; i++) r += Math.hypot(this.sx[i] - C.x, this.sy[i] - C.y);
    r = Math.max(4, r / N); // average radius on screen (grows while stretched): used for shading
    const u = R; // rest radius: decorations keep their size however the blob is pulled
    const path = new Path2D();
    G.smoothClosedPath(path, this.pts);

    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < N; i++) {
      x0 = Math.min(x0, this.sx[i]);
      x1 = Math.max(x1, this.sx[i]);
      y0 = Math.min(y0, this.sy[i]);
      y1 = Math.max(y1, this.sy[i]);
    }
    const bw = Math.max(4, x1 - x0) / 2, bh = Math.max(4, y1 - y0) / 2, bx = (x0 + x1) / 2, by = (y0 + y1) / 2;
    // ground shadow: a soft contact ellipse under the blob plus a faint offset silhouette
    G.groundShadow(ctx, bx + r * 0.02, y1 - bh * 0.18, bw * 1.12, bh * 0.4, 0.26);
    ctx.save();
    ctx.translate(C.x + r * 0.025, C.y + r * 0.075);
    ctx.scale(1.02, 1.02);
    ctx.translate(-C.x, -C.y);
    ctx.fillStyle = 'rgba(70,20,60,0.09)';
    ctx.fill(path);
    ctx.restore();
    if (st.glow) {
      // neon glow: a smooth halo fitted to the blob's current bounds, gently pulsing
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(1, bh / bw);
      const gg = ctx.createRadialGradient(0, 0, bw * 0.7, 0, 0, bw * 1.5);
      gg.addColorStop(0, G.alpha(st.color, 0.42 * (0.85 + 0.15 * Math.sin(t * 2.2))));
      gg.addColorStop(1, G.alpha(st.color, 0));
      ctx.fillStyle = gg;
      G.circle(ctx, 0, 0, bw * 1.5);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = this.bodyFill(ctx, st, C, r, t);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    if (st.rainbow) {
      // keep the rainbow round and glossy
      const sh = ctx.createRadialGradient(C.x - r * 0.3, C.y - r * 0.35, r * 0.1, C.x, C.y, r * 1.2);
      sh.addColorStop(0, 'rgba(255,255,255,0.35)');
      sh.addColorStop(0.6, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(90,0,70,0.3)');
      ctx.fillStyle = sh;
      ctx.fillRect(C.x - r * 3, C.y - r * 3, r * 6, r * 6);
    }
    // marbled swirls drifting slowly through the slime
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const sw of this.decor.swirls) {
      const pts = sw.pts.map(([s, rr]) => this.map(s + t * 0.12, rr, C));
      smoothOpenPath(ctx, pts);
      const a = st.rainbow ? 0.6 : 1;
      ctx.lineWidth = sw.w * u * 1.7;
      ctx.strokeStyle = G.alpha(sw.col, 0.16 * a);
      ctx.stroke();
      ctx.lineWidth = sw.w * u;
      ctx.strokeStyle = G.alpha(sw.col, 0.36 * a);
      ctx.stroke();
      // the fold of each band catches a glossy streak
      ctx.save();
      ctx.translate(-u * 0.035, -u * 0.045);
      smoothOpenPath(ctx, pts);
      ctx.lineWidth = Math.max(1, sw.w * u * 0.14);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.stroke();
      ctx.restore();
    }
    // thicker jelly toward the edge looks deeper
    ctx.lineWidth = u * 0.34;
    ctx.strokeStyle = G.alpha(st.dark, 0.16);
    ctx.stroke(path);
    ctx.lineWidth = u * 0.12;
    ctx.strokeStyle = G.alpha(st.dark, 0.2);
    ctx.stroke(path);
    // air bubbles (ocean)
    for (const b of this.decor.bubbles) {
      const [x, y] = this.map(b.s, b.rr, C), s = b.size * u;
      ctx.lineWidth = Math.max(0.8, s * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      G.circle(ctx, x, y, s);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      G.circle(ctx, x - s * 0.35, y - s * 0.35, s * 0.28);
      ctx.fill();
    }
    // glitter flakes and twinkling sparkles
    const spr = this.sparkleSprite();
    for (const gl of this.decor.glitter) {
      const [x, y] = this.map(gl.s, gl.rr, C);
      const tw = 0.5 + 0.5 * Math.sin(t * gl.sp + gl.ph);
      if (gl.star) {
        const s = gl.size * u * (2.2 + 2.2 * tw);
        ctx.globalAlpha = 0.35 + 0.65 * tw;
        ctx.drawImage(spr, x - s, y - s, s * 2, s * 2);
      } else {
        const s = Math.max(0.8, gl.size * u);
        ctx.globalAlpha = 0.45 + 0.55 * tw;
        ctx.fillStyle = gl.col;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    // finger dimples: a shadowed dent with light catching its far wall
    const dimple = (x, y, depth) => {
      const rd = u * 0.34 * (0.55 + 0.45 * depth), deep = G.shade(st.dark, -0.25);
      // the slime heaped up around the finger: lit on the top-left, shaded on the bottom-right
      const ring = ctx.createRadialGradient(x, y, rd * 0.8, x, y, rd * 1.45);
      ring.addColorStop(0, G.alpha(st.light, 0.32 * depth));
      ring.addColorStop(1, G.alpha(st.light, 0));
      ctx.fillStyle = ring;
      G.circle(ctx, x - rd * 0.12, y - rd * 0.14, rd * 1.45);
      ctx.fill();
      const dg = ctx.createRadialGradient(x - rd * 0.28, y - rd * 0.32, rd * 0.05, x, y, rd);
      dg.addColorStop(0, G.alpha(deep, 0.62 * depth));
      dg.addColorStop(0.55, G.alpha(deep, 0.34 * depth));
      dg.addColorStop(1, G.alpha(deep, 0));
      ctx.fillStyle = dg;
      G.circle(ctx, x, y, rd);
      ctx.fill();
      // light catching the far inner wall
      ctx.lineCap = 'round';
      ctx.lineWidth = rd * 0.16;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * depth})`;
      ctx.beginPath();
      ctx.arc(x, y, rd * 0.64, Math.PI * 0.08, Math.PI * 0.6);
      ctx.stroke();
      ctx.lineWidth = rd * 0.08;
      ctx.strokeStyle = `rgba(255,255,255,${0.4 * depth})`;
      ctx.beginPath();
      ctx.arc(x, y, rd * 1.05, Math.PI * 1.05, Math.PI * 1.55);
      ctx.stroke();
    };
    for (const tc of this.touches.values()) if (tc.over && tc.depth > 0.02) dimple(tc.sx, tc.sy, tc.depth);
    for (const f of this.fading) dimple(this.hx + f.x * R, this.hy + f.y * R, f.depth);
    // rim light from the top-left and a little bounce light at the bottom-right
    const lg = ctx.createLinearGradient(C.x - r, C.y - r, C.x + r, C.y + r);
    lg.addColorStop(0, 'rgba(255,255,255,0.85)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0)');
    lg.addColorStop(0.8, 'rgba(255,255,255,0)');
    lg.addColorStop(1, G.alpha(st.light, 0.45));
    ctx.lineWidth = u * 0.09;
    ctx.strokeStyle = lg;
    ctx.stroke(path);
    // glossy highlight: a shrunken copy of the outline, offset toward the light
    const hp = new Path2D(), hx = -u * 0.3, hy = -u * 0.34, hl = [];
    for (let i = 0; i < N; i += 4) hl.push([C.x + (this.sx[i] - C.x) * 0.48 + hx, C.y + (this.sy[i] - C.y) * 0.4 + hy]);
    G.smoothClosedPath(hp, hl);
    const hg = ctx.createRadialGradient(C.x + hx, C.y + hy, 0, C.x + hx, C.y + hy, (r + u) * 0.28);
    hg.addColorStop(0, 'rgba(255,255,255,0.5)');
    hg.addColorStop(0.6, 'rgba(255,255,255,0.16)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fill(hp);
    const [spx, spy] = this.map(HL, 0.7, C);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(spx, spy, u * 0.15, u * 0.075, -0.72, 0, TAU);
    ctx.fill();
    const [s2x, s2y] = this.map(HL + 3.5, 0.82, C);
    G.circle(ctx, s2x, s2y, u * 0.035);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(1.2, u * 0.012);
    ctx.strokeStyle = G.alpha(st.dark, 0.4);
    ctx.stroke(path);
  }

  hud() {
    const n = this.app.getStat('squishes');
    return `${group(n, this.app.lang)} ${G.pluralize(n, LABEL[this.app.lang] ?? LABEL.en, this.app.lang)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const size = Math.max(8, Math.ceil(r / 6) * 6), dpr = this.app.dpr;
    const key = `${i}|${size}|${dpr}`;
    let ic = this.icons.get(key);
    if (!ic) {
      const st = STYLES[i], c = G.makeCanvas(size * 2 * dpr, size * 2 * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      const C = { x: size, y: size * 1.04 }, br = size * 0.66, pts = [];
      const wob = [1.04, 0.96, 1.06, 0.95, 1.02, 0.97, 1.05, 0.95, 1.03, 0.98];
      for (let k = 0; k < wob.length; k++) {
        const a = (k / wob.length) * TAU;
        pts.push([C.x + Math.cos(a) * br * wob[k], C.y + Math.sin(a) * br * wob[k] * 0.9]);
      }
      const path = new Path2D();
      G.smoothClosedPath(path, pts);
      G.groundShadow(g, C.x, C.y + br * 0.8, br * 1.05, br * 0.28, 0.35);
      g.fillStyle = this.bodyFill(g, st, C, br, 1.5);
      g.fill(path);
      g.save();
      g.clip(path);
      g.lineCap = 'round';
      g.lineWidth = br * 0.22;
      g.strokeStyle = G.alpha(st.swirl[0], 0.35);
      g.beginPath();
      g.moveTo(C.x - br * 0.8, C.y + br * 0.1);
      g.bezierCurveTo(C.x - br * 0.3, C.y - br * 0.5, C.x + br * 0.2, C.y + br * 0.6, C.x + br * 0.8, C.y - br * 0.1);
      g.stroke();
      g.lineWidth = br * 0.25;
      g.strokeStyle = G.alpha(st.dark, 0.2);
      g.stroke(path);
      const rnd = rng(7 + i);
      for (let k = 0; k < 14; k++) {
        g.fillStyle = st.glitter[k % st.glitter.length];
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * br * 0.8, s = Math.max(1, br * 0.05);
        g.fillRect(C.x + Math.cos(a) * rr, C.y + Math.sin(a) * rr, s, s);
      }
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.ellipse(C.x - br * 0.38, C.y - br * 0.42, br * 0.22, br * 0.11, -0.7, 0, TAU);
      g.fill();
      g.restore();
      ic = { c, size: size * 2 };
      if (this.icons.size > 40) this.icons.clear();
      this.icons.set(key, ic);
    }
    const s = (r / size) * ic.size;
    ctx.drawImage(ic.c, x - s / 2, y - s / 2, s, s);
  }
}
