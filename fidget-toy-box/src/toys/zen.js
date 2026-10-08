// Zen Garden: rake calm grooves into a sand tray, move the pebbles, then sweep it all smooth again.
//
// The sand is made of offscreen layers the size of the tray interior (× dpr):
//   height — the groove pattern as a height map (white = undisturbed sand, darker = deeper). Raking
//            first paints the band under the rake white (re-raking replaces old grooves, like real
//            sand), then carves nested round strokes with 'darken', so joins between frames, overlaps
//            and crossings are seamless (the deepest carve wins).
//   shade  — an emboss of the height map (lit lip on the top-left of a groove, shaded lip on the
//            bottom-right, a slightly darker floor), rebuilt only where the height map changed:
//            shade = ½·h(p − d) + ½·(255 − h(p + d)), then × a little of h for occlusion. 128 = flat.
//   base   — sand colour, grain, soft lighting and edge occlusion (rebuilt on resize / style change).
// The shade layer is composited over the base with 'hard-light', which darkens or lightens ANY sand
// colour, so changing style keeps the pattern (black sand shows its grooves lighter, for free).
import { Toy } from './_base.js';
import * as G from '../gfx.js';

const FLAT = '#fff';
const MARGIN = 4; // height-map border (px) so the emboss can read neighbours at the edges
// Groove cross-section in the height map: nested round strokes [width × groove width, grey level].
const GROOVE = [
  [1.32, 240],
  [1.0, 214],
  [0.76, 180],
  [0.53, 147],
  [0.33, 117],
  [0.16, 98],
];

// Tools, in units of the tine spacing: tine offsets across the stroke, groove width, flattened band.
const TOOLS = {
  rake: { tines: [-1.5, -0.5, 0.5, 1.5], width: 0.55, band: 4 },
  stick: { tines: [0], width: 0.9, band: 2 },
};

// groove = strength of the emboss layer; grain = strength of the sand speckle; fx = ambient particles.
const STYLES = [
  { sand: '#e9d5a4', wood: '#dda662', corner: '#a9662f', bg: ['#f7ecd6', '#e2c497'], stone: '#8d949d', groove: 1, grain: 1 },
  { sand: '#f4f2ed', wood: '#ead7b5', corner: '#bf9867', bg: ['#f2f6f9', '#c9d5df'], stone: '#6c737b', groove: 0.85, grain: 0.8 },
  { sand: '#3f444b', wood: '#6f4529', corner: '#2c1d14', bg: ['#5a6068', '#25282d'], stone: '#aab1ba', groove: 0.9, grain: 0.55 },
  { sand: '#f7c3d0', wood: '#c97b5f', corner: '#8f4b3b', bg: ['#fff1f5', '#ffc6d7'], stone: '#8e8791', groove: 0.9, grain: 0.55, fx: 'petals' },
  { sand: '#5f80b6', wood: '#43506f', corner: '#262f46', bg: ['#2c4373', '#0e1a33'], stone: '#5d6b88', groove: 1, grain: 0.6, fx: 'flies', night: true },
  { sand: '#e27b4e', wood: '#b67548', corner: '#784528', bg: ['#ffdec2', '#f0a374'], stone: '#56504d', groove: 0.95, grain: 0.75, fx: 'glints' },
];
const PETAL_COLORS = ['#ff9fbd', '#ffb6cc', '#ff8bb0'];

// Pebbles: normalized position in the tray, radius (× tray size), aspect ratio, rotation.
const STONES = [
  { u: 0.27, v: 0.31, r: 0.085, ar: 0.76, rot: -0.35 },
  { u: 0.74, v: 0.46, r: 0.062, ar: 0.82, rot: 0.5 },
  { u: 0.37, v: 0.75, r: 0.068, ar: 0.72, rot: 0.2 },
];
const SWEEP_TIME = 1.35;

/** Small deterministic RNG so grain, wood and pebbles look the same after every rebuild. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainCanvas = null;
/** Seamless tile of neutral light/dark specks (mostly alpha), tiled over every sand colour. */
function grainTile() {
  if (grainCanvas) return grainCanvas;
  const S = 160;
  const c = G.makeCanvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  const rnd = mulberry(1234);
  for (let i = 0; i < S * S; i++) {
    const v = rnd(), k = i * 4;
    const dark = v < 0.5;
    const t = dark ? (0.5 - v) * 2 : (v - 0.5) * 2;
    const c0 = dark ? 30 : 255;
    d[k] = d[k + 1] = d[k + 2] = c0;
    d[k + 3] = Math.pow(t, 2.2) * (dark ? 80 : 90);
  }
  g.putImageData(img, 0, 0);
  // a few coarser grains, wrapped around the edges so the tile stays seamless
  for (let i = 0; i < 240; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 0.8;
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.22)';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, G.TAU);
        g.fill();
      }
    }
  }
  grainCanvas = c;
  return c;
}

/** Cherry petal (narrow at the stem, rounded with a little notch at the tip), along -y, s tall. */
function petalPath(p, s) {
  p.moveTo(0, s * 0.5);
  p.bezierCurveTo(-s * 0.4, s * 0.26, -s * 0.38, -s * 0.36, -s * 0.12, -s * 0.5);
  p.quadraticCurveTo(-s * 0.04, -s * 0.47, 0, -s * 0.4);
  p.quadraticCurveTo(s * 0.04, -s * 0.47, s * 0.12, -s * 0.5);
  p.bezierCurveTo(s * 0.38, -s * 0.36, s * 0.4, s * 0.26, 0, s * 0.5);
  p.closePath();
}

/** Soft elliptical shadow (rotated). */
function softEllipse(ctx, x, y, rx, ry, rot, a) {
  if (!(rx > 0) || !(ry > 0) || a <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, G.TAU);
  ctx.fill();
  ctx.restore();
}

export class ZenToy extends Toy {
  static id = 'zen';

  constructor(app) {
    super(app);
    this.tool = 'rake';
    this.drags = new Map(); // pointer id → stroke or stone drag
    this.stones = STONES.map((s, i) => ({ ...s, seed: 17 + i * 31, lift: 0, drop: 0, hop: 0, drag: null }));
    this.inner = null;
    this.height = null;
    this.heightCtx = null;
    this.shade = null;
    this.shadeCtx = null;
    this.dirty = null; // shade-layer rect waiting for an emboss refresh
    this.embossD = 1;
    this.base = null;
    this.frame = null;
    this.layoutKey = '';
    this.sprites = new Map();
    this.ghosts = []; // tools fading out where a stroke ended
    this.petals = [];
    this.flies = [];
    this.glints = [];
    this.fxT = 0;
    this.sweep = null;
    this.travel = 0;
    this.level = 0;
    this.vol = 0;
    this.rebuildIn = 0;
    this.styleFor = -1;
    this.scrape = app.audio.loop({ source: 'noise', color: 'brown', type: 'bandpass', freq: 900, q: 0.8 });
    this.toolBtn = { icon: 'rake', color: '#c98b4b', onTap: () => this.toggleTool() };
    this.buttons = [this.toolBtn, { icon: 'refresh', color: '#3cb4e6', onTap: () => this.smooth() }];
  }

  enter() {
    if (this.styleFor !== this.variant) this.applyStyle();
  }
  exit() {
    for (const d of this.drags.values()) {
      if (d.kind === 'rake') this.flush(d);
      else d.stone.drag = null;
    }
    this.drags.clear();
    this.ghosts.length = 0;
    this.level = 0;
    this.vol = 0;
    this.scrape.set({ vol: 0 });
  }
  setVariant() {
    this.applyStyle();
    this.app.audio.whoosh(0.5);
  }
  /** Recolour everything for the current style; the groove pattern (shade layer) is kept. */
  applyStyle() {
    this.styleFor = this.variant;
    this.base = null;
    this.frame = null;
    this.sprites.clear();
    this.resetFx();
  }

  // ---------------------------------------------------------------- layout
  resize(area) {
    const dpr = this.app.dpr || 1;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const m = G.clamp(Math.min(area.w, area.h) * 0.025, 3, 16);
    const tw = Math.max(24, area.w - m * 2), th = Math.max(24, area.h - m * 2.6);
    const F = Math.round(G.clamp(Math.min(tw, th) * 0.055, 8, 30));
    const tray = { x: snap(area.x + (area.w - tw) / 2), y: snap(area.y + m), w: snap(tw), h: snap(th) };
    const inner = { x: snap(tray.x + F), y: snap(tray.y + F), w: Math.max(4, snap(tray.w - F * 2)), h: Math.max(4, snap(tray.h - F * 2)) };
    const key = `${inner.x},${inner.y},${inner.w},${inner.h},${dpr}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.tray = tray;
    this.inner = inner;
    this.F = F;
    this.S = Math.max(4, Math.min(inner.w, inner.h));
    this.spacing = G.clamp(this.S * 0.026, 5, 17);
    this.lazy = this.spacing * 0.6;
    this.step = G.clamp(this.spacing * 0.3, 1, 3.5);
    this.boardW = G.clamp(this.S * 0.032, 7, 22);
    this.frame = null;
    this.sprites.clear();
    this.ghosts.length = 0;
    for (const d of this.drags.values()) if (d.kind === 'rake') this.restartStroke(d);
    // The groove layer is resampled into the new size; during a live window resize we wait until
    // the size settles (drawing the old layers stretched meanwhile) so repeated resamples don't blur.
    if (!this.shade) this.buildSand();
    else this.rebuildIn = 0.25;
  }

  sandScale(w, h) {
    return Math.max(0.5, Math.min(this.app.dpr || 1, Math.sqrt(4e6 / Math.max(1, w * h))));
  }

  /** Creates the sand layers, or resamples the existing height map into the current tray size. */
  buildSand() {
    this.rebuildIn = 0;
    const { w, h } = this.inner;
    const sc = this.sandScale(w, h);
    const W = Math.max(1, Math.round(w * sc)), H = Math.max(1, Math.round(h * sc));
    const old = this.height;
    if (old && this.shade.width === W && this.shade.height === H) return;
    const M = MARGIN;
    const hc = G.makeCanvas(W + M * 2, H + M * 2);
    const hg = hc.getContext('2d');
    hg.fillStyle = FLAT;
    hg.fillRect(0, 0, hc.width, hc.height);
    if (old) {
      hg.imageSmoothingEnabled = true;
      hg.drawImage(old, M, M, old.width - M * 2, old.height - M * 2, M, M, W, H);
    }
    this.height = hc;
    this.heightCtx = hg;
    this.shade = G.makeCanvas(W, H);
    this.shadeCtx = this.shade.getContext('2d');
    // emboss distance ≈ an eighth of a groove, in layer pixels
    this.embossD = G.clamp(Math.round(TOOLS.rake.width * this.spacing * sc * 0.13), 1, M);
    this.base = null;
    if (!old) this.rakeInitialPattern();
    this.dirty = null;
    this.updateShade(0, 0, W, H);
  }

  /** First visit: straight lines with ripples around each pebble, like a freshly kept garden. */
  rakeInitialPattern() {
    const { inner } = this, sp = this.spacing, band = sp * 4;
    for (let y = inner.y + band / 2; y - band / 2 < inner.y + inner.h; y += band) {
      this.rakeAlong([[inner.x - sp * 3, y], [inner.x + inner.w + sp * 3, y]]);
    }
    const g = this.heightCtx;
    for (const s of this.stones) {
      const c = this.stonePos(s), rx = s.r * this.S, ry = rx * s.ar;
      this.heightTransform();
      g.fillStyle = FLAT;
      g.beginPath();
      g.ellipse(c.x, c.y, rx + sp * 0.45, ry + sp * 0.45, s.rot, 0, G.TAU);
      g.fill();
      const a = rx + sp * 2.3, b = ry + sp * 2.3;
      const n = Math.max(24, Math.ceil(((a + b) * Math.PI) / (sp * 0.4)));
      const cr = Math.cos(s.rot), sr = Math.sin(s.rot);
      const pts = [];
      for (let i = 0; i <= n * 1.08; i++) {
        const t = (i / n) * G.TAU, ex = Math.cos(t) * a, ey = Math.sin(t) * b;
        pts.push([c.x + ex * cr - ey * sr, c.y + ex * sr + ey * cr]);
      }
      this.rakeAlong(pts);
    }
  }

  /** Rakes a scripted path (used for the initial pattern). */
  rakeAlong(pts, tool = 'rake') {
    const s = this.newStroke(pts[0][0], pts[0][1], tool);
    s.smooth = false;
    for (let i = 1; i < pts.length; i++) {
      s.x = pts[i][0];
      s.y = pts[i][1];
      this.advance(s, 0);
    }
    this.flush(s);
  }

  /** Maps screen CSS px into the height map (which has a MARGIN border). */
  heightTransform() {
    const { inner } = this, M = MARGIN, c = this.height;
    const sx = (c.width - M * 2) / inner.w, sy = (c.height - M * 2) / inner.h;
    this.heightCtx.setTransform(sx, 0, 0, sy, M - inner.x * sx, M - inner.y * sy);
  }

  /** Marks a screen-space box (CSS px) as changed, so its emboss is refreshed this frame. */
  markDirty(x0, y0, x1, y1) {
    const { inner } = this, d = this.embossD + 1;
    const sx = this.shade.width / inner.w, sy = this.shade.height / inner.h;
    const a = (x0 - inner.x) * sx - d, b = (y0 - inner.y) * sy - d;
    const c = (x1 - inner.x) * sx + d, e = (y1 - inner.y) * sy + d;
    const r = this.dirty;
    if (!r) this.dirty = { x0: a, y0: b, x1: c, y1: e };
    else {
      r.x0 = Math.min(r.x0, a);
      r.y0 = Math.min(r.y0, b);
      r.x1 = Math.max(r.x1, c);
      r.y1 = Math.max(r.y1, e);
    }
  }

  /** Recomputes the emboss (shade) layer from the height map inside a rect of shade pixels. */
  updateShade(x, y, w, h) {
    const S = this.shade, g = this.shadeCtx, Hm = this.height, M = MARGIN, d = this.embossD;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(S.width, Math.ceil(x + w)), y1 = Math.min(S.height, Math.ceil(y + h));
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff';
    g.fillRect(x0, y0, rw, rh);
    g.globalCompositeOperation = 'difference'; // 255 − h(p + d)
    g.drawImage(Hm, x0 + M + d, y0 + M + d, rw, rh, x0, y0, rw, rh);
    g.globalCompositeOperation = 'source-over'; // averaged with h(p − d)
    g.globalAlpha = 0.5;
    g.drawImage(Hm, x0 + M - d, y0 + M - d, rw, rh, x0, y0, rw, rh);
    g.globalCompositeOperation = 'multiply'; // deeper sand sits a little darker
    g.globalAlpha = 0.32;
    g.drawImage(Hm, x0 + M, y0 + M, rw, rh, x0, y0, rw, rh);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- raking
  newStroke(x, y, tool) {
    return { kind: 'rake', tool, x, y, hx: x, hy: y, dx: 1, dy: 0, aim: false, last: null, pend: [], len: 0, counted: false, show: 0, smooth: true, moved: false };
  }
  restartStroke(s) {
    s.hx = s.x;
    s.hy = s.y;
    s.aim = false;
    s.last = null;
    s.pend = [];
  }

  /**
   * Moves the rake head toward the pointer on a short "string" (lazy radius R) in small steps, so
   * the path stays smooth for fast drags and sparse events. The rake turns gradually with the path.
   */
  advance(s, R) {
    const ddx = s.x - s.hx, ddy = s.y - s.hy;
    const dist = Math.hypot(ddx, ddy);
    if (!(dist > R + 0.01)) return 0;
    const go = dist - R;
    const n = Math.min(400, Math.max(1, Math.ceil(go / this.step)));
    const ux = ddx / dist, uy = ddy / dist, st = go / n;
    const k = s.smooth ? Math.min(0.45, st / (this.spacing * 1.1)) : 1;
    if (!s.aim) {
      s.aim = true;
      s.dx = ux;
      s.dy = uy;
      s.last = this.stepAt(s);
    }
    for (let i = 0; i < n; i++) {
      s.hx += ux * st;
      s.hy += uy * st;
      const dx = s.dx + (ux - s.dx) * k, dy = s.dy + (uy - s.dy) * k;
      const l = Math.hypot(dx, dy);
      if (l > 1e-6) {
        s.dx = dx / l;
        s.dy = dy / l;
      }
      s.pend.push(this.stepAt(s));
    }
    s.len += go;
    s.moved = true;
    return go;
  }

  /** Head position, rake-bar normal and every tine position for the current head and direction. */
  stepAt(s) {
    const offs = TOOLS[s.tool].tines, sp = this.spacing;
    const nx = -s.dy, ny = s.dx;
    const pts = new Array(offs.length * 2);
    for (let i = 0; i < offs.length; i++) {
      pts[i * 2] = s.hx + nx * offs[i] * sp;
      pts[i * 2 + 1] = s.hy + ny * offs[i] * sp;
    }
    return { x: s.hx, y: s.hy, nx, ny, pts };
  }

  /** Carves the pending steps of a stroke into the height map (once per frame per stroke). */
  flush(s) {
    const steps = s.pend;
    if (!steps.length || !this.heightCtx || !s.last) {
      s.pend = [];
      return;
    }
    const g = this.heightCtx, sp = this.spacing, tool = TOOLS[s.tool];
    const prev = s.last;
    const half = (tool.band * sp) / 2;
    this.heightTransform();
    // 1) flatten the band swept by the rake bar: one quad per step, sharing edges exactly
    const band = new Path2D();
    let a = prev;
    let x0 = prev.x, y0 = prev.y, x1 = prev.x, y1 = prev.y;
    for (const q of steps) {
      band.moveTo(a.x + a.nx * half, a.y + a.ny * half);
      band.lineTo(q.x + q.nx * half, q.y + q.ny * half);
      band.lineTo(q.x - q.nx * half, q.y - q.ny * half);
      band.lineTo(a.x - a.nx * half, a.y - a.ny * half);
      band.closePath();
      a = q;
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = FLAT;
    g.fill(band);
    // 2) carve the grooves: nested round strokes, deepest wins
    const path = new Path2D();
    const nT = tool.tines.length;
    for (let t = 0; t < nT; t++) {
      path.moveTo(prev.pts[t * 2], prev.pts[t * 2 + 1]);
      for (const q of steps) path.lineTo(q.pts[t * 2], q.pts[t * 2 + 1]);
    }
    const w = tool.width * sp;
    g.globalCompositeOperation = 'darken';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [k, v] of GROOVE) {
      g.lineWidth = Math.max(0.5, k * w);
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.stroke(path);
    }
    g.globalCompositeOperation = 'source-over';
    const pad = half + w + 2;
    this.markDirty(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
    s.last = steps[steps.length - 1];
    s.pend = [];
    this.pushPetals(prev.x, prev.y, s.last.x, s.last.y, tool.band * sp * 0.5);
  }

  toggleTool() {
    this.tool = this.tool === 'rake' ? 'stick' : 'rake';
    this.toolBtn.icon = this.tool === 'rake' ? 'rake' : 'brush';
  }

  /** Refresh button: a smoothing board sweeps the tray from left to right. */
  smooth() {
    if (this.sweep || !this.inner) return;
    this.sweep = { t: 0, done: 0, front: 0 };
    for (const s of this.stones) s.hopped = false;
    const a = this.app.audio;
    a.noise({ dur: SWEEP_TIME, vol: 0.13, type: 'bandpass', freq: 450, freqEnd: 1500, q: 0.7, attack: 0.4, color: 'brown' });
    a.whoosh(0.35);
  }

  // ---------------------------------------------------------------- pebbles
  stonePos(s) {
    const { inner } = this;
    return { x: inner.x + s.u * inner.w, y: inner.y + s.v * inner.h };
  }
  stoneAt(x, y) {
    if (!this.inner) return null;
    const order = this.stoneOrder();
    for (let i = order.length - 1; i >= 0; i--) {
      const s = order[i];
      if (s.drag !== null) continue;
      const c = this.stonePos(s), rx = s.r * this.S, ry = rx * s.ar;
      const slop = Math.max(7, rx * 0.2);
      const dx = x - c.x, dy = y - c.y;
      const cr = Math.cos(-s.rot), sr = Math.sin(-s.rot);
      const lx = dx * cr - dy * sr, ly = dx * sr + dy * cr;
      if ((lx / (rx + slop)) ** 2 + (ly / (ry + slop)) ** 2 <= 1) return s;
    }
    return null;
  }
  stoneOrder() {
    return this.stones.slice().sort((a, b) => a.lift + a.hop - (b.lift + b.hop));
  }
  /** Places a pebble (clamped to the tray) and nudges the others out of its way. */
  moveStone(s, x, y) {
    const { inner } = this, S = this.S;
    const clampIn = (st, px, py) => {
      const r = st.r * S;
      const mx = Math.min(r, inner.w / 2), my = Math.min(r * 0.9, inner.h / 2);
      st.u = (G.clamp(px, inner.x + mx, inner.x + inner.w - mx) - inner.x) / inner.w;
      st.v = (G.clamp(py, inner.y + my, inner.y + inner.h - my) - inner.y) / inner.h;
    };
    clampIn(s, x, y);
    const c = this.stonePos(s);
    for (const o of this.stones) {
      if (o === s || o.drag !== null) continue;
      const oc = this.stonePos(o);
      let dx = oc.x - c.x, dy = oc.y - c.y;
      const d = Math.hypot(dx, dy), min = (s.r + o.r) * S * 0.98;
      if (d >= min) continue;
      if (d < 1e-3) {
        dx = 1;
        dy = 0;
      } else {
        dx /= d;
        dy /= d;
      }
      clampIn(o, c.x + dx * min, c.y + dy * min);
    }
  }
  /** Soft "tok" of a pebble settling on sand. */
  stoneSound(x, v = 1) {
    const a = this.app.audio, pan = (x / Math.max(1, this.app.w) - 0.5) * 0.8;
    const r = G.rand(0.9, 1.1);
    a.tone({ freq: 330 * r, freqEnd: 170 * r, type: 'triangle', dur: 0.08, vol: 0.2 * v, pan });
    a.noise({ dur: 0.05, vol: 0.13 * v, type: 'bandpass', freq: 1100 * r, q: 1.4, pan, color: 'brown' });
    a.crumble(0.3 * v, pan, 0.12);
  }

  // ---------------------------------------------------------------- input
  pointerDown(p) {
    if (!this.inner) return;
    const s = this.stoneAt(p.x, p.y);
    if (s) {
      const c = this.stonePos(s);
      s.drag = p.id;
      this.drags.set(p.id, { kind: 'stone', stone: s, ox: p.x - c.x, oy: p.y - c.y });
      this.app.audio.crumble(0.25, (p.x / Math.max(1, this.app.w) - 0.5) * 0.8, 0.1);
      this.app.haptic(8);
      return;
    }
    this.drags.set(p.id, this.newStroke(p.x, p.y, this.tool));
  }
  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    if (d.kind === 'stone') {
      this.moveStone(d.stone, p.x - d.ox, p.y - d.oy);
      return;
    }
    d.x = p.x;
    d.y = p.y;
    this.travel += this.advance(d, this.lazy);
  }
  pointerUp(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    this.drags.delete(p.id);
    if (d.kind === 'stone') {
      const s = d.stone;
      s.drag = null;
      s.drop = 1;
      const c = this.stonePos(s);
      this.stoneSound(c.x, 1);
      this.app.haptic(12);
      this.dust(c.x, c.y + s.r * this.S * s.ar * 0.6, s.r * this.S);
      return;
    }
    this.flush(d);
    if (d.aim) this.ghosts.push({ x: d.hx, y: d.hy, dx: d.dx, dy: d.dy, tool: d.tool, a: d.show });
  }
  keyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      this.smooth();
      return true;
    }
    if (e.key === 't' || e.key === 'T') {
      this.toggleTool();
      return true;
    }
    return false;
  }

  dust(x, y, r) {
    const st = STYLES[this.variant];
    this.app.fx.burst(x, y, {
      count: 9, colors: [G.shade(st.sand, 0.25), G.shade(st.sand, -0.12)], shape: 'circle',
      speed: [r * 0.6, r * 1.6], size: [1, 2.2], life: [0.25, 0.45], gravity: 0, drag: 0.95, angle: -Math.PI / 2, spread: Math.PI * 1.6, vr: 0,
    });
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const app = this.app;
    if (!this.inner) return;
    if (this.styleFor !== this.variant) this.applyStyle();
    if (this.rebuildIn > 0 && (this.rebuildIn -= dt) <= 0) this.buildSand();
    // draw this frame's rake steps into the sand
    let raking = null;
    for (const d of this.drags.values()) {
      if (d.kind !== 'rake') continue;
      if (d.pend.length) this.flush(d);
      if (d.aim) d.show = Math.min(1, d.show + dt / 0.15);
      if (d.moved) {
        raking = d;
        d.moved = false;
        if (!d.counted && d.len > this.spacing * 2) {
          d.counted = true;
          app.stat('strokes');
        }
      }
    }
    if (raking) app.addProgress(0.2 * dt, raking.hx, raking.hy);
    // scrape loop follows the rake speed
    const speed = this.travel / Math.max(dt, 1 / 120);
    this.travel = 0;
    const target = G.clamp(speed / (this.S * 1.8), 0, 1);
    this.level = G.damp(this.level, target, target > this.level ? 22 : 7, dt);
    if (this.level < 0.003 && target === 0) this.level = 0;
    const vol = this.level > 0 ? 0.42 * Math.pow(this.level, 0.85) : 0;
    if (Math.abs(vol - this.vol) > 0.004 || (vol === 0 && this.vol !== 0)) {
      this.vol = vol;
      this.scrape.set({ vol, freq: 700 + 900 * this.level, q: 0.8 });
    }
    for (const g of this.ghosts) g.a -= dt / 0.3;
    this.ghosts = this.ghosts.filter((g) => g.a > 0);
    // pebbles: lift while held, little squash when dropped, hop when the smoothing board passes
    for (const s of this.stones) {
      s.lift = G.damp(s.lift, s.drag !== null ? 1 : 0, 16, dt);
      if (s.drop > 0) s.drop = Math.max(0, s.drop - dt / 0.28);
      if (s.hop > 0) {
        const was = s.hop;
        s.hop = Math.max(0, s.hop - dt / 0.42);
        if (was > 0.12 && s.hop <= 0.12) {
          s.drop = 1;
          this.stoneSound(this.stonePos(s).x, 0.55);
        }
      }
    }
    if (this.sweep) this.updateSweep(dt);
    // refresh the emboss where the sand changed this frame
    const r = this.dirty;
    if (r && this.shade) {
      this.dirty = null;
      this.updateShade(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    }
    this.updateFx(dt);
  }

  updateSweep(dt) {
    const sw = this.sweep, { inner } = this, bw = this.boardW;
    sw.t += dt / SWEEP_TIME;
    const k = G.ease.inOutCubic(Math.min(1, sw.t));
    sw.front = -bw + k * (inner.w + bw * 2); // board centre, px from inner.x
    const edge = G.clamp((sw.front + bw * 0.5) / inner.w, 0, 1);
    if (edge > sw.done && this.heightCtx) {
      const M = MARGIN, W = this.height.width - M * 2;
      const x0 = M + Math.floor(sw.done * W), x1 = M + Math.ceil(edge * W) + (edge >= 1 ? M : 0);
      const g = this.heightCtx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = FLAT;
      g.fillRect(x0, 0, x1 - x0, this.height.height);
      this.markDirty(inner.x + sw.done * inner.w, inner.y, inner.x + edge * inner.w, inner.y + inner.h);
      sw.done = edge;
    }
    // pebbles hop over the board; resting petals get pushed along in front of it
    for (const s of this.stones) {
      if (!s.hopped && s.drag === null && inner.x + sw.front > this.stonePos(s).x - s.r * this.S * 0.6) {
        s.hopped = true;
        s.hop = 1;
      }
    }
    for (const p of this.petals) {
      if (p.landed && p.u < edge + 0.01) {
        p.u = edge + 0.01;
        p.t = Math.max(p.t, p.life - 0.5);
      }
    }
    // a few grains spray ahead of the board
    if (sw.t < 0.96 && Math.random() < 0.7) {
      const st = STYLES[this.variant];
      const x = inner.x + sw.front + bw * 0.6, y = inner.y + G.rand(inner.h);
      this.app.fx.spawn({ x, y, vx: G.rand(40, 140), vy: G.rand(-40, 40), life: G.rand(0.2, 0.4), size: G.rand(0.8, 1.8), color: G.shade(st.sand, G.rand(-0.15, 0.3)), drag: 0.97 });
    }
    if (sw.t >= 1) this.sweep = null;
  }

  // ---------------------------------------------------------------- ambient particles
  resetFx() {
    this.petals.length = 0;
    this.flies.length = 0;
    this.glints.length = 0;
    this.fxT = 0;
    const fx = STYLES[this.variant].fx;
    if (fx === 'flies') {
      for (let i = 0; i < 7; i++) {
        this.flies.push({ u: G.rand(0.1, 0.9), v: G.rand(0.1, 0.9), a: G.rand(G.TAU), ph: G.rand(G.TAU), sp: G.rand(0.6, 1.2), blink: G.rand(2, 6) });
      }
    } else if (fx === 'petals') {
      for (let i = 0; i < 7; i++) {
        const p = this.spawnPetal();
        p.landed = true;
        p.v = p.land;
        p.u = G.rand(0.05, 0.95);
        p.t = G.rand(0, p.life * 0.6);
      }
    }
  }

  spawnPetal() {
    const top = this.inner ? (this.app.area.y - 12 - this.inner.y) / Math.max(1, this.inner.h) : -0.1;
    const p = {
      u: G.rand(-0.08, 0.95), v: Math.min(-0.03, top), land: G.rand(0.05, 0.95), vy: G.rand(24, 42),
      sw: G.rand(0.7, 1.5), ph: G.rand(G.TAU), rot: G.rand(G.TAU), vr: G.rand(-1.8, 1.8),
      fl: G.rand(G.TAU), fs: G.rand(1.8, 3.2), size: G.rand(0.75, 1.2), kind: G.randInt(0, 2),
      landed: false, t: 0, life: G.rand(6, 10), flat: 1,
    };
    this.petals.push(p);
    return p;
  }

  /** Resting petals under the rake are pushed along to the edge of the raked band. */
  pushPetals(x0, y0, x1, y1, r) {
    if (!this.petals.length) return;
    const { inner } = this;
    const mx = x1 - x0, my = y1 - y0;
    for (const p of this.petals) {
      if (!p.landed) continue;
      const px = inner.x + p.u * inner.w, py = inner.y + p.v * inner.h;
      if (G.dist(px, py, x1, y1) < r) {
        p.u = G.clamp((px + mx - inner.x) / inner.w, 0.01, 0.99);
        p.v = G.clamp((py + my - inner.y) / inner.h, 0.01, 0.99);
        p.rot += 0.05;
      }
    }
  }

  updateFx(dt) {
    const fx = STYLES[this.variant].fx, { inner } = this;
    const t = this.app.time;
    if (fx === 'petals') {
      this.fxT -= dt;
      if (this.fxT <= 0 && this.petals.length < 26) {
        this.fxT = G.rand(0.35, 0.8);
        this.spawnPetal();
      }
      for (const p of this.petals) {
        p.t += dt;
        if (!p.landed) {
          p.fl += dt * p.fs;
          p.rot += p.vr * dt;
          const vx = Math.sin(p.t * p.sw + p.ph) * 22 + 9;
          p.u += (vx * dt) / inner.w;
          p.v += (p.vy * dt) / inner.h;
          if (p.v >= p.land) {
            p.landed = true;
            p.t = 0;
            p.flat = 0.55 + 0.45 * Math.abs(Math.cos(p.fl));
          }
        }
      }
      this.petals = this.petals.filter((p) => !(p.landed && p.t > p.life) && p.u < 1.15 && p.v < 1.2);
    } else if (fx === 'flies') {
      for (const f of this.flies) {
        f.a += Math.sin(t * 0.7 + f.ph) * 1.1 * dt;
        const v = 16 * f.sp;
        f.u += (Math.cos(f.a) * v * dt) / inner.w;
        f.v += (Math.sin(f.a) * v * dt) / inner.h;
        if (f.u < 0.05 || f.u > 0.95) {
          f.a = Math.PI - f.a;
          f.u = G.clamp(f.u, 0.05, 0.95);
        }
        if (f.v < 0.06 || f.v > 0.94) {
          f.a = -f.a;
          f.v = G.clamp(f.v, 0.06, 0.94);
        }
      }
    } else if (fx === 'glints') {
      this.fxT -= dt;
      if (this.fxT <= 0 && this.glints.length < 18) {
        this.fxT = G.rand(0.08, 0.2);
        this.glints.push({ u: G.rand(0.03, 0.97), v: G.rand(0.03, 0.97), t: 0, life: G.rand(0.5, 1.1), s: G.rand(0.6, 1.25) });
      }
      for (const g of this.glints) g.t += dt;
      this.glints = this.glints.filter((g) => g.t < g.life);
    }
  }

  // ---------------------------------------------------------------- caches
  renderBase() {
    const st = STYLES[this.variant];
    const W = this.shade.width, H = this.shade.height;
    const k = W / Math.max(1, this.inner.w); // layer px per CSS px
    const c = this.base && this.base.width === W && this.base.height === H ? this.base : G.makeCanvas(W, H);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = st.sand;
    g.fillRect(0, 0, W, H);
    // gentle large-scale mottling
    const rnd = mulberry(77 + this.variant * 13);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * W, y = rnd() * H, r = (0.12 + rnd() * 0.28) * Math.max(W, H);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = st.grain;
    g.fillStyle = g.createPattern(grainTile(), 'repeat');
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    // light from the top-left
    const lg = g.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, st.night ? 'rgba(215,232,255,0.12)' : 'rgba(255,255,255,0.13)');
    lg.addColorStop(0.55, 'rgba(255,255,255,0)');
    lg.addColorStop(1, st.night ? 'rgba(4,10,40,0.3)' : 'rgba(0,0,0,0.08)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    if (st.night) {
      // a pool of moonlight and a dusky vignette
      const R = Math.max(W, H);
      const mg = g.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, R * 0.65);
      mg.addColorStop(0, 'rgba(225,238,255,0.3)');
      mg.addColorStop(0.5, 'rgba(200,220,255,0.08)');
      mg.addColorStop(1, 'rgba(200,220,255,0)');
      g.fillStyle = mg;
      g.fillRect(0, 0, W, H);
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, R * 0.75);
      vg.addColorStop(0, 'rgba(5,10,35,0)');
      vg.addColorStop(1, 'rgba(5,10,35,0.38)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }
    // occlusion where the sand meets the frame (deeper on the top & left, which the frame shades)
    const F = this.F * k;
    const edge = (x0, y0, x1, y1, a) => {
      const eg = g.createLinearGradient(x0, y0, x1, y1);
      eg.addColorStop(0, `rgba(0,0,0,${a})`);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = eg;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || W, Math.abs(y1 - y0) || H);
    };
    edge(0, 0, 0, F * 1.1, 0.26);
    edge(0, 0, F * 0.9, 0, 0.2);
    edge(0, H, 0, H - F * 0.5, 0.1);
    edge(W, 0, W - F * 0.5, 0, 0.1);
    this.base = c;
  }

  renderFrame() {
    const st = STYLES[this.variant], dpr = this.app.dpr || 1;
    const { tray, F } = this;
    const W = tray.w, H = tray.h;
    const pad = Math.ceil(F * 1.8);
    const c = G.makeCanvas((W + pad * 2) * dpr, (H + pad * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(pad, pad);
    const R = Math.min(F * 0.55, W / 4, H / 4);
    const outer = new Path2D();
    G.roundRectPath(outer, 0, 0, W, H, R);
    // 1) drop shadow of the whole tray, then punch the sand window out again
    g.save();
    g.shadowColor = st.night ? 'rgba(0,0,10,0.5)' : 'rgba(70,40,15,0.36)';
    g.shadowBlur = F * 1.1 * dpr;
    g.shadowOffsetY = F * 0.45 * dpr;
    g.fillStyle = st.wood;
    g.fill(outer);
    g.restore();
    g.clearRect(F, F, W - F * 2, H - F * 2);
    // 2) wooden sides
    const ring = new Path2D();
    G.roundRectPath(ring, 0, 0, W, H, R);
    ring.rect(F, F, W - F * 2, H - F * 2);
    const wg = g.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, G.shade(st.wood, 0.14));
    wg.addColorStop(0.5, st.wood);
    wg.addColorStop(1, G.shade(st.wood, -0.1));
    g.fillStyle = wg;
    g.fill(ring, 'evenodd');
    // grain along each side
    const rnd = mulberry(4242 + this.variant);
    g.save();
    g.clip(ring, 'evenodd');
    g.lineCap = 'round';
    const grain = (horizontal, x0, y0, len, thick) => {
      for (let i = 0; i < 6; i++) {
        const off = thick * (0.15 + rnd() * 0.7);
        g.strokeStyle = G.shade(st.wood, -0.18 - rnd() * 0.12, 0.25 + rnd() * 0.25);
        g.lineWidth = 0.5 + rnd() * 0.9;
        g.beginPath();
        const segs = 4 + Math.floor(rnd() * 3);
        for (let s = 0; s <= segs; s++) {
          const a = x0 + (len * s) / segs, b = off + (rnd() - 0.5) * thick * 0.18;
          if (horizontal) s ? g.lineTo(a, y0 + b) : g.moveTo(a, y0 + b);
          else s ? g.lineTo(y0 + b, a) : g.moveTo(y0 + b, a);
        }
        g.stroke();
      }
    };
    grain(true, F, 0, W - F * 2, F);
    grain(true, F, H - F, W - F * 2, F);
    grain(false, F, 0, H - F * 2, F);
    grain(false, F, W - F, H - F * 2, F);
    g.restore();
    // 3) bevels: light catches the outer top/left edges and the inner bottom/right edges
    const bev = Math.max(1, F * 0.07);
    g.save();
    g.clip(outer);
    g.lineWidth = bev * 2;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.save();
    g.translate(bev, bev);
    g.stroke(outer);
    g.restore();
    g.strokeStyle = 'rgba(60,30,10,0.28)';
    g.save();
    g.translate(-bev, -bev);
    g.stroke(outer);
    g.restore();
    g.restore();
    g.lineWidth = bev * 1.6;
    g.strokeStyle = 'rgba(255,255,255,0.32)';
    g.beginPath();
    g.moveTo(F - bev * 0.8, H - F + bev * 0.8);
    g.lineTo(W - F + bev * 0.8, H - F + bev * 0.8);
    g.lineTo(W - F + bev * 0.8, F - bev * 0.8);
    g.stroke();
    // 4) end-grain corner blocks
    g.save();
    g.clip(outer);
    for (const [x, y] of [[0, 0], [W - F, 0], [0, H - F], [W - F, H - F]]) {
      const cg = g.createLinearGradient(x, y, x + F, y + F);
      cg.addColorStop(0, G.shade(st.corner, 0.22));
      cg.addColorStop(1, G.shade(st.corner, -0.15));
      g.fillStyle = cg;
      g.fillRect(x, y, F, F);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = bev * 1.4;
      g.beginPath();
      g.moveTo(x + bev, y + F - bev);
      g.lineTo(x + bev, y + bev);
      g.lineTo(x + F - bev, y + bev);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.moveTo(x + F - bev, y + bev);
      g.lineTo(x + F - bev, y + F - bev);
      g.lineTo(x + bev, y + F - bev);
      g.stroke();
    }
    g.restore();
    // 5) the far inner wall (faces the viewer, in shade) and a crisp dark seam around the sand
    const ig = g.createLinearGradient(0, F, 0, F + F * 0.2);
    ig.addColorStop(0, G.shade(st.wood, -0.35));
    ig.addColorStop(1, G.shade(st.wood, -0.2, 0));
    g.fillStyle = ig;
    g.fillRect(F, F, W - F * 2, F * 0.2);
    g.strokeStyle = 'rgba(40,20,5,0.35)';
    g.lineWidth = 1;
    g.strokeRect(F + 0.5, F + 0.5, W - F * 2 - 1, H - F * 2 - 1);
    this.frame = { c, pad, w: W + pad * 2, h: H + pad * 2 };
  }

  stoneSprite(s) {
    const key = `stone|${s.seed}`;
    let spr = this.sprites.get(key);
    if (spr) return spr;
    const st = STYLES[this.variant], dpr = this.app.dpr || 1;
    const rx = Math.max(2, s.r * this.S), ry = rx * s.ar;
    const m = rx * 1.12;
    const c = G.makeCanvas(m * 2 * dpr, m * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(m, m);
    const rnd = mulberry(s.seed);
    // slightly irregular pebble outline
    const path = new Path2D();
    const ph1 = rnd() * G.TAU, ph2 = rnd() * G.TAU;
    const cr = Math.cos(s.rot), sr = Math.sin(s.rot);
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * G.TAU;
      const k = 1 + 0.035 * Math.sin(2 * t + ph1) + 0.025 * Math.sin(3 * t + ph2);
      const ex = Math.cos(t) * rx * k, ey = Math.sin(t) * ry * k;
      const x = ex * cr - ey * sr, y = ex * sr + ey * cr;
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    path.closePath();
    const col = st.stone;
    const gr = g.createRadialGradient(-rx * 0.35, -ry * 0.5, rx * 0.05, 0, 0, rx * 1.08);
    gr.addColorStop(0, G.shade(col, 0.42));
    gr.addColorStop(0.45, col);
    gr.addColorStop(1, G.shade(col, -0.48));
    g.fillStyle = gr;
    g.fill(path);
    g.save();
    g.clip(path);
    // speckles
    for (let i = 0; i < 26; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      g.beginPath();
      g.arc((rnd() - 0.5) * rx * 1.8, (rnd() - 0.5) * rx * 1.8, rx * (0.012 + rnd() * 0.025), 0, G.TAU);
      g.fill();
    }
    // a pale quartz vein
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = Math.max(0.8, rx * 0.035);
    g.lineCap = 'round';
    const va = rnd() * Math.PI;
    const vx = Math.cos(va), vy = Math.sin(va);
    const off = (rnd() - 0.5) * rx * 0.6;
    g.beginPath();
    g.moveTo(-vx * rx * 1.2 - vy * off, -vy * rx * 1.2 + vx * off);
    g.quadraticCurveTo(vy * rx * 0.25, -vx * rx * 0.25, vx * rx * 1.2 - vy * off * 0.4, vy * rx * 1.2 + vx * off * 0.4);
    g.stroke();
    // warm bounce light from the sand at the bottom, gloss at the top-left
    const bg = g.createLinearGradient(0, ry * 0.2, 0, ry * 1.1);
    bg.addColorStop(0, G.alpha(st.sand, 0));
    bg.addColorStop(1, G.alpha(st.sand, 0.35));
    g.fillStyle = bg;
    g.fillRect(-m, -m, m * 2, m * 2);
    const hg = g.createRadialGradient(-rx * 0.38, -ry * 0.5, 0, -rx * 0.38, -ry * 0.5, rx * 0.55);
    hg.addColorStop(0, 'rgba(255,255,255,0.55)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.fillRect(-m, -m, m * 2, m * 2);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-rx * 0.4, -ry * 0.52, rx * 0.16, ry * 0.08, -0.5, 0, G.TAU);
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    g.stroke(path);
    spr = { c, size: m * 2 };
    this.sprites.set(key, spr);
    return spr;
  }

  /** Top-down rake / bamboo stick sprite (+ its silhouette for the shadow). Origin = tine line. */
  toolSprite(tool) {
    const key = `tool|${tool}`;
    let spr = this.sprites.get(key);
    if (spr) return spr;
    const dpr = this.app.dpr || 1, sp = this.spacing;
    const rake = tool === 'rake';
    const x0 = -sp * 1.1, x1 = sp * 9, y0 = rake ? -sp * 2.4 : -sp * 0.8, y1 = -y0;
    const w = x1 - x0, h = y1 - y0;
    const c = G.makeCanvas(w * dpr, h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(-x0, -y0);
    const wood = '#e0ac6e';
    const rod = (xa, xb, wa, wb) => {
      g.beginPath();
      g.moveTo(xa, -wa / 2);
      g.lineTo(xb, -wb / 2);
      g.arc(xb, 0, wb / 2, -Math.PI / 2, Math.PI / 2);
      g.lineTo(xa, wa / 2);
      g.arc(xa, 0, wa / 2, Math.PI / 2, Math.PI * 1.5);
      g.closePath();
      const rg = g.createLinearGradient(0, -wb / 2, 0, wb / 2);
      rg.addColorStop(0, G.shade(wood, 0.35));
      rg.addColorStop(0.45, wood);
      rg.addColorStop(1, G.shade(wood, -0.3));
      g.fillStyle = rg;
      g.fill();
      g.strokeStyle = 'rgba(90,50,15,0.35)';
      g.lineWidth = 0.8;
      g.stroke();
      // bamboo nodes
      g.strokeStyle = 'rgba(110,60,20,0.5)';
      g.lineWidth = Math.max(0.8, sp * 0.08);
      for (const f of [0.38, 0.72]) {
        const x = G.lerp(xa, xb, f), ww = G.lerp(wa, wb, f);
        g.beginPath();
        g.moveTo(x, -ww / 2);
        g.lineTo(x, ww / 2);
        g.stroke();
      }
    };
    if (rake) {
      for (const o of TOOLS.rake.tines) {
        G.roundRect(g, -sp * 0.95, o * sp - sp * 0.14, sp * 0.7, sp * 0.28, sp * 0.12);
        g.fillStyle = G.shade(wood, -0.25);
        g.fill();
      }
      rod(sp * 0.2, sp * 8.3, sp * 0.42, sp * 0.62);
      G.roundRect(g, -sp * 0.42, -sp * 2.1, sp * 0.84, sp * 4.2, sp * 0.3);
      const bg = g.createLinearGradient(-sp * 0.42, 0, sp * 0.42, 0);
      bg.addColorStop(0, G.shade(wood, 0.3));
      bg.addColorStop(1, G.shade(wood, -0.22));
      g.fillStyle = bg;
      g.fill();
      g.strokeStyle = 'rgba(90,50,15,0.4)';
      g.lineWidth = 0.8;
      g.stroke();
    } else {
      rod(-sp * 0.1, sp * 8.3, sp * 0.36, sp * 0.62);
    }
    const sh = G.makeCanvas(w * dpr, h * dpr);
    const sg = sh.getContext('2d');
    sg.drawImage(c, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = 'rgba(30,15,0,0.25)';
    sg.fillRect(0, 0, sh.width, sh.height);
    spr = { c, sh, x0, y0, w, h };
    this.sprites.set(key, spr);
    return spr;
  }

  petalSprite(kind) {
    const key = `petal|${kind}`;
    let spr = this.sprites.get(key);
    if (spr) return spr;
    const dpr = this.app.dpr || 1, s = G.clamp(this.S * 0.036, 7, 26);
    const c = G.makeCanvas(s * 1.2 * dpr, s * 1.2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(s * 0.6, s * 0.6);
    const path = new Path2D();
    petalPath(path, s);
    const col = PETAL_COLORS[kind];
    const gr = g.createLinearGradient(0, s * 0.5, 0, -s * 0.5);
    gr.addColorStop(0, G.shade(col, -0.18));
    gr.addColorStop(0.55, col);
    gr.addColorStop(1, G.shade(col, 0.55));
    g.fillStyle = gr;
    g.fill(path);
    g.strokeStyle = G.shade(col, -0.25, 0.5);
    g.lineWidth = Math.max(0.6, s * 0.035);
    g.stroke(path);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = Math.max(0.6, s * 0.04);
    g.beginPath();
    g.moveTo(0, s * 0.38);
    g.quadraticCurveTo(-s * 0.03, 0, 0, -s * 0.22);
    g.stroke();
    const sh = G.makeCanvas(c.width, c.height);
    const sg = sh.getContext('2d');
    sg.drawImage(c, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = 'rgba(90,20,45,0.3)';
    sg.fillRect(0, 0, sh.width, sh.height);
    spr = { c, sh, size: s * 1.2 };
    this.sprites.set(key, spr);
    return spr;
  }

  glowSprite() {
    let spr = this.sprites.get('glow');
    if (spr) return spr;
    const dpr = this.app.dpr || 1, r = G.clamp(this.S * 0.055, 9, 40);
    const c = G.makeCanvas(r * 2 * dpr, r * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,215,1)');
    gr.addColorStop(0.12, 'rgba(235,255,150,0.9)');
    gr.addColorStop(0.4, 'rgba(190,255,90,0.28)');
    gr.addColorStop(1, 'rgba(160,255,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, r * 2, r * 2);
    spr = { c, size: r * 2 };
    this.sprites.set('glow', spr);
    return spr;
  }

  // ---------------------------------------------------------------- drawing
  draw(ctx) {
    const app = this.app;
    if (this.styleFor !== this.variant) this.applyStyle();
    const st = STYLES[this.variant];
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1], st.night ? { glow: 'rgba(160,190,255,0.12)' } : undefined);
    if (!this.inner) return;
    if (!this.shade) this.buildSand();
    if (!this.base || this.base.width !== this.shade.width || this.base.height !== this.shade.height) this.renderBase();
    if (!this.frame) this.renderFrame();
    const { inner, tray } = this;
    ctx.drawImage(this.base, inner.x, inner.y, inner.w, inner.h);
    ctx.save();
    ctx.globalCompositeOperation = 'hard-light';
    ctx.globalAlpha = st.groove;
    ctx.drawImage(this.shade, inner.x, inner.y, inner.w, inner.h);
    ctx.restore();
    if (this.glints.length) this.drawGlints(ctx);
    if (this.petals.length) this.drawPetals(ctx, true);
    const fr = this.frame;
    ctx.drawImage(fr.c, tray.x - fr.pad, tray.y - fr.pad, fr.w, fr.h);
    if (this.sweep) this.drawSweep(ctx);
    for (const s of this.stoneOrder()) this.drawStone(ctx, s);
    for (const g of this.ghosts) this.drawTool(ctx, g.x, g.y, g.dx, g.dy, g.tool, g.a);
    for (const d of this.drags.values()) if (d.kind === 'rake' && d.aim) this.drawTool(ctx, d.hx, d.hy, d.dx, d.dy, d.tool, d.show);
    if (this.petals.length) this.drawPetals(ctx, false);
    if (this.flies.length) this.drawFlies(ctx);
  }

  drawStone(ctx, s) {
    const c = this.stonePos(s), rx = s.r * this.S, ry = rx * s.ar;
    const hop = s.hop > 0 ? Math.sin(s.hop * Math.PI) * 0.8 : 0;
    const lift = Math.max(s.lift, hop);
    const squash = s.drop > 0 ? Math.sin(s.drop * Math.PI) * 0.05 : 0;
    // contact shadow + soft cast shadow (both drift and soften as the pebble lifts)
    const night = STYLES[this.variant].night;
    softEllipse(ctx, c.x + rx * (0.16 + lift * 0.2), c.y + ry * (0.3 + lift * 0.35), rx * (1.15 + lift * 0.15), ry * (1.05 + lift * 0.15), s.rot, (night ? 0.38 : 0.3) * (1 - lift * 0.35));
    if (lift < 0.6) softEllipse(ctx, c.x + rx * 0.05, c.y + ry * 0.16, rx * 1.0, ry * 0.95, s.rot, 0.28 * (1 - lift / 0.6));
    const spr = this.stoneSprite(s);
    const k = 1 + lift * 0.07;
    const w = spr.size * k * (1 + squash), h = spr.size * k * (1 - squash);
    ctx.drawImage(spr.c, c.x - w / 2, c.y - lift * rx * 0.2 - h / 2 + squash * spr.size * 0.25, w, h);
  }

  drawTool(ctx, x, y, dx, dy, tool, a) {
    if (a <= 0.01) return;
    const spr = this.toolSprite(tool), sp = this.spacing;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.translate(x + sp * 0.35, y + sp * 0.6);
    ctx.rotate(ang);
    ctx.drawImage(spr.sh, spr.x0, spr.y0, spr.w, spr.h);
    ctx.rotate(-ang);
    ctx.translate(-sp * 0.35, -sp * 0.6);
    ctx.rotate(ang);
    ctx.drawImage(spr.c, spr.x0, spr.y0, spr.w, spr.h);
    ctx.restore();
  }

  drawSweep(ctx) {
    const { inner, F } = this, bw = this.boardW, st = STYLES[this.variant];
    const x = inner.x + this.sweep.front;
    // a little bank of pushed sand rolling ahead of the board
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    // (shaded where it meets the board, a lit crest, then fading into the untouched sand)
    const wx = x + bw * 0.5, ww = bw * 2.6;
    const wg = ctx.createLinearGradient(wx, 0, wx + ww, 0);
    wg.addColorStop(0, G.shade(st.sand, -0.35, 0.75));
    wg.addColorStop(0.25, G.shade(st.sand, -0.1, 0.6));
    wg.addColorStop(0.45, G.shade(st.sand, 0.4, 0.75));
    wg.addColorStop(1, G.alpha(st.sand, 0));
    ctx.fillStyle = wg;
    ctx.fillRect(wx, inner.y, ww, inner.h);
    ctx.restore();
    const y0 = inner.y - F * 0.55, h = inner.h + F * 1.1;
    G.roundRect(ctx, x - bw * 0.5 + bw * 0.35, y0 + bw * 0.55, bw, h, bw * 0.4);
    ctx.fillStyle = 'rgba(30,15,0,0.25)';
    ctx.fill();
    G.roundRect(ctx, x - bw * 0.5, y0, bw, h, bw * 0.4);
    const bg = ctx.createLinearGradient(x - bw * 0.5, 0, x + bw * 0.5, 0);
    bg.addColorStop(0, G.shade(st.wood, 0.35));
    bg.addColorStop(0.5, G.shade(st.wood, 0.1));
    bg.addColorStop(1, G.shade(st.wood, -0.25));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,5,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawPetals(ctx, landed) {
    const { inner } = this;
    for (const p of this.petals) {
      if (p.landed !== landed) continue;
      const spr = this.petalSprite(p.kind);
      const x = inner.x + p.u * inner.w, y = inner.y + p.v * inner.h;
      const s = spr.size * p.size;
      let a = 1, sy = p.flat;
      if (landed) a = G.clamp((p.life - p.t) / 1.2, 0, 1) * G.clamp(p.t / 0.2 + 0.85, 0, 1);
      else sy = Math.cos(p.fl);
      if (a <= 0.01) continue;
      // shadow: close under a resting petal, further away (and fainter) under a falling one
      const off = landed ? s * 0.08 : s * 0.45;
      ctx.save();
      ctx.globalAlpha = a * (landed ? 1 : 0.6);
      ctx.translate(x + off * 0.6, y + off);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(sy) < 0.12 ? 0.12 : sy);
      ctx.drawImage(spr.sh, -s / 2, -s / 2, s, s);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(sy) < 0.12 ? 0.12 : sy);
      ctx.drawImage(spr.c, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  drawFlies(ctx) {
    const { inner } = this, t = this.app.time;
    const spr = this.glowSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flies) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (1.6 + f.sp) + f.ph);
      const blink = G.clamp(Math.sin(t * (0.9 / f.blink) * G.TAU + f.ph) * 3 + 2, 0, 1);
      const a = (0.35 + 0.65 * pulse) * blink;
      if (a <= 0.02) continue;
      const x = inner.x + f.u * inner.w, y = inner.y + f.v * inner.h + Math.sin(t * 1.3 + f.ph) * 4;
      const s = spr.size * (0.75 + 0.35 * pulse);
      ctx.globalAlpha = a;
      ctx.drawImage(spr.c, x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
  }

  drawGlints(ctx) {
    const { inner } = this, base = Math.max(1.5, this.S * 0.012);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff6dc';
    for (const g of this.glints) {
      const k = Math.sin((g.t / g.life) * Math.PI);
      const s = base * g.s * k;
      if (s < 0.3) continue;
      const x = inner.x + g.u * inner.w, y = inner.y + g.v * inner.h;
      ctx.globalAlpha = 0.85 * k;
      ctx.beginPath();
      G.softStarPath(ctx, x, y, 4, s * 1.6, s * 0.3, g.u * 3);
      ctx.fill();
    }
    ctx.restore();
  }

  hud() {
    return '';
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const st = STYLES[i];
    ctx.fillStyle = st.wood;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const s = r * 0.66;
    ctx.fillStyle = st.sand;
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - s, y - s, s * 2, s * 2);
    ctx.clip();
    const cx = x - s * 0.3, cy = y + s * 0.25;
    const dark = i === 2 || i === 4;
    const lo = G.shade(st.sand, dark ? -0.35 : -0.3), hi = G.shade(st.sand, dark ? 0.45 : 0.5);
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (let k = 1; k <= 3; k++) {
      const rr = s * (0.32 + k * 0.3);
      ctx.strokeStyle = hi;
      ctx.beginPath();
      ctx.arc(cx - 0.7, cy - 0.7, rr, 0, G.TAU);
      ctx.stroke();
      ctx.strokeStyle = lo;
      ctx.beginPath();
      ctx.arc(cx + 0.6, cy + 0.6, rr, 0, G.TAU);
      ctx.stroke();
    }
    ctx.fillStyle = st.stone;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.3, s * 0.23, -0.3, 0, G.TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.1, cy - s * 0.08, s * 0.1, s * 0.05, -0.4, 0, G.TAU);
    ctx.fill();
    if (st.fx === 'petals') {
      ctx.fillStyle = '#ff9fbb';
      ctx.save();
      ctx.translate(x + s * 0.45, y - s * 0.45);
      ctx.rotate(0.6);
      ctx.beginPath();
      petalPath(ctx, s * 0.5);
      ctx.fill();
      ctx.restore();
    } else if (st.fx === 'flies') {
      for (const [fx, fy] of [[0.45, -0.5], [0.6, 0.1]]) {
        const gr = ctx.createRadialGradient(x + s * fx, y + s * fy, 0, x + s * fx, y + s * fy, s * 0.3);
        gr.addColorStop(0, 'rgba(240,255,170,1)');
        gr.addColorStop(1, 'rgba(200,255,90,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    } else if (st.fx === 'glints') {
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      G.softStarPath(ctx, x + s * 0.45, y - s * 0.4, 4, s * 0.3, s * 0.07, 0);
      ctx.fill();
    }
    ctx.restore();
  }
}
