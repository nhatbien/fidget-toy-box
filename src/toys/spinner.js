// Fidget Spinner: flick anywhere to spin it, rest a finger on it to brake. Chase your best RPM.
import { Toy } from './_base.js';
import * as G from '../gfx.js';
import { Particles } from '../fx.js';

const TAU = G.TAU;
const MAX_SPIN = 150; // rad/s
const LIGHT = Math.atan2(-0.78, -0.62); // direction toward the key light (top-left), screen space

/**
 * Body geometry per style in units of the spinner radius R: n lobes whose centers sit at distance d,
 * lobe radius rl, and the radius rf of the concave fillets that blend neighbouring lobes together.
 */
const STYLES = [
  { n: 3, d: 0.6, rl: 0.37, rf: 0.27, color: '#18c6c6', bg: ['#e0fbf7', '#94dcd6'] },
  { n: 3, d: 0.6, rl: 0.37, rf: 0.27, color: '#ff5fa2', bg: ['#ffe9f2', '#ffb0cf'], finish: 'pearl' },
  { n: 3, d: 0.6, rl: 0.37, rf: 0.27, color: '#6a4cff', bg: ['#ebe7ff', '#ab9df0'], finish: 'galaxy' },
  { n: 4, d: 0.62, rl: 0.33, rf: 0.14, color: '#f5b700', bg: ['#fff6d8', '#f9d27c'], finish: 'gold' },
  { n: 2, d: 0.56, rl: 0.42, rf: 1.2, color: '#ff6b35', bg: ['#ffeadc', '#ffaf85'], finish: 'fire' },
  { n: 5, d: 0.66, rl: 0.29, rf: 0.12, color: '#3ddc84', bg: ['#eafcf2', '#b4e9cb'], finish: 'rainbow', lobes: ['#ff4d6d', '#ffb703', '#3ddc84', '#3a86ff', '#9b5de5'] },
];
const ICON_TURN = [-Math.PI / 2, -Math.PI / 2, -Math.PI / 2, -Math.PI / 4, -Math.PI / 4, -Math.PI / 2];
const SPARKS = {
  fire: { colors: ['#ffd23f', '#ff9f1c', '#fff3b0', '#ff6b35'], shape: 'spark', gravity: 320 },
  galaxy: { colors: ['#ffffff', '#d7ccff', '#9fe3ff'], shape: 'sparkle', gravity: 0 },
  rainbow: { colors: G.RAINBOW, shape: 'circle', gravity: 160 },
};
const RPM_LABEL = { en: 'RPM', vi: 'RPM', es: 'RPM', pt: 'RPM', fr: 'tr/min', de: 'U/min', id: 'RPM', it: 'giri/min', tr: 'dev/dk', ru: 'об/мин' };
const BEST = { en: 'Best', vi: 'Kỷ lục', es: 'Récord', pt: 'Recorde', fr: 'Record', de: 'Rekord', id: 'Terbaik', it: 'Record', tr: 'Rekor', ru: 'Рекорд' };
const NEW_BEST = { en: 'New best!', vi: 'Kỷ lục mới!', es: '¡Nuevo récord!', pt: 'Novo recorde!', fr: 'Nouveau record !', de: 'Neuer Rekord!', id: 'Rekor baru!', it: 'Nuovo record!', tr: 'Yeni rekor!', ru: 'Новый рекорд!' };
const SEP = { en: ',', vi: '.', es: '.', pt: '.', fr: ' ', de: '.', id: '.', it: '.', tr: '.', ru: ' ' };

/** 1,234 style grouping with the separator of the current language. */
function group(n, lang) {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, SEP[lang] ?? ',');
}
const smooth = (a, b, v) => {
  const t = G.clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Slow drags turn the spinner 1:1, quick flicks are amplified up to 4×. */
const flickGain = (fingerSpeed) => 1 + 3 * smooth(2, 11, fingerSpeed);
/** Small deterministic PRNG so decorations look the same after every rebuild. */
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

/** Solves the fillet circles; also returns the bearing (rb) and center cap (rc) radii. */
function geometry(st) {
  const half = Math.PI / st.n, reach = st.rl + st.rf;
  const f = st.d * Math.cos(half) + Math.sqrt(Math.max(0, reach * reach - (st.d * Math.sin(half)) ** 2));
  return { n: st.n, d: st.d, rl: st.rl, rf: st.rf, f, neck: f - st.rf, rb: st.rl * 0.6, rc: 0.25 };
}

/**
 * The outline as a loop of arcs centered at 0,0 and scaled by R: each lobe's outer arc (convex),
 * then the concave fillet arc that is tangent to it and to the next lobe.
 */
function outlineArcs(geo, R) {
  const { n, d, rl, rf, f } = geo;
  const step = TAU / n, arcs = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const lx = Math.cos(a) * d * R, ly = Math.sin(a) * d * R;
    const px = Math.cos(a - step / 2) * f * R, py = Math.sin(a - step / 2) * f * R;
    const nx = Math.cos(a + step / 2) * f * R, ny = Math.sin(a + step / 2) * f * R;
    const qx = Math.cos(a + step) * d * R, qy = Math.sin(a + step) * d * R;
    arcs.push({ x: lx, y: ly, r: rl * R, a0: Math.atan2(py - ly, px - lx), a1: Math.atan2(ny - ly, nx - lx), ccw: false });
    arcs.push({ x: nx, y: ny, r: rf * R, a0: Math.atan2(ly - ny, lx - nx), a1: Math.atan2(qy - ny, qx - nx), ccw: true });
  }
  return arcs;
}
function bodyPath(p, geo, R) {
  const arcs = outlineArcs(geo, R), s = arcs[0];
  p.moveTo(s.x + Math.cos(s.a0) * s.r, s.y + Math.sin(s.a0) * s.r);
  for (const c of arcs) p.arc(c.x, c.y, c.r, c.a0, c.a1, c.ccw);
  p.closePath();
}
/** Body outline inside a big rectangle: filled even-odd it covers everything around the body. */
function framePath(geo, R) {
  const p = new Path2D();
  p.rect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
  bodyPath(p, geo, R);
  return p;
}

/** Fill style of the body (dark < 0 gives the matching outline tone). */
function bodyPaint(g, st, R, dark = 0) {
  const tone = (c) => (dark ? G.shade(c, dark) : c);
  const radial = (stops) => {
    const rg = g.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
    stops.forEach(([o, c]) => rg.addColorStop(o, tone(c)));
    return rg;
  };
  switch (st.finish) {
    case 'rainbow': {
      const cols = st.lobes, n = cols.length;
      if (typeof g.createConicGradient !== 'function') return tone(cols[0]);
      const cg = g.createConicGradient(-Math.PI / n, 0, 0);
      for (let i = 0; i < n; i++) {
        cg.addColorStop(i / n, G.mixColor(tone(cols[(i + n - 1) % n]), tone(cols[i]), 0.5));
        cg.addColorStop((i + 0.25) / n, tone(cols[i]));
        cg.addColorStop((i + 0.75) / n, tone(cols[i]));
      }
      cg.addColorStop(1, G.mixColor(tone(cols[n - 1]), tone(cols[0]), 0.5));
      return cg;
    }
    case 'galaxy': return radial([[0, '#8f74ff'], [0.55, '#4b2fd1'], [1, '#24136b']]);
    case 'gold': return radial([[0, '#ffe680'], [0.5, '#f5b700'], [1, '#c98a00']]);
    case 'fire': return radial([[0, '#ffe14d'], [0.38, '#ffa62b'], [0.72, '#ff6b35'], [1, '#e0303a']]);
    default: return tone(st.color);
  }
}

/** Tapered flame tongue along a cubic bezier: round at the base, pointed at the tip. */
function tonguePath(g, p0, c1, c2, p3, w) {
  const steps = 16, left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1];
    const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0]);
    const dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1]);
    const len = Math.hypot(dx, dy) || 1;
    const hw = w * Math.pow(u, 0.75) * Math.min(1, 0.5 + t * 5);
    left.push([x - (dy / len) * hw, y + (dx / len) * hw]);
    right.push([x + (dy / len) * hw, y - (dx / len) * hw]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (const q of left) g.lineTo(q[0], q[1]);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
}

/** Material decorations painted inside the (clipped) body; they rotate with it. */
function paintFinish(g, st, geo, R) {
  const rnd = rng(11 + geo.n);
  switch (st.finish) {
    case 'pearl': {
      const sh = g.createLinearGradient(-R, -R, R, R);
      sh.addColorStop(0, 'rgba(255,236,246,0.32)');
      sh.addColorStop(0.45, 'rgba(255,255,255,0)');
      sh.addColorStop(0.75, 'rgba(255,120,190,0.12)');
      sh.addColorStop(1, 'rgba(190,110,255,0.26)');
      g.fillStyle = sh;
      g.fillRect(-R, -R, R * 2, R * 2);
      for (let k = 0; k < 70; k++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R;
        g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.35})`;
        G.circle(g, Math.cos(a) * rr, Math.sin(a) * rr, R * (0.004 + rnd() * 0.007));
        g.fill();
      }
      break;
    }
    case 'galaxy': {
      const neb = ['#ff4fd8', '#3fd0ff', '#b06bff'];
      for (let k = 0; k < 7; k++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.85 * R, s = R * (0.2 + rnd() * 0.24);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        const ng = g.createRadialGradient(x, y, 0, x, y, s);
        ng.addColorStop(0, G.alpha(neb[k % 3], 0.45));
        ng.addColorStop(1, G.alpha(neb[k % 3], 0));
        g.fillStyle = ng;
        g.fillRect(x - s, y - s, s * 2, s * 2);
      }
      for (let k = 0; k < 110; k++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R;
        g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.65})`;
        G.circle(g, Math.cos(a) * rr, Math.sin(a) * rr, R * (0.003 + rnd() * 0.009));
        g.fill();
      }
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 10; k++) {
        const a = rnd() * TAU, rr = (0.3 + rnd() * 0.65) * R, s = R * (0.018 + rnd() * 0.026);
        g.beginPath();
        G.softStarPath(g, Math.cos(a) * rr, Math.sin(a) * rr, 4, s, s * 0.25, 0);
        g.fill();
      }
      break;
    }
    case 'gold': {
      g.lineWidth = Math.max(0.5, R * 0.004);
      for (let r = R * 0.28; r < R; r += R * 0.01) {
        g.strokeStyle = rnd() < 0.6 ? `rgba(255,250,220,${0.06 + rnd() * 0.1})` : `rgba(150,90,0,${0.02 + rnd() * 0.035})`;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.stroke();
      }
      break;
    }
    case 'fire': {
      // hot-rod flames streaming from the hub out to each tip, hugging the bearings
      const licks = [
        [[0.1, 0.2], [0.42, 0.47], [0.84, 0.42], [0.99, 0.03], 0.075],
        [[0.16, 0.11], [0.36, 0.3], [0.6, 0.41], [0.76, 0.33], 0.05],
      ];
      for (let i = 0; i < geo.n; i++) {
        g.save();
        g.rotate((i * TAU) / geo.n);
        for (const s of [1, -1]) {
          for (const [p0, c1, c2, p3, w] of licks) {
            const P = (q) => [q[0] * R, q[1] * R * s];
            for (const [col, k] of [['rgba(200,20,30,0.55)', 1.35], ['#ffcf3a', 1], ['rgba(255,246,200,0.95)', 0.45]]) {
              tonguePath(g, P(p0), P(c1), P(c2), P(p3), w * R * k);
              g.fillStyle = col;
              g.fill();
            }
          }
        }
        g.restore();
      }
      for (let k = 0; k < 40; k++) {
        const a = rnd() * TAU, rr = (0.3 + rnd() * 0.7) * R;
        g.fillStyle = `rgba(255,${200 + ((rnd() * 55) | 0)},120,${0.35 + rnd() * 0.5})`;
        G.circle(g, Math.cos(a) * rr, Math.sin(a) * rr, R * (0.004 + rnd() * 0.008));
        g.fill();
      }
      break;
    }
    case 'rainbow':
      if (typeof g.createConicGradient !== 'function') {
        // no conic gradients: paint each lobe's wedge in its own color
        const n = geo.n;
        for (let i = 0; i < n; i++) {
          const a = (i * TAU) / n;
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, R * 1.2, a - Math.PI / n, a + Math.PI / n);
          g.closePath();
          g.fillStyle = st.lobes[i % st.lobes.length];
          g.fill();
        }
      }
      break;
    default:
  }
}

/** Color of the soft rounded-edge falloff for a style. */
function edgeTone(st) {
  switch (st.finish) {
    case 'rainbow': return 'rgba(70,20,90,0.5)';
    case 'galaxy': return 'rgba(8,0,40,0.7)';
    case 'fire': return 'rgba(150,20,0,0.55)';
    case 'pearl': return 'rgba(150,20,80,0.42)';
    case 'gold': return 'rgba(140,80,0,0.5)';
    default: return G.shade(st.color, -0.5, 0.5);
  }
}

/** Paints the whole static body (outline, fill, finish, rounded edge, sockets) centered at 0,0. */
function paintBody(g, st, geo, R, path, frame, dpr) {
  g.lineJoin = 'round';
  g.lineWidth = R * 0.04;
  g.strokeStyle = bodyPaint(g, st, R, -0.38);
  g.stroke(path);
  g.fillStyle = bodyPaint(g, st, R);
  g.fill(path);
  g.save();
  g.clip(path);
  paintFinish(g, st, geo, R);
  // a touch lighter around the hub
  const rg = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
  rg.addColorStop(0, 'rgba(255,255,255,0.14)');
  rg.addColorStop(0.55, 'rgba(255,255,255,0.02)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(-R, -R, R * 2, R * 2);
  // rounded edge: the surroundings cast a soft colored inner shadow (blurred once, here)
  g.shadowColor = edgeTone(st);
  g.shadowBlur = R * 0.11 * dpr;
  g.fillStyle = '#000';
  g.fill(frame, 'evenodd');
  g.shadowColor = 'rgba(0,0,0,0)';
  g.shadowBlur = 0;
  // sockets for the bearings and a molded ring around the hub
  for (let i = 0; i < geo.n; i++) {
    const a = (i * TAU) / geo.n;
    const x = Math.cos(a) * geo.d * R, y = Math.sin(a) * geo.d * R, r = geo.rb * R;
    const sg = g.createRadialGradient(x, y, r * 0.92, x, y, r * 1.25);
    sg.addColorStop(0, 'rgba(0,0,0,0.3)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    G.circle(g, x, y, r * 1.25);
    g.fill();
  }
  const rc = geo.rc * R;
  g.lineWidth = R * 0.03;
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  G.circle(g, 0, 0, rc * 1.12);
  g.stroke();
  g.lineWidth = R * 0.016;
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  G.circle(g, 0, 0, rc * 1.24);
  g.stroke();
  g.restore();
}

/** Chrome bearing: polished bezel around a mirror ball, lit from the top-left (always drawn unrotated). */
function paintBearing(g, rb, tint) {
  const sh = g.createRadialGradient(rb * 0.08, rb * 0.12, rb * 0.78, rb * 0.08, rb * 0.12, rb * 1.28);
  sh.addColorStop(0, 'rgba(0,0,0,0.4)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  G.circle(g, rb * 0.08, rb * 0.12, rb * 1.28);
  g.fill();
  const bz = g.createLinearGradient(-rb, -rb, rb, rb);
  bz.addColorStop(0, '#ffffff');
  bz.addColorStop(0.22, '#dfe5ea');
  bz.addColorStop(0.47, '#7e8792');
  bz.addColorStop(0.62, '#cfd5dc');
  bz.addColorStop(0.8, '#f4f7f9');
  bz.addColorStop(1, '#68717c');
  G.circle(g, 0, 0, rb);
  g.fillStyle = bz;
  g.fill();
  g.lineWidth = rb * 0.05;
  g.strokeStyle = 'rgba(30,36,44,0.55)';
  g.stroke();
  const gr = g.createLinearGradient(-rb, -rb, rb, rb);
  gr.addColorStop(0, '#1b2026');
  gr.addColorStop(1, '#5c6570');
  G.circle(g, 0, 0, rb * 0.79);
  g.fillStyle = gr;
  g.fill();
  const br = rb * 0.73;
  const bg = g.createRadialGradient(-br * 0.3, -br * 0.36, br * 0.02, -br * 0.05, -br * 0.05, br * 1.08);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.22, '#f3f6f8');
  bg.addColorStop(0.46, '#bcc5ce');
  bg.addColorStop(0.68, '#646d78');
  bg.addColorStop(0.84, '#434a53');
  bg.addColorStop(1, '#a9b3bd');
  G.circle(g, 0, 0, br);
  g.fillStyle = bg;
  g.fill();
  // the body color reflected in the lower half of the ball, and the bezel glinting on its rim
  g.save();
  G.circle(g, 0, 0, br);
  g.clip();
  const rf = g.createRadialGradient(br * 0.1, br * 0.85, 0, br * 0.1, br * 0.85, br * 0.8);
  rf.addColorStop(0, G.alpha(tint, 0.75));
  rf.addColorStop(1, G.alpha(tint, 0));
  g.fillStyle = rf;
  g.fillRect(-br, -br, br * 2, br * 2);
  g.restore();
  g.lineWidth = br * 0.09;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.arc(0, 0, br * 0.9, Math.PI * 0.05, Math.PI * 0.55);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(-br * 0.34, -br * 0.38, br * 0.3, br * 0.17, -0.75, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.65)';
  G.circle(g, br * 0.36, br * 0.34, br * 0.08);
  g.fill();
  g.lineWidth = rb * 0.06;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.arc(0, 0, rb * 0.9, Math.PI * 1.05, Math.PI * 1.45);
  g.stroke();
}

function bearingSprite(rb, tint, dpr) {
  const m = rb * 1.4;
  const c = G.makeCanvas(m * 2 * dpr, m * 2 * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(m, m);
  paintBearing(g, rb, tint);
  return { c, size: m * 2 };
}

export class SpinnerToy extends Toy {
  static id = 'spinner';

  constructor(app) {
    super(app);
    this.theta = -Math.PI / 2; // a lobe points up at rest
    this.omega = 0; // rad/s, positive = clockwise on screen
    this.ptrs = new Map();
    this.geo = null;
    this.sprites = null;
    this.icons = new Map();
    this.sparks = new Particles(160);
    this.floaters = [];
    this.rpmShown = 0;
    this.spinning = false;
    this.celebrated = false;
    this.bestAtStart = 0;
    this.brakeCd = 0;
    this.pulse = 0;
    this.emitAcc = 0;
    this.lastDt = 1 / 60;
    this.cx = 0;
    this.cy = 0;
    this.R = 40;
    this.whirr = app.audio.loop({ source: 'noise', type: 'bandpass', freq: 400, q: 1.6 });
    this.hum = app.audio.loop({ source: 'osc', oscType: 'triangle', type: 'lowpass', freq: 520, q: 0.6 });
  }

  enter() {
    if (!this.geo || this.builtFor !== this.variant) this.setStyle();
  }
  exit() {
    this.ptrs.clear();
    this.whirr.stop();
    this.hum.stop();
  }
  setVariant() {
    this.setStyle();
    this.app.audio.whoosh(0.6);
  }
  setStyle() {
    this.builtFor = this.variant;
    this.geo = geometry(STYLES[this.variant]);
    this.sprites = null;
    this.sparks.clear();
  }

  resize(area) {
    this.cx = area.x + area.w / 2;
    this.cy = area.y + area.h / 2;
    this.R = Math.max(10, Math.min(area.w, area.h) * 0.42);
    this.sprites = null;
    // re-anchor live pointers so the new center does not read as a sudden swipe
    for (const pt of this.ptrs.values()) this.track(pt, pt.x, pt.y);
  }

  // ---------------------------------------------------------------- interaction
  track(pt, x, y) {
    pt.x = x;
    pt.y = y;
    pt.ang = Math.atan2(y - this.cy, x - this.cx);
    pt.r = G.dist(this.cx, this.cy, x, y);
  }
  pan() {
    return (this.cx / Math.max(1, this.app.w) - 0.5) * 0.6;
  }

  pointerDown(p) {
    const pt = { acc: 0, moved: 0, fv: 0, sp: 0, rest: 0, ticked: false };
    this.track(pt, p.x, p.y);
    this.ptrs.set(p.id, pt);
    if (pt.r < this.R && Math.abs(this.omega) > 6) {
      this.app.audio.click(0.8, 0.7, this.pan());
      this.app.haptic(8);
    }
  }
  pointerMove(p) {
    const pt = this.ptrs.get(p.id);
    if (!pt) return;
    const R = this.R;
    const ang = Math.atan2(p.y - this.cy, p.x - this.cx);
    const r = G.dist(this.cx, this.cy, p.x, p.y);
    // near the hub atan2 is twitchy, so those swipes count less; far swipes get a mild boost
    const near = smooth(R * 0.1, R * 0.55, Math.min(r, pt.r));
    const far = Math.pow(G.clamp(Math.max(r, pt.r) / R, 1, 2.5), 0.6);
    pt.acc += G.angleDiff(pt.ang, ang) * near * far;
    pt.moved += G.dist(pt.x, pt.y, p.x, p.y);
    pt.x = p.x;
    pt.y = p.y;
    pt.ang = ang;
    pt.r = r;
  }
  pointerUp(p) {
    const pt = this.ptrs.get(p.id);
    if (!pt) return;
    this.ptrs.delete(p.id);
    if (p.cancel) return;
    let fv = pt.fv;
    if (pt.acc) fv = G.damp(fv, pt.acc / this.lastDt, 35, this.lastDt);
    // A real flick leaves at least the flick's own speed (no smoothing lag), and adds a bit on top
    // when it goes the way it already spins, so repeated flicks keep building speed.
    const afv = Math.abs(fv), dir = Math.sign(fv);
    if (afv > 4 && (Math.sign(this.omega) === dir || Math.abs(this.omega) < 2)) {
      const w = Math.max(Math.abs(this.omega), afv * flickGain(afv)) + afv * 0.5;
      this.omega = dir * Math.min(MAX_SPIN, w);
    }
  }
  keyDown(e) {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowRight') {
      this.kick(25);
      return true;
    }
    if (e.key === 'ArrowLeft') {
      this.kick(-25);
      return true;
    }
    return false;
  }
  kick(dw) {
    this.omega = G.clamp(this.omega + dw, -MAX_SPIN, MAX_SPIN);
    this.app.audio.click(G.rand(1.1, 1.3), 0.55, this.pan());
    this.app.haptic(6);
  }

  // ---------------------------------------------------------------- simulation
  update(dt) {
    const app = this.app;
    if (!this.geo) this.setStyle();
    this.lastDt = Math.max(1e-3, dt);
    const R = this.R;
    let braking = false;
    for (const pt of this.ptrs.values()) {
      pt.fv = G.damp(pt.fv, pt.acc / this.lastDt, 35, dt); // smoothed finger angular velocity
      pt.sp = G.damp(pt.sp, pt.moved / this.lastDt, 20, dt); // smoothed finger speed (px/s)
      pt.acc = 0;
      pt.moved = 0;
      pt.rest = pt.r < R * 1.02 && pt.sp < 45 ? pt.rest + dt : 0;
      const afv = Math.abs(pt.fv);
      if (pt.rest > 0.08) {
        // a finger resting on the spinner grips it
        this.omega = G.damp(this.omega, 0, 7, dt);
        braking = true;
      } else if (afv > 0.3) {
        // slow drags turn it 1:1, flicks are amplified; a slower finger just slips over it
        const target = pt.fv * flickGain(afv);
        if (Math.sign(target) !== Math.sign(this.omega) || Math.abs(target) > Math.abs(this.omega)) {
          this.omega = G.damp(this.omega, target, 22, dt);
        }
      }
      if (!pt.ticked && afv > 3) {
        pt.ticked = true;
        app.audio.click(G.rand(1.15, 1.35), 0.5, this.pan());
        app.haptic(6);
      } else if (pt.ticked && afv < 1) pt.ticked = false;
    }

    // bearing friction: proportional drag plus a small constant deceleration so it always stops
    let w = this.omega * Math.exp(-0.12 * dt);
    const dec = 0.25 * dt;
    w = Math.abs(w) <= dec ? 0 : w - Math.sign(w) * dec;
    this.omega = G.clamp(w, -MAX_SPIN, MAX_SPIN);
    const dTheta = this.omega * dt;
    this.theta = (this.theta + dTheta) % TAU;
    if (dTheta) app.addProgress((Math.abs(dTheta) / TAU) * 0.01, this.cx, this.cy);

    const aw = Math.abs(this.omega);
    // lobes rattling against a braking finger
    this.brakeCd -= dt;
    if (braking && aw > 3 && this.brakeCd <= 0) {
      this.brakeCd = Math.max(0.045, TAU / (aw * this.geo.n));
      app.audio.click(G.rand(0.75, 0.95), Math.min(0.8, 0.25 + aw / 60), this.pan());
      app.haptic(5);
    }

    // whirr: band-passed noise rising with speed, pulsing with each lobe at low speed, plus a faint hum
    const lobeHz = (aw * this.geo.n) / TAU;
    let mod = 1;
    if (lobeHz < 10) {
      this.pulse = (this.pulse + lobeHz * dt * TAU) % TAU;
      mod = 0.72 + 0.28 * Math.sin(this.pulse);
    }
    this.whirr.set({ vol: Math.min(0.22, (aw / MAX_SPIN) * 0.25) * mod, freq: 200 + aw * 25 });
    this.hum.set({ vol: Math.min(0.06, (aw / MAX_SPIN) * 0.08), oscFreq: 50 + aw * 0.8 });

    // RPM, best and the once-per-spin record celebration
    const rpm = (aw * 60) / TAU;
    this.rpmShown = rpm < 0.5 ? 0 : G.damp(this.rpmShown, rpm, 12, dt);
    if (!this.spinning && aw > 1) {
      this.spinning = true;
      this.celebrated = false;
      this.bestAtStart = app.getStat('bestRpm');
    }
    if (this.spinning) {
      if (rpm >= 1) app.statMax('bestRpm', Math.round(rpm));
      if (!this.celebrated && rpm > 300 && rpm > this.bestAtStart * 1.05) {
        this.celebrated = true;
        this.celebrate();
      }
      if (aw < 0.4) this.spinning = false;
    }

    this.emit(dt, aw);
    this.sparks.update(dt);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
  }

  celebrate() {
    const app = this.app, st = STYLES[this.variant];
    const colors = st.lobes || [st.color, G.shade(st.color, 0.45), '#ffffff', '#ffd23f'];
    app.fx.burst(this.cx, this.cy - this.R * 0.15, { count: 26, colors, shape: ['confetti', 'star'], speed: [180, 430], size: [3, 7], gravity: 620, life: [0.7, 1.2] });
    app.audio.chime(1318.5, 0.75);
    app.audio.chime(1975.5, 0.4, 0, 'sfx');
    app.haptic(20);
    this.floaters.push({ text: this.tr(NEW_BEST), t: 0, life: 1.4 });
  }

  /** Sparks, stardust or confetti flung off the lobe tips at high speed (some styles only). */
  emit(dt, aw) {
    const kind = SPARKS[STYLES[this.variant].finish];
    if (!kind || aw < 20) {
      this.emitAcc = 0;
      return;
    }
    const geo = this.geo, R = this.R, dir = Math.sign(this.omega);
    this.emitAcc += dt * Math.min(42, (aw - 20) * 0.5);
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const a = this.theta + (G.randInt(0, geo.n - 1) * TAU) / geo.n + G.rand(-0.3, 0.3);
      const rr = (geo.d + geo.rl) * R * 0.96;
      const ca = Math.cos(a), sa = Math.sin(a);
      const sp = G.rand(110, 230) + aw * 1.4;
      this.sparks.spawn({
        x: this.cx + ca * rr, y: this.cy + sa * rr,
        vx: -sa * dir * sp + ca * 50, vy: ca * dir * sp + sa * 50,
        life: G.rand(0.3, 0.6), size: G.rand(2, 4), color: G.pick(kind.colors), shape: kind.shape,
        gravity: kind.gravity, drag: 0.6, vr: G.rand(-6, 6),
      });
    }
  }

  // ---------------------------------------------------------------- drawing
  buildSprites() {
    const st = STYLES[this.variant], geo = this.geo, R = this.R, dpr = this.app.dpr;
    this.path = new Path2D();
    bodyPath(this.path, geo, R);
    this.arcs = outlineArcs(geo, R);
    const pad = R * 0.06, size = (R + pad) * 2;
    const body = G.makeCanvas(size * dpr, size * dpr);
    const g = body.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(size / 2, size / 2);
    paintBody(g, st, geo, R, this.path, framePath(geo, R), dpr);
    const spad = R * 0.2, ssize = (R + spad) * 2;
    // soft ground shadow: the shape is drawn far away so only its blurred shadow lands on the canvas
    const shadow = this.blurredSilhouette(ssize, R * 0.06, [['rgba(45,25,15,1)', null]]);
    // motion-blur trail: soft, outline-free silhouettes in the body color(s)
    const tints = st.lobes || [st.color];
    const wedges = st.lobes ? tints.map((c, i) => [G.shade(c, 0.1), (i * TAU) / geo.n]) : [[G.shade(st.color, 0.08), null]];
    const ghost = this.blurredSilhouette(ssize, R * 0.035, wedges);
    const bearings = [];
    for (let i = 0; i < geo.n; i++) bearings.push(bearingSprite(geo.rb * R, tints[i % tints.length], dpr));
    this.sprites = {
      body: { c: body, size },
      shadow: { c: shadow, size: ssize },
      ghost: { c: ghost, size: ssize },
      bearings,
      cap: bearingSprite(geo.rc * R, st.color, dpr),
    };
  }

  /** Blurred silhouette of the body; parts = [[color, wedgeAngle|null]] paints per-lobe wedges. */
  blurredSilhouette(size, blur, parts) {
    const dpr = this.app.dpr, n = this.geo.n;
    const c = G.makeCanvas(size * dpr, size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(size / 2, size / 2);
    for (const [color, a] of parts) {
      g.save();
      if (a !== null) {
        // the clip lives where the shadow lands, so it is set before shifting the shape away
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, this.R * 1.5, a - Math.PI / n, a + Math.PI / n);
        g.closePath();
        g.clip();
      }
      g.translate(-10000, 0);
      g.shadowColor = color;
      g.shadowBlur = blur * dpr;
      g.shadowOffsetX = 10000 * dpr;
      g.fillStyle = '#000';
      g.fill(this.path);
      g.restore();
    }
    return c;
  }

  /** Body at angle a; bearings stay unrotated so their reflections keep facing the light. */
  drawSpinnerAt(ctx, a) {
    const S = this.sprites, geo = this.geo, R = this.R, cx = this.cx, cy = this.cy;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.drawImage(S.body.c, -S.body.size / 2, -S.body.size / 2, S.body.size, S.body.size);
    this.drawLighting(ctx, a);
    ctx.restore();
    for (let i = 0; i < geo.n; i++) {
      const b = a + (i * TAU) / geo.n, s = S.bearings[i];
      const x = cx + Math.cos(b) * geo.d * R, y = cy + Math.sin(b) * geo.d * R;
      ctx.drawImage(s.c, x - s.size / 2, y - s.size / 2, s.size, s.size);
    }
  }

  /** Fixed key light on the rotating body (called inside its rotated transform). */
  drawLighting(ctx, a) {
    const R = this.R;
    ctx.save();
    ctx.clip(this.path);
    // broad top-left gloss, fixed in screen space
    const c = Math.cos(-a), s = Math.sin(-a);
    const wx = -0.3 * R, wy = -0.36 * R;
    const gx = wx * c - wy * s, gy = wx * s + wy * c;
    const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.85);
    gl.addColorStop(0, 'rgba(255,255,255,0.24)');
    gl.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
    // Rim light on the edges that face the light and shade on the far ones. Each outline arc is
    // stroked (inner half visible) with a radial gradient whose center is nudged along the light
    // direction, so only the part of the arc whose normal faces (or turns away from) the light glows.
    const w = R * 0.16, o = w * 0.5, la = LIGHT - a, lx = Math.cos(la), ly = Math.sin(la);
    ctx.lineWidth = w;
    for (const arc of this.arcs) {
      const convex = !arc.ccw;
      for (const lit of [false, true]) {
        const shift = (convex ? -1 : 1) * (lit ? 1 : -1) * o;
        const ax = arc.x + lx * shift, ay = arc.y + ly * shift;
        const peak = lit ? (convex ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.45)') : 'rgba(20,10,30,0.2)';
        const clear = lit ? 'rgba(255,255,255,0)' : 'rgba(20,10,30,0)';
        let gr;
        if (convex) {
          const r1 = arc.r + o;
          gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, r1);
          gr.addColorStop(G.clamp((r1 - w * 0.5) / r1, 0, 0.98), clear);
          gr.addColorStop(G.clamp((r1 - w * 0.1) / r1, 0, 0.99), peak);
          gr.addColorStop(1, lit ? 'rgba(255,255,255,0.3)' : 'rgba(20,10,30,0.26)');
        } else {
          const rE = arc.r + o, r1 = rE + w * 0.5;
          gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, r1);
          gr.addColorStop(G.clamp(rE / r1, 0, 0.97), clear);
          gr.addColorStop(G.clamp((rE + w * 0.12) / r1, 0, 0.98), peak);
          gr.addColorStop(1, clear);
        }
        ctx.strokeStyle = gr;
        ctx.beginPath();
        ctx.arc(arc.x, arc.y, arc.r, arc.a0, arc.a1, arc.ccw);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  draw(ctx) {
    const app = this.app, st = STYLES[this.variant];
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1]);
    if (!this.geo) this.setStyle();
    if (!this.sprites) this.buildSprites();
    const S = this.sprites, geo = this.geo, R = this.R, cx = this.cx, cy = this.cy;
    const aw = Math.abs(this.omega), dir = Math.sign(this.omega) || 1;
    const blur = smooth(4, 26, aw), fast = smooth(30, 95, aw);
    const mainColor = st.lobes ? '#c9b8ff' : st.color;

    // ground shadow (the silhouette rotates with the body; a soft disc takes over when it blurs)
    const sx = cx + R * 0.035, sy = cy + R * 0.075;
    ctx.save();
    ctx.globalAlpha = 0.34 * (1 - 0.6 * fast);
    ctx.translate(sx, sy);
    ctx.rotate(this.theta);
    ctx.drawImage(S.shadow.c, -S.shadow.size / 2, -S.shadow.size / 2, S.shadow.size, S.shadow.size);
    ctx.restore();
    if (fast > 0.01) G.groundShadow(ctx, sx, sy, R * 1.04, R * 1.04, 0.26 * fast);

    // translucent blur disc where the lobes sweep when it is really fast
    if (fast > 0.01) {
      const r0 = geo.neck * R * 0.9, r1 = R * 0.99;
      const dg = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      dg.addColorStop(0, G.alpha(mainColor, 0));
      dg.addColorStop(0.3, G.alpha(mainColor, 0.5 * fast));
      dg.addColorStop(0.86, G.alpha(mainColor, 0.42 * fast));
      dg.addColorStop(1, G.alpha(G.shade(mainColor, -0.4), 0.22 * fast));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, TAU);
      ctx.arc(cx, cy, r0, 0, TAU, true);
      ctx.fill();
    }

    // motion blur: soft copies trailing at slightly earlier angles
    if (blur > 0.01) {
      const K = 4, span = Math.min(aw * 0.04, (TAU / geo.n) * 0.9), gs = S.ghost;
      for (let k = K; k >= 1; k--) {
        ctx.globalAlpha = blur * 0.34 * (1 - (k - 1) / K);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.theta - dir * span * (k / K));
        ctx.drawImage(gs.c, -gs.size / 2, -gs.size / 2, gs.size, gs.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1 - 0.68 * fast;
    this.drawSpinnerAt(ctx, this.theta);
    ctx.globalAlpha = 1;

    if (fast > 0.01) {
      // the bearings smear into a silver ring; the gloss stays put
      const rb = geo.rb * R;
      ctx.lineWidth = rb * 1.5;
      ctx.strokeStyle = `rgba(214,220,228,${0.4 * fast})`;
      G.circle(ctx, cx, cy, geo.d * R);
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.lineWidth = rb * 0.35;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * fast})`;
      ctx.beginPath();
      ctx.arc(cx, cy, geo.d * R - rb * 0.25, LIGHT - 0.55, LIGHT + 0.55);
      ctx.stroke();
      ctx.lineWidth = R * 0.05;
      ctx.strokeStyle = `rgba(255,255,255,${0.2 * fast})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.93, LIGHT - 0.7, LIGHT + 0.7);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // the center cap is held still by your fingers on a real spinner
    ctx.drawImage(S.cap.c, cx - S.cap.size / 2, cy - S.cap.size / 2, S.cap.size, S.cap.size);
    this.sparks.draw(ctx);

    for (const f of this.floaters) {
      const k = f.t / f.life;
      const pop = k < 0.15 ? G.ease.outBack(k / 0.15) : 1;
      G.drawText(ctx, f.text, cx, cy - R * (1.02 + k * 0.18), {
        size: G.clamp(R * 0.16, 16, 34) * pop, color: '#fff', stroke: 5, strokeColor: G.alpha(G.shade(mainColor, -0.45), 0.85),
        alpha: k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1,
      });
    }
  }

  hud() {
    const lang = this.app.lang;
    return `${this.tr(RPM_LABEL)} ${group(this.rpmShown, lang)} · ${this.tr(BEST)} ${group(this.app.getStat('bestRpm'), lang)}`;
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const size = Math.max(8, Math.ceil(r / 6) * 6), dpr = this.app.dpr;
    const key = `${i}|${size}|${dpr}`;
    let ic = this.icons.get(key);
    if (!ic) {
      const st = STYLES[i], geo = geometry(st), R = size * 0.86;
      const c = G.makeCanvas(size * 2 * dpr, size * 2 * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(size, size);
      g.rotate(ICON_TURN[i]);
      const path = new Path2D();
      bodyPath(path, geo, R);
      paintBody(g, st, geo, R, path, framePath(geo, R), dpr);
      g.save();
      g.clip(path);
      g.rotate(-ICON_TURN[i]);
      const gl = g.createRadialGradient(-R * 0.3, -R * 0.35, 0, -R * 0.3, -R * 0.35, R);
      gl.addColorStop(0, 'rgba(255,255,255,0.35)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(-R, -R, R * 2, R * 2);
      g.restore();
      const tints = st.lobes || [st.color];
      for (let k = 0; k < geo.n; k++) {
        const a = (k * TAU) / geo.n;
        g.save();
        g.translate(Math.cos(a) * geo.d * R, Math.sin(a) * geo.d * R);
        g.rotate(-ICON_TURN[i]); // bearings stay upright so their highlight faces the light
        paintBearing(g, geo.rb * R, tints[k % tints.length]);
        g.restore();
      }
      g.rotate(-ICON_TURN[i]);
      paintBearing(g, geo.rc * R, st.color);
      ic = { c, size: size * 2 };
      if (this.icons.size > 40) this.icons.clear();
      this.icons.set(key, ic);
    }
    const s = (r / size) * ic.size;
    ctx.drawImage(ic.c, x - s / 2, y - s / 2, s, s);
  }
}
