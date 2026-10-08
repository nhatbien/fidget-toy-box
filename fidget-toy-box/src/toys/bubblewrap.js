// Bubble Wrap: pop every bubble on the sheet. A finished sheet slides away and a fresh one slides in.
import { Toy } from './_base.js';
import * as G from '../gfx.js';

const TAU = G.TAU;
const SHEET_W = 1000; // design width of a sheet; its height follows the area's aspect when it is made
/** Per style: bubble tint, plastic film tint, backdrop, bubble columns in portrait. */
const STYLES = [
  { tint: '#6fbcff', film: '#cfe8ff', bg: ['#dcedfb', '#86b8e3'], cols: 7 },
  { tint: '#4fd3a0', film: '#c6f4df', bg: ['#e0faee', '#86d1ae'], cols: 7 },
  { tint: '#ff85b9', film: '#ffd3e6', bg: ['#fff0f6', '#eea2c3'], cols: 7 },
  { tint: '#ffbd2e', film: '#ffe7a3', bg: ['#fff5d8', '#ebc067'], cols: 7 },
  { tint: '#9f84ff', film: '#ded3ff', bg: ['#f0ebff', '#b4a0ee'], cols: 4 },
  { tint: '#ffa64d', film: '#fff1e0', bg: ['#fff1e2', '#f2b682'], cols: 7, rainbow: true },
];
const LABEL = { en: 'popped', vi: 'đã bóp', es: 'reventadas', pt: 'estouradas', fr: 'éclatées', de: 'geplatzt', id: 'pecah', it: 'scoppiate', tr: 'patladı', ru: 'лопнуто' };
const SEP = { en: ',', vi: '.', es: '.', pt: '.', fr: ' ', de: '.', id: '.', it: '.', tr: '.', ru: ' ' };
const RAINBOW_FILM = ['#ffd6e0', '#ffe6c4', '#fff6bf', '#d6f5e3', '#d3e8ff', '#e8dbff'];

/** 1,234 style grouping with the separator of the current language. */
function group(n, lang) {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, SEP[lang] ?? ',');
}
function hslHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
const RAINBOW_TINTS = Array.from({ length: 12 }, (_, i) => hslHex(i * 30, 92, 64));

/** Small deterministic PRNG so crinkles and sheen streaks stay put across rebuilds. */
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

/** Sheet outline (top-right corner folded away) at screen offset ox, oy for layout L. */
function sheetOutline(p, sheet, L, ox, oy) {
  const w = L.w, h = L.h, f = sheet.fold * L.k, r = Math.min(w, h) * 0.03;
  p.moveTo(ox + r, oy);
  p.lineTo(ox + w - f, oy);
  p.lineTo(ox + w, oy + f);
  p.arcTo(ox + w, oy + h, ox, oy + h, r);
  p.arcTo(ox, oy + h, ox, oy, r);
  p.arcTo(ox, oy, ox + w, oy, r);
  p.closePath();
}

/** A full bubble: translucent glossy dome with rim, refraction crescent and highlights. */
function paintUp(g, m, R, tint) {
  const dark = G.shade(tint, -0.55);
  const sh = g.createRadialGradient(m + R * 0.12, m + R * 0.17, R * 0.55, m + R * 0.12, m + R * 0.17, R * 1.18);
  sh.addColorStop(0, G.alpha(dark, 0.3));
  sh.addColorStop(1, G.alpha(dark, 0));
  g.fillStyle = sh;
  G.circle(g, m + R * 0.12, m + R * 0.17, R * 1.18);
  g.fill();
  const dg = g.createRadialGradient(m - R * 0.28, m - R * 0.32, R * 0.06, m, m, R);
  dg.addColorStop(0, 'rgba(255,255,255,0.6)');
  dg.addColorStop(0.35, G.alpha(G.shade(tint, 0.4), 0.38));
  dg.addColorStop(0.78, G.alpha(tint, 0.5));
  dg.addColorStop(0.94, G.alpha(G.shade(tint, -0.22), 0.68));
  dg.addColorStop(1, G.alpha(G.shade(tint, -0.38), 0.6));
  G.circle(g, m, m, R);
  g.fillStyle = dg;
  g.fill();
  // light bending through the dome: bright crescent inside the lower-right rim
  g.save();
  G.circle(g, m, m, R);
  g.clip();
  const cr = g.createRadialGradient(m - R * 0.25, m - R * 0.3, R * 0.88, m - R * 0.25, m - R * 0.3, R * 1.36);
  cr.addColorStop(0, 'rgba(255,255,255,0)');
  cr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  cr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = cr;
  g.fillRect(m - R, m - R, R * 2, R * 2);
  g.restore();
  g.lineWidth = Math.max(0.8, R * 0.05);
  g.strokeStyle = G.alpha(G.shade(tint, -0.45), 0.45);
  G.circle(g, m, m, R);
  g.stroke();
  const hx = m - R * 0.36, hy = m - R * 0.4;
  const hg = g.createRadialGradient(hx, hy, 0, hx, hy, R * 0.48);
  hg.addColorStop(0, 'rgba(255,255,255,0.8)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg;
  G.circle(g, hx, hy, R * 0.48);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(m - R * 0.38, m - R * 0.43, R * 0.18, R * 0.095, -0.75, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  G.circle(g, m + R * 0.43, m + R * 0.38, R * 0.065);
  g.fill();
}

/** A popped bubble: deflated, crinkled film with uneven fold lines and little star wrinkles. */
function paintPopped(g, m, R, tint, k) {
  const rnd = rng(1234 + k * 977);
  // the deflated film has a puckered, slightly wobbly edge
  const edge = new Path2D();
  const pts = 20, rim = [];
  for (let i = 0; i < pts; i++) rim.push(R * (0.9 + rnd() * 0.08));
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * TAU, rr = rim[i % pts];
    i ? edge.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr) : edge.moveTo(m + rr, m);
  }
  edge.closePath();
  const fg = g.createRadialGradient(m, m, R * 0.15, m, m, R);
  fg.addColorStop(0, G.alpha(tint, 0.2));
  fg.addColorStop(0.8, G.alpha(G.shade(tint, -0.14), 0.3));
  fg.addColorStop(1, G.alpha(G.shade(tint, -0.32), 0.42));
  g.fillStyle = fg;
  g.fill(edge);
  g.save();
  g.clip(edge);
  // uneven creases radiating from an off-center pinch point
  const cx = m + (rnd() - 0.5) * R * 0.4, cy = m + (rnd() - 0.5) * R * 0.4;
  const n = 5 + Math.floor(rnd() * 3), ends = [], a0 = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + (rnd() - 0.5) * 0.8, len = R * (0.5 + rnd() * 0.55);
    ends.push({ a, x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len, bend: (rnd() - 0.5) * R * 0.25 });
  }
  ends.sort((p, q) => p.a - q.a);
  // facets between neighbouring creases catch the light differently
  for (let i = 0; i < n; i++) {
    const p = ends[i], q = ends[(i + 1) % n];
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.closePath();
    g.fillStyle = i % 2 ? `rgba(255,255,255,${0.1 + rnd() * 0.14})` : G.alpha(G.shade(tint, -0.5), 0.08 + rnd() * 0.08);
    g.fill();
  }
  g.lineCap = 'round';
  const crease = (x0, y0, mx, my, x1, y1, w) => {
    for (const [off, col, k2] of [[0, G.alpha(G.shade(tint, -0.55), 0.4), 1], [-0.03, 'rgba(255,255,255,0.7)', 0.7]]) {
      g.beginPath();
      g.moveTo(x0 + off * R, y0 + off * R);
      g.quadraticCurveTo(mx + off * R, my + off * R, x1 + off * R, y1 + off * R);
      g.lineWidth = Math.max(0.5, R * w * k2);
      g.strokeStyle = col;
      g.stroke();
    }
  };
  for (const p of ends) {
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    const mx = (cx + p.x) / 2 + nx * p.bend, my = (cy + p.y) / 2 + ny * p.bend;
    crease(cx, cy, mx, my, p.x, p.y, 0.05);
    if (rnd() < 0.55) {
      // a short branch splitting off part way along
      const t = 0.5 + rnd() * 0.25, bx = G.lerp(cx, p.x, t) + nx * p.bend * 0.5, by = G.lerp(cy, p.y, t) + ny * p.bend * 0.5;
      const ba = p.a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), bl = R * (0.18 + rnd() * 0.2);
      crease(bx, by, bx + Math.cos(ba) * bl * 0.5, by + Math.sin(ba) * bl * 0.5, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, 0.035);
    }
  }
  // tiny star wrinkles near the rim
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(0.5, R * 0.028);
  for (let s = 0; s < 3; s++) {
    const a = rnd() * TAU, rr = R * (0.6 + rnd() * 0.25), sx = m + Math.cos(a) * rr, sy = m + Math.sin(a) * rr;
    for (let j = 0; j < 3; j++) {
      const b = rnd() * Math.PI, l = R * (0.05 + rnd() * 0.07);
      g.beginPath();
      g.moveTo(sx - Math.cos(b) * l, sy - Math.sin(b) * l);
      g.lineTo(sx + Math.cos(b) * l, sy + Math.sin(b) * l);
      g.stroke();
    }
  }
  g.restore();
  // the flattened rim still catches the light
  g.lineJoin = 'round';
  g.lineWidth = Math.max(0.8, R * 0.07);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.stroke(edge);
  g.lineWidth = Math.max(0.6, R * 0.035);
  g.strokeStyle = G.alpha(G.shade(tint, -0.45), 0.3);
  G.circle(g, m, m, R);
  g.stroke();
}

export class BubbleWrapToy extends Toy {
  static id = 'bubblewrap';

  constructor(app) {
    super(app);
    this.sheet = null;
    this.prev = null; // the sheet sliding out during a transition
    this.trans = null;
    this.doneDelay = 0;
    this.lastPop = -1;
    this.drags = new Map();
    this.sprites = new Map();
    this.icons = new Map();
    this.buttons = [{ icon: 'refresh', color: '#3cb4e6', onTap: () => this.nextSheet(false) }];
  }

  enter() {
    if (!this.sheet || this.sheet.variant !== this.variant) {
      this.sheet = this.makeSheet(this.variant);
      this.trans = null;
      this.prev = null;
    }
  }
  exit() {
    this.drags.clear();
  }
  setVariant() {
    if (this.trans) this.sheet = this.makeSheet(this.variant);
    else this.nextSheet(false);
  }

  resize(area) {
    this.sprites.clear();
    // an untouched sheet is simply remade to suit the new shape; a played one is scaled to fit
    const s = this.sheet;
    if (s && !this.trans && s.left === s.bubbles.length && area.w > 0 && area.h > 0) {
      const aspect = area.w / area.h;
      if (Math.abs(aspect / (s.W / s.H) - 1) > 0.06) this.sheet = this.makeSheet(s.variant);
    }
  }

  /** Lays out a fresh sheet in design units (width 1000) for the current area's shape. */
  makeSheet(variant) {
    const st = STYLES[variant], a = this.area;
    const aspect = G.clamp(Math.max(1, a.w) / Math.max(1, a.h), 0.2, 6);
    const W = SHEET_W, H = W / aspect;
    const cols = Math.round(G.clamp(st.cols * Math.pow(Math.max(1, aspect), 0.8), st.cols, st.cols * 4));
    // hex packing: odd rows sit half a pitch in and hold one bubble less, so both sides match
    const pitch = W / (cols + 0.56);
    const br = pitch * 0.43, rowH = pitch * 0.866;
    const rows = Math.max(1, Math.floor((H - pitch * 0.6 - br * 2) / rowH) + 1);
    const x0 = (W - (cols - 1) * pitch) / 2, y0 = (H - (rows - 1) * rowH) / 2;
    const fold = G.clamp(Math.min(W, H) * 0.15, pitch * 1.2, pitch * 2.4);
    const bubbles = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols - (j % 2); i++) {
        const u = x0 + i * pitch + (j % 2) * pitch * 0.5, v = y0 + j * rowH;
        if (u - v + br * 1.45 > W - fold * 1.75) continue; // under the curled corner
        let tint = st.tint;
        if (st.rainbow) tint = RAINBOW_TINTS[Math.round(((u + v) / (W + H)) * 11) % 12]; // diagonal rainbow
        bubbles.push({ u, v, up: true, anim: 0, tint, crease: (i * 7 + j * 5) % 4 });
      }
    }
    return { variant, W, H, br, fold, bubbles, left: bubbles.length, seed: (Math.random() * 1e9) | 0, base: null, baseKey: '' };
  }

  /** Where a sheet sits in the current area: scaled to fit (keeping its shape) and centered. */
  fit(sheet) {
    const a = this.area;
    const aw = Math.max(10, a.w * 0.92), ah = Math.max(10, a.h * 0.92);
    const k = Math.max(0.005, Math.min(aw / sheet.W, ah / sheet.H));
    const w = sheet.W * k, h = sheet.H * k;
    return { k, w, h, x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2 };
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    this.drags.set(p.id, { x: p.x, y: p.y });
    this.tryPop(p.x, p.y);
  }
  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    if (this.sheet && !this.trans) {
      // test points along the drag so fast swipes still pop every bubble they cross
      const step = Math.max(2, this.sheet.br * this.fit(this.sheet).k * 0.5);
      const n = Math.min(80, Math.max(1, Math.ceil(G.dist(d.x, d.y, p.x, p.y) / step)));
      for (let i = 1; i <= n; i++) this.tryPop(G.lerp(d.x, p.x, i / n), G.lerp(d.y, p.y, i / n));
    }
    d.x = p.x;
    d.y = p.y;
  }
  pointerUp(p) {
    this.drags.delete(p.id);
  }
  keyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      this.nextSheet(false);
      return true;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      const s = this.sheet;
      if (s && !this.trans) {
        const up = s.bubbles.filter((b) => b.up);
        if (up.length) this.popBubble(G.pick(up), this.fit(s));
      }
      return true;
    }
    return false;
  }

  tryPop(x, y) {
    const s = this.sheet;
    if (!s || this.trans || s.left <= 0) return;
    const L = this.fit(s);
    const u = (x - L.x) / L.k, v = (y - L.y) / L.k;
    if (u < -s.br || v < -s.br || u > s.W + s.br || v > s.H + s.br) return;
    const r2 = (s.br * 1.05) ** 2;
    for (const b of s.bubbles) {
      if (b.up && (b.u - u) ** 2 + (b.v - v) ** 2 < r2) {
        this.popBubble(b, L);
        return;
      }
    }
  }

  popBubble(b, L) {
    const app = this.app, s = this.sheet;
    b.up = false;
    b.anim = 1;
    s.left--;
    const x = L.x + b.u * L.k, y = L.y + b.v * L.k, R = s.br * L.k;
    // pops landing in the same instant (a fast swipe) are a little quieter
    const crowd = app.time - this.lastPop < 0.035;
    this.lastPop = app.time;
    const pitch = G.clamp(1.3 - (R - 12) / 80, 0.7, 1.3) * G.rand(0.9, 1.12);
    app.audio.snap(pitch, crowd ? 0.6 : 1, (x / Math.max(1, app.w) - 0.5) * 0.8);
    app.fx.burst(x, y, {
      count: 5, colors: ['#ffffff', G.shade(b.tint, 0.55)], shape: 'circle', speed: [30, 120], size: [1.2, 3],
      life: [0.25, 0.5], gravity: -40, drag: 0.92, vr: 0, alpha: 0.8,
    });
    app.haptic(8);
    app.addProgress(0.035, x, y);
    app.stat('pops');
    if (s.left <= 0) this.doneDelay = 0.5;
  }

  /** Slides the current sheet out to the left and a fresh one in from the right. */
  nextSheet(earned) {
    if (this.trans || !this.sheet) return;
    const app = this.app;
    if (earned) {
      const L = this.fit(this.sheet), cx = L.x + L.w / 2, cy = L.y + L.h / 2;
      const st = STYLES[this.sheet.variant];
      app.stat('sheets');
      app.addProgress(0.5, cx, cy);
      app.audio.chime(1046.5, 0.6);
      app.fx.burst(cx, cy, {
        count: 24, colors: st.rainbow ? G.RAINBOW : ['#ffffff', st.tint, G.shade(st.tint, 0.5)], shape: ['sparkle', 'circle'],
        speed: [140, 380], size: [3, 6], gravity: 260, life: [0.6, 1.1],
      });
    }
    this.prev = this.sheet;
    this.sheet = this.makeSheet(this.variant);
    this.trans = { t: 0, dur: 0.95 };
    this.doneDelay = 0;
    app.audio.whoosh(0.7);
  }

  update(dt) {
    const s = this.sheet;
    if (!s) return;
    for (const b of s.bubbles) if (b.anim > 0) b.anim = Math.max(0, b.anim - dt / 0.15);
    if (this.doneDelay > 0) {
      this.doneDelay -= dt;
      if (this.doneDelay <= 0) this.nextSheet(true);
    }
    if (this.trans) {
      this.trans.t += dt / this.trans.dur;
      if (this.trans.t >= 1) {
        this.trans = null;
        this.prev = null;
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  sprite(tint, kind, R, rk = R.toFixed(2)) {
    const key = `${tint}|${kind}|${rk}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const dpr = this.app.dpr, m = R * 1.36;
    const c = G.makeCanvas(m * 2 * dpr, m * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    if (kind === 'up') paintUp(g, m, R, tint);
    else paintPopped(g, m, R, tint, kind);
    s = { c, size: m * 2 };
    if (this.sprites.size > 200) this.sprites.clear();
    this.sprites.set(key, s);
    return s;
  }

  /** The plastic sheet without its bubbles: soft shadow, tinted film, sheen, seals, edge. */
  renderBase(sheet, L) {
    const dpr = this.app.dpr, st = STYLES[sheet.variant];
    const pad = Math.ceil(Math.max(14, Math.min(L.w, L.h) * 0.06));
    const c = G.makeCanvas((L.w + pad * 2) * dpr, (L.h + pad * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const path = new Path2D();
    sheetOutline(path, sheet, L, pad, pad);
    // soft shadow on the backdrop (the shape is drawn far away, only its shadow lands here) ...
    g.save();
    g.translate(-10000, 0);
    g.shadowColor = 'rgba(40,30,70,0.34)';
    g.shadowBlur = Math.max(6, pad * 0.55) * dpr;
    g.shadowOffsetX = 10000 * dpr;
    g.shadowOffsetY = Math.max(3, pad * 0.3) * dpr;
    g.fill(path);
    g.restore();
    // ... mostly washed out under the sheet, since light passes through clear plastic
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fill(path);
    g.globalCompositeOperation = 'source-over';
    if (st.rainbow) {
      const rg = g.createLinearGradient(pad, pad, pad + L.w, pad + L.h);
      RAINBOW_FILM.forEach((col, i) => rg.addColorStop(i / (RAINBOW_FILM.length - 1), G.alpha(col, 0.62)));
      g.fillStyle = rg;
    } else g.fillStyle = G.alpha(st.film, 0.55);
    g.fill(path);
    g.save();
    g.clip(path);
    const lg = g.createLinearGradient(pad, pad, pad + L.w, pad + L.h);
    lg.addColorStop(0, 'rgba(255,255,255,0.42)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0.08)');
    lg.addColorStop(1, 'rgba(60,70,110,0.08)');
    g.fillStyle = lg;
    g.fillRect(pad, pad, L.w, L.h);
    // long diagonal sheen streaks
    const rnd = rng(sheet.seed), diag = Math.hypot(L.w, L.h);
    for (let s = 0; s < 4; s++) {
      g.save();
      g.translate(pad + L.w * (0.1 + rnd() * 0.8), pad + L.h * (0.1 + rnd() * 0.8));
      g.rotate(-0.75 + rnd() * 0.25);
      const sw = Math.min(L.w, L.h) * (0.03 + rnd() * 0.07);
      const sg = g.createLinearGradient(0, -sw, 0, sw);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, `rgba(255,255,255,${0.1 + rnd() * 0.12})`);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg;
      g.fillRect(-diag, -sw, diag * 2, sw * 2);
      g.restore();
    }
    // the flat welded film around every bubble (quilted look)
    const R = sheet.br * L.k;
    for (const b of sheet.bubbles) {
      const x = pad + b.u * L.k, y = pad + b.v * L.k;
      g.lineWidth = Math.max(1, R * 0.1);
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      G.circle(g, x, y, R * 1.1);
      g.stroke();
      g.lineWidth = Math.max(0.6, R * 0.045);
      g.strokeStyle = G.alpha(G.shade(b.tint, -0.4), 0.16);
      G.circle(g, x, y, R * 1.18);
      g.stroke();
    }
    // faint crinkles in the film
    g.lineWidth = 1;
    for (let s = 0; s < 7; s++) {
      const x = pad + rnd() * L.w, y = pad + rnd() * L.h, l = Math.min(L.w, L.h) * (0.08 + rnd() * 0.15), a = rnd() * TAU;
      g.strokeStyle = `rgba(255,255,255,${0.14 + rnd() * 0.12})`;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.restore();
    g.lineJoin = 'round';
    g.lineWidth = 2.4;
    g.strokeStyle = G.alpha(G.shade(st.tint, -0.45), 0.28);
    g.stroke(path);
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.stroke(path);
    return { c, pad };
  }

  /** The curled-up corner: the film's underside, lit along the fold, casting a soft shadow. */
  drawFlap(ctx, sheet, L) {
    const st = STYLES[sheet.variant];
    const f = sheet.fold * L.k, x1 = L.x + L.w, y0 = L.y;
    const tx = x1 - f * 0.92, ty = y0 + f * 0.92;
    ctx.fillStyle = 'rgba(30,30,70,0.15)';
    ctx.beginPath();
    ctx.moveTo(x1 - f, y0);
    ctx.quadraticCurveTo(x1 - f * 1.14, y0 + f * 0.62, tx - f * 0.07, ty + f * 0.12);
    ctx.quadraticCurveTo(x1 - f * 0.52, y0 + f * 1.14, x1, y0 + f);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x1 - f, y0);
    ctx.quadraticCurveTo(x1 - f * 1.03, y0 + f * 0.5, tx, ty);
    ctx.quadraticCurveTo(x1 - f * 0.5, y0 + f * 1.03, x1, y0 + f);
    ctx.closePath();
    const film = st.rainbow ? '#fff4e6' : st.film;
    const fg = ctx.createLinearGradient(x1 - f * 0.5, y0 + f * 0.5, tx, ty);
    fg.addColorStop(0, 'rgba(255,255,255,0.92)');
    fg.addColorStop(0.45, G.alpha(G.mixColor(film, '#ffffff', 0.4), 0.88));
    fg.addColorStop(1, G.alpha(G.shade(film, -0.12), 0.92));
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = G.alpha(G.shade(st.tint, -0.4), 0.35);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(x1 - f, y0);
    ctx.lineTo(x1, y0 + f);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /** Every few seconds a soft band of light glides across the plastic. */
  drawShimmer(ctx, sheet, L) {
    const period = 7, dur = 1.7;
    const t = (this.app.time + (sheet.seed % 7)) % period;
    if (t > dur) return;
    const k = G.ease.inOutCubic(t / dur);
    const path = new Path2D();
    sheetOutline(path, sheet, L, L.x, L.y);
    const span = L.w + L.h, pos = -0.2 * span + k * 1.4 * span, bw = span * 0.09;
    const dx = 0.8, dy = 0.6; // direction the band travels (top-left to bottom-right)
    const g = ctx.createLinearGradient(L.x + dx * (pos - bw), L.y + dy * (pos - bw), L.x + dx * (pos + bw), L.y + dy * (pos + bw));
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = g;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.restore();
  }

  drawSheet(ctx, sheet, L, dx, rot) {
    const key = `${L.w.toFixed(1)}|${L.h.toFixed(1)}|${this.app.dpr}`;
    if (!sheet.base || sheet.baseKey !== key) {
      sheet.base = this.renderBase(sheet, L);
      sheet.baseKey = key;
    }
    ctx.save();
    if (dx || rot) {
      const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
      ctx.translate(cx + dx, cy);
      ctx.rotate(rot);
      ctx.translate(-cx, -cy);
    }
    const b = sheet.base;
    ctx.drawImage(b.c, L.x - b.pad, L.y - b.pad, L.w + b.pad * 2, L.h + b.pad * 2);
    // a sheet uses only a handful of sprites: look each one up once per frame
    const R = sheet.br * L.k, rk = R.toFixed(2), memo = {};
    const spr = (tint, kind) => {
      const row = memo[tint] || (memo[tint] = {});
      return row[kind] || (row[kind] = this.sprite(tint, kind, R, rk));
    };
    for (const bb of sheet.bubbles) {
      const x = L.x + bb.u * L.k, y = L.y + bb.v * L.k;
      const s = spr(bb.tint, bb.up ? 'up' : bb.crease);
      ctx.drawImage(s.c, x - s.size / 2, y - s.size / 2, s.size, s.size);
      if (bb.anim > 0) {
        // the dome collapsing into the crinkles
        const up = spr(bb.tint, 'up'), k = 0.55 + 0.45 * bb.anim;
        ctx.globalAlpha = bb.anim;
        ctx.drawImage(up.c, x - (up.size * k) / 2, y - (up.size * k) / 2, up.size * k, up.size * k);
        ctx.globalAlpha = 1;
      }
    }
    this.drawShimmer(ctx, sheet, L);
    this.drawFlap(ctx, sheet, L);
    ctx.restore();
  }

  draw(ctx) {
    const app = this.app;
    const st = STYLES[this.sheet ? this.sheet.variant : this.variant];
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1]);
    if (!this.sheet) return;
    if (this.trans) {
      const t = this.trans.t;
      const out = G.ease.inCubic(G.clamp(t * 1.2, 0, 1)); // the old sheet accelerates away
      const inn = G.ease.outBack(G.clamp((t - 0.2) / 0.8, 0, 1)); // the new one settles with a tiny overshoot
      if (this.prev) {
        const L = this.fit(this.prev);
        this.drawSheet(ctx, this.prev, L, -out * (L.x + L.w + 80), -0.07 * out);
      }
      const L = this.fit(this.sheet);
      this.drawSheet(ctx, this.sheet, L, (1 - inn) * (app.w - L.x + 80), 0.07 * (1 - inn));
    } else this.drawSheet(ctx, this.sheet, this.fit(this.sheet), 0, 0);
  }

  hud() {
    return `${group(this.app.getStat('pops'), this.app.lang)} ${this.tr(LABEL)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const size = Math.max(8, Math.ceil(r / 6) * 6), dpr = this.app.dpr;
    const key = `${i}|${size}|${dpr}`;
    let ic = this.icons.get(key);
    if (!ic) {
      const st = STYLES[i];
      const c = G.makeCanvas(size * 2 * dpr, size * 2 * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      const fg = g.createLinearGradient(0, 0, size * 2, size * 2);
      if (st.rainbow) RAINBOW_FILM.forEach((col, k) => fg.addColorStop(k / (RAINBOW_FILM.length - 1), col));
      else {
        fg.addColorStop(0, G.mixColor(st.film, '#ffffff', 0.5));
        fg.addColorStop(1, G.shade(st.film, -0.12));
      }
      g.fillStyle = fg;
      g.fillRect(0, 0, size * 2, size * 2);
      const giant = st.cols < 6;
      const br = size * (giant ? 0.5 : 0.3), pitch = br / 0.43;
      let n = 0;
      for (let row = -3; row <= 3; row++) {
        for (let col = -3; col <= 3; col++) {
          const px = size + (col + (row & 1) * 0.5) * pitch, py = size + row * pitch * 0.866;
          if (Math.hypot(px - size, py - size) > size + br) continue;
          const tint = st.rainbow ? RAINBOW_TINTS[(n++ * 5) % 12] : st.tint;
          g.save();
          g.translate(px - br * 1.36, py - br * 1.36);
          paintUp(g, br * 1.36, br, tint);
          g.restore();
        }
      }
      ic = { c, size: size * 2 };
      if (this.icons.size > 40) this.icons.clear();
      this.icons.set(key, ic);
    }
    const s = (r / size) * ic.size;
    ctx.drawImage(ic.c, x - s / 2, y - s / 2, s, s);
  }
}
