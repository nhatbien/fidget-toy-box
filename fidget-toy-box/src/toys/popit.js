// Pop It: press the silicone bubbles. When every bubble is down the toy flips over and starts again.
import { Toy } from './_base.js';
import * as G from '../gfx.js';

const SHAPES = ['circle', 'heart', 'star', 'square', 'hexagon', 'paw'];
const PALETTES = [
  ['#ff4d6d', '#ff9f1c', '#ffd23f', '#3ddc84', '#3a86ff', '#9b5de5'],
  ['#ff5d8f', '#ff7aa2', '#ff97b7', '#e07bff', '#c77dff', '#9d4edd'],
  ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff', '#06d6a0'],
  ['#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#7fd8ec', '#a9e8f5'],
  ['#38b000', '#55c800', '#70e000', '#9ef01a', '#b9f45a', '#d4fc79'],
  ['#7b2cbf', '#9d4edd', '#b06ef0', '#c77dff', '#d8a4ff', '#e7c6ff'],
];
const BACKGROUNDS = [
  ['#ffe8d6', '#ffbf94'],
  ['#ffe5ef', '#ffbcd3'],
  ['#fff3c4', '#ffcf99'],
  ['#e0f7ff', '#a9def2'],
  ['#efffd9', '#bfeb95'],
  ['#f3e8ff', '#d4b8ff'],
];
const PITCH = [104, 98, 94, 112, 102, 92]; // bubble spacing inside the 1000-unit design box
const LABEL = {
  en: ['pop', 'pops'], vi: 'lần bấm', es: ['pop', 'pops'], pt: ['pop', 'pops'], fr: ['pop', 'pops'],
  de: ['Pop', 'Pops'], id: 'pop', it: 'pop', tr: 'pat', ru: ['щелчок', 'щелчка', 'щелчков'],
};

/** Adds the outline of a pop-it shape (designed in a 1000×1000 box) to a ctx or Path2D. */
function shapePath(p, shape, cx, cy, S) {
  const s = S / 1000;
  switch (shape) {
    case 'heart':
      G.heartPath(p, cx, cy - 48 * s, 1060 * s);
      break;
    case 'star':
      G.softStarPath(p, cx, cy + 34 * s, 5, 540 * s, 300 * s);
      break;
    case 'square':
      G.roundRectPath(p, cx - 455 * s, cy - 455 * s, 910 * s, 910 * s, 150 * s);
      break;
    case 'hexagon':
      G.polygonPath(p, cx, cy, 6, 505 * s, 0);
      break;
    case 'paw':
      p.moveTo(cx + 335 * s, cy + 175 * s);
      p.ellipse(cx, cy + 175 * s, 335 * s, 280 * s, 0, 0, G.TAU);
      for (const [x, y, r] of [[-350, -70, 140], [350, -70, 140], [-135, -300, 150], [135, -300, 150]]) {
        p.moveTo(cx + (x + r) * s, cy + y * s);
        p.arc(cx + x * s, cy + y * s, r * s, 0, G.TAU);
      }
      break;
    default:
      p.moveTo(cx + 485 * s, cy);
      p.arc(cx, cy, 485 * s, 0, G.TAU);
  }
}

export class PopItToy extends Toy {
  static id = 'popit';

  constructor(app) {
    super(app);
    this.bubbles = null;
    this.drags = new Map();
    this.sprites = new Map();
    this.flipT = 0;
    this.flipDelay = 0;
    this.testCtx = G.makeCanvas(2, 2).getContext('2d');
    this.buttons = [{ icon: 'refresh', color: '#3cb4e6', onTap: () => this.startFlip(false) }];
  }

  enter() {
    if (!this.bubbles || this.builtFor !== this.variant) this.build();
  }
  exit() {
    this.drags.clear();
  }
  setVariant() {
    this.build();
    this.app.audio.whoosh(0.6);
  }

  /** Lays out the bubbles in design units; screen size is applied at draw time. */
  build() {
    const v = this.variant;
    this.builtFor = v;
    this.path = new Path2D();
    shapePath(this.path, SHAPES[v], 0, 0, 1000);
    const d = PITCH[v];
    this.pitch = d;
    this.br = d * 0.4;
    const margin = this.br + d * 0.09;
    let best = [];
    for (const ox of [0, d / 2]) {
      for (const oy of [0, d / 2]) {
        const list = [];
        for (let j = -7; j <= 7; j++) {
          for (let i = -7; i <= 7; i++) {
            const u = i * d + ox, w = j * d + oy;
            if (this.fits(u, w, margin)) list.push({ u, v: w, up: true, anim: 0 });
          }
        }
        if (list.length > best.length) best = list;
      }
    }
    const rows = [...new Set(best.map((b) => b.v))].sort((a, b) => a - b);
    this.rows = rows;
    for (const b of best) {
      const r = rows.indexOf(b.v);
      b.row = r;
      b.band = Math.min(5, Math.floor((r * 6) / rows.length));
      b.color = PALETTES[v][b.band];
    }
    this.bubbles = best;
    this.remaining = best.length;
    this.flipT = 0;
    this.flipDelay = 0;
    this.board = null;
    this.sprites.clear();
  }

  fits(u, v, r) {
    const c = this.testCtx;
    if (!c.isPointInPath(this.path, u, v)) return false;
    for (let k = 0; k < 12; k++) {
      const a = (k * G.TAU) / 12;
      if (!c.isPointInPath(this.path, u + Math.cos(a) * r, v + Math.sin(a) * r)) return false;
    }
    return true;
  }

  resize(area) {
    this.S = Math.max(10, Math.min(area.w, area.h) * 0.94);
    this.cx = area.x + area.w / 2;
    this.cy = area.y + area.h / 2;
    this.k = this.S / 1000;
    this.board = null;
    this.sprites.clear();
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    this.drags.set(p.id, { x: p.x, y: p.y });
    this.tryPop(p.x, p.y);
  }
  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    const len = G.dist(d.x, d.y, p.x, p.y);
    const n = Math.max(1, Math.ceil(len / (this.br * this.k * 0.5)));
    for (let i = 1; i <= n; i++) this.tryPop(G.lerp(d.x, p.x, i / n), G.lerp(d.y, p.y, i / n));
    d.x = p.x;
    d.y = p.y;
  }
  pointerUp(p) {
    this.drags.delete(p.id);
  }
  keyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      this.startFlip(false);
      return true;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      const up = this.bubbles.filter((b) => b.up);
      if (up.length) this.popBubble(G.pick(up));
      return true;
    }
    return false;
  }

  tryPop(x, y) {
    if (this.flipT > 0) return;
    const u = (x - this.cx) / this.k, v = (y - this.cy) / this.k;
    const r2 = (this.br * 1.08) ** 2;
    for (const b of this.bubbles) {
      if (b.up && (b.u - u) ** 2 + (b.v - v) ** 2 < r2) {
        this.popBubble(b);
        return;
      }
    }
  }

  popBubble(b) {
    const app = this.app;
    b.up = false;
    b.anim = 1;
    const x = this.cx + b.u * this.k, y = this.cy + b.v * this.k;
    const R = this.br * this.k;
    const pitch = G.clamp(1.25 - (R - 14) / 70, 0.75, 1.35) * (0.96 + (b.row % 4) * 0.03);
    app.audio.pop(pitch, 1, ((x / app.w) - 0.5) * 0.8);
    app.haptic(8);
    app.fx.ring(x, y, 'rgba(255,255,255,0.75)', R * 0.5, R * 1.45, 0.28, 2.5);
    app.addProgress(0.04, x, y);
    app.stat('pops');
    this.remaining--;
    if (this.remaining <= 0) this.flipDelay = 0.45;
  }

  startFlip(earned = true) {
    if (this.flipT > 0) return;
    const app = this.app;
    this.flipT = 0.0001;
    this.flipDelay = 0;
    app.audio.whoosh(0.9);
    if (earned) {
      app.stat('flips');
      app.audio.chime(1046.5, 0.8);
      app.addProgress(0.5, this.cx, this.cy);
      app.fx.burst(this.cx, this.cy, { count: 36, colors: PALETTES[this.variant], shape: ['confetti', 'circle'], speed: [200, 520], size: [4, 8], gravity: 700, life: [0.8, 1.4] });
    }
  }

  update(dt) {
    for (const b of this.bubbles) if (b.anim > 0) b.anim = Math.max(0, b.anim - dt / 0.22);
    if (this.flipDelay > 0) {
      this.flipDelay -= dt;
      if (this.flipDelay <= 0) this.startFlip(true);
    }
    if (this.flipT > 0) {
      const prev = this.flipT;
      this.flipT += dt / 0.7;
      if (prev < 0.5 && this.flipT >= 0.5) {
        for (const b of this.bubbles) {
          b.up = true;
          b.anim = 0;
        }
        this.remaining = this.bubbles.length;
      }
      if (this.flipT >= 1) this.flipT = 0;
    }
  }

  // ---------------------------------------------------------------- drawing
  renderBoard() {
    const dpr = this.app.dpr, S = this.S, pad = S * 0.09;
    const pal = PALETTES[this.variant];
    const c = G.makeCanvas((S + pad * 2) * dpr, (S + pad * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(pad + S / 2, pad + S / 2);
    g.scale(S / 1000, S / 1000);
    const path = this.path;
    // drop shadow (shadow values are in device pixels)
    g.save();
    g.shadowColor = 'rgba(90,40,10,0.35)';
    g.shadowBlur = 34 * (S / 1000) * dpr;
    g.shadowOffsetY = 22 * (S / 1000) * dpr;
    g.fillStyle = pal[0];
    g.fill(path);
    g.restore();
    // colored row bands
    g.save();
    g.clip(path);
    const rows = this.rows, d = this.pitch;
    rows.forEach((rv, r) => {
      const band = Math.min(5, Math.floor((r * 6) / rows.length));
      const y0 = r === 0 ? -700 : rv - d / 2;
      const y1 = r === rows.length - 1 ? 700 : rv + d / 2;
      g.fillStyle = G.shade(pal[band], 0.12);
      g.fillRect(-700, y0, 1400, y1 - y0 + 1);
    });
    const lg = g.createLinearGradient(0, -520, 0, 520);
    lg.addColorStop(0, 'rgba(255,255,255,0.28)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.14)');
    g.fillStyle = lg;
    g.fillRect(-700, -700, 1400, 1400);
    // raised lip: dark inner edge + light top edge
    g.lineWidth = 52;
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.stroke(path);
    g.save();
    g.translate(-5, -8);
    g.lineWidth = 16;
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.stroke(path);
    g.restore();
    g.restore();
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(60,20,0,0.18)';
    g.stroke(path);
    this.board = { canvas: c, pad };
  }

  sprite(color, up, R) {
    const dpr = this.app.dpr;
    const key = `${color}|${up ? 1 : 0}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const m = R * 1.22;
    const c = G.makeCanvas(m * 2 * dpr, m * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    // groove around the bubble
    G.circle(g, m, m, R * 1.1);
    g.fillStyle = G.shade(color, -0.22);
    g.fill();
    if (up) {
      const gr = g.createRadialGradient(m - R * 0.32, m - R * 0.36, R * 0.06, m, m, R);
      gr.addColorStop(0, G.shade(color, 0.6));
      gr.addColorStop(0.45, G.shade(color, 0.14));
      gr.addColorStop(1, G.shade(color, -0.2));
      G.circle(g, m, m, R);
      g.fillStyle = gr;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.78)';
      g.beginPath();
      g.ellipse(m - R * 0.34, m - R * 0.4, R * 0.27, R * 0.15, -0.65, 0, G.TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = R * 0.08;
      g.beginPath();
      g.arc(m, m, R * 0.94, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    } else {
      // pressed in: a shaded dish lit from the lower right, with a deep shadow under the top-left rim
      const gr = g.createRadialGradient(m + R * 0.3, m + R * 0.34, R * 0.05, m + R * 0.1, m + R * 0.1, R * 1.05);
      gr.addColorStop(0, G.shade(color, 0.18));
      gr.addColorStop(0.5, G.shade(color, -0.12));
      gr.addColorStop(1, G.shade(color, -0.42));
      G.circle(g, m, m, R * 0.96);
      g.fillStyle = gr;
      g.fill();
      g.save();
      G.circle(g, m, m, R * 0.96);
      g.clip();
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = R * 0.32;
      g.beginPath();
      g.arc(m + R * 0.12, m + R * 0.14, R * 1.02, Math.PI * 0.95, Math.PI * 1.75);
      g.stroke();
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = R * 0.08;
      g.beginPath();
      g.arc(m, m, R * 0.8, Math.PI * 0.08, Math.PI * 0.42);
      g.stroke();
    }
    s = { c, size: m * 2 };
    this.sprites.set(key, s);
    return s;
  }

  draw(ctx) {
    const app = this.app;
    const bg = BACKGROUNDS[this.variant];
    G.drawSoftBackground(ctx, app.w, app.h, bg[0], bg[1]);
    if (!this.board) this.renderBoard();
    const ft = this.flipT;
    const fx = ft > 0 ? Math.cos(ft * Math.PI) : 1;
    const lift = ft > 0 ? Math.sin(ft * Math.PI) : 0;
    ctx.save();
    ctx.translate(this.cx, this.cy - lift * this.S * 0.05);
    ctx.scale(fx * (1 + lift * 0.06), 1 + lift * 0.06);
    const { canvas, pad } = this.board;
    const full = this.S + pad * 2;
    ctx.drawImage(canvas, -full / 2, -full / 2, full, full);
    const R = this.br * this.k;
    for (const b of this.bubbles) {
      const s = this.sprite(b.color, b.up, R);
      const sq = b.anim > 0 ? 1 - 0.14 * Math.sin(b.anim * Math.PI) : 1;
      const size = s.size * sq;
      ctx.drawImage(s.c, b.u * this.k - size / 2, b.v * this.k - size / 2, size, size);
    }
    ctx.restore();
  }

  hud() {
    return G.countLabel(this.app.getStat('pops'), LABEL, this.app.lang);
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const S = r * 1.65;
    const pal = PALETTES[i];
    const path = new Path2D();
    shapePath(path, SHAPES[i], x, y, S);
    ctx.save();
    ctx.clip(path);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = pal[k];
      ctx.fillRect(x - S, y - S / 2 + (k * S) / 6 - 1, S * 2, S / 6 + 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const st = S / 4.5;
    for (let gy = -2; gy <= 2; gy++) {
      for (let gx = -2; gx <= 2; gx++) {
        G.circle(ctx, x + gx * st, y + gy * st, st * 0.28);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
