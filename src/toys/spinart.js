// Spin Art: hold a finger on the spinning paper to squeeze paint onto it. The paint is flung
// outward into spirals and splatters; the refresh button slides the finished sheet away.
import { Toy } from './_base.js';
import * as G from '../gfx.js';

// [singular, plural] (Russian: [1, 2-4, 5+]); a plain string when the language doesn't inflect
const LABEL = { en: ['artwork', 'artworks'], vi: 'tác phẩm', es: ['obra', 'obras'], pt: ['obra', 'obras'], fr: ['œuvre', 'œuvres'], de: ['Kunstwerk', 'Kunstwerke'], id: 'karya', it: ['opera', 'opere'], tr: 'eser', ru: ['работа', 'работы', 'работ'] };

/** Picks the right plural form of a LABEL entry for n. */
function countWord(lang, forms, n) {
  const f = forms[lang] ?? forms.en;
  if (typeof f === 'string') return f;
  if (f.length === 3) {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? f[1] : f[2];
  }
  return n === 1 ? f[0] : f[1];
}

// paints: palette, paper: sheet color, rim / base: machine plastics, bg: backdrop.
const STYLES = [
  { paints: ['#ff006e', '#ffbe0b', '#3a86ff', '#8ac926', '#fb5607', '#00d5ff'], paper: '#ffffff', rim: '#2ec4f1', base: '#3a86ff', bg: ['#d8f3ff', '#9fd8f5'] },
  { paints: ['#ff8fb8', '#8fc8ff', '#b9a2e8', '#6fdcd8', '#ffe066', '#ffab76'], paper: '#ffffff', rim: '#ffb3d1', base: '#b8b0ff', bg: ['#fff0f6', '#ffd3e6'] },
  { paints: ['#0096c7', '#00b4d8', '#023e8a', '#48cae4', '#2ec4b6', '#90e0ef'], paper: '#ffffff', rim: '#00b4d8', base: '#0077b6', bg: ['#e0f7ff', '#9fdcf0'] },
  { paints: ['#ff7b00', '#ff006e', '#ffbe0b', '#f15bb5', '#ff4d00', '#ffd166'], paper: '#fffaf2', rim: '#ff9f1c', base: '#ef476f', bg: ['#ffe8d6', '#ffbf94'] },
  { paints: ['#f72585', '#4cc9f0', '#b5179e', '#ffd60a', '#4361ee', '#7cff6b'], paper: '#151a3d', rim: '#7b2cbf', base: '#3c096c', bg: ['#3a2a78', '#140e33'], stars: true },
  { paints: ['#d4af37', '#c9ccd3', '#e8c27a', '#b08d57', '#f5e6a8', '#9ea7b3'], paper: '#1f1f27', rim: '#d4af37', base: '#4a4a55', bg: ['#4b4b58', '#22222b'], shimmer: true },
];
const SPEED_FAST = 3.5;
const SPEED_SLOW = 1.4;
const MAX_DROPS = 220;
const STREAM_W = 0.042; // width of the paint stream hitting the paper, in disc radii
const PAINT_MAX = 1600; // paint canvas size cap (device px)

export class SpinArtToy extends Toy {
  static id = 'spinart';

  constructor(app) {
    super(app);
    this.theta = 0;
    this.omega = SPEED_FAST;
    this.fast = true;
    this.drops = [];
    this.drippers = new Map();
    this.paint = null; // disc-local paint layer (rotates with the paper)
    this.splat = null; // paint flung onto the bowl around the paper (does not rotate)
    this.old = null; // finished sheet while it slides away
    this.painted = 0; // seconds of painting on the current sheet
    this.colorIdx = 0;
    this.shimmer = [];
    this.icons = new Map();
    this.R = 100;
    this.cx = 0;
    this.cy = 0;
    this.hum = app.audio.loop({ source: 'osc', oscType: 'sawtooth', type: 'lowpass', freq: 320, q: 0.7 });
    this.squirt = app.audio.loop({ source: 'noise', type: 'bandpass', freq: 1500, q: 1.6 });
    this.speedBtn = { icon: 'speed', color: '#ff9f1c', onTap: () => this.toggleSpeed() };
    this.buttons = [{ icon: 'refresh', color: '#3cb4e6', onTap: () => this.newPaper() }, this.speedBtn];
  }

  enter() {
    this.drippers.clear();
  }
  exit() {
    this.drippers.clear();
    this.hum.stop();
    this.squirt.stop();
  }
  setVariant() {
    this.machine = null;
    this.paperSpr = null;
    this.app.audio.whoosh(0.5);
  }

  resize(area) {
    const R = Math.max(10, Math.min(area.w, area.h) * 0.42);
    this.R = R;
    this.cx = area.x + area.w / 2;
    this.cy = area.y + area.h / 2;
    const dpr = this.app.dpr;
    const ps = Math.min(PAINT_MAX, Math.ceil(2 * R * dpr));
    if (!this.paint || this.paint.width !== ps) {
      const fresh = !this.paint;
      this.paint = this.rescale(this.paint, ps);
      if (fresh) this.decorateSheet();
    }
    const ss = Math.min(PAINT_MAX, Math.ceil(2.3 * R * dpr));
    if (!this.splat || this.splat.width !== ss) this.splat = this.rescale(this.splat, ss);
    this.machine = null;
    this.paperSpr = null;
    this.gloss = null;
  }

  /** New canvas of the given size holding the old one's picture scaled to fit (keeps paintings on resize). */
  rescale(old, size) {
    const c = G.makeCanvas(size, size);
    const g = c.getContext('2d');
    if (old) g.drawImage(old, 0, 0, size, size);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    c.g = g;
    return c;
  }

  /** Galaxy paper comes with a sprinkling of printed stars. */
  decorateSheet() {
    if (!STYLES[this.variant].stars) return;
    for (let i = 0; i < 70; i++) {
      const a = G.rand(G.TAU), r = Math.sqrt(Math.random()) * 0.95;
      this.stampDot(Math.cos(a) * r, Math.sin(a) * r, G.rand(0.002, 0.007), G.pick(['#ffffff', '#cfd8ff', '#ffe9a8']));
    }
  }

  // ---------------------------------------------------------------- controls
  toggleSpeed() {
    this.fast = !this.fast;
    this.speedBtn.color = this.fast ? '#ff9f1c' : '#36c4a0';
    this.app.audio.whoosh(0.35, this.fast);
  }

  newPaper() {
    const app = this.app;
    if (this.painted > 0.6) {
      app.stat('artworks');
      app.addProgress(0.3, this.cx, this.cy);
      app.audio.chime(1046.5, 0.5);
      app.fx.burst(this.cx, this.cy - this.R * 0.2, { count: 26, colors: STYLES[this.variant].paints, shape: ['confetti', 'circle'], speed: [180, 460], size: [3, 7], gravity: 650, life: [0.7, 1.2] });
    }
    app.audio.whoosh(0.9);
    app.haptic(15);
    this.old = { c: this.paint, theta: this.theta, t: 0, dir: Math.random() < 0.5 ? -1 : 1 };
    this.paint = this.rescale(null, this.paint.width);
    this.decorateSheet();
    this.drops.length = 0;
    this.shimmer.length = 0;
    this.painted = 0;
    for (const d of this.drippers.values()) d.lx = null;
    // the bowl gets wiped a little between sheets
    const g = this.splat.g;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, this.splat.width, this.splat.height);
    g.restore();
  }

  keyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      this.newPaper();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- input
  pointerDown(p) {
    const st = STYLES[this.variant];
    this.colorIdx = (this.colorIdx + 1) % st.paints.length;
    const d = { id: p.id, x: p.x, y: p.y, lx: null, ly: null, base: st.paints[this.colorIdx], color: '', colorT: 0.6, jitterT: 0, acc: 0, tilt: 0.55, t: 0, splashed: false };
    d.color = d.base;
    d.tilt = this.tiltFor(p.x);
    this.drippers.set(p.id, d);
  }
  pointerMove(p) {
    const d = this.drippers.get(p.id);
    if (!d) return;
    d.x = p.x;
    d.y = p.y;
  }
  pointerUp(p) {
    this.drippers.delete(p.id);
  }

  tiltFor(x) {
    // lean the bottle away from the nearest screen edge so it stays visible
    return x > this.app.w - this.R * 0.7 ? -0.55 : 0.55;
  }

  // ---------------------------------------------------------------- paint
  stampLine(x0, y0, x1, y1, w, color) {
    const c = this.paint, g = c.g, k = c.width / 2;
    g.strokeStyle = color;
    g.lineWidth = Math.max(0.6, w * k);
    g.beginPath();
    g.moveTo(k + x0 * k, k + y0 * k);
    g.lineTo(k + x1 * k, k + y1 * k);
    g.stroke();
  }
  stampDot(x, y, r, color) {
    const c = this.paint, g = c.g, k = c.width / 2;
    g.fillStyle = color;
    g.beginPath();
    g.arc(k + x * k, k + y * k, Math.max(0.5, r * k), 0, G.TAU);
    g.fill();
  }
  /** Paint that leaves the paper lands on the bowl around it (screen-fixed angle). */
  splatBowl(localAng, color, m) {
    const c = this.splat, g = c.g, k = c.width / 2.3;
    const a = localAng + this.theta;
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const r = G.rand(1.015, 1.06), aa = a + G.rand(0, 0.12);
      const s = G.rand(0.006, 0.016) * (0.6 + m);
      g.save();
      g.translate(c.width / 2 + Math.cos(aa) * r * k, c.height / 2 + Math.sin(aa) * r * k);
      g.rotate(aa + Math.PI / 2);
      g.beginPath();
      g.ellipse(0, 0, s * 1.8 * k, s * k, 0, 0, G.TAU);
      g.fill();
      g.restore();
    }
  }

  spawnDrop(d, lx, ly) {
    if (this.drops.length >= MAX_DROPS) return;
    const r = Math.hypot(lx, ly) || 1e-4;
    const w = this.omega;
    // a mix of fat blobs (thick fingers), regular drops and fine fast spray
    const roll = Math.random();
    const kind = roll < 0.12 ? 2 : roll < 0.4 ? 0 : 1;
    const m = kind === 2 ? G.rand(1.5, 2.4) : kind === 0 ? G.rand(0.08, 0.3) : G.rand(0.45, 1.2);
    const speed = kind === 2 ? 0.6 : kind === 0 ? 1.6 : 1;
    // outward push grows with the radius (centrifugal) + a slight lag against the spin
    const vr = (0.08 + 0.85 * r) * (w / SPEED_FAST) * G.rand(0.5, 1.35) * speed;
    const vt = -0.22 * w * r * G.rand(0.6, 1.2);
    const a = Math.atan2(ly, lx) + G.rand(-0.35, 0.35);
    const ux = Math.cos(a), uy = Math.sin(a);
    // spread the drops around the stream so they leave as a fan, not a single line
    const ja = G.rand(G.TAU), jr = G.rand(0, 0.024);
    this.drops.push({
      x: lx + Math.cos(ja) * jr, y: ly + Math.sin(ja) * jr,
      vx: ux * vr - uy * vt, vy: uy * vr + ux * vt,
      m, color: d.color, t: 0, ph: G.rand(G.TAU), k: G.rand(0.7, 1.4),
    });
  }

  update(dt) {
    const app = this.app, st = STYLES[this.variant];
    const target = this.fast ? SPEED_FAST : SPEED_SLOW;
    this.omega = G.damp(this.omega, target, 2.2, dt);
    this.theta = (this.theta + this.omega * dt) % (G.TAU * 1000);
    const R = this.R, w = this.omega;
    const cosT = Math.cos(-this.theta), sinT = Math.sin(-this.theta);

    // drippers: the stream traces rings on the turning paper and throws droplets outward
    let painting = false;
    for (const d of this.drippers.values()) {
      d.t += dt;
      d.tilt = G.damp(d.tilt, this.tiltFor(d.x), 8, dt);
      d.colorT -= dt;
      if (d.colorT <= 0) {
        d.colorT = 0.6;
        const pal = st.paints;
        d.base = pal[(pal.indexOf(d.base) + 1) % pal.length] || pal[0];
      }
      d.jitterT -= dt;
      if (d.jitterT <= 0) {
        d.jitterT = 0.12;
        d.color = G.shade(d.base, st.shimmer ? G.rand(-0.22, 0.25) : G.rand(-0.07, 0.07));
      }
      const dx = (d.x - this.cx) / R, dy = (d.y - this.cy) / R;
      if (Math.hypot(dx, dy) > 0.96) {
        d.lx = null;
        continue;
      }
      painting = true;
      const lx = dx * cosT - dy * sinT, ly = dx * sinT + dy * cosT;
      const sw = STREAM_W * (0.85 + 0.25 * Math.sin(d.t * 11));
      if (d.lx === null) {
        this.stampDot(lx, ly, STREAM_W * 1.1, d.color);
        if (!d.splashed) {
          // first touch: a little splash ring of droplets
          d.splashed = true;
          for (let i = 0; i < 7; i++) this.spawnDrop(d, lx, ly);
          app.audio.squish(1.5, 0.35, G.clamp((d.x / app.w - 0.5) * 1.2, -0.8, 0.8));
        }
      } else this.stampLine(d.lx, d.ly, lx, ly, sw, d.color);
      d.lx = lx;
      d.ly = ly;
      d.acc += dt * 30;
      while (d.acc >= 1) {
        d.acc -= 1;
        this.spawnDrop(d, lx, ly);
      }
      if (st.shimmer && Math.random() < dt * 16) {
        // glints scattered along where the metallic paint is flowing
        const gr = Math.min(0.95, Math.hypot(lx, ly) + G.rand(0, 0.5)), ga = Math.atan2(ly, lx) + G.rand(-0.5, 0.5);
        this.shimmer.push({ x: Math.cos(ga) * gr, y: Math.sin(ga) * gr, ph: G.rand(G.TAU), sp: G.rand(1.5, 3.5) });
        if (this.shimmer.length > 160) this.shimmer.shift();
      }
    }
    if (painting) {
      this.painted += dt;
      const first = this.drippers.values().next().value;
      app.addProgress(0.25 * dt, first ? first.x : this.cx, first ? first.y : this.cy);
    }

    // droplets in the paper's rotating frame: centrifugal + Coriolis + paint drag
    const w2 = w * w, CO = 0.55, K = 2.4;
    const stick = 1.25; // below this outward pull the paint just sits there
    const list = this.drops;
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.t += dt;
      const x0 = p.x, y0 = p.y;
      const r0 = Math.hypot(x0, y0);
      const pull = w2 * r0 > stick ? w2 : 0;
      // each drop has its own drag (p.k) so the streaks don't come out perfectly parallel
      const ax = pull * x0 + 2 * w * p.vy * CO - K * p.k * p.vx;
      const ay = pull * y0 - 2 * w * p.vx * CO - K * p.k * p.vy;
      p.vx += ax * dt;
      p.vy += ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const ds = Math.hypot(p.x - x0, p.y - y0);
      p.m -= ds * 1.05 + dt * 0.3;
      const width = (0.006 + 0.036 * Math.sqrt(Math.max(0, p.m))) * (0.85 + 0.3 * Math.sin(p.t * 13 + p.ph));
      this.stampLine(x0, y0, p.x, p.y, width, p.color);
      const r = Math.hypot(p.x, p.y);
      if (r > 0.975) {
        // flung off the edge: a bead at the rim and a splat on the bowl
        this.stampDot((p.x / r) * 0.975, (p.y / r) * 0.975, width * 0.8, p.color);
        this.splatBowl(Math.atan2(p.y, p.x), p.color, Math.max(0, p.m));
        continue;
      }
      if (p.m < 0.05 || p.t > 2.5) {
        this.stampDot(p.x, p.y, width * 0.95, p.color);
        continue;
      }
      // fast drops sometimes shed a tiny satellite splatter
      const sp = ds / Math.max(1e-4, dt);
      if (sp > 0.8 && p.m > 0.3 && Math.random() < dt * 7 && list.length < MAX_DROPS) {
        const a = Math.atan2(p.vy, p.vx) + G.rand(-0.7, 0.7), v = sp * G.rand(0.8, 1.4);
        list.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, m: p.m * 0.2, color: p.color, t: 0, ph: G.rand(G.TAU), k: G.rand(0.6, 1.2) });
        p.m *= 0.85;
      }
      list[j++] = p;
    }
    list.length = j;

    if (this.old) {
      this.old.t += dt / 0.6;
      this.old.theta += this.omega * dt * (1 - this.old.t);
      if (this.old.t >= 1) this.old = null;
    }

    // motor hum follows the spin speed; the squirt hiss plays while paint flows
    this.hum.set({ vol: 0.04, oscFreq: 46 + w * 9, freq: 220 + w * 55 });
    this.squirt.set({ vol: painting ? 0.06 : 0, freq: 1300 + 350 * Math.sin(app.time * 9) });
  }

  // ---------------------------------------------------------------- drawing
  renderMachine() {
    const R = this.R, dpr = this.app.dpr, st = STYLES[this.variant];
    const half = R * 1.45, size = half * 2;
    const c = G.makeCanvas(size * dpr, size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(half, half);
    const ro = R * 1.2, ri = R * 1.065;
    G.groundShadow(g, 0, R * 0.2, R * 1.32, R * 1.18, 0.35);
    // side wall gives the machine some height
    G.circle(g, 0, R * 0.085, ro);
    g.fillStyle = G.shade(st.base, -0.38);
    g.fill();
    // glossy plastic rim, shaded like a rounded tube (dark edges, light crest)
    const rg = g.createRadialGradient(0, 0, ri, 0, 0, ro);
    rg.addColorStop(0, G.shade(st.rim, -0.32));
    rg.addColorStop(0.35, G.shade(st.rim, 0.12));
    rg.addColorStop(0.55, G.shade(st.rim, 0.32));
    rg.addColorStop(1, G.shade(st.rim, -0.22));
    G.circle(g, 0, 0, ro);
    g.fillStyle = rg;
    g.fill();
    const lg = g.createLinearGradient(0, -ro, 0, ro);
    lg.addColorStop(0, 'rgba(255,255,255,0.3)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = lg;
    g.fill();
    g.lineCap = 'round';
    g.lineWidth = R * 0.028;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(0, 0, (ri + ro) * 0.5 + R * 0.012, Math.PI * 1.1, Math.PI * 1.45);
    g.stroke();
    g.lineWidth = R * 0.014;
    g.beginPath();
    g.arc(0, 0, (ri + ro) * 0.5 + R * 0.012, Math.PI * 1.52, Math.PI * 1.6);
    g.stroke();
    // colorful knobs around the rim
    const pal = st.paints;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * G.TAU + Math.PI / 8;
      const kx = Math.cos(a) * (ri + ro) * 0.5, ky = Math.sin(a) * (ri + ro) * 0.5;
      G.circle(g, kx, ky + R * 0.012, R * 0.045);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fill();
      G.glossyBall(g, kx, ky, R * 0.042, pal[i % pal.length], { highlight: 0.65, shadowAmt: 0.3 });
    }
    // bowl the paper spins in
    const bg = g.createRadialGradient(0, -R * 0.25, R * 0.5, 0, 0, ri);
    bg.addColorStop(0, G.shade(st.base, 0.1));
    bg.addColorStop(0.85, G.shade(st.base, -0.12));
    bg.addColorStop(1, G.shade(st.base, -0.4));
    G.circle(g, 0, 0, ri);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = R * 0.012;
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.stroke();
    this.machine = { c, half };
  }

  renderPaper() {
    const R = this.R, dpr = this.app.dpr, st = STYLES[this.variant];
    const half = R * 1.12, size = half * 2;
    const c = G.makeCanvas(size * dpr, size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(half, half);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = R * 0.05 * dpr;
    g.shadowOffsetY = R * 0.025 * dpr;
    G.circle(g, 0, 0, R);
    g.fillStyle = st.paper;
    g.fill();
    g.restore();
    const pg = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R);
    pg.addColorStop(0, G.shade(st.paper, 0.06));
    pg.addColorStop(0.75, st.paper);
    pg.addColorStop(1, G.shade(st.paper, -0.12));
    G.circle(g, 0, 0, R);
    g.fillStyle = pg;
    g.fill();
    this.paperSpr = { c, half };

    // gloss drawn over the paint: soft window light + bright edge
    const gc = G.makeCanvas(size * dpr, size * dpr);
    const gg = gc.getContext('2d');
    gg.scale(dpr, dpr);
    gg.translate(half, half);
    const hl = gg.createRadialGradient(-R * 0.4, -R * 0.45, 0, -R * 0.4, -R * 0.45, R * 0.75);
    hl.addColorStop(0, 'rgba(255,255,255,0.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    G.circle(gg, 0, 0, R);
    gg.fillStyle = hl;
    gg.fill();
    gg.lineWidth = R * 0.012;
    gg.strokeStyle = 'rgba(255,255,255,0.5)';
    gg.beginPath();
    gg.arc(0, 0, R * 0.99, Math.PI * 1.05, Math.PI * 1.6);
    gg.stroke();
    this.gloss = { c: gc, half };
  }

  drawSheet(ctx, paint, theta, motion) {
    const R = this.R, ps = this.paperSpr;
    ctx.drawImage(ps.c, -ps.half, -ps.half, ps.half * 2, ps.half * 2);
    ctx.save();
    ctx.rotate(theta);
    if (motion > 0.01) {
      // cheap motion blur: a faint copy trailing behind the spin
      ctx.save();
      ctx.globalAlpha = Math.min(0.35, motion);
      ctx.rotate(-this.omega * 0.014);
      ctx.drawImage(paint, -R, -R, R * 2, R * 2);
      ctx.restore();
    }
    ctx.drawImage(paint, -R, -R, R * 2, R * 2);
    const st = STYLES[this.variant];
    if (motion > 0.01) {
      // motion streaks: faint tapered arcs riding around with the spin
      const k = Math.min(1, motion * 3);
      const dark = G.parseColor(st.paper)[0] < 128;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const r = R * (0.36 + i * 0.24), a0 = i * 2.2, len = 0.18 + 0.12 * k;
        for (let s = 0; s < 4; s++) {
          ctx.strokeStyle = dark ? `rgba(255,255,255,${(0.14 * k * (1 - s / 4)).toFixed(3)})` : `rgba(90,110,140,${(0.07 * k * (1 - s / 4)).toFixed(3)})`;
          ctx.lineWidth = R * 0.011 * (1 - s * 0.18);
          ctx.beginPath();
          ctx.arc(0, 0, r, a0 - (s + 1) * len, a0 - s * len);
          ctx.stroke();
        }
      }
    }
    // clips holding the sheet (they make the spin readable on a blank sheet)
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * G.TAU) / 3);
      ctx.translate(R * 0.955, 0);
      G.roundRect(ctx, -R * 0.045, -R * 0.06, R * 0.09, R * 0.12, R * 0.025);
      ctx.fillStyle = G.shade(st.rim, -0.15);
      ctx.fill();
      G.roundRect(ctx, -R * 0.03, -R * 0.045, R * 0.04, R * 0.09, R * 0.015);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawBottle(ctx, x, y, color, ang, sq) {
    const S = G.clamp(this.R * 0.62, 56, 150);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // nozzle tip sits on the finger; the bottle rises away from it
    G.groundShadow(ctx, S * 0.12, -S * 0.5, S * 0.3, S * 0.5, 0.18);
    ctx.beginPath();
    ctx.moveTo(-S * 0.025, -S * 0.02);
    ctx.lineTo(S * 0.025, -S * 0.02);
    ctx.lineTo(S * 0.06, -S * 0.2);
    ctx.lineTo(-S * 0.06, -S * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#f4f1ea';
    ctx.fill();
    ctx.fillStyle = color;
    G.circle(ctx, 0, -S * 0.01, S * 0.035);
    ctx.fill();
    // ribbed cap
    const cap = G.shade(color, -0.22);
    G.roundRect(ctx, -S * 0.13, -S * 0.33, S * 0.26, S * 0.14, S * 0.035);
    ctx.fillStyle = cap;
    ctx.fill();
    ctx.strokeStyle = G.shade(color, -0.4, 0.6);
    ctx.lineWidth = Math.max(1, S * 0.012);
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * S * 0.045, -S * 0.31);
      ctx.lineTo(i * S * 0.045, -S * 0.21);
    }
    ctx.stroke();
    // squeezable body
    const bw = S * 0.22 * (1 - 0.07 * sq);
    const top = -S * 0.33, bot = -S * 0.98;
    ctx.beginPath();
    ctx.moveTo(-S * 0.11, top);
    ctx.quadraticCurveTo(-bw, top - S * 0.02, -bw, top - S * 0.14);
    ctx.lineTo(-bw, bot + S * 0.06);
    ctx.quadraticCurveTo(-bw, bot, -bw + S * 0.06, bot);
    ctx.lineTo(bw - S * 0.06, bot);
    ctx.quadraticCurveTo(bw, bot, bw, bot + S * 0.06);
    ctx.lineTo(bw, top - S * 0.14);
    ctx.quadraticCurveTo(bw, top - S * 0.02, S * 0.11, top);
    ctx.closePath();
    const bg = ctx.createLinearGradient(-bw, 0, bw, 0);
    bg.addColorStop(0, G.shade(color, 0.32));
    bg.addColorStop(0.45, color);
    bg.addColorStop(1, G.shade(color, -0.32));
    ctx.fillStyle = bg;
    ctx.fill();
    // drips down the shoulder
    ctx.fillStyle = G.shade(color, -0.12);
    ctx.beginPath();
    ctx.moveTo(-bw * 0.7, top - S * 0.1);
    ctx.lineTo(-bw * 0.7, top - S * 0.24);
    ctx.arc(-bw * 0.62, top - S * 0.24, bw * 0.08, Math.PI, 0, true);
    ctx.lineTo(-bw * 0.54, top - S * 0.1);
    ctx.moveTo(bw * 0.15, top - S * 0.1);
    ctx.lineTo(bw * 0.15, top - S * 0.17);
    ctx.arc(bw * 0.24, top - S * 0.17, bw * 0.09, Math.PI, 0, true);
    ctx.lineTo(bw * 0.33, top - S * 0.1);
    ctx.fill();
    // label + gloss
    G.roundRect(ctx, -bw * 0.78, -S * 0.72, bw * 1.56, S * 0.2, S * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    G.drawIcon(ctx, 'drop', 0, -S * 0.62, S * 0.15, color);
    G.roundRect(ctx, -bw * 0.72, -S * 0.94, bw * 0.28, S * 0.5, bw * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    const app = this.app, st = STYLES[this.variant], t = app.time;
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1]);
    if (!this.machine) this.renderMachine();
    if (!this.paperSpr) this.renderPaper();
    const { cx, cy, R } = this;
    const m = this.machine;
    ctx.drawImage(m.c, cx - m.half, cy - m.half, m.half * 2, m.half * 2);
    ctx.drawImage(this.splat, cx - R * 1.15, cy - R * 1.15, R * 2.3, R * 2.3); // spans 2.3 R

    ctx.save();
    ctx.translate(cx, cy);
    this.drawSheet(ctx, this.paint, this.theta, (this.omega - 1) * 0.12);
    if (st.shimmer && this.shimmer.length) {
      // glints on the metallic paint, turning with the paper
      ctx.save();
      ctx.rotate(this.theta);
      ctx.fillStyle = '#fffbe8';
      for (const s of this.shimmer) {
        const a = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 4);
        if (a < 0.05) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        G.softStarPath(ctx, s.x * R, s.y * R, 4, R * 0.045 * (0.4 + a), R * 0.008, 0);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // center pin
    G.glossyBall(ctx, 0, 0, R * 0.075, st.rim, { highlight: 0.6 });
    ctx.save();
    ctx.rotate(this.theta);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = R * 0.014;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.045, 0, Math.PI * 1.1);
    ctx.stroke();
    ctx.restore();
    const gl = this.gloss;
    ctx.drawImage(gl.c, -gl.half, -gl.half, gl.half * 2, gl.half * 2);

    // the finished sheet sliding off the machine
    if (this.old) {
      const k = G.ease.inCubic(G.clamp(this.old.t, 0, 1));
      ctx.save();
      ctx.translate(this.old.dir * k * (app.w * 0.6 + R * 1.3), -k * R * 0.35 - Math.sin(k * Math.PI) * R * 0.08);
      const s = 1 + 0.06 * Math.min(1, this.old.t * 4);
      ctx.scale(s, s);
      this.drawSheet(ctx, this.old.c, this.old.theta, 0);
      ctx.restore();
    }
    ctx.restore();

    for (const d of this.drippers.values()) {
      const inside = d.lx !== null;
      this.drawBottle(ctx, d.x, d.y, d.base, d.tilt, inside ? 0.5 + 0.5 * Math.sin(t * 16) : 0);
    }
  }

  hud() {
    const n = this.app.getStat('artworks');
    return `${G.formatNum(n)} ${countWord(this.app.lang, LABEL, n)}`;
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
      g.translate(r, r);
      G.circle(g, 0, 0, r);
      g.fillStyle = st.rim;
      g.fill();
      const pr = r * 0.8;
      G.circle(g, 0, 0, pr);
      g.fillStyle = st.paper;
      g.fill();
      g.lineCap = 'round';
      // spiral arms in the palette
      st.paints.forEach((col, k) => {
        const a0 = (k / st.paints.length) * G.TAU;
        g.strokeStyle = col;
        g.lineWidth = r * 0.13;
        g.beginPath();
        for (let s = 0; s <= 8; s++) {
          const f = s / 8, rr = pr * (0.12 + f * 0.8), a = a0 + f * 1.6;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          s ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.stroke();
        g.fillStyle = col;
        G.circle(g, Math.cos(a0 + 1.6) * pr * 0.92, Math.sin(a0 + 1.6) * pr * 0.92, r * 0.07);
        g.fill();
      });
      G.circle(g, 0, 0, r * 0.12);
      g.fillStyle = '#ffffff';
      g.fill();
      ic = { c, S };
      this.icons.set(key, ic);
    }
    ctx.drawImage(ic.c, x - r, y - r, ic.S, ic.S);
  }
}
