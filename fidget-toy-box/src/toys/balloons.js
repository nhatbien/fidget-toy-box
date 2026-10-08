// Balloon Pop: balloons drift up from below the screen — tap them to pop. Quick pops chain into a
// combo (rising pitch + a floating "x3!") and a golden balloon floats by about every 25 seconds.
import { Toy } from './_base.js';
import * as G from '../gfx.js';
import { Particles } from '../fx.js';

const LABEL = { en: 'popped', vi: 'quả đã nổ', es: 'reventados', pt: 'estourados', fr: 'éclatés', de: 'geplatzt', id: 'meletus', it: 'scoppiati', tr: 'patladı', ru: 'лопнуто' };

// kind = body shape, finish = surface look, sky = background gradient, deco = backdrop extras.
const STYLES = [
  { kind: 'latex', finish: 'latex', colors: ['#ff4d6d', '#ffbe0b', '#3a86ff', '#3ddc84', '#9b5de5', '#ff7b00', '#ff5fa2', '#16c7d9'], sky: ['#bfe9ff', '#ffe3c4'], deco: 'clouds' },
  { kind: 'heart', finish: 'latex', colors: ['#ff4d6d', '#ff8fab', '#e5383b', '#ff5c8a', '#d6336c', '#ffb3c6'], sky: ['#ffe3ee', '#ffc1d4'], deco: 'clouds' },
  { kind: 'star', finish: 'foil', colors: ['#ff9f45', '#d6dbe4', '#ff8fd1', '#6ec6ff', '#b18cff', '#7ce0a8'], sky: ['#3b2a86', '#d66fa8'], deco: 'twinkle' },
  { kind: 'latex', finish: 'latex', colors: ['#ffc8dd', '#bde0fe', '#cdb4db', '#caffbf', '#fdffb6', '#ffd6a5', '#a0e7e5'], sky: ['#f4ecff', '#ffe8f1'], deco: 'clouds' },
  { kind: 'bubble', finish: 'soap', colors: ['#ff9de2', '#8fe3ff', '#b8a4ff', '#9dffcf', '#ffe08f'], sky: ['#a6e1f7', '#5aa9d6'], deco: 'glow' },
  { kind: 'latex', finish: 'metal', colors: ['#d4af37', '#c3c7cf', '#e9c46a', '#a7adb8', '#c9a227', '#e3e6ec'], sky: ['#26314f', '#5d6d96'], deco: 'twinkle' },
];
const GOLD = '#ffc933';
const COMBO_WINDOW = 0.8; // seconds between pops that still count as a combo
const MAX_BALLOONS = 14;
const SPRITE_PAD = 1.45; // sprite half-width in body radii (also its top offset)

// ---------------------------------------------------------------- shape helpers
/** Classic latex balloon: round top, tapered neck at (0, 1.07R). */
function latexPath(p, R) {
  p.moveTo(0, -1.12 * R);
  p.bezierCurveTo(0.58 * R, -1.12 * R, 1.0 * R, -0.68 * R, 1.0 * R, -0.12 * R);
  p.bezierCurveTo(1.0 * R, 0.42 * R, 0.56 * R, 0.9 * R, 0.09 * R, 1.07 * R);
  p.lineTo(-0.09 * R, 1.07 * R);
  p.bezierCurveTo(-0.56 * R, 0.9 * R, -1.0 * R, 0.42 * R, -1.0 * R, -0.12 * R);
  p.bezierCurveTo(-1.0 * R, -0.68 * R, -0.58 * R, -1.12 * R, 0, -1.12 * R);
  p.closePath();
}

function bodyPath(p, kind, R) {
  if (kind === 'heart') G.heartPath(p, 0, -0.12 * R, 2.35 * R);
  else if (kind === 'star') G.softStarPath(p, 0, 0.04 * R, 5, 1.22 * R, 0.66 * R);
  else if (kind === 'bubble') {
    p.moveTo(R, 0);
    p.arc(0, 0, R, 0, G.TAU);
  } else latexPath(p, R);
}

/** Where the string hangs from, in body radii below the center. */
function attachY(kind) {
  return kind === 'heart' ? 1.12 : kind === 'star' ? 0.8 : 1.2;
}

/** Paints one balloon body (centered at 0,0 with radius R) into g. */
function paintBalloon(g, kind, finish, color, R, golden = false) {
  const path = new Path2D();
  bodyPath(path, kind, R);
  if (finish === 'soap') {
    paintSoap(g, path, color, R, golden);
    return;
  }
  // knot / valve first so the body overlaps it
  g.beginPath();
  if (kind === 'star') {
    G.roundRectPath(g, -0.07 * R, 0.68 * R, 0.14 * R, 0.16 * R, 0.04 * R);
  } else {
    const ky = kind === 'heart' ? 0.95 * R : 1.04 * R;
    g.moveTo(-0.08 * R, ky);
    g.lineTo(0.08 * R, ky);
    g.lineTo(0.15 * R, ky + 0.15 * R);
    g.quadraticCurveTo(0, ky + 0.21 * R, -0.15 * R, ky + 0.15 * R);
    g.closePath();
  }
  g.fillStyle = G.shade(color, -0.28);
  g.fill();

  let fill;
  if (finish === 'foil') {
    // crinkly foil: diagonal light / dark bands
    fill = g.createLinearGradient(-R, -1.1 * R, 0.9 * R, 1.1 * R);
    fill.addColorStop(0, G.shade(color, 0.8));
    fill.addColorStop(0.2, G.shade(color, 0.2));
    fill.addColorStop(0.36, G.shade(color, -0.28));
    fill.addColorStop(0.52, G.shade(color, 0.55));
    fill.addColorStop(0.7, G.shade(color, -0.12));
    fill.addColorStop(0.86, G.shade(color, 0.25));
    fill.addColorStop(1, G.shade(color, -0.4));
  } else if (finish === 'metal' || golden) {
    // chrome-like concentric bands around the light spot
    fill = g.createRadialGradient(-0.36 * R, -0.48 * R, 0.02 * R, -0.12 * R, -0.1 * R, 1.42 * R);
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(0.1, G.shade(color, 0.62));
    fill.addColorStop(0.32, color);
    fill.addColorStop(0.58, G.shade(color, -0.38));
    fill.addColorStop(0.78, G.shade(color, 0.05));
    fill.addColorStop(0.9, G.shade(color, 0.32));
    fill.addColorStop(1, G.shade(color, -0.3));
  } else {
    fill = g.createRadialGradient(-0.36 * R, -0.46 * R, 0.04 * R, -0.05 * R, -0.02 * R, 1.38 * R);
    fill.addColorStop(0, G.shade(color, 0.6));
    fill.addColorStop(0.16, G.shade(color, 0.22));
    fill.addColorStop(0.5, color);
    fill.addColorStop(0.82, G.shade(color, -0.26));
    fill.addColorStop(1, G.shade(color, -0.5));
  }
  g.fillStyle = fill;
  g.fill(path);

  g.save();
  g.clip(path);
  // light bouncing back into the lower edge (latex is slightly translucent)
  const rim = g.createRadialGradient(0.2 * R, 0.78 * R, 0, 0.2 * R, 0.78 * R, 0.8 * R);
  rim.addColorStop(0, G.shade(color, 0.4, 0.55));
  rim.addColorStop(1, G.shade(color, 0.4, 0));
  g.fillStyle = rim;
  g.fillRect(-1.5 * R, -1.5 * R, 3 * R, 3 * R);
  // big soft studio highlight
  const hl = g.createRadialGradient(-0.4 * R, -0.5 * R, 0, -0.4 * R, -0.5 * R, 0.62 * R);
  hl.addColorStop(0, 'rgba(255,255,255,0.55)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(-1.5 * R, -1.5 * R, 3 * R, 3 * R);
  if (finish === 'foil') {
    // crimped seam just inside the outline
    g.lineWidth = R * 0.07;
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.stroke(path);
  }
  g.restore();
  g.lineWidth = Math.max(1, R * 0.025);
  g.strokeStyle = G.shade(color, -0.45, 0.35);
  g.stroke(path);

  // speculars: sharp main glint, a small dot and a soft reflection on the right side
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  if (kind === 'heart') g.ellipse(-0.45 * R, -0.48 * R, 0.24 * R, 0.13 * R, -0.75, 0, G.TAU);
  else if (kind === 'star') g.ellipse(-0.3 * R, -0.42 * R, 0.19 * R, 0.09 * R, -0.85, 0, G.TAU);
  else g.ellipse(-0.44 * R, -0.55 * R, 0.25 * R, 0.14 * R, -0.72, 0, G.TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  if (kind === 'star') G.circle(g, -0.05 * R, -0.62 * R, 0.06 * R);
  else if (kind === 'heart') G.circle(g, -0.7 * R, -0.22 * R, 0.055 * R);
  else G.circle(g, -0.1 * R, -0.82 * R, 0.06 * R);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.32)';
  g.lineWidth = R * 0.07;
  g.lineCap = 'round';
  g.beginPath();
  if (kind === 'star') g.arc(0, 0.04 * R, 0.6 * R, 0.25, 0.9);
  else if (kind === 'heart') g.arc(0.1 * R, -0.15 * R, 0.68 * R, -0.25, 0.55);
  else g.arc(0, -0.1 * R, 0.8 * R, -0.35, 0.45);
  g.stroke();
}

/** Iridescent soap bubble: nearly clear film with a colorful rim, swirls and window reflections. */
function paintSoap(g, path, color, R, golden) {
  const film = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
  film.addColorStop(0, 'rgba(255,255,255,0.06)');
  film.addColorStop(0.55, 'rgba(255,255,255,0.13)');
  film.addColorStop(0.82, 'rgba(255,255,255,0.42)');
  film.addColorStop(0.95, 'rgba(255,255,255,0.8)');
  film.addColorStop(1, 'rgba(255,255,255,0.92)');
  g.fillStyle = film;
  g.fill(path);
  // rainbow sheen, kept inside the film's alpha
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(-R, -R, R, R);
  if (golden) {
    lg.addColorStop(0, 'rgba(255,244,170,0.95)');
    lg.addColorStop(0.5, 'rgba(255,196,40,0.95)');
    lg.addColorStop(1, 'rgba(255,150,30,0.95)');
  } else {
    lg.addColorStop(0, 'rgba(255,110,215,0.85)');
    lg.addColorStop(0.28, 'rgba(255,226,100,0.8)');
    lg.addColorStop(0.52, 'rgba(100,250,190,0.75)');
    lg.addColorStop(0.76, 'rgba(90,180,255,0.85)');
    lg.addColorStop(1, 'rgba(190,110,255,0.9)');
  }
  g.fillStyle = lg;
  g.fillRect(-R, -R, 2 * R, 2 * R);
  const tint = g.createRadialGradient(0.25 * R, 0.3 * R, 0, 0.25 * R, 0.3 * R, R * 1.15);
  tint.addColorStop(0, G.alpha(color, 0));
  tint.addColorStop(1, G.alpha(color, 0.8));
  g.fillStyle = tint;
  g.fillRect(-R, -R, 2 * R, 2 * R);
  // oily swirls drifting over the film
  g.lineCap = 'round';
  g.lineWidth = R * 0.22;
  g.strokeStyle = golden ? 'rgba(255,255,220,0.45)' : 'rgba(255,90,200,0.4)';
  g.beginPath();
  g.arc(0.05 * R, 0.05 * R, R * 0.72, -1.3, -0.2);
  g.stroke();
  g.strokeStyle = golden ? 'rgba(255,170,0,0.4)' : 'rgba(60,220,255,0.4)';
  g.beginPath();
  g.arc(-0.05 * R, 0, R * 0.7, 1.6, 2.7);
  g.stroke();
  g.restore();
  g.lineWidth = Math.max(1, R * 0.03);
  g.strokeStyle = golden ? 'rgba(255,236,170,0.9)' : 'rgba(255,255,255,0.6)';
  g.beginPath();
  g.arc(0, 0, R * 0.985, 0, G.TAU);
  g.stroke();
  // window reflection + glints
  g.save();
  g.translate(-0.42 * R, -0.42 * R);
  g.rotate(-0.78);
  G.roundRect(g, -0.2 * R, -0.12 * R, 0.4 * R, 0.24 * R, 0.08 * R);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  G.circle(g, -0.12 * R, -0.66 * R, 0.06 * R);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = R * 0.05;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, 0, R * 0.8, 0.35, 1.1);
  g.stroke();
}

/**
 * Curling ribbon hanging from (x, y): a helix seen from the side. Its width follows the twist
 * (wide where it faces us, thin edge-on) and the front / back faces get different shades.
 * sway shifts the lower end sideways so the ribbon lags behind the balloon.
 */
function drawRibbon(ctx, x, y, R, len, color, phase, sway) {
  const n = 30, L = len * R, amp = R * 0.15, turns = 4.3;
  const lw = Math.max(1.8, R * 0.1);
  const front = new Path2D(), back = new Path2D();
  let px = x, py = y, pw = lw * 0.5;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const ph = f * turns * G.TAU + phase;
    const qx = x + Math.sin(ph) * amp * Math.min(1, f * 6) + sway * f * f * R;
    const qy = y + f * L;
    const w = lw * (0.22 + 0.78 * Math.abs(Math.cos(ph))) * (1 - f * 0.35);
    let nx = -(qy - py), ny = qx - px;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const p = Math.cos(ph) > 0 ? front : back;
    p.moveTo(px + nx * pw * 0.5, py + ny * pw * 0.5);
    p.lineTo(qx + nx * w * 0.5, qy + ny * w * 0.5);
    p.lineTo(qx - nx * w * 0.5, qy - ny * w * 0.5);
    p.lineTo(px - nx * pw * 0.5, py - ny * pw * 0.5);
    p.closePath();
    px = qx;
    py = qy;
    pw = w;
  }
  ctx.fillStyle = G.shade(color, -0.32);
  ctx.fill(back);
  ctx.fillStyle = G.shade(color, 0.12);
  ctx.fill(front);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = G.shade(color, 0.12);
  ctx.stroke(front);
}

export class BalloonsToy extends Toy {
  static id = 'balloons';

  constructor(app) {
    super(app);
    this.balloons = [];
    this.shreds = [];
    this.strings = [];
    this.texts = [];
    this.parts = new Particles(500);
    this.sprites = new Map();
    this.icons = new Map();
    this.recentU = [];
    this.colorIdx = 0;
    this.spawnT = 0;
    this.goldT = 14;
    this.combo = 0;
    this.lastPop = -10;
    this.sparkT = 0;
    this.R = 40;
    this.spriteR = 0;
  }

  enter() {
    if (this.balloons.length === 0) this.prewarm = true;
  }
  exit() {
    this.texts.length = 0;
  }
  setVariant() {
    // re-skin the balloons already in the air with a little boing
    const st = STYLES[this.variant];
    for (const b of this.balloons) {
      b.color = b.golden ? GOLD : this.nextColor(st);
      b.bump = 1;
    }
    this.app.audio.whoosh(0.6);
  }

  resize(area) {
    const R = G.clamp(Math.min(area.w, area.h) * 0.1, 20, 110);
    this.R = R;
    // sprites are rendered for the largest balloon; rebuild when the size changes noticeably
    const need = R * 1.25;
    if (!this.spriteR || Math.abs(need - this.spriteR) / this.spriteR > 0.08 || this.spriteDpr !== this.app.dpr) {
      this.spriteR = need;
      this.spriteDpr = this.app.dpr;
      this.sprites.clear();
    }
    this.icons.clear();
    if (this.prewarm) {
      this.prewarm = false;
      for (let i = 0; i < 5; i++) this.spawn(G.rand(0.12, 0.72));
    }
    for (const b of this.balloons) this.place(b);
  }

  // ---------------------------------------------------------------- balloons
  nextColor(st = STYLES[this.variant]) {
    // walk the palette in a shuffled-but-even way so colors stay varied
    this.colorIdx = (this.colorIdx + 1 + G.randInt(0, 2)) % st.colors.length;
    return st.colors[this.colorIdx];
  }

  spawn(v0 = 0, golden = false) {
    let u = G.rand(0.03, 0.97);
    for (let tries = 0; tries < 8 && this.recentU.some((r) => Math.abs(r - u) < 0.17); tries++) u = G.rand(0.03, 0.97);
    this.recentU.push(u);
    if (this.recentU.length > 3) this.recentU.shift();
    const k = golden ? 1.22 : G.rand(0.78, 1.2);
    const b = {
      u, v: v0, k, golden,
      // fraction of the bottom→top trip per second; bigger (closer) balloons rise a bit faster
      spd: G.rand(0.135, 0.165) * (0.84 + 0.32 * G.invLerp(0.78, 1.2, k)) * (golden ? 0.8 : 1),
      ph: G.rand(G.TAU), sf: G.rand(0.6, 1.05), sa: G.rand(0.15, 0.32),
      color: golden ? GOLD : this.nextColor(),
      len: G.rand(2.2, 2.8), curl: G.rand(G.TAU), bump: 0,
      x: 0, y: 0, r: 0, rot: 0,
    };
    // keep the list sorted by size: small (far) ones are drawn first
    let i = this.balloons.length;
    while (i > 0 && this.balloons[i - 1].k > k) i--;
    this.balloons.splice(i, 0, b);
    this.place(b);
    return b;
  }

  /** Screen position of a balloon from its normalized state (so resizing keeps everything). */
  place(b) {
    const a = this.area, app = this.app, t = app.time;
    const r = this.R * b.k;
    const y0 = app.h + r * 1.2, y1 = -r * (1.3 + b.len);
    const span = Math.max(0, a.w - r * 2);
    b.r = r;
    b.x = a.x + r + b.u * span + Math.sin(t * b.sf + b.ph) * b.sa * r;
    b.y = G.lerp(y0, y1, b.v);
    b.rot = Math.cos(t * b.sf + b.ph) * 0.1 + Math.sin(t * 0.7 + b.ph * 2) * 0.04;
  }

  hit(b, x, y) {
    const dx = x - b.x, dy = y - b.y;
    const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    const lx = (dx * c - dy * s) / b.r, ly = (dx * s + dy * c) / b.r;
    const kind = STYLES[this.variant].kind;
    // a minimum finger-sized target for small balloons on phones
    const slop = Math.max(1.12, 26 / b.r);
    if (kind === 'latex') return lx * lx + ((ly + 0.03) / 1.12) ** 2 <= slop * slop;
    return lx * lx + ly * ly <= slop * slop * (kind === 'heart' ? 1.02 : 1);
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (this.hit(b, p.x, p.y)) {
        this.pop(b);
        return;
      }
    }
  }

  keyDown(e) {
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
      const a = this.area;
      const vis = this.balloons.filter((b) => b.y > a.y + b.r * 0.5 && b.y < a.y + a.h - b.r * 0.3);
      const list = vis.length ? vis : this.balloons;
      if (list.length) this.pop(G.pick(list));
      return true;
    }
    return false;
  }

  pop(b) {
    const app = this.app, st = STYLES[this.variant];
    const idx = this.balloons.indexOf(b);
    if (idx < 0) return;
    this.balloons.splice(idx, 1);
    const { x, y, r, color } = b;
    const t = app.time;
    this.combo = t - this.lastPop <= COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastPop = t;
    const pitch = 1 + Math.min(this.combo - 1, 10) * 0.045;
    const pan = G.clamp((x / app.w - 0.5) * 1.2, -0.8, 0.8);
    const a = app.audio;
    const soap = st.finish === 'soap';

    if (soap) {
      a.pop((1.3 * pitch) / b.k, 0.8, pan);
      a.noise({ dur: 0.06, vol: 0.07, type: 'highpass', freq: 4800, q: 0.7, pan });
      this.parts.burst(x, y, { count: 16, colors: ['rgba(220,245,255,0.95)', 'rgba(255,255,255,0.9)', G.alpha(color, 0.9)], shape: 'circle', speed: [90, 300].map((v) => (v * r) / 50), size: [1.5, 3.5].map((v) => (v * r) / 45), gravity: 900, life: [0.4, 0.8], drag: 0.35 });
      this.parts.burst(x, y, { count: 7, colors: ['rgba(255,255,255,0.9)', G.alpha(color, 0.9)], shape: 'bubble', speed: [30, 120], size: [2, 5].map((v) => (v * r) / 45), gravity: -60, life: [0.6, 1.1], drag: 0.6 });
      app.fx.ring(x, y, 'rgba(255,255,255,0.85)', r * 0.6, r * 1.25, 0.22, 2);
    } else {
      a.balloonPop(G.clamp(0.45 + b.k * 0.38, 0.6, 1), pan);
      a.tone({ freq: (760 * pitch) / b.k, freqEnd: (260 * pitch) / b.k, type: 'triangle', dur: 0.07, vol: 0.12, pan });
      if (st.finish === 'foil') a.noise({ dur: 0.12, vol: 0.1, type: 'highpass', freq: 6000, q: 0.6, pan, attack: 0.002 });
      const conf = [color, G.shade(color, 0.45), G.shade(color, -0.15), '#ffffff'];
      app.fx.burst(x, y, { count: 20, colors: conf, shape: 'confetti', speed: [140, 420].map((v) => (v * r) / 50), size: [3, 6].map((v) => G.clamp((v * r) / 50, 2, 9)), gravity: 520, life: [0.6, 1.15], drag: 0.55, vr: 10 });
      app.fx.ring(x, y, 'rgba(255,255,255,0.8)', r * 0.4, r * 1.35, 0.25, 3);
      this.spawnShreds(x, y, r, color);
      if (st.kind !== 'bubble') {
        const ay = attachY(st.kind) * r;
        this.strings.push({
          x: x - Math.sin(b.rot) * ay, y: y + Math.cos(b.rot) * ay,
          vx: G.rand(-20, 20), vy: G.rand(-60, -10), rot: b.rot, vr: G.rand(-1.2, 1.2),
          r, len: b.len, color, curl: b.curl, t: 0, life: 1.5,
        });
      }
    }
    if (b.golden) {
      a.fanfare();
      app.addProgress(1, x, y);
      app.fx.burst(x, y, { count: 26, colors: ['#ffd23f', '#fff3b0', '#ffffff', '#ffb703'], shape: ['star', 'sparkle'], speed: [120, 380], size: [4, 8], gravity: 220, life: [0.7, 1.3], drag: 0.4 });
      app.haptic(30);
    } else {
      app.haptic(12);
    }
    if (this.combo >= 2) {
      this.texts.push({ x, y: y - r * 0.4, t: 0, text: `x${this.combo}!`, color: b.golden ? GOLD : color, size: G.clamp(r * 0.62, 18, 44) });
    }
    app.addProgress(0.05, x, y);
    app.stat('popped');
  }

  spawnShreds(x, y, r, color) {
    const n = G.randInt(6, 9);
    for (let i = 0; i < n; i++) {
      const ang = G.rand(G.TAU), sp = G.rand(80, 260) * (r / 50);
      this.shreds.push({
        x: x + Math.cos(ang) * r * 0.5, y: y + Math.sin(ang) * r * 0.5,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80,
        rot: G.rand(G.TAU), vr: G.rand(-9, 9), s: r * G.rand(0.13, 0.24),
        color: G.shade(color, G.rand(-0.2, 0.1)), t: 0, life: G.rand(0.9, 1.4), ph: G.rand(G.TAU),
      });
    }
    if (this.shreds.length > 90) this.shreds.splice(0, this.shreds.length - 90);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const app = this.app;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.balloons.length < MAX_BALLOONS) this.spawn();
      // wide screens get balloons a bit more often so the sky doesn't look empty
      const aspect = this.area.w / Math.max(1, this.area.h);
      this.spawnT = G.rand(0.45, 0.9) * G.clamp(1.25 / Math.sqrt(Math.max(0.01, aspect)), 0.6, 1);
    }
    this.goldT -= dt;
    if (this.goldT <= 0) {
      this.spawn(0, true);
      this.goldT = G.rand(22, 28);
    }
    for (const b of this.balloons) {
      b.v += b.spd * dt;
      if (b.bump > 0) b.bump = Math.max(0, b.bump - dt * 2.5);
      this.place(b);
    }
    this.balloons = this.balloons.filter((b) => b.v < 1);
    if (app.time - this.lastPop > COMBO_WINDOW) this.combo = 0;

    // sparkles trailing the golden balloon
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.06;
      for (const b of this.balloons) {
        if (!b.golden) continue;
        const ang = G.rand(G.TAU), d = b.r * G.rand(0.7, 1.35);
        this.parts.spawn({ x: b.x + Math.cos(ang) * d, y: b.y + Math.sin(ang) * d * 1.1, vx: G.rand(-15, 15), vy: G.rand(-30, 10), shape: 'sparkle', size: G.rand(3, 6) * (b.r / 50 + 0.4), color: G.pick(['#fff6c2', '#ffd23f', '#ffffff']), life: G.rand(0.4, 0.8), drag: 0.5, vr: G.rand(-3, 3) });
      }
    }

    this.parts.update(dt);
    const gy = 700 * (this.R / 50 * 0.5 + 0.5);
    for (const s of this.shreds) {
      s.t += dt;
      const k = Math.pow(0.12, dt);
      s.vx *= k;
      s.vy = s.vy * k + gy * 0.55 * dt;
      s.x += (s.vx + Math.sin(s.t * 7 + s.ph) * 30) * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
    }
    this.shreds = this.shreds.filter((s) => s.t < s.life);
    for (const s of this.strings) {
      s.t += dt;
      s.vy += gy * 0.7 * dt;
      s.vx *= Math.pow(0.4, dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      s.vr *= Math.pow(0.5, dt);
    }
    this.strings = this.strings.filter((s) => s.t < s.life && s.y < app.h + s.r * 4);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < 0.9);
  }

  // ---------------------------------------------------------------- drawing
  sprite(color, golden) {
    const st = STYLES[this.variant];
    const key = `${this.variant}|${color}|${golden ? 1 : 0}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const R = this.spriteR, dpr = this.app.dpr;
    const side = R * SPRITE_PAD * 2;
    const c = G.makeCanvas(side * dpr, side * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(side / 2, R * 1.4);
    const finish = golden && st.finish !== 'soap' ? 'metal' : st.finish;
    paintBalloon(g, st.kind, finish, color, R, golden);
    s = { c, side, oy: R * 1.4 };
    this.sprites.set(key, s);
    return s;
  }

  /** Soft radial glow (gold for the bonus balloon, white for the bubble backdrop). */
  glowSprite(white = false) {
    const key = white ? 'glowW' : 'glowG';
    if (this[key]) return this[key];
    const S = 128;
    const c = G.makeCanvas(S, S);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    if (white) {
      rg.addColorStop(0, 'rgba(255,255,255,0.5)');
      rg.addColorStop(0.6, 'rgba(255,255,255,0.14)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      rg.addColorStop(0, 'rgba(255,222,110,0.55)');
      rg.addColorStop(0.5, 'rgba(255,200,60,0.22)');
      rg.addColorStop(1, 'rgba(255,200,60,0)');
    }
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
    this[key] = { c };
    return this[key];
  }

  cloudSprite() {
    const dpr = this.app.dpr;
    if (this.cloud && this.cloud.dpr === dpr) return this.cloud;
    const W = 220, H = 110;
    const c = G.makeCanvas(W * dpr, H * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    for (const [x, y, r] of [[60, 70, 34], [100, 52, 44], [148, 62, 36], [178, 78, 24], [36, 84, 20], [120, 84, 30]]) {
      const rg = g.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)');
      rg.addColorStop(1, 'rgba(255,255,255,0.75)');
      g.fillStyle = rg;
      G.circle(g, x, y, r);
      g.fill();
    }
    this.cloud = { c, dpr, W, H };
    return this.cloud;
  }

  drawDeco(ctx, st) {
    const app = this.app, t = app.time, w = app.w, h = app.h;
    if (st.deco === 'clouds') {
      const cl = this.cloudSprite();
      const base = G.clamp(Math.min(w, h) / 700, 0.45, 1.3);
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 4; i++) {
        const sc = base * (0.7 + (i % 3) * 0.3);
        const cw = cl.W * sc, chh = cl.H * sc;
        const span = w + cw * 2;
        const x = ((i * 0.37 * span + t * (8 + i * 3)) % span) - cw;
        const y = h * (0.12 + ((i * 0.29) % 0.8));
        ctx.drawImage(cl.c, x, y, cw, chh);
      }
      ctx.globalAlpha = 1;
    } else if (st.deco === 'twinkle') {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 26; i++) {
        const x = ((i * 0.618 * 997) % 1) * w, y = ((i * 0.414 * 773) % 1) * h * 0.95;
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * (1.2 + (i % 5) * 0.3) + i));
        const s = 1.2 + (i % 3) * 0.9;
        ctx.globalAlpha = a;
        ctx.beginPath();
        G.softStarPath(ctx, x, y, 4, s * 2.2, s * 0.5, 0);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (st.deco === 'glow') {
      // soft drifting light spots (no outline, so they never read as poppable bubbles)
      const gl = this.glowSprite(true);
      for (let i = 0; i < 7; i++) {
        const r = Math.min(w, h) * (0.12 + (i % 3) * 0.06);
        const x = ((i * 0.618 * 991) % 1) * w + Math.sin(t * 0.25 + i) * 30;
        const y = ((i * 0.377 * 613) % 1) * h + Math.cos(t * 0.2 + i * 2) * 24;
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.6 + i);
        ctx.drawImage(gl.c, x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  draw(ctx) {
    const app = this.app, st = STYLES[this.variant], t = app.time;
    G.drawSoftBackground(ctx, app.w, app.h, st.sky[0], st.sky[1]);
    this.drawDeco(ctx, st);

    for (const b of this.balloons) {
      const sp = this.sprite(b.color, b.golden);
      const f = b.r / this.spriteR;
      const bump = b.bump > 0 ? 1 + 0.18 * Math.sin(b.bump * Math.PI) : 1;
      const wob = Math.sin(t * (st.kind === 'bubble' ? 3.1 : 2.2) + b.ph) * (st.kind === 'bubble' ? 0.045 : 0.018);
      if (b.golden) {
        const gl = this.glowSprite();
        const gs = b.r * (3.4 + 0.3 * Math.sin(t * 4));
        ctx.drawImage(gl.c, b.x - gs / 2, b.y - gs / 2, gs, gs);
      }
      if (st.kind !== 'bubble') {
        const ay = attachY(st.kind) * b.r;
        const kx = b.x - Math.sin(b.rot) * ay, ky = b.y + Math.cos(b.rot) * ay;
        const lag = -Math.cos(t * b.sf + b.ph - 0.8) * b.sa * 1.6;
        drawRibbon(ctx, kx, ky, b.r, b.len, b.golden ? '#ffd23f' : b.color, b.curl + t * 1.6, lag);
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(bump * (1 + wob), bump * (1 - wob));
      ctx.drawImage(sp.c, (-sp.side / 2) * f, -sp.oy * f, sp.side * f, sp.side * f);
      ctx.restore();
    }

    // falling strings and rubber shreds
    for (const s of this.strings) {
      const a = G.clamp((s.life - s.t) / 0.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      drawRibbon(ctx, 0, 0, s.r, s.len, s.color, s.curl + s.t * 5, Math.sin(s.t * 6) * 0.4);
      ctx.restore();
    }
    for (const s of this.shreds) {
      const a = G.clamp((s.life - s.t) / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(s.t * 8 + s.ph)));
      ctx.beginPath();
      ctx.moveTo(-s.s, 0);
      ctx.quadraticCurveTo(0, -s.s * 0.9, s.s, 0.1 * s.s);
      ctx.lineWidth = s.s * 0.55;
      ctx.lineCap = 'round';
      ctx.strokeStyle = s.color;
      ctx.stroke();
      ctx.restore();
    }
    this.parts.draw(ctx);

    for (const tx of this.texts) {
      const k = tx.t / 0.9;
      const sc = tx.t < 0.18 ? G.ease.outBack(tx.t / 0.18) : 1;
      const a = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      ctx.save();
      ctx.translate(tx.x, tx.y - G.ease.outCubic(k) * tx.size * 1.6);
      ctx.scale(sc, sc);
      G.drawText(ctx, tx.text, 0, 0, { size: tx.size, color: '#fff', stroke: Math.max(3, tx.size * 0.22), strokeColor: G.shade(tx.color, -0.35), alpha: a });
      ctx.restore();
    }
  }

  hud() {
    return `${G.formatNum(this.app.getStat('popped'))} ${this.tr(LABEL)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const st = STYLES[i];
    const key = `${i}|${Math.round(r * 2)}|${this.app.dpr}`;
    let ic = this.icons.get(key);
    if (!ic) {
      const dpr = this.app.dpr, S = r * 2;
      const c = G.makeCanvas(S * dpr, S * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      const bg = g.createLinearGradient(0, 0, 0, S);
      bg.addColorStop(0, st.sky[0]);
      bg.addColorStop(1, st.sky[1]);
      g.fillStyle = bg;
      g.fillRect(0, 0, S, S);
      const R = r * (st.kind === 'bubble' ? 0.58 : 0.5);
      g.translate(r, r * (st.kind === 'bubble' ? 1 : 0.86));
      if (st.kind !== 'bubble') {
        g.strokeStyle = G.shade(st.colors[0], -0.2);
        g.lineWidth = Math.max(1, r * 0.06);
        g.beginPath();
        g.moveTo(0, attachY(st.kind) * R);
        g.quadraticCurveTo(r * 0.12, r * 0.95, -r * 0.05, r * 1.3);
        g.stroke();
      }
      paintBalloon(g, st.kind, st.finish, st.colors[0], R);
      ic = { c, S };
      this.icons.set(key, ic);
    }
    ctx.drawImage(ic.c, x - r, y - r, ic.S, ic.S);
  }
}
