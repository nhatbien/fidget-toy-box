// Kinetic Sand: a layered block of kinetic sand sits on a tray. Swipe across it to slice it — the
// cut-off slab tips over and crumbles into a little pile of grains that slowly melts away.
//
// Geometry lives in design units (du) relative to the tray: the floor is y = 0 and the block is
// BH du tall, so resizing only changes the du → px scale. Everything is drawn as an oblique prism:
// the front face is the block polygon, the faces turned toward the viewer extrude by (DX, -DY).
import { Toy } from './_base.js';
import * as G from '../gfx.js';

// [singular, plural] (Russian: [1, 2-4, 5+]); a plain string when the language doesn't inflect
const LABEL = { en: ['cut', 'cuts'], vi: 'nhát cắt', es: ['corte', 'cortes'], pt: ['corte', 'cortes'], fr: ['coupe', 'coupes'], de: ['Schnitt', 'Schnitte'], id: 'potongan', it: ['taglio', 'tagli'], tr: 'kesim', ru: ['разрез', 'разреза', 'разрезов'] };

function countWord(lang, forms, n) {
  const f = forms[lang] ?? forms.en;
  if (typeof f === 'string') return f;
  if (f.length === 3) {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? f[1] : f[2];
  }
  return n === 1 ? f[0] : f[1];
}

// layers top → bottom, tray plastic, backdrop
const STYLES = [
  { layers: ['#ff9ebb', '#ffb38a', '#ffe08a', '#a8e6a1', '#8fd3ff', '#c3a6ff'], tray: '#8fdcf5', bg: ['#fff1e6', '#ffcfdc'] },
  { layers: ['#d4f4fb', '#90e0ef', '#48cae4', '#00b4d8', '#0091c2', '#0068a8'], tray: '#ffd6a5', bg: ['#e3f8ff', '#a6dcf0'] },
  { layers: ['#ffd166', '#ffb347', '#ff8c42', '#ff6b6b', '#f45b8d', '#c94b9f'], tray: '#9ad7ee', bg: ['#fff3c4', '#ffc2a6'] },
  { layers: ['#b8f2d0', '#7a4a2e', '#9ae6bd', '#5c3520', '#c9f5dd', '#6b3e26'], tray: '#f3e3cb', bg: ['#effff4', '#c2ead2'] },
  { layers: ['#e9b8ff', '#c77dff', '#9d4edd', '#7b2cbf', '#5a189a', '#3c096c'], tray: '#3a3170', bg: ['#3d2c80', '#160f34'], sparkle: true },
  { layers: ['#ff2e97', '#ff9e00', '#ffee32', '#39ff14', '#00f0ff', '#b84dff'], tray: '#33334a', bg: ['#2c2c48', '#121220'] },
];

const BH = 1000; // block height (du)
const DX = 150, DY = 110; // oblique offset of the block's back face (du)
const ZS = 500; // du per block depth in the tray's plan view
const NL = 6; // sand layers
const GRAV = 4200; // du/s²
const RIM = 46; // tray rim width (du)
const LIP = 58; // tray front face height (du)
const ZF = -0.6, ZB = 1.35; // tray floor depth range (in block depths)
const MAX_GRAINS = 1500;
const BIN = 10; // pile height-map bin width (du)
const TEX_MAX = 2048; // texture size cap (device px)

// ---------------------------------------------------------------- polygon helpers
function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function centroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const k = p[0] * q[1] - q[0] * p[1];
    a += k;
    cx += (p[0] + q[0]) * k;
    cy += (p[1] + q[1]) * k;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (const p of pts) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / pts.length, sy / pts.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Part of a convex polygon on the side (p − o)·n ≥ 0 of a line (half-plane clip). */
function clipHalf(pts, ox, oy, nx, ny) {
  const out = [];
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const da = (a[0] - ox) * nx + (a[1] - oy) * ny;
    const db = (b[0] - ox) * nx + (b[1] - oy) * ny;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const res = [];
  for (const p of out) {
    const q = res[res.length - 1];
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.5) res.push(p);
  }
  while (res.length > 2) {
    const f = res[0], l = res[res.length - 1];
    if (Math.abs(f[0] - l[0]) + Math.abs(f[1] - l[1]) > 0.5) break;
    res.pop();
  }
  return res;
}

function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Crossings of segment a→b with the polygon outline, sorted along the segment. */
function segHits(pts, ax, ay, bx, by) {
  const hits = [];
  const rx = bx - ax, ry = by - ay;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const sx = q[0] - p[0], sy = q[1] - p[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - ax) * sy - (p[1] - ay) * sx) / den;
    const u = ((p[0] - ax) * ry - (p[1] - ay) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u < 1) hits.push({ t, x: ax + rx * t, y: ay + ry * t });
  }
  hits.sort((a, b) => a.t - b.t);
  return hits.filter((h, i) => i === 0 || h.t - hits[i - 1].t > 1e-6);
}

/** The polygon edge closest to a point: { i (edge pts[i] → pts[i+1]), t (0..1 along it), d (distance) }. */
function nearestEdge(pts, x, y) {
  let best = null;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey || 1;
    const t = G.clamp(((x - p[0]) * ex + (y - p[1]) * ey) / l2, 0, 1);
    const d = Math.hypot(p[0] + ex * t - x, p[1] + ey * t - y);
    if (!best || d < best.d) best = { i, t, d };
  }
  return best;
}

/** Crossing point of segments a→b and c→d, or null. */
function segCross(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? [a[0] + rx * t, a[1] + ry * t] : null;
}

/** Cuts the loops out of a scribbled path so it never crosses itself. */
function untangle(path) {
  const out = [path[0]];
  for (let k = 1; k < path.length; k++) {
    const q = path[k];
    for (let j = out.length - 3; j >= 0; j--) {
      const x = segCross(out[out.length - 1], q, out[j], out[j + 1]);
      if (x) {
        out.length = j + 1;
        out.push(x);
        break;
      }
    }
    out.push(q);
  }
  return out;
}

/** Douglas–Peucker: drops path points that stray less than eps from a straight line. */
function simplify(path, eps) {
  if (path.length < 3) return path;
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const a = path[i0], b = path[i1];
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    let worst = -1, wd = eps;
    for (let k = i0 + 1; k < i1; k++) {
      const d = Math.abs((path[k][0] - a[0]) * ey - (path[k][1] - a[1]) * ex) / l;
      if (d > wd) {
        wd = d;
        worst = k;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  return path.filter((_, k) => keep[k]);
}

function dedupe(pts) {
  const res = [];
  for (const p of pts) {
    const q = res[res.length - 1];
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.5) res.push(p);
  }
  while (res.length > 2) {
    const f = res[0], l = res[res.length - 1];
    if (Math.abs(f[0] - l[0]) + Math.abs(f[1] - l[1]) > 0.5) break;
    res.pop();
  }
  return res;
}

/**
 * Splits a simple polygon along a path that starts and ends on its outline and runs inside it.
 * Returns both halves (same winding as the original).
 */
function splitPoly(pts, path) {
  const n = pts.length;
  const E = path[0], X = path[path.length - 1];
  const e = nearestEdge(pts, E[0], E[1]), x = nearestEdge(pts, X[0], X[1]);
  // outline vertices met walking forward from point a to point b
  const walk = (a, b) => {
    const out = [];
    if (a.i === b.i && b.t >= a.t) return out;
    for (let k = (a.i + 1) % n; ; k = (k + 1) % n) {
      out.push(pts[k]);
      if (k === b.i) break;
    }
    return out;
  };
  const inner = path.slice(1, -1);
  return [dedupe([E, ...walk(e, x), X, ...inner.slice().reverse()]), dedupe([X, ...walk(x, e), E, ...inner])];
}

/** Rounded rectangle as a polygon (separate top / bottom corner radii). */
function blockPts(w, h, rTop, rBot, seg = 4) {
  const x = -w / 2, y = -h;
  const pts = [];
  const corners = [
    [x + w - rTop, y + rTop, rTop, -Math.PI / 2],
    [x + w - rBot, y + h - rBot, rBot, 0],
    [x + rBot, y + h - rBot, rBot, Math.PI / 2],
    [x + rTop, y + rTop, rTop, Math.PI],
  ];
  for (const [cx, cy, r, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/**
 * Softens the corners of a convex polygon: each sharp vertex becomes a short curve that starts
 * up to r(p) du away from it along both edges. Nearly straight vertices are left alone.
 */
function roundPoly(pts, r, seg = 5) {
  const out = [];
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[(i - 1 + n) % n], p = pts[i], c = pts[(i + 1) % n];
    const ux = a[0] - p[0], uy = a[1] - p[1], vx = c[0] - p[0], vy = c[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const turn = Math.PI - Math.acos(G.clamp((ux * vx + uy * vy) / (lu * lv || 1), -1, 1));
    const t = Math.min(r(p), lu * 0.45, lv * 0.45);
    if (turn < 0.25 || t < 1) {
      out.push(p);
      continue;
    }
    const A = [p[0] + (ux / lu) * t, p[1] + (uy / lu) * t], B = [p[0] + (vx / lv) * t, p[1] + (vy / lv) * t];
    for (let k = 0; k <= seg; k++) {
      const s = k / seg, q = 1 - s;
      out.push([q * q * A[0] + 2 * q * s * p[0] + s * s * B[0], q * q * A[1] + 2 * q * s * p[1] + s * s * B[1]]);
    }
  }
  return out;
}

/** Points of an ellipse arc (angles in radians, y down). */
function arc(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/**
 * Block outlines, all convex (the slicing and side-face drawing rely on it) with a flat bottom on
 * the floor y = 0, top at y = -H, never wider than W. Corners: soft on top, tighter at the floor.
 */
const corners = (top, bot = 22) => (p) => (p[1] > -60 ? bot : top);
const SHAPES = [
  // loaf: the classic rounded brick
  (W, H) => blockPts(W, H, 70, 22),
  // castle: a sand-mold frustum
  (W, H) => roundPoly([[-W / 2, 0], [-W * 0.31, -H], [W * 0.31, -H], [W / 2, 0]], corners(70)),
  // dome: straight walls under a half-ellipse cap
  (W, H) => roundPoly([[-W / 2, 0], ...arc(0, -H * 0.3, W / 2, H * 0.7, Math.PI, Math.PI * 2, 24), [W / 2, 0]], corners(70)),
  // house: walls and a pitched roof
  (W, H) => roundPoly([[-W / 2, 0], [-W / 2, -H * 0.55], [0, -H], [W / 2, -H * 0.55], [W / 2, 0]], corners(90)),
  // hexagon standing on a flat side
  (W, H) => {
    W = Math.min(W, H * 1.35);
    return roundPoly([[-W * 0.27, 0], [-W / 2, -H / 2], [-W * 0.27, -H], [W * 0.27, -H], [W / 2, -H / 2], [W * 0.27, 0]], corners(60));
  },
  // pyramid with a rounded tip
  (W, H) => {
    W = Math.min(W, H * 1.6);
    return roundPoly([[-W / 2, 0], [0, -H], [W / 2, 0]], (p) => (p[1] < -H * 0.5 ? 220 : 22));
  },
  // ball, squashed flat where it sits
  (W, H) => {
    W = Math.min(W, H * 1.25);
    const ry = H / 1.866, cy = -H + ry; // the floor cuts it where it's half as wide as its middle
    const ring = arc(0, cy, W / 2, ry, 0, Math.PI * 2, 40).slice(0, -1);
    return roundPoly(clipHalf(ring, 0, 0, 0, -1), corners(0, 30));
  },
];

let SHAPE_ICONS = null; // outlines for the picker chips, built on first draw

/** Small seeded PRNG so a texture re-rendered after a resize keeps its sparkles in place. */
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

export class SandToy extends Toy {
  static id = 'sand';

  constructor(app) {
    super(app);
    this.block = null;
    this.pieces = [];
    this.grains = [];
    this.heights = new Float32Array(1);
    this.drags = new Map();
    this.buckets = new Map();
    this.darkCols = new Map();
    this.twinkles = [];
    this.trails = [];
    this.patterN = 0; // grains landed since the last patter sound, and their summed x
    this.patterX = 0;
    this.patterT = 0;
    this.shapeIdx = -1;
    this.shapeSel = -1; // picked shape, -1 = shuffle
    this.chipPop = new Float32Array(SHAPES.length + 1);
    this.respawnT = 0;
    this.BW = 1200;
    this.TW = 1800;
    this.S = 0.3;
    this.ox = 0;
    this.oy = 0;
    this.tray = null;
    this.icons = new Map();
    this.scrape = app.audio.loop({ source: 'noise', color: 'brown', type: 'bandpass', freq: 900, q: 0.9 });
    this.buttons = [{ icon: 'refresh', color: '#3cb4e6', onTap: () => this.refresh() }];
  }

  enter() {
    if (!this.block) this.newBlock(false);
  }
  exit() {
    this.drags.clear();
    this.trails.length = 0;
    this.scrape.stop();
    this.app.audio.duckMusic(0);
  }
  setVariant() {
    this.tray = null;
    this.replaceBlock();
    this.app.audio.whoosh(0.6);
  }

  resize() {
    if (!this.block) this.newBlock(false);
    this.layout();
  }

  // ---------------------------------------------------------------- shape picker
  /** Row of shape chips along the top of the play area: shuffle first, then every shape. */
  shapeBar() {
    const a = this.area, n = SHAPES.length + 1;
    const r = G.clamp(a.w / (n * 2.7), 13, 22), gap = r * 0.55;
    const total = n * r * 2 + (n - 1) * gap;
    const chips = [];
    for (let i = 0; i < n; i++) chips.push({ shape: i - 1, x: a.x + (a.w - total) / 2 + r + i * (r * 2 + gap), y: a.y + r + 4, r });
    return { chips, h: r * 2 + 14 };
  }
  playArea() {
    const a = this.area, h = this.shapeBar().h;
    return { x: a.x, y: a.y + h, w: a.w, h: Math.max(40, a.h - h) };
  }
  pickShape(s) {
    this.shapeSel = s;
    this.chipPop[s + 1] = 1;
    this.replaceBlock();
    this.app.audio.whoosh(0.6);
    this.app.haptic(8);
  }

  // ---------------------------------------------------------------- layout
  /** Fits block + tray into the play area and re-renders the cached art at the new scale. */
  layout() {
    const a = this.playArea(), BW = this.BW;
    const M = 170 + BW * 0.12; // floor space on each side for slabs to tip into
    const TW = BW + M * 2;
    if (TW !== this.TW || this.heights.length !== Math.ceil(TW / BIN)) {
      this.TW = TW;
      this.heights = new Float32Array(Math.ceil(TW / BIN));
      for (const g of this.grains) g.bin = -1;
    }
    const zf = (ZF - 0.32) * ZS, zb = (ZB + 0.32) * ZS;
    const x0 = -TW / 2 - RIM + (zf * DX) / ZS, x1 = TW / 2 + RIM + (zb * DX) / ZS;
    const y0 = -BH - DY - 70, y1 = (-zf * DY) / ZS + LIP + 10;
    this.S = Math.max(0.01, Math.min((a.w * 1.0) / (x1 - x0), (a.h * 0.95) / (y1 - y0)));
    this.ox = a.x + a.w / 2 - ((x0 + x1) / 2) * this.S;
    this.oy = a.y + a.h / 2 - ((y0 + y1) / 2) * this.S;
    this.tray = null;
    this.noisePat = null;
    this.icons.clear();
    const texes = new Set();
    if (this.block) texes.add(this.block.tex);
    for (const p of this.pieces) texes.add(p.tex);
    for (const t of texes) this.renderTex(t);
  }

  toDu(x, y) {
    return [(x - this.ox) / this.S, (y - this.oy) / this.S];
  }

  // ---------------------------------------------------------------- blocks
  newBlock(drop) {
    const a = this.playArea();
    const aspect = a.w / Math.max(1, a.h);
    // a chunky block whatever the screen shape: wide screens get a longer loaf, tall ones a cube
    this.BW = Math.round(G.clamp((aspect * 1300 - 520) / 1.45, 760, 2300));
    // the picked shape, or (on shuffle) a different one from last time
    let si = this.shapeSel;
    if (si < 0) {
      si = (Math.random() * SHAPES.length) | 0;
      if (si === this.shapeIdx) si = (si + 1 + ((Math.random() * (SHAPES.length - 1)) | 0)) % SHAPES.length;
    }
    this.shapeIdx = si;
    const pts = SHAPES[si](this.BW, BH);
    let foot = 0; // half-width of the part standing on the floor
    for (const p of pts) if (p[1] > -5) foot = Math.max(foot, Math.abs(p[0]));
    const tex = this.makeTex(this.BW);
    this.block = { pts, tex, foot, area0: Math.abs(polyArea(pts)), ty: 0, vy: 0, sx: 1, sy: 1, squash: 0, landed: true };
    this.layout();
    if (drop) {
      this.block.landed = false;
      this.block.ty = -(this.oy / this.S) - 60;
    }
    this.twinkles.length = 0;
    this.trails.length = 0;
    for (const d of this.drags.values()) {
      d.inside = false;
      d.entry = null;
      d.trail = null;
    }
  }

  /** The current block crumbles away and a fresh one drops in. */
  replaceBlock() {
    const b = this.block;
    if (b) {
      const frac = Math.abs(polyArea(b.pts)) / b.area0;
      const [cx] = centroid(b.pts);
      let x0 = Infinity, x1 = -Infinity;
      for (const p of b.pts) {
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
      }
      this.crumble(b.pts, b.tex, this.blockMatrix(b), cx, (x1 - x0) * 0.6 + 80, frac * 0.6);
      this.app.audio.sandFall(1.2, 0, 0.5);
    }
    this.respawnT = 0;
    this.newBlock(true);
  }

  refresh() {
    if (this.block && !this.block.landed) return;
    this.replaceBlock();
    this.app.audio.whoosh(0.7);
  }

  canCut() {
    return !!this.block && this.block.landed;
  }

  blockMatrix(b) {
    return [b.sx, 0, 0, b.sy, 0, b.ty];
  }
  pieceMatrix(p) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    return [c, s, -s, c, p.cx + p.tx - (c * p.cx - s * p.cy), p.cy + p.ty - (s * p.cx + c * p.cy)];
  }

  // ---------------------------------------------------------------- texture
  makeTex(BW) {
    const st = STYLES[this.variant];
    const waves = [];
    for (let k = 1; k < NL; k++) {
      waves.push({ a1: G.rand(10, 24), f1: G.rand(0.0035, 0.008), p1: G.rand(G.TAU), a2: G.rand(3, 8), f2: G.rand(0.014, 0.03), p2: G.rand(G.TAU) });
    }
    // rendered by layout(), which runs right after a block is created and on every resize
    return { BW, pal: st.layers.slice(), sparkle: !!st.sparkle, waves, seed: (Math.random() * 1e9) | 0, canvas: null };
  }

  /** y of the boundary between layer k-1 and k at x (gently wavy, like hand-packed sand). */
  layerY(tex, k, x) {
    const w = tex.waves[k - 1];
    return -BH + (k * BH) / NL + w.a1 * Math.sin(x * w.f1 + w.p1) + w.a2 * Math.sin(x * w.f2 + w.p2);
  }
  layerAt(tex, x, y) {
    for (let k = 1; k < NL; k++) if (y < this.layerY(tex, k, x)) return k - 1;
    return NL - 1;
  }

  noiseTile() {
    const dpr = this.app.dpr;
    if (this.noise && this.noise.dpr === dpr) return this.noise;
    const N = 128;
    const c = G.makeCanvas(N, N);
    const g = c.getContext('2d');
    const dots = N * N * 0.2;
    for (let i = 0; i < dots; i++) {
      const light = Math.random() < 0.55;
      g.fillStyle = light ? `rgba(255,255,255,${G.rand(0.1, 0.28).toFixed(2)})` : `rgba(60,25,0,${G.rand(0.05, 0.15).toFixed(2)})`;
      const s = Math.max(1, Math.round(dpr * G.rand(0.5, 1.3)));
      g.fillRect((Math.random() * N) | 0, (Math.random() * N) | 0, s, s);
    }
    this.noise = { c, dpr };
    return this.noise;
  }

  /**
   * Two canvases per block: `canvas` (stripes + grain noise) for the front face and a smaller,
   * noise-free `flat` one for the side faces, whose colors get stretched across the depth.
   */
  renderTex(tex) {
    const dpr = this.app.dpr, PAD = 40;
    const w = tex.BW + PAD * 2, h = BH + PAD * 2;
    const k = Math.max(0.05, Math.min(this.S * dpr, TEX_MAX / w, TEX_MAX / h));
    tex.x0 = -tex.BW / 2 - PAD;
    tex.y0 = -BH - PAD;
    tex.w = w;
    tex.h = h;
    const make = (kk, grain) => {
      const c = G.makeCanvas(w * kk, h * kk);
      const g = c.getContext('2d');
      g.scale(kk, kk);
      g.translate(PAD + tex.BW / 2, PAD + BH);
      this.paintLayers(g, tex, PAD, w, h, grain);
      if (grain) {
        // fine grain texture, in texture pixels
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = g.createPattern(this.noiseTile().c, 'repeat');
        g.fillRect(0, 0, c.width, c.height);
      }
      return c;
    };
    tex.canvas = make(k, true);
    tex.flat = make(Math.max(0.05, k * 0.5), false);
  }

  paintLayers(g, tex, PAD, w, h, sparkles) {
    const xa = -tex.BW / 2 - PAD, xb = tex.BW / 2 + PAD;
    for (let i = 0; i < NL; i++) {
      g.beginPath();
      for (let x = xa; x <= xb + 20; x += 20) {
        const y = i === 0 ? -BH - PAD : this.layerY(tex, i, x);
        x === xa ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      for (let x = xb + 20; x >= xa; x -= 20) g.lineTo(x, i === NL - 1 ? PAD : this.layerY(tex, i + 1, x));
      g.closePath();
      g.fillStyle = tex.pal[i];
      g.fill();
    }
    // each layer a touch darker toward its bottom, so the stripes read as packed sand
    for (let i = 0; i < NL; i++) {
      const y0 = -BH + (i * BH) / NL, y1 = y0 + BH / NL;
      const lg = g.createLinearGradient(0, y0, 0, y1 + 20);
      lg.addColorStop(0, 'rgba(255,255,255,0.08)');
      lg.addColorStop(1, 'rgba(60,25,0,0.08)');
      g.fillStyle = lg;
      g.fillRect(xa, y0 - (i === 0 ? PAD : 0), w, BH / NL + (i === 0 ? PAD : 0) + (i === NL - 1 ? PAD : 0));
    }
    // soft top highlight
    const hg = g.createLinearGradient(0, -BH, 0, -BH + 190);
    hg.addColorStop(0, 'rgba(255,255,255,0.3)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.fillRect(xa, -BH - PAD, w, 190 + PAD);
    if (tex.sparkle && sparkles) {
      const r = rng(tex.seed);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = r() < 0.6 ? 'rgba(255,255,255,0.9)' : r() < 0.5 ? 'rgba(255,190,250,0.9)' : 'rgba(150,230,255,0.9)';
        const s = 2 + r() * 4;
        g.fillRect(xa + r() * w, -BH - PAD + r() * h, s, s);
      }
    }
  }

  // ---------------------------------------------------------------- input
  pointerDown(p) {
    for (const c of this.shapeBar().chips) {
      if (Math.hypot(p.x - c.x, p.y - c.y) < c.r + 6) {
        this.pickShape(c.shape);
        return;
      }
    }
    const [ux, uy] = this.toDu(p.x, p.y);
    const d = { id: p.id, x: p.x, y: p.y, ux, uy, inside: false, entry: null, trail: null, moved: 0, speed: 0, crumbT: 0, up: false, dirX: 0, dirY: 1 };
    if (this.canCut() && inPoly(this.block.pts, ux, uy)) {
      d.inside = true;
      d.entry = [ux, uy];
      this.startTrail(d, ux, uy);
    }
    this.drags.set(p.id, d);
  }

  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (!d || d.up) return;
    const dx = p.x - d.x, dy = p.y - d.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    if (len > 2) {
      d.dirX = dx / len;
      d.dirY = dy / len;
    }
    d.moved += len;
    const [ux, uy] = this.toDu(p.x, p.y);
    this.trace(d, d.ux, d.uy, ux, uy);
    d.x = p.x;
    d.y = p.y;
    d.ux = ux;
    d.uy = uy;
  }

  pointerUp(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    d.up = true;
    d.inside = false;
    d.entry = null;
    this.endTrail(d);
  }

  // ---------------------------------------------------------------- cut trails
  /** The groove a finger leaves while it is inside the block (block coords). */
  startTrail(d, x, y) {
    this.endTrail(d);
    d.trail = { pts: [[x, y]], a: 1, live: true };
    this.trails.push(d.trail);
  }
  extendTrail(d, x, y, force) {
    const t = d.trail;
    if (!t) return;
    const q = t.pts[t.pts.length - 1];
    if (force || Math.abs(x - q[0]) + Math.abs(y - q[1]) > 6) t.pts.push([x, y]);
  }
  endTrail(d) {
    if (d.trail) d.trail.live = false;
    d.trail = null;
  }

  keyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      this.refresh();
      return true;
    }
    if (e.key === 's' || e.key === 'S') {
      this.pickShape(this.shapeSel + 1 < SHAPES.length ? this.shapeSel + 1 : -1);
      return true;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      this.autoCut();
      return true;
    }
    return false;
  }

  /** Keyboard slice: a slightly tilted cut near one side of the block. */
  autoCut() {
    if (!this.canCut()) return;
    const pts = this.block.pts;
    let x0 = Infinity, x1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
    }
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = (side > 0 ? x1 : x0) - side * (x1 - x0) * G.rand(0.12, 0.28);
    const tilt = G.rand(-90, 90);
    const hits = segHits(pts, x - tilt, -BH * 1.3, x + tilt, 200);
    if (hits.length >= 2) this.tryCut([[hits[0].x, hits[0].y], [hits[1].x, hits[1].y]], { dirX: 0, dirY: 1, x: this.ox + x * this.S, y: this.oy - BH * 0.5 * this.S });
  }

  /** Follows one pointer segment through the block: entering then leaving it makes a cut. */
  trace(d, ax, ay, bx, by) {
    if (!this.canCut()) {
      d.inside = false;
      d.entry = null;
      this.endTrail(d);
      return;
    }
    const hits = segHits(this.block.pts, ax, ay, bx, by);
    for (const h of hits) {
      if (!d.inside) {
        d.inside = true;
        d.entry = [h.x, h.y];
        this.startTrail(d, h.x, h.y);
      } else {
        d.inside = false;
        const entry = d.entry;
        d.entry = null;
        this.extendTrail(d, h.x, h.y, true);
        const path = d.trail ? d.trail.pts.slice() : entry ? [entry, [h.x, h.y]] : null;
        this.endTrail(d);
        if (path && this.tryCut(path, d)) {
          // the outline changed under every finger: restart their tracking from where they are
          for (const o of this.drags.values()) {
            const ox = o === d ? bx : o.ux, oy = o === d ? by : o.uy;
            const inside = !o.up && this.canCut() && inPoly(this.block.pts, ox, oy);
            o.inside = inside;
            o.entry = inside ? [ox, oy] : null;
            if (inside) this.startTrail(o, ox, oy);
            else this.endTrail(o);
          }
          return;
        }
      }
    }
    if (d.inside) this.extendTrail(d, bx, by);
  }

  /**
   * Slices the block along the path the finger took (curves and all), from where it went in to
   * where it came out. The piece on the floor (the bigger one if both are) stays.
   */
  tryCut(path, d) {
    const b = this.block, app = this.app;
    path = untangle(simplify(dedupe(path), 2.5));
    if (path.length < 2) return false;
    // a swipe that started inside the block: run its first stretch back out to the outline
    const s0 = path[0], s1 = path[1];
    if (nearestEdge(b.pts, s0[0], s0[1]).d > 1) {
      const dx = s0[0] - s1[0], dy = s0[1] - s1[1], dl = Math.hypot(dx, dy) || 1;
      const back = segHits(b.pts, s0[0], s0[1], s0[0] + (dx / dl) * 1e4, s0[1] + (dy / dl) * 1e4);
      if (!back.length) return false;
      path = untangle([[back[0].x, back[0].y], ...path]);
    }
    const E = path[0], X = path[path.length - 1];
    let plen = 0;
    for (let k = 1; k < path.length; k++) plen += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    if (plen < 40) return false;
    const area = Math.abs(polyArea(b.pts));
    const valid = ([P, Q]) => P.length >= 3 && Q.length >= 3 && Math.abs(Math.abs(polyArea(P)) + Math.abs(polyArea(Q)) - area) < area * 0.01;
    // if the path strayed outside (it can graze a hollow), fall back to a straight slice
    let halves = splitPoly(b.pts, path);
    if (!valid(halves)) halves = splitPoly(b.pts, [E, X]);
    if (!valid(halves)) return false;
    const [A, B] = halves;
    const aA = Math.abs(polyArea(A)), aB = Math.abs(polyArea(B));
    if (Math.min(aA, aB) < b.area0 * 0.004) return false; // just a nick
    const floorA = Math.max(...A.map((p) => p[1])) > -3;
    const floorB = Math.max(...B.map((p) => p[1])) > -3;
    const keepA = floorA && !floorB ? true : floorB && !floorA ? false : aA >= aB;
    const keep = keepA ? A : B, lose = keepA ? B : A;
    const loseArea = keepA ? aB : aA;
    b.pts = keep;
    this.twinkles.length = 0;

    const sx = this.ox + ((E[0] + X[0]) / 2) * this.S, sy = this.oy + ((E[1] + X[1]) / 2) * this.S;
    const pan = G.clamp((sx / app.w - 0.5) * 1.2, -0.8, 0.8);
    app.audio.noise({ dur: 0.2, vol: 0.42, type: 'bandpass', freq: 1500, freqEnd: 600, q: 0.8, color: 'brown', pan });
    app.audio.noise({ dur: 0.09, vol: 0.14, type: 'highpass', freq: 2800, pan });
    app.haptic(10);
    app.stat('cuts');
    this.duckT = 0.6;
    app.audio.duckMusic(0.65);
    app.addProgress(0.08, d && d.x !== undefined ? d.x : sx, d && d.y !== undefined ? d.y : sy);

    // crumbs shaken loose along the cut
    for (let i = 0; i < 14; i++) {
      const k = (Math.random() * (path.length - 1)) | 0, t = Math.random();
      const x = path[k][0] + (path[k + 1][0] - path[k][0]) * t, y = path[k][1] + (path[k + 1][1] - path[k][1]) * t;
      const li = this.layerAt(b.tex, x, y);
      this.addGrain(x, y, G.rand(-90, 90), G.rand(-160, 0), this.grainColor(b.tex, li), Math.random() < 0.25);
    }

    const frac = loseArea / b.area0;
    if (frac < 0.02) {
      // tiny corners just crumble on the spot
      const [lcx] = centroid(lose);
      this.crumble(lose, b.tex, [1, 0, 0, 1, 0, 0], lcx, 70, frac);
      app.audio.sandFall(0.55, pan, 0.2);
    } else {
      this.pieces.push(this.makePiece(lose, keep, E, X, d, frac));
    }
    // most of the block is gone: a fresh one drops in shortly (further cuts don't postpone it)
    if (this.respawnT <= 0 && Math.abs(polyArea(keep)) < b.area0 * 0.3) this.respawnT = 0.9;
    return true;
  }

  makePiece(pts, keep, E, X, d, frac) {
    const b = this.block;
    const [cx, cy] = centroid(pts);
    const [kx] = centroid(keep);
    const maxY = Math.max(...pts.map((p) => p[1]));
    const p = { pts, tex: b.tex, cx, cy, tx: 0, ty: 0, rot: 0, w: 0, vx: 0, vy: 0, t: 0, frac, mode: 'tip', dir: cx >= kx ? 1 : -1 };
    if (maxY > -3) {
      // standing on the tray: tip over the outer bottom corner
      let best = null;
      for (const q of pts) {
        if (q[1] < maxY - 4) continue;
        if (!best || q[0] * p.dir > best[0] * p.dir) best = q;
      }
      p.qx = best[0];
      p.qy = best[1];
      p.px = best[0];
      p.py = best[1];
      p.w = G.rand(0.35, 0.6);
      p.maxRot = G.rand(0.75, 1.0);
    } else {
      // resting on top of the block: slide down the cut (or along the swipe), then fall off
      let tx = X[0] - E[0], ty = X[1] - E[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      if (Math.abs(ty) > 0.15 ? ty < 0 : tx * (d ? d.dirX || 0 : 0) < 0) {
        tx = -tx;
        ty = -ty;
      }
      if (Math.abs(ty) <= 0.15 && !(d && d.dirX)) {
        const s = cx >= kx ? 1 : -1;
        if (tx * s < 0) {
          tx = -tx;
          ty = -ty;
        }
      }
      p.mode = 'slide';
      p.tanX = tx;
      p.tanY = ty;
      p.dir = tx >= 0 ? 1 : -1;
      p.sv = 420;
      // it tips off once its middle is (almost) past the block's edge
      let edge = -Infinity, lo = Infinity, hi = -Infinity;
      for (const q of keep) edge = Math.max(edge, q[0] * tx + q[1] * ty);
      for (const q of pts) {
        const s = q[0] * tx + q[1] * ty;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
      p.edge = edge - (hi - lo) * 0.12;
    }
    return p;
  }

  // ---------------------------------------------------------------- grains
  grainColor(tex, li) {
    if (tex.sparkle && Math.random() < 0.1) return '#ffffff';
    const base = tex.pal[li] || tex.pal[0];
    const r = Math.random();
    return r < 0.5 ? base : r < 0.8 ? G.shade(base, -0.13) : G.shade(base, 0.16);
  }

  addGrain(x, y, vx, vy, col, big, fy = G.rand(0, 36)) {
    if (this.grains.length >= MAX_GRAINS) return;
    this.grains.push({
      x, y, vx, vy, col, round: big, s: big ? G.rand(18, 32) : G.rand(8, 15),
      fy, st: 0, t: 0, life: G.rand(3, 4.8), bin: -1, h: 0, fade: 1,
      spark: col === '#ffffff',
    });
  }

  /**
   * Turns a polygon (local pts + matrix m) into grains. Kinetic sand slumps instead of
   * scattering: each grain is aimed so it lands around the heap center hx (± spread).
   */
  crumble(pts, tex, m, hx, spread, frac) {
    let n = Math.round(G.clamp(frac * 2400, 40, 420));
    // make room by fading out the oldest settled grains
    let excess = this.grains.length + n - MAX_GRAINS;
    for (const g of this.grains) {
      if (excess <= 0) break;
      if (g.st === 1 && g.t < g.life) {
        g.t = g.life;
        excess--;
      }
    }
    n = Math.min(n, MAX_GRAINS - this.grains.length);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    const lim = Math.max(0, this.TW / 2 - spread - 30);
    hx = G.clamp(hx, -lim, lim);
    for (let made = 0, tries = 0; made < n && tries < n * 5; tries++) {
      const lx = G.rand(x0, x1), ly = G.rand(y0, y1);
      if (!inPoly(pts, lx, ly)) continue;
      made++;
      const wx = m[0] * lx + m[2] * ly + m[4], wy = m[1] * lx + m[3] * ly + m[5];
      const fy = G.rand(0, 36);
      const vy = G.rand(-160, 10);
      const drop = Math.max(5, fy - wy);
      const tf = (-vy + Math.sqrt(vy * vy + 2 * GRAV * drop)) / GRAV; // time until it lands
      const target = hx + spread * (Math.random() - Math.random()); // denser in the middle
      const vx = (target - wx) / Math.max(0.12, tf) + G.rand(-25, 25);
      this.addGrain(wx, wy, vx, vy, this.grainColor(tex, this.layerAt(tex, lx, ly)), Math.random() < 0.35, fy);
    }
  }

  binOf(x) {
    return G.clamp(Math.floor((x + this.TW / 2) / BIN), 0, this.heights.length - 1);
  }

  updateGrains(dt) {
    const H = this.heights, nb = H.length, half = this.TW / 2;
    const drag = Math.pow(0.5, dt);
    const list = this.grains;
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.st === 0) {
        g.vy += GRAV * dt;
        g.vx *= drag;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        // the tray walls are low: only grains near the floor bump into them
        const lim = half - g.s * 0.5;
        if (g.y > -70) {
          if (g.x < -lim) {
            g.x = -lim;
            g.vx = Math.abs(g.vx) * 0.25;
          } else if (g.x > lim) {
            g.x = lim;
            g.vx = -Math.abs(g.vx) * 0.25;
          }
        }
        let bin = this.binOf(g.x);
        if (g.vy > 0 && g.y >= g.fy - H[bin] - g.s * 0.45) {
          // settle; roll toward a lower neighbor while the pile is too steep
          for (let hop = 0; hop < 6; hop++) {
            const l = bin > 0 ? H[bin - 1] : Infinity, r = bin < nb - 1 ? H[bin + 1] : Infinity;
            if (H[bin] - Math.min(l, r) <= g.s * 1.1) break;
            bin = l <= r ? bin - 1 : bin + 1;
          }
          g.bin = bin;
          g.x = (bin + 0.5) * BIN - half + G.rand(-BIN * 0.5, BIN * 0.5);
          g.y = g.fy - H[bin] - g.s * 0.45;
          g.h = g.s * 0.62;
          H[bin] += g.h;
          g.st = 1;
          g.t = 0;
          this.patterN++;
          this.patterX += g.x;
        }
      } else {
        g.t += dt;
        if (g.t > g.life) {
          g.fade = 1 - (g.t - g.life) / 0.9;
          if (g.fade <= 0) {
            if (g.bin >= 0 && g.bin < nb) H[g.bin] = Math.max(0, H[g.bin] - g.h);
            continue;
          }
        }
      }
      if (g.y > 5000) continue;
      list[j++] = g;
    }
    list.length = j;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const app = this.app, b = this.block;
    if (!b) return;
    if (!b.landed) {
      b.vy += GRAV * 1.25 * dt;
      b.ty += b.vy * dt;
      if (b.ty >= 0) {
        b.ty = 0;
        b.vy = 0;
        b.landed = true;
        b.squash = 1;
        app.audio.tone({ freq: 92, freqEnd: 48, dur: 0.3, vol: 0.5 });
        app.audio.noise({ dur: 0.14, vol: 0.16, type: 'lowpass', freq: 600, q: 0.7, color: 'brown' });
        app.haptic(20);
        const by = this.oy;
        for (const side of [-1, 1]) {
          app.fx.burst(this.ox + side * b.foot * this.S, by, { count: 8, colors: ['rgba(255,255,255,0.75)', G.shade(b.tex.pal[NL - 1], 0.4)], shape: 'circle', speed: [40, 160], angle: side > 0 ? -0.3 : Math.PI + 0.3, spread: 1.4, size: [2, 5], gravity: 120, life: [0.3, 0.6], drag: 0.85 });
        }
      }
    }
    if (b.squash > 0) {
      b.squash = Math.max(0, b.squash - dt / 0.55);
      const q = b.squash, e = q * Math.cos((1 - q) * 11);
      b.sy = 1 - 0.13 * e;
      b.sx = 1 + 0.09 * e;
    } else {
      b.sx = b.sy = 1;
    }
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.replaceBlock();
    }

    // knives, crumbs, scrape sound and progress while cutting
    let vol = 0, freq = 900, cutting = null;
    for (const [id, d] of this.drags) {
      d.speed = G.damp(d.speed, d.moved / Math.max(dt, 1e-3), 10, dt);
      d.moved = 0;
      if (d.up) {
        this.drags.delete(id);
        continue;
      }
      if (d.inside && !d.up && this.canCut()) {
        const k = G.clamp(d.speed / 1100, 0, 1);
        vol = Math.max(vol, 0.09 + 0.45 * k);
        freq = 700 + 600 * k;
        if (d.speed > 60) {
          cutting = d;
          d.crumbT -= dt;
          if (d.crumbT <= 0) {
            d.crumbT = 0.03;
            const li = this.layerAt(this.block.tex, d.ux, d.uy);
            this.addGrain(d.ux + G.rand(-12, 12), d.uy + G.rand(-12, 12), G.rand(-70, 70), G.rand(-90, 20), this.grainColor(this.block.tex, li), Math.random() < 0.2);
          }
        }
      }
    }
    this.scrape.set({ vol, freq });
    // the music steps back while a finger is carving, and for a moment after each slice
    this.duckT = vol > 0 ? 0.6 : Math.max(0, (this.duckT || 0) - dt);
    app.audio.duckMusic(this.duckT > 0 ? 0.65 : 0);
    if (cutting) app.addProgress(0.2 * dt, cutting.x, cutting.y);

    for (let i = 0; i < this.chipPop.length; i++) this.chipPop[i] = Math.max(0, this.chipPop[i] - dt / 0.25);
    // finished grooves fade out
    let j = 0;
    for (const t of this.trails) {
      if (!t.live) t.a -= dt / 0.35;
      if (t.a > 0) this.trails[j++] = t;
    }
    this.trails.length = j;

    this.updatePieces(dt);
    this.updateGrains(dt);
    this.patterT -= dt;
    if (this.patterN > 0 && this.patterT <= 0) {
      const sx = this.ox + (this.patterX / this.patterN) * this.S;
      app.audio.grains(this.patterN, G.clamp((sx / app.w - 0.5) * 1.2, -0.8, 0.8));
      this.patterN = 0;
      this.patterX = 0;
      this.patterT = 0.035;
    }
  }

  updatePieces(dt) {
    const half = this.TW / 2;
    const list = this.pieces;
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.t += dt;
      let done = false;
      if (p.mode === 'tip') {
        // a domino falling over its outer corner, pushed a little away from the block
        p.w += (3.2 + 10 * Math.sin(Math.min(Math.PI / 2, Math.abs(p.rot)))) * dt;
        p.rot += p.dir * p.w * dt;
        p.px += p.dir * 90 * Math.max(0, 1 - p.t * 2.5) * dt;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        const qx = p.qx - p.cx, qy = p.qy - p.cy;
        p.tx = p.px - (c * qx - s * qy) - p.cx;
        p.ty = p.py - (s * qx + c * qy) - p.cy;
        done = Math.abs(p.rot) > p.maxRot || p.t > 1.6;
      } else if (p.mode === 'slide') {
        p.sv += (GRAV * Math.max(0, p.tanY) * 0.5 + 2000) * dt;
        p.tx += p.tanX * p.sv * dt;
        p.ty += p.tanY * p.sv * dt;
        if ((p.cx + p.tx) * p.tanX + (p.cy + p.ty) * p.tanY > p.edge) {
          p.mode = 'fall';
          p.vx = p.tanX * p.sv;
          p.vy = p.tanY * p.sv;
          p.w = p.dir * G.rand(2.2, 3.2);
        }
        done = p.t > 3;
      } else {
        p.vy += GRAV * dt;
        p.tx += p.vx * dt;
        p.ty += p.vy * dt;
        p.rot += p.w * dt;
        done = p.t > 2.5 || Math.abs(p.rot) > 1.7;
      }
      // hitting the tray floor, a tray wall (low down) or the screen edge ends the fall
      const m = this.pieceMatrix(p);
      const sl = -this.ox / this.S - 20, sr = (this.app.w - this.ox) / this.S + 20;
      let lowest = -Infinity, wall = false, off = false;
      for (const q of p.pts) {
        const wx = m[0] * q[0] + m[2] * q[1] + m[4], wy = m[1] * q[0] + m[3] * q[1] + m[5];
        if (p.mode !== 'tip' || Math.abs(wx - p.px) + Math.abs(wy - p.py) > 30) lowest = Math.max(lowest, wy);
        if (Math.abs(wx) > half + 10 && wy > -70) wall = true;
        if (wx < sl || wx > sr) off = true;
      }
      if (p.mode === 'fall' && lowest >= 0) done = true;
      if (p.mode === 'tip' && Math.abs(p.rot) > 0.25 && lowest >= -2) done = true;
      if ((wall || off) && p.t > 0.12) done = true;
      if (done) {
        this.crumblePiece(p, m);
        continue;
      }
      list[j++] = p;
    }
    list.length = j;
  }

  crumblePiece(p, m) {
    const app = this.app;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of p.pts) {
      x0 = Math.min(x0, q[0]);
      x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]);
      y1 = Math.max(y1, q[1]);
    }
    const [cx, cy] = centroid(p.pts);
    const wx = m[0] * cx + m[2] * cy + m[4], wy = m[1] * cx + m[3] * cy + m[5];
    // the heap gathers a little beyond where the slab was falling
    const hx = p.mode === 'tip' ? p.px + p.dir * G.clamp((y1 - y0) * 0.22, 60, 260) : wx + p.dir * 40;
    this.crumble(p.pts, p.tex, m, hx, G.clamp((x1 - x0) * 0.5 + 70, 90, 260), p.frac);
    const sx = this.ox + wx * this.S, sy = this.oy + wy * this.S;
    const pan = G.clamp((sx / app.w - 0.5) * 1.2, -0.8, 0.8);
    app.audio.sandFall(G.clamp(0.8 + p.frac * 3, 0.8, 1.6), pan, G.clamp(0.3 + p.frac * 1.2, 0.3, 0.75));
    app.haptic(8);
    app.fx.burst(sx, sy, { count: 10, colors: ['rgba(255,255,255,0.7)', G.shade(p.tex.pal[2], 0.45)], shape: 'circle', speed: [40, 170], size: [2, 5], gravity: 160, life: [0.3, 0.6], drag: 0.85 });
  }

  // ---------------------------------------------------------------- drawing
  renderTray() {
    const S = this.S, dpr = this.app.dpr, st = STYLES[this.variant], TW = this.TW;
    const xa = -TW / 2 - RIM, xb = TW / 2 + RIM;
    const za = (ZF - 0.32) * ZS, zb = (ZB + 0.32) * ZS;
    const bx0 = xa + (za * DX) / ZS - 40, bx1 = xb + (zb * DX) / ZS + 40;
    const by0 = (-zb * DY) / ZS - 40, by1 = (-za * DY) / ZS + LIP + 70;
    const k = S * dpr;
    const c = G.makeCanvas((bx1 - bx0) * k, (by1 - by0) * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    g.translate(-bx0, -by0);
    const plan = (dy, fn) => {
      g.save();
      g.translate(0, dy);
      g.transform(1, 0, DX / ZS, -DY / ZS, 0, 0); // plan (x, z) → oblique view
      g.beginPath();
      fn();
      g.restore();
    };
    const outer = () => G.roundRectPath(g, xa, za, xb - xa, zb - za, 120);
    const inner = () => G.roundRectPath(g, -TW / 2, ZF * ZS, TW, (ZB - ZF) * ZS, 80);
    const tray = st.tray;
    // shadow on the table
    plan(LIP + 18, outer);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fill();
    // thickness: stack the outline downward to extrude the front face
    for (let i = 10; i >= 1; i--) {
      plan((LIP * i) / 10, outer);
      g.fillStyle = G.shade(tray, -0.22 - 0.12 * (i / 10));
      g.fill();
    }
    // rim top
    plan(0, outer);
    const rg = g.createLinearGradient(0, by0, 0, (-za * DY) / ZS);
    rg.addColorStop(0, G.shade(tray, 0.28));
    rg.addColorStop(1, G.shade(tray, 0.05));
    g.fillStyle = rg;
    g.fill();
    // floor, a step down from the rim
    plan(0, inner);
    const fg = g.createLinearGradient(0, (-ZB * DY) / ZS, 0, (-ZF * DY) / ZS);
    fg.addColorStop(0, G.shade(tray, -0.16));
    fg.addColorStop(1, G.shade(tray, -0.06));
    g.fillStyle = fg;
    g.fill();
    g.save();
    plan(0, inner);
    g.clip();
    plan(-12, inner);
    g.lineWidth = 26;
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.stroke();
    g.restore();
    plan(0, inner);
    g.lineWidth = 5;
    g.strokeStyle = G.shade(tray, 0.4, 0.8);
    g.stroke();
    this.tray = { c, x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
  }

  noisePattern(ctx) {
    if (this.noisePat) return this.noisePat;
    const pat = ctx.createPattern(this.noiseTile().c, 'repeat');
    try {
      const k = 1 / this.app.dpr;
      pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    } catch (e) { /* pattern transforms unsupported: slightly coarser grain */ }
    this.noisePat = pat;
    return pat;
  }

  /** Draws a sand polygon as a prism: lit side faces smeared from the edge colors, then the front. */
  drawPrism(ctx, pts, tex, m) {
    const n = pts.length;
    if (n < 3 || !tex.canvas) return;
    const S = this.S, ox = this.ox, oy = this.oy;
    const P = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = pts[i][0], y = pts[i][1];
      P[i] = [ox + (m[0] * x + m[2] * y + m[4]) * S, oy + (m[1] * x + m[3] * y + m[5]) * S];
    }
    // winding decides which side of each edge is outside (curved cuts leave hollows, so no centroid tricks)
    const wind = polyArea(pts) > 0 ? 1 : -1;
    const dsx = DX * S, dsy = -DY * S;
    const dl = Math.hypot(DX, DY), ddx = DX / dl, ddy = -DY / dl;
    const TH = 10; // du of texture smeared across the depth of a side face
    const noise = this.noisePattern(ctx);
    for (let i = 0; i < n; i++) {
      const jn = (i + 1) % n;
      const a = P[i], b = P[jn];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const el = Math.hypot(ex, ey);
      if (el < 0.01) continue;
      const nx = (wind * ey) / el, ny = (-wind * ex) / el;
      if (nx * ddx + ny * ddy <= 0.02) continue; // faces away from us
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(b[0] + dsx, b[1] + dsy);
      ctx.lineTo(a[0] + dsx, a[1] + dsy);
      ctx.closePath();
      const p0 = pts[i], p1 = pts[jn];
      if (el < 4) {
        const li = this.layerAt(tex, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
        ctx.fillStyle = tex.pal[li];
        ctx.fill();
      } else {
        ctx.save();
        ctx.clip();
        // map texture → screen so the colors along this edge stretch back along the depth
        const lx = p1[0] - p0[0], ly = p1[1] - p0[1], ll = Math.hypot(lx, ly) || 1;
        const elx = lx / ll, ely = ly / ll;
        const mlx = -wind * ely, mly = wind * elx; // inward
        const sex = ex / ll, sey = ey / ll;
        const A00 = sex * elx + (dsx / TH) * mlx, A01 = sex * ely + (dsx / TH) * mly;
        const A10 = sey * elx + (dsy / TH) * mlx, A11 = sey * ely + (dsy / TH) * mly;
        ctx.transform(A00, A10, A01, A11, a[0] - (A00 * p0[0] + A01 * p0[1]), a[1] - (A10 * p0[0] + A11 * p0[1]));
        ctx.drawImage(tex.flat, tex.x0, tex.y0, tex.w, tex.h);
        ctx.restore();
        ctx.fillStyle = noise;
        ctx.fill();
      }
      // light from the top left: tops brighten, right sides darken
      const lit = -0.37 * nx - 0.93 * ny;
      ctx.fillStyle = lit > 0 ? `rgba(255,255,255,${(0.2 * lit).toFixed(3)})` : `rgba(30,10,0,${(-0.32 * lit).toFixed(3)})`;
      ctx.fill();
    }
    // front face
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < n; i++) i ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.save();
    ctx.transform(m[0] * S, m[1] * S, m[2] * S, m[3] * S, ox + m[4] * S, oy + m[5] * S);
    ctx.drawImage(tex.canvas, tex.x0, tex.y0, tex.w, tex.h);
    ctx.restore();
    // slightly darker edges (inner half of wide strokes)
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(50,20,0,0.09)';
    ctx.lineWidth = 60 * S;
    ctx.stroke();
    ctx.lineWidth = 24 * S;
    ctx.stroke();
    // crisp light bevel where the front meets the top faces
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1;
      const nx = (wind * ey) / el, ny = (-wind * ex) / el;
      if (ny < -0.45) {
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(1.5, 9 * S);
    ctx.stroke();
    ctx.restore();
  }

  drawGrains(ctx) {
    const S = this.S, ox = this.ox, oy = this.oy, t = this.app.time;
    const buckets = this.buckets;
    for (const arr of buckets.values()) arr.length = 0;
    let sparks = 0;
    for (const g of this.grains) {
      if (g.spark) {
        sparks++;
        continue;
      }
      let arr = buckets.get(g.col);
      if (!arr) buckets.set(g.col, (arr = []));
      arr.push(g);
    }
    for (const [col, arr] of buckets) {
      if (!arr.length) continue;
      // fine grains are little squares; clumps are round crumbs with a darker underside
      ctx.fillStyle = col;
      for (const g of arr) {
        if (g.round) continue;
        const s = Math.max(1, g.s * S);
        if (g.fade < 1) ctx.globalAlpha = Math.max(0, g.fade);
        ctx.fillRect(ox + g.x * S - s * 0.5, oy + g.y * S - s * 0.5, s, s);
        if (g.fade < 1) ctx.globalAlpha = 1;
      }
      let dark = this.darkCols.get(col);
      if (!dark) this.darkCols.set(col, (dark = G.shade(col, -0.22)));
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? col : dark;
        ctx.beginPath();
        for (const g of arr) {
          if (!g.round || g.fade < 1) continue;
          const r = Math.max(1, g.s * S) * (pass ? 0.44 : 0.5);
          const x = ox + g.x * S + (pass ? 0 : r * 0.18), y = oy + g.y * S + (pass ? -r * 0.1 : r * 0.2);
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, G.TAU);
        }
        ctx.fill();
      }
      for (const g of arr) {
        if (!g.round || g.fade >= 1) continue;
        const r = Math.max(1, g.s * S) * 0.48;
        ctx.globalAlpha = Math.max(0, g.fade);
        ctx.beginPath();
        ctx.arc(ox + g.x * S, oy + g.y * S, r, 0, G.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (sparks) {
      ctx.fillStyle = '#ffffff';
      for (const g of this.grains) {
        if (!g.spark) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * 9 + g.x * 0.05);
        ctx.globalAlpha = Math.max(0, g.fade) * tw;
        const s = Math.max(2, g.s * S * 0.9);
        ctx.beginPath();
        G.softStarPath(ctx, ox + g.x * S, oy + g.y * S, 4, s, s * 0.3, 0);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Galaxy style: little stars twinkling on the block. */
  drawTwinkles(ctx, m) {
    const b = this.block, t = this.app.time, S = this.S;
    if (!b.tex.sparkle) return;
    if (this.twinkles.length < 9) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of b.pts) {
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
      }
      for (let i = 0; i < 20 && this.twinkles.length < 9; i++) {
        const x = G.rand(x0, x1), y = G.rand(y0, y1);
        if (inPoly(b.pts, x, y)) this.twinkles.push({ x, y, ph: G.rand(G.TAU), sp: G.rand(1.5, 3) });
      }
    }
    ctx.fillStyle = '#ffffff';
    for (const s of this.twinkles) {
      const a = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 3);
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      const x = this.ox + (m[0] * s.x + m[2] * s.y + m[4]) * S, y = this.oy + (m[1] * s.x + m[3] * s.y + m[5]) * S;
      ctx.beginPath();
      G.softStarPath(ctx, x, y, 4, Math.max(3, 26 * S) * (0.5 + a * 0.5), Math.max(1, 5 * S), 0);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The grooves fingers have carved through the block, along the exact path they took. */
  drawTrails(ctx, m) {
    if (!this.trails.length) return;
    const b = this.block, S = this.S;
    const toScreen = (x, y) => [this.ox + (m[0] * x + m[2] * y + m[4]) * S, this.oy + (m[1] * x + m[3] * y + m[5]) * S];
    const path = (pts, dy) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = toScreen(p[0], p[1]);
        i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy);
      });
    };
    ctx.save();
    path(b.pts, 0);
    ctx.closePath();
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const w = Math.max(3, 18 * S);
    for (const t of this.trails) {
      if (t.pts.length < 2) continue;
      ctx.globalAlpha = t.a;
      // a dark slot with a lit lower lip
      path(t.pts, 0);
      ctx.lineWidth = w;
      ctx.strokeStyle = 'rgba(60,25,0,0.38)';
      ctx.stroke();
      path(t.pts, w * 0.45);
      ctx.lineWidth = Math.max(1, w * 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx) {
    const app = this.app, st = STYLES[this.variant], S = this.S;
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1]);
    if (!this.block) return;
    if (!this.tray) this.renderTray();
    const tr = this.tray;
    ctx.drawImage(tr.c, this.ox + tr.x * S, this.oy + tr.y * S, tr.w * S, tr.h * S);

    const b = this.block, bm = this.blockMatrix(b);
    // contact shadow on the floor, under and behind the block
    let x0 = Infinity, x1 = -Infinity;
    for (const p of b.pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
    }
    const air = G.clamp(-b.ty / 1500, 0, 1);
    G.groundShadow(ctx, this.ox + ((x0 + x1) / 2 + DX * 0.45) * S, this.oy - DY * 0.45 * S, ((x1 - x0) / 2 + 90) * S * (1 - air * 0.4), DY * 0.8 * S, 0.3 * (1 - air * 0.6));

    // pieces left of the block hide behind it; the rest (and slabs riding on top) go in front
    const [bcx] = centroid(b.pts);
    const behind = [], front = [];
    for (const p of this.pieces) {
      const m = this.pieceMatrix(p);
      const wx = m[0] * p.cx + m[2] * p.cy + m[4];
      (p.mode !== 'slide' && wx < bcx && wx < x0 + 60 ? behind : front).push([p, m]);
    }
    for (const [p, m] of behind) this.drawPrism(ctx, p.pts, p.tex, m);
    this.drawPrism(ctx, b.pts, b.tex, bm);
    this.drawTwinkles(ctx, bm);
    this.drawTrails(ctx, bm);
    for (const [p, m] of front) this.drawPrism(ctx, p.pts, p.tex, m);
    this.drawGrains(ctx);
    this.drawShapeBar(ctx, st);
  }

  drawShapeBar(ctx, st) {
    if (!SHAPE_ICONS) SHAPE_ICONS = SHAPES.map((f) => f(1300, BH));
    for (const c of this.shapeBar().chips) {
      const sel = c.shape === this.shapeSel;
      const r = c.r * (sel ? 1.1 : 1) * (1 + 0.15 * Math.sin(this.chipPop[c.shape + 1] * Math.PI));
      G.circle(ctx, c.x, c.y + 2, r + 3);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fill();
      G.circle(ctx, c.x, c.y, r + 3);
      ctx.fillStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.85)';
      ctx.fill();
      G.circle(ctx, c.x, c.y, r);
      ctx.fillStyle = '#fffaf4';
      ctx.fill();
      if (c.shape < 0) {
        G.drawIcon(ctx, 'shuffle', c.x, c.y, r * 1.15, '#8a6a52');
        continue;
      }
      // the outline filled with this style's sand stripes
      const pts = SHAPE_ICONS[c.shape];
      let x0 = Infinity, x1 = -Infinity;
      for (const p of pts) {
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
      }
      const k = (r * 1.3) / Math.max(x1 - x0, BH);
      ctx.save();
      ctx.translate(c.x - ((x0 + x1) / 2) * k, c.y + (BH / 2) * k);
      ctx.scale(k, k);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.save();
      ctx.clip();
      for (let i = 0; i < NL; i++) {
        ctx.fillStyle = st.layers[i];
        ctx.fillRect(x0, -BH + (i * BH) / NL, x1 - x0, BH / NL + 2);
      }
      ctx.restore();
      ctx.lineWidth = 1.5 / k;
      ctx.strokeStyle = 'rgba(60,30,10,0.3)';
      ctx.stroke();
      ctx.restore();
    }
  }

  hud() {
    const n = this.app.getStat('cuts');
    return `${G.formatNum(n)} ${countWord(this.app.lang, LABEL, n)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const st = STYLES[i];
    const key = `${i}|${Math.round(r * 2)}|${this.app.dpr}`;
    let ic = this.icons.get(key);
    if (!ic) {
      const dpr = this.app.dpr, S2 = r * 2;
      const c = G.makeCanvas(S2 * dpr, S2 * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      const bg = g.createLinearGradient(0, 0, 0, S2);
      bg.addColorStop(0, st.bg[0]);
      bg.addColorStop(1, st.bg[1]);
      g.fillStyle = bg;
      g.fillRect(0, 0, S2, S2);
      // a tiny striped block in the same oblique view as the toy
      const w = r * 1.05, h = r * 0.95, dx = r * 0.32, dy = r * 0.24;
      const bx = r - w / 2 - dx / 2, by = r - h / 2 + dy / 2 + r * 0.02;
      const band = h / NL;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + dx, by - dy);
      g.lineTo(bx + w + dx, by - dy);
      g.lineTo(bx + w, by);
      g.closePath();
      g.fillStyle = G.shade(st.layers[0], 0.25);
      g.fill();
      for (let k = 0; k < NL; k++) {
        g.beginPath();
        g.moveTo(bx + w, by + k * band);
        g.lineTo(bx + w + dx, by + k * band - dy);
        g.lineTo(bx + w + dx, by + (k + 1) * band - dy + 0.5);
        g.lineTo(bx + w, by + (k + 1) * band + 0.5);
        g.closePath();
        g.fillStyle = G.shade(st.layers[k], -0.18);
        g.fill();
        g.fillStyle = st.layers[k];
        g.fillRect(bx, by + k * band, w, band + 0.5);
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(bx, by, w, Math.max(1, band * 0.25));
      ic = { c, S2 };
      this.icons.set(key, ic);
    }
    ctx.drawImage(ic.c, x - r, y - r, ic.S2, ic.S2);
  }
}
