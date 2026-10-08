// Xylophone: eight bars in C major on a toy frame. Tap or sweep across the bars (glissando) with
// one or several fingers, or switch on "learn a song" and follow the glowing bar.
import { Toy } from './_base.js';
import * as G from '../gfx.js';
import { midi } from '../audio.js';

const NOTES = [72, 74, 76, 77, 79, 81, 83, 84];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const KIND = ['xylo', 'toy', 'marimba', 'glass', 'xylo', 'glass'];
const COLORS = [
  ['#ff3b3b', '#ff8c1a', '#ffd21f', '#3fcf4a', '#1fc1e8', '#2f6bff', '#6a4dff', '#b04dff'], // rainbow
  ['#ffadc6', '#ffc9a3', '#fff0a0', '#c3f5b5', '#aee6f7', '#b9c8ff', '#d7b9ff', '#ffc2ec'], // pastel
  ['#a8652f', '#9e5d2b', '#ab6935', '#985a2c', '#a66433', '#9b5c2e', '#a5663a', '#985b2d'], // rosewood
  ['#9fd3ff', '#a3ecff', '#a6ffe6', '#c8f7a8', '#fff09a', '#ffc6e2', '#dcc2ff', '#b9cdff'], // crystal
  ['#ff2e88', '#ff7a00', '#ffe600', '#39ff14', '#00f0ff', '#2f7bff', '#b026ff', '#ff3df2'], // neon
  ['#ffd56a', '#ffd062', '#ffd870', '#ffcc5c', '#ffd468', '#ffcf60', '#ffd66c', '#ffcd5e'], // music box gold
];
// Per style: background, frame rails (light, dark), pins, mallet head & stick, toolbar button.
const STYLES = [
  { bg: ['#fff1d6', '#ffc58a'], rail: ['#f1c88f', '#c48a4c'], pin: '#f3dcb8', head: '#ff3b3b', stick: '#efcf9f', btn: '#ff8a3d' },
  { bg: ['#fff0f7', '#ffc4de'], rail: ['#ffffff', '#efc6dc'], pin: '#ff9ec4', head: '#ff8fbf', stick: '#fff1f7', btn: '#ff7fb2' },
  { bg: ['#f6e6cc', '#c99a63'], rail: ['#7a4a29', '#4a2a15'], pin: '#e2bd6a', head: '#4a3a5a', stick: '#d9b98a', btn: '#a8652f' },
  { bg: ['#e2f3ff', '#8dbfe8'], rail: ['#f7fbff', '#8fa3b8'], pin: '#ffffff', head: '#f4fbff', stick: '#cfdbe8', btn: '#4cb2e6' },
  { bg: ['#2a1450', '#0b0420'], rail: ['#3a3158', '#16112a'], pin: '#00f0ff', head: '#ff2e88', stick: '#b9b3d6', btn: '#b026ff' },
  { bg: ['#f3e2ff', '#a979cf'], rail: ['#8a3a33', '#4d1715'], pin: '#ffe9a6', head: '#ffd56a', stick: '#7a2e2a', btn: '#d4a017' },
];
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, k: 7 };
const GAP = 0.24, END = 0.8, OVER = 0.42, SHRINK = 0.42, NODE = 0.276; // layout, in bar widths
const L = (en, vi, es, pt, fr, de, id, it, tr, ru) => ({ en, vi, es, pt, fr, de, id, it, tr, ru });
// Public-domain melodies as scale indices (0..7 = C D E F G A B C').
const SONGS = [
  {
    title: L('Twinkle Twinkle Little Star', 'Ngôi sao nhỏ lấp lánh', 'Estrellita, ¿dónde estás?', 'Brilha, brilha, estrelinha', 'Brille, brille, petite étoile', 'Funkel, funkel, kleiner Stern', 'Kelap-kelip Bintang Kecil', 'Brilla brilla la stellina', 'Parla Parla Küçük Yıldız', 'Мерцай, мерцай, звёздочка'),
    notes: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0],
  },
  {
    title: L('Ode to Joy', 'Khúc hoan ca', 'Himno de la alegría', 'Hino à Alegria', 'Hymne à la joie', 'Ode an die Freude', 'Ode untuk Kegembiraan', 'Inno alla gioia', 'Neşeye Övgü', 'Ода к радости'),
    notes: [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 1, 0, 0],
  },
  {
    title: L('Mary Had a Little Lamb', 'Mary có một chú cừu non', 'María tenía un corderito', 'Maria tinha um carneirinho', 'Marie avait un petit agneau', 'Mary hatte ein kleines Lamm', 'Mary Punya Anak Domba', 'Maria aveva un agnellino', "Mary'nin Küçük Kuzusu", 'У Мэри был барашек'),
    notes: [2, 1, 0, 1, 2, 2, 2, 1, 1, 1, 2, 4, 4, 2, 1, 0, 1, 2, 2, 2, 2, 1, 1, 2, 1, 0],
  },
  {
    title: L('Jingle Bells', 'Chuông ngân vang', 'Cascabeles', 'Bate o sino', 'Vive le vent', 'Jingle Bells', 'Jingle Bells', 'Jingle Bells', 'Jingle Bells', 'Бубенцы'),
    notes: [2, 2, 2, 2, 2, 2, 2, 4, 0, 1, 2, 3, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 3, 1, 0],
  },
];
const LABEL = L('notes', 'nốt nhạc', 'notas', 'notas', 'notes', 'Töne', 'nada', 'note', 'nota', 'нот');
const LABEL_ONE = L('note', 'nốt nhạc', 'nota', 'nota', 'note', 'Ton', 'nada', 'nota', 'nota', 'нота');
const RU_FEW = 'ноты';

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

const _glows = new Map();
/** Soft round light sprite, stretched over a bar when it rings. */
function glowSprite(color) {
  let c = _glows.get(color);
  if (c) return c;
  c = G.makeCanvas(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, G.alpha(color, 0.85));
  gr.addColorStop(0.4, G.alpha(color, 0.35));
  gr.addColorStop(1, G.alpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glows.set(color, c);
  return c;
}

export class XylophoneToy extends Toy {
  static id = 'xylophone';

  constructor(app) {
    super(app);
    this.bars = NOTES.map((n, i) => ({ i, x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0, uc: 0, len: 1, flash: 0, wt: 9 }));
    this.mallets = new Map(); // pointer id → mallet following that finger
    this.fading = []; // released mallets lifting away
    this.song = null; // { idx, pos, wait } while learning a song
    this.songIdx = 0;
    this.songPop = 0;
    this.run = null; // little demo run after a style change
    this.land = true;
    this.bw = 10;
    this.layer = null;
    this.sprites = null;
    this.sparkT = 0;
    this.btn = { icon: 'play', color: STYLES[0].btn, onTap: () => this.toggleSong() };
    this.buttons = [this.btn];
  }

  enter() {
    this.btn.icon = this.song ? 'stop' : 'play';
    this.btn.color = STYLES[this.variant].btn;
  }
  exit() {
    this.mallets.clear();
    this.fading.length = 0;
    this.run = null;
    this.layer = null; // free the full-screen cache while the toy is closed
    this.sprites = null;
  }
  setVariant() {
    this.layer = null;
    this.sprites = null;
    this.btn.color = STYLES[this.variant].btn;
    this.run = { t: 0, next: 0 };
  }

  // ---------------------------------------------------------------- layout
  /**
   * Landscape areas get a row of upright bars (longest on the left); portrait areas get a stack
   * of horizontal bars (longest on top). Layout runs along U (the row) and V (bar length).
   */
  resize(area) {
    const land = area.w >= area.h * 0.95;
    const Au = Math.max(10, land ? area.w : area.h), Av = Math.max(10, land ? area.h : area.w);
    const unit = 8 + 7 * GAP + 2 * END;
    let bw = (Au * 0.97) / unit;
    let len0 = Av * 0.97 - 2 * OVER * bw;
    if (len0 > bw * 5) len0 = bw * 5;
    if (len0 < bw * 2.4) {
      bw = (Av * 0.97) / (2.4 + 2 * OVER);
      len0 = bw * 2.4;
    }
    bw = Math.max(2, bw);
    len0 = Math.max(4, len0);
    const rowLen = unit * bw;
    const u0 = (land ? area.x : area.y) + (Au - rowLen) / 2 + END * bw;
    const vc = (land ? area.y : area.x) + Av / 2;
    for (const b of this.bars) {
      const u = u0 + b.i * bw * (1 + GAP);
      b.uc = u + bw / 2;
      b.len = len0 * (1 - (SHRINK * b.i) / 7);
      if (land) Object.assign(b, { x: u, y: vc - b.len / 2, w: bw, h: b.len });
      else Object.assign(b, { x: vc - b.len / 2, y: u, w: b.len, h: bw });
      b.cx = b.x + b.w / 2;
      b.cy = b.y + b.h / 2;
    }
    this.land = land;
    this.bw = bw;
    this.vc = vc;
    this.layer = null;
    this.sprites = null;
  }

  /** Bar length along the row (rails follow the bar nodes in a straight line). */
  lenAt(u) {
    const a = this.bars[0], b = this.bars[7];
    return G.lerp(a.len, b.len, (u - a.uc) / Math.max(1e-6, b.uc - a.uc));
  }
  /** (u, v) layout coords → screen point. */
  P(u, v) {
    return this.land ? [u, v] : [v, u];
  }

  barAt(x, y) {
    const half = this.bw * GAP * 0.5, sl = this.bw * 0.15;
    const ex = this.land ? half : sl, ey = this.land ? sl : half;
    for (const b of this.bars) {
      if (x >= b.x - ex && x <= b.x + b.w + ex && y >= b.y - ey && y <= b.y + b.h + ey) return b.i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- interaction
  pointerDown(p) {
    const i = this.barAt(p.x, p.y);
    const m = { x: p.x, y: p.y, bar: i, st: i >= 0 ? 0 : 9, appear: i >= 0 ? 1 : 0.2, fade: 1 };
    this.mallets.set(p.id, m);
    if (i >= 0) this.strike(i, p.x, p.y);
  }
  pointerMove(p) {
    const m = this.mallets.get(p.id);
    if (!m) return;
    // walk the segment so a quick sweep rings every bar it crosses (glissando)
    const n = Math.max(1, Math.ceil(G.dist(m.x, m.y, p.x, p.y) / Math.max(3, this.bw * 0.25)));
    for (let k = 1; k <= n; k++) {
      const x = G.lerp(m.x, p.x, k / n), y = G.lerp(m.y, p.y, k / n);
      const i = this.barAt(x, y);
      if (i !== m.bar) {
        m.bar = i;
        if (i >= 0) {
          m.st = 0;
          this.strike(i, x, y, true, 0.85);
        }
      }
    }
    m.x = p.x;
    m.y = p.y;
  }
  pointerUp(p) {
    const m = this.mallets.get(p.id);
    if (!m) return;
    this.mallets.delete(p.id);
    if (this.fading.length > 8) this.fading.shift();
    this.fading.push(m);
  }
  keyDown(e) {
    const k = String(e.key).toLowerCase();
    if (k === ' ' || k === 'enter') {
      if (!e.repeat) this.toggleSong();
      return true;
    }
    const i = KEYS[k];
    if (i === undefined) return false;
    if (!e.repeat) {
      const b = this.bars[i];
      const x = b.cx + (this.land ? 0 : b.w * 0.12), y = b.cy + (this.land ? b.h * 0.12 : 0);
      if (this.fading.length > 8) this.fading.shift();
      this.fading.push({ x, y, bar: i, st: 0, appear: 1, fade: 1 });
      this.strike(i, x, y);
    }
    return true;
  }

  /** Rings bar i: sound, wobble, glow, floating note. `user` hits also count for stars and songs. */
  strike(i, x, y, user = true, vol = 1) {
    const app = this.app, b = this.bars[i], v = this.variant;
    const freq = midi(NOTES[i] + (v === 5 ? 12 : 0)) * G.rand(0.998, 1.002);
    const pan = this.land ? G.clamp((b.cx / Math.max(1, app.w) - 0.5) * 0.9, -0.8, 0.8) : (i / 7 - 0.5) * 0.6;
    app.audio.mallet(freq, vol * G.rand(0.85, 1), KIND[v], pan);
    b.wt = 0;
    b.flash = 1;
    const col = v === 2 ? '#fff1d0' : G.shade(COLORS[v][i], v === 3 || v === 5 ? 0 : 0.15);
    const size = G.clamp(this.bw * 0.22, 8, 22);
    app.fx.spawn({ x, y: y - size, vx: G.rand(-40, 40), vy: G.rand(-150, -95), gravity: -40, drag: 0.6, life: G.rand(0.9, 1.3), size, color: col, shape: 'note' });
    app.fx.ring(x, y, 'rgba(255,255,255,0.8)', this.bw * 0.15, this.bw * 0.75, 0.3, 3);
    if (!user) return;
    app.haptic(8);
    app.addProgress(0.04, x, y);
    app.stat('notes');
    this.checkSong(i);
  }

  // ---------------------------------------------------------------- song mode
  toggleSong() {
    if (this.song) {
      this.song = null;
      this.btn.icon = 'play';
    } else {
      this.song = { idx: this.songIdx % SONGS.length, pos: 0, wait: 0 };
      this.btn.icon = 'stop';
      this.songPop = 1;
    }
  }
  checkSong(i) {
    const s = this.song;
    if (!s || s.wait > 0) return;
    const notes = SONGS[s.idx].notes;
    if (notes[s.pos] !== i) return; // wrong notes simply play
    s.pos++;
    this.songPop = 1;
    if (s.pos < notes.length) return;
    // song finished!
    const app = this.app;
    const cx = (this.bars[0].cx + this.bars[7].cx) / 2, cy = (this.bars[0].cy + this.bars[7].cy) / 2;
    app.audio.fanfare();
    app.haptic(30);
    app.fx.burst(cx, cy, { count: 48, colors: G.RAINBOW, shape: ['confetti', 'star', 'circle'], speed: [220, 560], size: [4, 8], gravity: 700, life: [0.9, 1.6] });
    app.addProgress(0.6, cx, cy);
    app.stat('songs');
    s.wait = 2.2;
  }

  update(dt) {
    for (const b of this.bars) {
      b.wt += dt;
      b.flash = b.flash > 0.01 ? b.flash * Math.exp(-dt * 3.2) : 0;
    }
    for (const m of this.mallets.values()) {
      m.st += dt;
      m.appear = Math.min(1, m.appear + dt * 7);
    }
    for (const m of this.fading) {
      m.st += dt;
      m.fade -= dt / 0.28;
    }
    if (this.fading.length && this.fading[0].fade <= 0) this.fading = this.fading.filter((m) => m.fade > 0);
    this.songPop = Math.max(0, this.songPop - dt * 3);
    const s = this.song;
    if (s && s.wait > 0) {
      s.wait -= dt;
      if (s.wait <= 0) {
        s.idx = (s.idx + 1) % SONGS.length;
        s.pos = 0;
        s.wait = 0;
        this.songIdx = s.idx;
        this.songPop = 1;
      }
    }
    // after a style change, a quick run up the bars shows off the new sound
    if (this.run) {
      this.run.t += dt;
      while (this.run && this.run.t >= this.run.next * 0.055) {
        const b = this.bars[this.run.next];
        this.strike(b.i, b.cx, b.cy, false, 0.45);
        this.run.next++;
        if (this.run.next >= this.bars.length) this.run = null;
      }
    }
    // idle twinkles on the bars (frequent on the crystal and golden ones)
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      const shiny = this.variant === 3 || this.variant === 5;
      this.sparkT = shiny ? G.rand(0.35, 0.9) : G.rand(1.4, 3);
      const b = G.pick(this.bars);
      this.app.fx.spawn({ x: b.x + G.rand(0.2, 0.8) * b.w, y: b.y + G.rand(0.15, 0.85) * b.h, shape: 'sparkle', size: G.rand(3, 6), color: '#ffffff', life: 0.6, vr: 2, grow: -4, alpha: 0.9 });
    }
  }

  // ---------------------------------------------------------------- drawing
  renderLayer() {
    const app = this.app, dpr = app.dpr, w = app.w, h = app.h, v = this.variant;
    const c = G.makeCanvas(w * dpr, h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const S = STYLES[v];
    G.drawSoftBackground(g, w, h, S.bg[0], S.bg[1], v === 4 ? { glow: 'rgba(160,80,255,0.18)' } : undefined);
    if (v === 4) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let k = 0; k < 50; k++) {
        G.circle(g, (Math.sin(k * 12.9898) * 0.5 + 0.5) * w, (Math.sin(k * 78.233) * 0.5 + 0.5) * h, 0.6 + (k % 3) * 0.5);
        g.fill();
      }
    } else if (v === 5) {
      g.fillStyle = 'rgba(255,240,200,0.45)';
      for (let k = 0; k < 28; k++) {
        const x = (Math.sin(k * 91.7) * 0.5 + 0.5) * w, y = (Math.sin(k * 47.3) * 0.5 + 0.5) * h, r = 2 + (k % 4) * 1.5;
        g.beginPath();
        G.softStarPath(g, x, y, 4, r, r * 0.3, 0);
        g.fill();
      }
    }
    this.drawFrame(g);
    this.layer = { c, w, h, dpr };
  }

  /** Two rails under the bar nodes plus rounded end posts, cached with its soft shadow. */
  drawFrame(g) {
    const v = this.variant, S = STYLES[v], bw = this.bw, dpr = this.app.dpr;
    const a = this.bars[0], b = this.bars[7];
    const ua = a.uc - bw * (0.5 + END * 0.62), ub = b.uc + bw * (0.5 + END * 0.62);
    const vc = this.vc;
    const rail = (sign) => [this.P(ua, vc + sign * NODE * this.lenAt(ua)), this.P(ub, vc + sign * NODE * this.lenAt(ub))];
    const rt = bw * 0.42, pt = bw * 0.7;
    const line = (p0, p1, width, color) => {
      g.lineWidth = width;
      g.strokeStyle = color;
      g.beginPath();
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
      g.stroke();
    };
    const posts = [ua, ub].map((u) => {
      const ext = NODE * this.lenAt(u) + rt * 0.9;
      return [this.P(u, vc - ext), this.P(u, vc + ext)];
    });
    const rails = [rail(-1), rail(1)];
    g.save();
    g.lineCap = 'round';
    // shadow pass
    g.save();
    g.shadowColor = v === 4 ? 'rgba(0,0,0,0.6)' : 'rgba(60,30,10,0.35)';
    g.shadowBlur = bw * 0.35 * dpr;
    g.shadowOffsetY = bw * 0.22 * dpr;
    for (const [p0, p1] of posts) line(p0, p1, pt, S.rail[1]);
    for (const [p0, p1] of rails) line(p0, p1, rt, S.rail[1]);
    g.restore();
    // body + highlights
    const beams = [...posts.map((q) => [q, pt]), ...rails.map((q) => [q, rt])];
    for (const [[p0, p1], wdt] of beams) {
      line(p0, p1, wdt * 0.94, G.mixColor(S.rail[0], S.rail[1], 0.45));
      const o = wdt * 0.16;
      line([p0[0] - o * 0.5, p0[1] - o], [p1[0] - o * 0.5, p1[1] - o], wdt * 0.42, G.alpha(S.rail[0], v === 4 ? 0.35 : 0.85));
      if (v === 2) line([p0[0], p0[1] + o * 0.6], [p1[0], p1[1] + o * 0.6], Math.max(1, wdt * 0.05), 'rgba(0,0,0,0.25)');
    }
    if (v === 4) {
      // neon trim
      g.save();
      g.shadowColor = '#00f0ff';
      g.shadowBlur = bw * 0.3 * dpr;
      for (const [p0, p1] of rails) line(p0, p1, Math.max(1.5, bw * 0.04), '#00f0ff');
      for (const [p0, p1] of posts) line(p0, p1, Math.max(1.5, bw * 0.04), '#ff2e88');
      g.restore();
    } else if (v === 5) {
      for (const [p0, p1] of rails) line(p0, p1, Math.max(1, bw * 0.05), '#f6d27a');
      for (const [p0, p1] of posts) {
        for (const p of [p0, p1]) G.glossyBall(g, p[0], p[1], pt * 0.32, '#f2c14e');
      }
    }
    if (v !== 5) {
      // screw heads where the rails meet the end posts
      const sr = rt * 0.3;
      for (const [p0, p1] of rails) {
        for (const p of [p0, p1]) {
          G.circle(g, p[0] + sr * 0.15, p[1] + sr * 0.3, sr);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fill();
          G.glossyBall(g, p[0], p[1], sr, v === 4 ? '#8a86a8' : G.mixColor(S.rail[0], '#c9c9c9', 0.5), { highlight: 0.6, shadowAmt: 0.35 });
          g.strokeStyle = 'rgba(0,0,0,0.35)';
          g.lineWidth = Math.max(1, sr * 0.25);
          g.beginPath();
          g.moveTo(p[0] - sr * 0.55, p[1] - sr * 0.2);
          g.lineTo(p[0] + sr * 0.55, p[1] + sr * 0.2);
          g.stroke();
        }
      }
    }
    g.restore();
  }

  buildSprites() {
    this.sprites = this.bars.map((b) => ({ face: this.renderBar(b, false), lit: this.renderBar(b, true) }));
  }

  /** One bar (shadow, thickness, glossy face, pins, note letter) in screen orientation. */
  renderBar(b, lit) {
    const v = this.variant, dpr = this.app.dpr, bw = this.bw, vert = this.land;
    const S = STYLES[v];
    const w = b.w, h = b.h;
    const m = Math.ceil(bw * 0.4);
    const c = G.makeCanvas((w + m * 2) * dpr, (h + m * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(m, m);
    const r = Math.min(w, h) * 0.22;
    const color = COLORS[v][b.i];
    const face = new Path2D();
    G.roundRectPath(face, 0, 0, w, h, r);
    const across = (stops) => {
      const gr = vert ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, 0, 0, h);
      for (const [t, col] of stops) gr.addColorStop(t, col);
      return gr;
    };
    if (lit) {
      // glow overlay: bright core along the bar, drawn with alpha when it rings
      g.fillStyle = across(v === 2 || v === 5
        ? [[0, 'rgba(255,200,120,0.7)'], [0.45, 'rgba(255,240,205,0.95)'], [1, 'rgba(255,190,110,0.6)']]
        : [[0, G.shade(color, 0.7, 0.85)], [0.45, 'rgba(255,255,255,0.95)'], [1, G.shade(color, 0.35, 0.75)]]);
      g.fill(face);
      return { c, m };
    }
    const d = bw * 0.11;
    // soft shadow + thickness
    g.save();
    g.shadowColor = v === 4 ? 'rgba(0,0,0,0.7)' : 'rgba(40,20,5,0.38)';
    g.shadowBlur = bw * 0.22 * dpr;
    g.shadowOffsetY = bw * 0.14 * dpr;
    G.roundRect(g, 0, d, w, h, r);
    g.fillStyle = v === 3 ? 'rgba(120,160,200,0.45)' : G.shade(color, v === 5 ? -0.35 : -0.42);
    g.fill();
    g.restore();
    if (v === 3) {
      // crystal: translucent glass with bright edges and facets
      g.fillStyle = across([[0, G.alpha(G.shade(color, 0.45), 0.95)], [0.5, G.alpha(color, 0.62)], [1, G.alpha(G.shade(color, -0.2), 0.85)]]);
      g.fill(face);
      g.save();
      g.clip(face);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      if (vert) {
        g.moveTo(w * 0.1, h * 0.12); g.lineTo(w * 0.42, h * 0.04); g.lineTo(w * 0.42, h * 0.96); g.lineTo(w * 0.1, h * 0.9);
      } else {
        g.moveTo(w * 0.04, h * 0.1); g.lineTo(w * 0.96, h * 0.1); g.lineTo(w * 0.9, h * 0.42); g.lineTo(w * 0.12, h * 0.42);
      }
      g.closePath();
      g.fill();
      g.restore();
      g.lineWidth = Math.max(1.5, bw * 0.07);
      g.strokeStyle = 'rgba(50,100,150,0.35)';
      g.stroke(face);
      g.lineWidth = Math.max(1, bw * 0.035);
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.stroke(face);
    } else if (v === 5) {
      // music box: polished gold
      g.fillStyle = across([[0, '#fff4c8'], [0.22, color], [0.55, '#c8922c'], [0.8, '#ffe28e'], [1, '#b88224']]);
      g.fill(face);
      g.lineWidth = Math.max(1, bw * 0.035);
      g.strokeStyle = 'rgba(120,70,10,0.55)';
      g.stroke(face);
    } else {
      g.fillStyle = across(v === 2
        ? [[0, G.shade(color, 0.22)], [0.5, color], [1, G.shade(color, -0.25)]]
        : v === 1
          ? [[0, G.shade(color, 0.45)], [0.45, color], [1, G.shade(color, -0.1)]]
          : [[0, G.shade(color, 0.35)], [0.4, color], [1, G.shade(color, -0.22)]]);
      g.fill(face);
      g.save();
      g.clip(face);
      if (v === 2) {
        // rosewood grain running along the bar
        g.strokeStyle = 'rgba(60,25,8,0.28)';
        g.lineWidth = Math.max(1, bw * 0.025);
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const t = (k + 0.5) / 7 + Math.sin(b.i * 3 + k) * 0.03;
          const wob = bw * 0.05 * Math.sin(k * 2.1 + b.i);
          if (vert) {
            g.moveTo(w * t, 0);
            g.bezierCurveTo(w * t + wob, h * 0.33, w * t - wob, h * 0.66, w * t, h);
          } else {
            g.moveTo(0, h * t);
            g.bezierCurveTo(w * 0.33, h * t + wob, w * 0.66, h * t - wob, w, h * t);
          }
        }
        g.stroke();
      }
      // end shading so the bar reads as a solid block
      const ends = vert ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
      const ea = v === 1 ? 0.05 : 0.13;
      ends.addColorStop(0, `rgba(0,0,0,${ea})`);
      ends.addColorStop(0.12, 'rgba(0,0,0,0)');
      ends.addColorStop(0.88, 'rgba(0,0,0,0)');
      ends.addColorStop(1, `rgba(0,0,0,${ea * 1.3})`);
      g.fillStyle = ends;
      g.fillRect(0, 0, w, h);
      g.restore();
      // glossy streak
      g.fillStyle = `rgba(255,255,255,${v === 2 ? 0.16 : 0.42})`;
      if (vert) G.roundRect(g, w * 0.14, h * 0.05, w * 0.2, h * 0.9, w * 0.1);
      else G.roundRect(g, w * 0.05, h * 0.14, w * 0.9, h * 0.2, h * 0.1);
      g.fill();
      g.lineWidth = Math.max(1, bw * 0.03);
      g.strokeStyle = G.shade(color, -0.3, 0.6);
      g.stroke(face);
    }
    // pins at the vibration nodes, sitting on the rails
    const pr = Math.min(w, h) * 0.15;
    for (const t of [NODE, 1 - NODE]) {
      const along = 0.5 - t;
      const px = vert ? w / 2 : w * (0.5 + along);
      const py = vert ? h * (0.5 - along) : h / 2;
      G.circle(g, px + pr * 0.15, py + pr * 0.3, pr);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fill();
      G.glossyBall(g, px, py, pr, S.pin, { highlight: 0.7, shadowAmt: v === 4 ? 0.5 : 0.3 });
    }
    // engraved note letter
    const fs = Math.min(w, h) * 0.36;
    const dark = v === 1 || v === 3 || v === 5;
    G.drawText(g, LETTERS[b.i], w / 2, h / 2 + fs * 0.06, { size: fs, color: dark ? G.shade(color, -0.55, 0.55) : 'rgba(255,255,255,0.78)', weight: 800 });
    return { c, m };
  }

  draw(ctx) {
    const app = this.app;
    const ly = this.layer;
    if (!ly || ly.w !== app.w || ly.h !== app.h || ly.dpr !== app.dpr) this.renderLayer();
    if (!this.sprites) this.buildSprites();
    ctx.drawImage(this.layer.c, 0, 0, app.w, app.h);
    const v = this.variant, bw = this.bw, t = app.time;
    const neon = v === 4;
    // glow behind ringing bars (always a little for neon)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bars) {
      const a = (neon ? 0.45 + 0.1 * Math.sin(t * 2 + b.i) : 0) + b.flash * (neon ? 0.9 : 0.6);
      if (a < 0.02) continue;
      ctx.globalAlpha = G.clamp(a, 0, 1);
      const gw = b.w + bw * 1.6, gh = b.h + bw * 1.6;
      ctx.drawImage(glowSprite(neon || v === 5 ? COLORS[v][b.i] : G.shade(COLORS[v][b.i], 0.3)), b.cx - gw / 2, b.cy - gh / 2, gw, gh);
    }
    ctx.restore();
    // bars, wobbling after a strike
    for (const b of this.bars) {
      const sp = this.sprites[b.i];
      const k = Math.exp(-b.wt * 7);
      let ox = 0, oy = 0, rot = 0;
      if (k > 0.01) {
        const wob = Math.sin(b.wt * 58) * k * bw * 0.06;
        rot = Math.sin(b.wt * 43 + 1) * k * 0.025;
        if (this.land) ox = wob;
        else oy = wob;
      }
      const fw = b.w + sp.face.m * 2, fh = b.h + sp.face.m * 2;
      ctx.save();
      ctx.translate(b.cx + ox, b.cy + oy);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(sp.face.c, -fw / 2, -fh / 2, fw, fh);
      if (b.flash > 0.02) {
        ctx.globalAlpha = b.flash * 0.75;
        ctx.drawImage(sp.lit.c, -fw / 2, -fh / 2, fw, fh);
      }
      ctx.restore();
    }
    if (this.song) this.drawSongGuide(ctx);
    for (const m of this.fading) this.drawMallet(ctx, m, G.clamp(m.fade, 0, 1));
    for (const m of this.mallets.values()) this.drawMallet(ctx, m, 1);
  }

  /** Pulsing ring + bobbing arrow on the next bar of the song. */
  drawSongGuide(ctx) {
    const s = this.song, bw = this.bw, t = this.app.time;
    const notes = SONGS[s.idx].notes;
    if (s.wait > 0 || s.pos >= notes.length) return;
    const b = this.bars[notes[s.pos]];
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const pop = G.ease.outCubic(this.songPop);
    const e = bw * (0.1 + 0.06 * pulse + 0.25 * pop);
    const r = Math.min(b.w, b.h) * 0.22 + e;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.35 * pulse;
    const gw = b.w + bw * 1.4, gh = b.h + bw * 1.4;
    ctx.drawImage(glowSprite('#ffffff'), b.cx - gw / 2, b.cy - gh / 2, gw, gh);
    ctx.restore();
    ctx.save();
    G.roundRect(ctx, b.x - e, b.y - e, b.w + e * 2, b.h + e * 2, r);
    ctx.lineWidth = Math.max(4.5, bw * 0.13);
    ctx.strokeStyle = `rgba(60,30,10,${0.22 * (1 - pop)})`;
    ctx.stroke();
    ctx.lineWidth = Math.max(2.5, bw * 0.07);
    ctx.strokeStyle = `rgba(255,255,255,${G.clamp(0.7 + 0.3 * pulse - 0.5 * pop, 0, 1)})`;
    ctx.stroke();
    // arrow pointing at the bar's outer end (top end for upright bars, left end when stacked)
    const bob = Math.sin(t * 6) * bw * 0.12;
    const as = G.clamp(bw * 0.42, 12, 34);
    const tipX = this.land ? b.cx : b.x - bw * 0.22 - bob;
    const tipY = this.land ? b.y - bw * 0.22 - bob : b.cy;
    ctx.translate(tipX, tipY);
    if (!this.land) ctx.rotate(-Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-as * 0.62, -as * 0.7);
    ctx.lineTo(-as * 0.24, -as * 0.7);
    ctx.lineTo(-as * 0.24, -as * 1.35);
    ctx.lineTo(as * 0.24, -as * 1.35);
    ctx.lineTo(as * 0.24, -as * 0.7);
    ctx.lineTo(as * 0.62, -as * 0.7);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, as * 0.16);
    ctx.strokeStyle = 'rgba(60,30,10,0.55)';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  /** A mallet: shadow on the bars, wooden stick, glossy head with squash on impact. */
  drawMallet(ctx, m, alpha) {
    const v = this.variant, S = STYLES[v], bw = this.bw;
    const R = G.clamp(bw * 0.4, 10, 40);
    const st = m.st;
    // lift: 0 at impact, springs back to a hover; released mallets rise away
    const hover = R * 0.9;
    let lift = st < 0.2 ? hover * G.ease.outBack(st / 0.2) : hover;
    lift = lift * m.appear + (1 - alpha) * R * 2;
    const squash = st < 0.09 ? 1 - st / 0.09 : 0;
    const hx = m.x, hy = m.y - lift;
    const ang = 0.95 - (st < 0.15 ? 0.25 * (1 - st / 0.15) : 0); // stick tilts on impact
    const len = R * 5.2;
    ctx.save();
    ctx.globalAlpha = alpha * G.clamp(m.appear, 0, 1);
    G.groundShadow(ctx, m.x + R * 0.2, m.y + R * 0.15, R * (1.1 - lift / (R * 6)), R * 0.45, 0.28);
    const ex = hx + Math.cos(ang) * len, ey = hy + Math.sin(ang) * len;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = R * 0.42;
    ctx.beginPath();
    ctx.moveTo(hx + R * 0.1, hy + R * 0.2);
    ctx.lineTo(ex + R * 0.1, ey + R * 0.2);
    ctx.stroke();
    ctx.strokeStyle = S.stick;
    ctx.lineWidth = R * 0.36;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = R * 0.1;
    ctx.beginPath();
    ctx.moveTo(hx - R * 0.08, hy - R * 0.08);
    ctx.lineTo(ex - R * 0.08, ey - R * 0.08);
    ctx.stroke();
    ctx.translate(hx, hy);
    ctx.scale(1 + squash * 0.16, 1 - squash * 0.14);
    G.glossyBall(ctx, 0, 0, R, S.head, { outline: v === 3 ? 1.5 : 0 });
    ctx.restore();
  }

  hud() {
    const s = this.song;
    if (s) {
      const song = SONGS[s.idx];
      return `${this.tr(song.title)} ${Math.min(s.pos, song.notes.length)}/${song.notes.length}`;
    }
    const n = this.app.getStat('notes');
    return `${G.formatNum(n)} ${countLabel(this.app, n, LABEL_ONE, LABEL, RU_FEW)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const S = STYLES[i], cols = COLORS[i];
    ctx.fillStyle = S.bg[1];
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const n = 6, bw = r * 0.17, gap = r * 0.07;
    const total = n * bw + (n - 1) * gap;
    const x0 = x - total / 2;
    const len = (k) => r * (1.12 - k * 0.075);
    ctx.save();
    ctx.strokeStyle = G.mixColor(S.rail[0], S.rail[1], 0.5);
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const sg of [-1, 1]) {
      ctx.moveTo(x0 - bw * 0.5, y + sg * len(0) * NODE);
      ctx.lineTo(x0 + total + bw * 0.5, y + sg * len(n - 1) * NODE);
    }
    ctx.stroke();
    ctx.restore();
    for (let k = 0; k < n; k++) {
      const L = len(k), bx = x0 + k * (bw + gap);
      G.roundRect(ctx, bx, y - L / 2, bw, L, bw * 0.35);
      const col = cols[Math.round((k * 7) / (n - 1))];
      ctx.fillStyle = i === 3 ? G.alpha(col, 0.85) : col;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(bx + bw * 0.18, y - L / 2 + bw * 0.4, bw * 0.22, L - bw * 0.8);
    }
  }
}
