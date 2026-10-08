// Newton's Cradle: pull a ball (or two) aside and let go — the clack travels through the row.
//
// Physics works in "design units" where a ball radius = 1. Each ball is a pendulum angle φ with
// string length L, hanging from a pivot exactly 2 units from its neighbours, so resting balls touch.
// Every frame is split into sub-steps: gravity, then a contact pass that exchanges horizontal
// velocities between touching, approaching neighbours (alternating left→right / right→left sweeps,
// so momentum crosses the whole row in one step: pull 1 → 1 flies out, pull 2 → 2 fly out), then a
// position pass that removes overlaps. Held balls are kinematic: slow contacts carry their
// neighbours along (dragging the 2nd ball lifts the 1st), fast ones bounce them softly.
import { Toy } from './_base.js';
import * as G from '../gfx.js';

const N = 5;
const L0 = 6.6, L_MAX = 11; // string length (pivot → ball centre); longer strings in tall play areas
const OMEGA0 = (2 * Math.PI) / 1.2; // small-swing angular frequency (period ≈ 1.2 s)
const DAMP = 0.24; // angular damping per second: a swing fades out in ~25 s
const E_BALL = 0.995; // restitution between balls
const SUB = 10; // physics sub-steps per frame
const MAX_ANGLE = (70 * Math.PI) / 180;
const MAX_OMEGA = 6.6; // rad/s (a 70° drop), keeps flings sane
const HOLD_OMEGA = 9; // how fast a held ball can follow the finger (rad/s)
const CONTACT = 0.004; // contact tolerance
const CARRY = 0.03; // a ball this close to the outer side of a held ball rides along with it
const BOX_W = 21.8, BOX_TOP = -1.35; // design box that must fit in the play area (height = L + 4.3)
const POST = 9.25; // frame posts (x)
const BAR = -0.45; // top bar centre line (y); pivots sit just below it at y = 0
const TUBE = 0.62; // frame tube thickness
const BASE_X = 10.2; // the base's top face starts 1.15 below the resting ball centres
const LABEL = {
  en: ['clack', 'clacks'], vi: 'cú va', es: ['choque', 'choques'], pt: ['batida', 'batidas'], fr: ['clac', 'clacs'],
  de: ['Klack', 'Klacks'], id: 'benturan', it: ['colpo', 'colpi'], tr: 'çarpışma', ru: ['удар', 'удара', 'ударов'],
};

const STYLES = [
  { ball: 'metal', frame: '#ff7f7a', felt: '#ee5d5b', bg: ['#ffeae2', '#ffbcab'], string: 'rgba(70,40,45,0.5)', trail: 0.16,
    metal: { sky: '#eef2f7', low: '#aab4c2', horizon: '#262a31', ground: '#8d96a1', edge: '#1d2026' } },
  { ball: 'metal', frame: '#2f2b36', felt: '#22604e', bg: ['#fff4d8', '#efc97c'], string: 'rgba(60,45,20,0.5)', trail: 0.16, trim: '#f5b700',
    metal: { sky: '#fff3c4', low: '#e8b635', horizon: '#4a2e00', ground: '#c08a14', edge: '#3a2300' } },
  { ball: 'glass', frame: '#f3f0ff', felt: '#c8bfff', bg: ['#e8f7ff', '#b2daf2'], string: 'rgba(70,80,110,0.45)', trail: 0.14,
    colors: ['#ff4f6d', '#ff9f2e', '#ffd93b', '#3fd483', '#3f9bff'] },
  { ball: 'neon', frame: '#272441', felt: '#17152b', bg: ['#2b1247', '#07030f'], string: 'rgba(255,190,250,0.5)', trail: 0.5, neon: '#ff3df0',
    colors: ['#ff2bd6', '#00e5ff', '#7dff3a', '#ffe53b', '#b14dff'] },
  { ball: 'planet', frame: '#3a4f8a', felt: '#1e2a55', bg: ['#1c2756', '#050817'], string: 'rgba(205,220,255,0.45)', trail: 0.14, stars: true },
  { ball: 'candy', frame: '#ff9dbb', felt: '#a3eed3', bg: ['#fff1f7', '#ffcde0'], string: 'rgba(150,80,110,0.45)', trail: 0.14,
    colors: ['#ff9ec4', '#86e0bf', '#ffdc7a', '#c3a3ff', '#ffb784'] },
];

/** Small deterministic RNG so procedural planets look the same after every rebuild. */
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

/** Random smooth blob (continents, patches). */
function blob(g, rnd, x, y, r, pts = 8) {
  const list = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * G.TAU, rr = r * (0.6 + rnd() * 0.6);
    list.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]);
  }
  g.beginPath();
  G.smoothClosedPath(g, list);
}

/** Specular highlight shared by every ball style. */
function specular(g, R, a = 0.9) {
  const hg = g.createRadialGradient(-R * 0.36, -R * 0.42, 0, -R * 0.36, -R * 0.42, R * 0.42);
  hg.addColorStop(0, `rgba(255,255,255,${0.55 * a})`);
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg;
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.fill();
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.ellipse(-R * 0.36, -R * 0.44, R * 0.17, R * 0.1, -0.65, 0, G.TAU);
  g.fill();
  g.fillStyle = `rgba(255,255,255,${0.6 * a})`;
  g.beginPath();
  g.arc(-R * 0.14, -R * 0.6, R * 0.035, 0, G.TAU);
  g.fill();
}

/** Polished metal sphere reflecting a bright sky, a curved horizon and the coloured base below. */
function paintMetal(g, R, m, floor) {
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.clip();
  // lower half: the coloured base reflected, dark at the horizon, bright toward the rim (Fresnel)
  const ground = G.mixColor(m.ground, floor, 0.5);
  const gg = g.createLinearGradient(0, R * 0.05, 0, R);
  gg.addColorStop(0, m.horizon);
  gg.addColorStop(0.28, G.shade(ground, -0.3));
  gg.addColorStop(0.7, ground);
  gg.addColorStop(1, G.shade(ground, 0.55));
  g.fillStyle = gg;
  g.fillRect(-R, -R, R * 2, R * 2);
  // upper half: bright sky in an ellipse whose lower edge is the (sphere-curved) horizon
  g.save();
  g.beginPath();
  g.ellipse(0, -R * 0.55, R * 1.3, R * 0.98, 0, 0, G.TAU);
  g.clip();
  const sg = g.createLinearGradient(0, -R, 0, R * 0.43);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.3, m.sky);
  sg.addColorStop(0.68, m.low);
  sg.addColorStop(0.9, G.shade(m.low, -0.38));
  sg.addColorStop(1, m.horizon);
  g.fillStyle = sg;
  g.fillRect(-R, -R, R * 2, R * 2);
  // reflections of the room: a dark shape on the right, bright windows on the left
  g.fillStyle = G.alpha(m.horizon, 0.32);
  g.beginPath();
  g.ellipse(R * 0.62, -R * 0.12, R * 0.2, R * 0.62, 0.32, 0, G.TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(-R * 0.42, -R * 0.34, R * 0.15, R * 0.33, -0.5, 0, G.TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.ellipse(-R * 0.12, -R * 0.62, R * 0.09, R * 0.2, -0.15, 0, G.TAU);
  g.fill();
  g.restore();
  // crisp horizon line
  g.strokeStyle = G.alpha(m.horizon, 0.75);
  g.lineWidth = R * 0.06;
  g.beginPath();
  g.ellipse(0, -R * 0.55, R * 1.3, R * 0.98, 0, 0.1 * Math.PI, 0.9 * Math.PI);
  g.stroke();
  // strong limb darkening makes it read as a polished sphere
  const lg = g.createRadialGradient(-R * 0.15, -R * 0.2, R * 0.5, 0, 0, R);
  lg.addColorStop(0, 'rgba(0,0,0,0)');
  lg.addColorStop(0.8, G.alpha(m.edge, 0.12));
  lg.addColorStop(1, G.alpha(m.edge, 0.85));
  g.fillStyle = lg;
  g.fillRect(-R, -R, R * 2, R * 2);
  // bright rim catching the light from below
  g.strokeStyle = G.alpha(G.shade(floor, 0.7), 0.85);
  g.lineWidth = R * 0.06;
  g.beginPath();
  g.arc(0, 0, R * 0.9, 0.12 * Math.PI, 0.68 * Math.PI);
  g.stroke();
  g.restore();
  specular(g, R, 1);
}

function paintGlass(g, R, c) {
  const body = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R);
  body.addColorStop(0, G.alpha(G.shade(c, 0.6), 0.32));
  body.addColorStop(0.62, G.alpha(c, 0.5));
  body.addColorStop(1, G.alpha(G.shade(c, -0.35), 0.92));
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.fill();
  g.save();
  g.clip();
  // caustic: light focused through the glass onto its far side
  const cg = g.createRadialGradient(R * 0.3, R * 0.42, 0, R * 0.3, R * 0.42, R * 0.58);
  cg.addColorStop(0, G.alpha(G.shade(c, 0.85), 0.95));
  cg.addColorStop(1, G.alpha(G.shade(c, 0.6), 0));
  g.fillStyle = cg;
  g.fillRect(-R, -R, R * 2, R * 2);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = R * 0.08;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, 0, R * 0.76, 1.05 * Math.PI, 1.42 * Math.PI);
  g.stroke();
  g.strokeStyle = G.alpha(G.shade(c, 0.65), 0.75);
  g.lineWidth = R * 0.05;
  g.beginPath();
  g.arc(0, 0, R * 0.975, 0, G.TAU);
  g.stroke();
  specular(g, R, 1);
}

function paintNeon(g, R, c) {
  const body = g.createRadialGradient(-R * 0.15, -R * 0.2, 0, 0, 0, R);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.3, G.shade(c, 0.55));
  body.addColorStop(0.78, c);
  body.addColorStop(1, G.shade(c, -0.3));
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = R * 0.06;
  g.beginPath();
  g.arc(0, 0, R * 0.9, 0, G.TAU);
  g.stroke();
  specular(g, R, 0.8);
}

/** Planet surfaces (this layer rotates with the swing; lighting is added on top, unrotated). */
function paintPlanet(g, R, kind) {
  const rnd = mulberry(101 + kind * 17);
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.clip();
  const fill = (c0, c1) => {
    const rg = g.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R * 1.1);
    rg.addColorStop(0, c0);
    rg.addColorStop(1, c1);
    g.fillStyle = rg;
    g.fillRect(-R, -R, R * 2, R * 2);
  };
  if (kind === 0) {
    // Earth: oceans, continents, ice caps, clouds
    fill('#4aa0f0', '#1b4d9a');
    for (const [x, y, r] of [[-0.35, -0.15, 0.42], [0.42, 0.2, 0.36], [0.05, 0.62, 0.22], [0.55, -0.55, 0.2]]) {
      g.fillStyle = '#4fae4d';
      blob(g, rnd, x * R, y * R, r * R, 9);
      g.fill();
      g.fillStyle = 'rgba(176,146,90,0.7)';
      blob(g, rnd, x * R + r * R * 0.2, y * R, r * R * 0.45, 7);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(0, -R * 0.98, R * 0.55, R * 0.16, 0, 0, G.TAU);
    g.ellipse(0, R * 0.98, R * 0.5, R * 0.14, 0, 0, G.TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = (rnd() - 0.5) * R * 1.4, x = (rnd() - 0.5) * R * 1.2;
      g.lineWidth = R * (0.06 + rnd() * 0.06);
      g.beginPath();
      g.moveTo(x - R * 0.35, y);
      g.quadraticCurveTo(x, y - R * 0.12, x + R * 0.38, y + R * 0.04);
      g.stroke();
    }
  } else if (kind === 1) {
    // Mars: rusty plains, dark maria, a small polar cap
    fill('#f08a57', '#a9432a');
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(120,40,25,${0.35 + rnd() * 0.25})`;
      blob(g, rnd, (rnd() - 0.5) * R * 1.5, (rnd() - 0.5) * R * 1.5, R * (0.15 + rnd() * 0.22), 7);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,190,150,0.35)';
    g.lineWidth = R * 0.05;
    for (let i = 0; i < 4; i++) {
      const y = (rnd() - 0.5) * R * 1.2;
      g.beginPath();
      g.moveTo(-R, y);
      g.quadraticCurveTo(0, y + (rnd() - 0.5) * R * 0.4, R, y + (rnd() - 0.5) * R * 0.3);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,250,245,0.9)';
    g.beginPath();
    g.ellipse(-R * 0.1, -R * 0.95, R * 0.35, R * 0.14, 0.1, 0, G.TAU);
    g.fill();
  } else if (kind === 2) {
    // Jupiter: wavy cloud bands and the Great Red Spot
    const bands = ['#efdcc0', '#c99a6b', '#f3e4cb', '#b77a4a', '#e8cfa7', '#a86c42', '#f0dcbf', '#c7956a', '#e9d2ad'];
    const n = bands.length, bh = (R * 2) / n;
    for (let i = 0; i < n; i++) {
      const y0 = -R + i * bh;
      g.fillStyle = bands[i];
      g.beginPath();
      g.moveTo(-R, y0 - 1);
      for (let s = 0; s <= 6; s++) g.lineTo(-R + (s / 6) * R * 2, y0 + Math.sin(s * 1.7 + i) * bh * 0.18);
      g.lineTo(R, y0 + bh + 2);
      g.lineTo(-R, y0 + bh + 2);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#c95d3c';
    g.beginPath();
    g.ellipse(R * 0.28, R * 0.36, R * 0.28, R * 0.15, -0.08, 0, G.TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,225,200,0.6)';
    g.lineWidth = R * 0.04;
    g.stroke();
  } else if (kind === 3) {
    // Saturn: soft golden bands (the ring is painted separately)
    fill('#f3dea2', '#c9a35c');
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? 'rgba(200,160,90,0.35)' : 'rgba(255,240,200,0.3)';
      g.fillRect(-R, -R + (i + 0.5) * R * 0.32, R * 2, R * 0.14);
    }
  } else {
    // Moon: grey dust and lit craters
    fill('#dcdcdc', '#8c8c8c');
    for (let i = 0; i < 11; i++) {
      const x = (rnd() - 0.5) * R * 1.6, y = (rnd() - 0.5) * R * 1.6, r = R * (0.06 + rnd() * 0.15);
      g.fillStyle = 'rgba(120,120,120,0.45)';
      g.beginPath();
      g.arc(x, y, r, 0, G.TAU);
      g.fill();
      g.strokeStyle = 'rgba(70,70,70,0.35)';
      g.lineWidth = r * 0.25;
      g.beginPath();
      g.arc(x, y, r * 0.85, Math.PI * 0.9, Math.PI * 1.6);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.arc(x, y, r * 0.85, Math.PI * 1.9, Math.PI * 0.6);
      g.stroke();
    }
  }
  g.restore();
}

/** Peppermint swirl (rotates with the swing). */
function paintCandy(g, R, c) {
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.clip();
  g.fillStyle = c;
  g.fillRect(-R, -R, R * 2, R * 2);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let a = 0; a < 4; a++) {
    const th0 = (a * Math.PI) / 2;
    g.beginPath();
    for (let s = 0; s <= 24; s++) {
      const t = s / 24, r = t * R * 1.1, th = th0 + t * 2.3;
      s ? g.lineTo(Math.cos(th) * r, Math.sin(th) * r) : g.moveTo(0, 0);
    }
    for (let s = 24; s >= 0; s--) {
      const t = s / 24, r = t * R * 1.1, th = th0 + 0.5 + t * 2.3;
      g.lineTo(Math.cos(th) * r, Math.sin(th) * r);
    }
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Fixed lighting over a rotating texture: terminator shade, rim and gloss. */
function paintShading(g, R, glossy, atmo) {
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, G.TAU);
  g.clip();
  const lg = g.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.1, -R * 0.05, -R * 0.05, R * 1.25);
  lg.addColorStop(0, glossy ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)');
  lg.addColorStop(0.5, 'rgba(0,0,0,0)');
  lg.addColorStop(1, glossy ? 'rgba(80,20,50,0.35)' : 'rgba(0,0,15,0.68)');
  g.fillStyle = lg;
  g.fillRect(-R, -R, R * 2, R * 2);
  if (atmo) {
    g.strokeStyle = atmo;
    g.lineWidth = R * 0.12;
    g.beginPath();
    g.arc(0, 0, R * 0.98, 0, G.TAU);
    g.stroke();
  }
  g.strokeStyle = glossy ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)';
  g.lineWidth = R * 0.07;
  g.beginPath();
  g.arc(0, 0, R * 0.92, 0.1 * Math.PI, 0.6 * Math.PI);
  g.stroke();
  g.restore();
  specular(g, R, glossy ? 0.95 : 0.3);
}

/** Saturn's ring, split into the half behind the planet and the half in front of it. */
function paintRing(g, R, front) {
  g.save();
  g.rotate(-0.28);
  g.beginPath();
  if (front) g.rect(-R * 2, 0, R * 4, R * 2);
  else g.rect(-R * 2, -R * 2, R * 4, R * 2);
  g.clip();
  const ring = (rx, ry, w, col) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, G.TAU);
    g.stroke();
  };
  ring(R * 1.62, R * 0.42, R * 0.2, 'rgba(214,188,130,0.95)');
  ring(R * 1.4, R * 0.36, R * 0.16, 'rgba(240,222,170,0.95)');
  ring(R * 1.24, R * 0.32, R * 0.06, 'rgba(180,150,100,0.8)');
  g.restore();
}

export class CradleToy extends Toy {
  static id = 'cradle';

  constructor(app) {
    super(app);
    this.phi = new Float64Array(N);
    this.om = new Float64Array(N);
    this._x = new Float64Array(N);
    this._v = new Float64Array(N);
    this._held = new Uint8Array(N);
    this.kin = new Array(N).fill(null); // controller (drag / keyboard lift) holding each ball
    this.drags = new Map();
    this.lift = null;
    this.hist = Array.from({ length: N }, () => []);
    this.flashes = [];
    this.sprites = new Map();
    this.icons = new Map();
    this.layers = null;
    this.t = 0;
    this.lastClack = -1;
    this.budget = 0.3;
    this.stars = null;
    this.k = 10;
    this.cx = 0;
    this.py = 0;
    this.L = L0;
    this.boxH = L0 + 4.3;
    this.maxAngle = MAX_ANGLE;
  }

  enter() {}
  exit() {
    for (const d of this.drags.values()) this.release(d);
    this.drags.clear();
    this.lift = null;
    this.kin.fill(null);
  }
  setVariant() {
    this.layers = null;
    this.sprites.clear();
    this.app.audio.whoosh(0.5);
  }

  resize(area) {
    // tall areas get longer strings (same swing period), so the cradle fills more of the height
    const L = G.clamp(L0 + (area.h / Math.max(1, area.w) - 1) * 5, L0, L_MAX);
    this.L = L;
    this.boxH = L + 4.3;
    const k = Math.max(0.5, Math.min(area.w / BOX_W, area.h / this.boxH));
    this.k = k;
    this.cx = area.x + area.w / 2;
    this.py = area.y + area.h / 2 - (BOX_TOP + this.boxH / 2) * k;
    // the outer ball must stay inside the play area at full swing (never more than 70°)
    const half = area.w / 2 / k - 0.1;
    this.maxAngle = Math.asin(G.clamp((half - 5) / L, 0.3, Math.sin(MAX_ANGLE)));
    this.layers = null;
    this.sprites.clear();
  }

  // ---------------------------------------------------------------- coordinates
  ballX(i, phi = this.phi[i]) {
    return (i - 2) * 2 + this.L * Math.sin(phi);
  }
  screenX(u) {
    return this.cx + u * this.k;
  }
  screenY(v) {
    return this.py + v * this.k;
  }
  /** Angle (0 = straight down) of a screen point seen from ball i's pivot. */
  pointerAngle(i, x, y) {
    const px = this.screenX((i - 2) * 2);
    return Math.atan2(x - px, Math.max(1e-3, y - this.py));
  }
  ballAt(x, y) {
    let best = -1, bd = 1.65 * this.k;
    for (let i = 0; i < N; i++) {
      if (this.kin[i]) continue;
      const d = G.dist(x, y, this.screenX(this.ballX(i)), this.screenY(this.L * Math.cos(this.phi[i])));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- input
  pointerDown(p) {
    if (this.drags.size >= 2) return;
    const b = this.ballAt(p.x, p.y);
    if (b < 0) return;
    if (this.lift && this.lift.ball === b) this.lift = null;
    const d = { ball: b, off: this.phi[b] - this.pointerAngle(b, p.x, p.y), target: this.phi[b], vel: 0, from: this.phi[b], to: this.phi[b] };
    this.drags.set(p.id, d);
    this.kin[b] = d;
    this.om[b] = 0;
    this.app.haptic(6);
  }
  pointerMove(p) {
    const d = this.drags.get(p.id);
    if (d) d.target = this.pointerAngle(d.ball, p.x, p.y) + d.off;
  }
  pointerUp(p) {
    const d = this.drags.get(p.id);
    if (!d) return;
    this.drags.delete(p.id);
    this.release(d);
  }
  release(d) {
    this.kin[d.ball] = null;
    this.om[d.ball] = G.clamp(d.vel, -MAX_OMEGA, MAX_OMEGA);
  }
  keyDown(e) {
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
      if (!this.lift && !this.kin[0]) {
        const goal = -Math.min(this.maxAngle, (45 * Math.PI) / 180);
        this.lift = { ball: 0, t: 0, start: this.phi[0], goal, target: this.phi[0], vel: 0, from: this.phi[0], to: this.phi[0] };
        this.kin[0] = this.lift;
        this.om[0] = 0;
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- physics
  /** Keeps held balls inside the swing limit and leaves room for the balls between two holds. */
  clampTargets(ctl) {
    const sMax = Math.sin(this.maxAngle);
    for (const d of ctl) {
      let x = this.ballX(d.ball, G.clamp(d.target, -this.maxAngle, this.maxAngle));
      for (const o of ctl) {
        if (o === d) continue;
        const xo = this.ballX(o.ball), gap = 2 * Math.abs(o.ball - d.ball);
        x = o.ball > d.ball ? Math.min(x, xo - gap) : Math.max(x, xo + gap);
      }
      d.target = Math.asin(G.clamp((x - (d.ball - 2) * 2) / this.L, -sMax, sMax));
    }
  }

  /** Velocity pass over touching neighbours; records the strongest impact of this sub-step. */
  solveContacts(hit) {
    const { phi, om, kin, _x: x, _v: v, _held: held, L } = this;
    for (let i = 0; i < N; i++) {
      x[i] = this.ballX(i);
      v[i] = L * Math.cos(phi[i]) * om[i];
      held[i] = kin[i] ? 1 : 0;
    }
    // Balls resting against the side a held ball is pulled toward ride along with it (so a quick
    // drag doesn't knock them ahead, and a drag that stops dead doesn't fling them), and are
    // released together. Near the bottom the side is taken from the direction of motion.
    for (let k = 0; k < N; k++) {
      if (!kin[k]) continue;
      const s = phi[k] < -0.02 ? -1 : phi[k] > 0.02 ? 1 : v[k] < -0.05 ? -1 : v[k] > 0.05 ? 1 : 0;
      for (let j = k + s; s && j >= 0 && j < N && !kin[j]; j += s) {
        const gap = s < 0 ? x[j + 1] - x[j] - 2 : x[j] - x[j - 1] - 2;
        if (gap > CARRY) break;
        held[j] = 1;
        v[j] = v[k];
      }
    }
    for (let pass = 0; pass < 8; pass++) {
      let any = false;
      for (let q = 0; q < N - 1; q++) {
        const i = pass % 2 ? N - 2 - q : q, j = i + 1;
        if (x[j] - x[i] - 2 > CONTACT) continue;
        const rel = v[i] - v[j];
        if (rel <= 1e-6) continue;
        const ki = held[i], kj = held[j];
        if (ki && kj) continue;
        if (!ki && !kj) {
          const imp = 0.5 * (1 + E_BALL) * rel; // equal masses: (almost) swap velocities
          v[i] -= imp;
          v[j] += imp;
        } else {
          const e = rel > 3 ? 0.35 : 0; // a held ball pushes gently, or knocks a little
          if (ki) v[j] = v[i] + e * rel;
          else v[i] = v[j] - e * rel;
        }
        any = true;
        if (rel > hit.v) {
          hit.v = rel;
          hit.x = (x[i] + x[j]) / 2;
          hit.y = L * Math.cos((phi[i] + phi[j]) / 2);
        }
      }
      if (!any) break;
    }
    for (let i = 0; i < N; i++) if (!kin[i]) om[i] = G.clamp(v[i] / (L * Math.max(0.2, Math.cos(phi[i]))), -MAX_OMEGA, MAX_OMEGA);
  }

  /** Position pass: removes overlaps (held balls never move, free ones are pushed). */
  separate() {
    const { phi, kin, _x: x, L } = this;
    let moved = 0;
    for (let i = 0; i < N; i++) x[i] = this.ballX(i);
    for (let pass = 0; pass < 6; pass++) {
      let any = false;
      for (let q = 0; q < N - 1; q++) {
        const i = pass % 2 ? N - 2 - q : q, j = i + 1;
        const over = 2 - (x[j] - x[i]);
        if (over <= 1e-9) continue;
        const ki = kin[i], kj = kin[j];
        if (ki && kj) continue;
        if (!ki && !kj) {
          x[i] -= over / 2;
          x[j] += over / 2;
          moved |= (1 << i) | (1 << j);
        } else if (ki) {
          x[j] += over;
          moved |= 1 << j;
        } else {
          x[i] -= over;
          moved |= 1 << i;
        }
        any = true;
      }
      if (!any) break;
    }
    for (let i = 0; i < N; i++) {
      if (moved & (1 << i) && !kin[i]) phi[i] = Math.asin(G.clamp((x[i] - (i - 2) * 2) / L, -0.995, 0.995));
    }
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.t += dt;
    this.budget = Math.min(0.3, this.budget + dt * 0.3);
    // keyboard lift: ease the left ball up, hold a beat, let go
    const lf = this.lift;
    if (lf) {
      lf.t += dt;
      lf.target = G.lerp(lf.start, lf.goal, G.ease.outCubic(Math.min(1, lf.t / 0.4)));
      if (lf.t >= 0.55) {
        this.lift = null;
        this.release(lf);
      }
    }
    const ctl = [...this.drags.values()];
    if (this.lift) ctl.push(this.lift);
    this.kin.fill(null);
    for (const d of ctl) this.kin[d.ball] = d;
    this.clampTargets(ctl);
    for (const d of ctl) {
      d.from = this.phi[d.ball];
      const step = HOLD_OMEGA * dt;
      d.to = d.from + G.clamp(d.target - d.from, -step, step);
      d.vel = G.lerp(d.vel, (d.to - d.from) / dt, 0.35);
    }
    const h = dt / SUB, w2 = OMEGA0 * OMEGA0;
    const { phi, om, kin } = this;
    for (let s = 1; s <= SUB; s++) {
      for (let i = 0; i < N; i++) {
        if (kin[i]) om[i] = (kin[i].to - kin[i].from) / dt;
        else om[i] += h * (-w2 * Math.sin(phi[i]) - DAMP * om[i]);
      }
      const hit = { v: 0, x: 0, y: this.L };
      this.solveContacts(hit);
      for (let i = 0; i < N; i++) {
        if (kin[i]) phi[i] = kin[i].from + (kin[i].to - kin[i].from) * (s / SUB);
        else phi[i] += h * om[i];
      }
      this.separate();
      if (hit.v > 0.7) this.clack(hit, this.t - dt + s * h);
    }
    // let a nearly still row settle completely
    let still = !ctl.length;
    for (let i = 0; i < N && still; i++) still = Math.abs(om[i]) < 0.004 && Math.abs(phi[i]) < 0.0015;
    if (still) {
      phi.fill(0);
      om.fill(0);
    }
    // motion trails (design units)
    for (let i = 0; i < N; i++) {
      const hl = this.hist[i];
      hl.push(this.ballX(i), this.L * Math.cos(phi[i]));
      if (hl.length > 16) hl.splice(0, 2);
    }
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
  }

  /** One audible clack per ~25 ms, volume from impact speed; stats, stars and a little glint. */
  clack(hit, time) {
    if (time - this.lastClack < 0.025) return;
    this.lastClack = time;
    const app = this.app;
    const vol = G.clamp(hit.v / 26, 0.05, 1);
    const sx = this.screenX(hit.x), sy = this.screenY(hit.y);
    const pan = G.clamp((sx / Math.max(1, app.w) - 0.5) * 0.9, -0.9, 0.9);
    const a = app.audio, kind = STYLES[this.variant].ball;
    a.clack(vol, pan);
    // a quiet accent so each style sounds like its material
    const r = G.rand(0.95, 1.06);
    if (kind === 'glass') a.tone({ freq: 2900 * r, dur: 0.22, vol: 0.05 * vol, pan, reverb: 0.25 });
    else if (kind === 'neon') a.tone({ freq: 1250 * r, freqEnd: 880 * r, type: 'triangle', dur: 0.08, vol: 0.05 * vol, pan, reverb: 0.2 });
    else if (kind === 'planet') a.tone({ freq: 240 * r, freqEnd: 150 * r, dur: 0.1, vol: 0.09 * vol, pan });
    else if (kind === 'candy') a.pop(1.4 * r, 0.3 * vol, pan);
    app.stat('clacks');
    const amt = Math.min(0.03, this.budget);
    if (amt > 0.001) {
      this.budget -= amt;
      app.addProgress(amt, sx, sy);
    }
    if (vol > 0.12 && this.flashes.length < 6) this.flashes.push({ x: hit.x, y: hit.y, t: 0, life: 0.2, p: vol });
  }

  // ---------------------------------------------------------------- sprites & cached layers
  /** Cached ball sprite: { body, tex?, glow?, ringBack?, ringFront?, size }. */
  ballSprite(i, R, style = this.variant, cache = this.sprites) {
    const st = STYLES[style];
    const shared = st.ball === 'metal';
    const key = `${style}|${shared ? 0 : i}|${R.toFixed(2)}`;
    let spr = cache.get(key);
    if (spr) return spr;
    if (cache.size > 80) cache.clear(); // chip icons are keyed by size: don't grow forever on resizes
    const dpr = this.app.dpr || 1;
    const glow = st.ball === 'neon', saturn = st.ball === 'planet' && i === 3;
    const m = R * (glow ? 2.1 : saturn ? 1.9 : 1.08);
    const make = (fn) => {
      const c = G.makeCanvas(m * 2 * dpr, m * 2 * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(m, m);
      fn(g);
      return c;
    };
    spr = { size: m * 2 };
    if (st.ball === 'metal') spr.body = make((g) => paintMetal(g, R, st.metal, st.felt));
    else if (st.ball === 'glass') spr.body = make((g) => paintGlass(g, R, st.colors[i]));
    else if (st.ball === 'neon') {
      const c = st.colors[i];
      spr.glow = make((g) => {
        const gg = g.createRadialGradient(0, 0, R * 0.7, 0, 0, m);
        gg.addColorStop(0, G.alpha(c, 0.6));
        gg.addColorStop(0.35, G.alpha(c, 0.22));
        gg.addColorStop(1, G.alpha(c, 0));
        g.fillStyle = gg;
        g.fillRect(-m, -m, m * 2, m * 2);
      });
      spr.body = make((g) => paintNeon(g, R, c));
    } else if (st.ball === 'planet') {
      spr.tex = make((g) => paintPlanet(g, R, i));
      spr.body = make((g) => paintShading(g, R, false, i === 0 ? 'rgba(130,190,255,0.35)' : null));
      if (saturn) {
        spr.ringBack = make((g) => paintRing(g, R, false));
        spr.ringFront = make((g) => paintRing(g, R, true));
      }
    } else {
      spr.tex = make((g) => paintCandy(g, R, st.colors[i]));
      spr.body = make((g) => paintShading(g, R, true, null));
    }
    cache.set(key, spr);
    return spr;
  }

  /** Small polished cap on top of each ball where the strings meet. */
  capSprite(R) {
    const key = `cap|${R.toFixed(2)}`;
    let spr = this.sprites.get(key);
    if (spr) return spr;
    const dpr = this.app.dpr || 1, w = R * 0.42, h = R * 0.36;
    const c = G.makeCanvas(w * dpr + 2, h * dpr + 2);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#f4f6f8');
    gr.addColorStop(0.45, '#9aa1aa');
    gr.addColorStop(1, '#4a5058');
    G.roundRect(g, 0, 0, w, h, w * 0.25);
    g.fillStyle = gr;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(w * 0.18, h * 0.12, w * 0.12, h * 0.7);
    spr = { c, w, h };
    this.sprites.set(key, spr);
    return spr;
  }

  shadowSprite() {
    let spr = this.sprites.get('shadow');
    if (spr) return spr;
    const s = 64;
    const c = G.makeCanvas(s, s);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    spr = { c };
    this.sprites.set('shadow', spr);
    return spr;
  }

  /** Glossy tube along a path (frame), shaded as if lit from the top-left. */
  tube(g, path, w, color, neon) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pass = (dx, lw, col) => {
      g.save();
      g.translate(-w * dx, -w * dx);
      g.lineWidth = w * lw;
      g.strokeStyle = col;
      g.stroke(path);
      g.restore();
    };
    pass(0, 1, G.shade(color, -0.35));
    pass(0.07, 0.74, color);
    pass(0.15, 0.36, G.shade(color, 0.28));
    pass(0.2, 0.11, 'rgba(255,255,255,0.7)');
    if (neon) {
      g.save();
      g.shadowColor = neon;
      g.shadowBlur = w * 0.9 * this.k * (this.app.dpr || 1);
      g.lineWidth = w * 0.16;
      g.strokeStyle = neon;
      g.stroke(path);
      g.restore();
    }
  }

  /** Renders the static frame into two cached layers: behind the balls, and the bar in front. */
  renderLayers() {
    const st = STYLES[this.variant], k = this.k, dpr = this.app.dpr || 1;
    const x0 = -BOX_W / 2, y0 = BOX_TOP - 0.4, w = BOX_W, h = this.boxH + 0.8;
    const BASE_TOP = this.L + 1.15, BASE_MID = this.L + 1.55, BASE_BOT = this.L + 2.45;
    const make = (fn) => {
      const c = G.makeCanvas(w * k * dpr, h * k * dpr);
      const g = c.getContext('2d');
      g.scale(dpr * k, dpr * k);
      g.translate(-x0, -y0);
      fn(g);
      return c;
    };
    const RC = 1.05, FOOT = BASE_TOP + 0.25;
    const arch = (inset, top, foot) => {
      const p = new Path2D();
      const X = POST - inset;
      p.moveTo(-X, foot);
      p.lineTo(-X, top + RC);
      p.arcTo(-X, top, -X + RC, top, RC);
      p.lineTo(X - RC, top);
      p.arcTo(X, top, X, top + RC, RC);
      p.lineTo(X, foot);
      return p;
    };
    const back = make((g) => {
      // soft shadow of the whole toy on the table
      g.save();
      g.shadowColor = st.stars || st.neon ? 'rgba(0,0,0,0.55)' : 'rgba(80,30,20,0.3)';
      g.shadowBlur = 0.9 * k * dpr;
      g.shadowOffsetY = 0.35 * k * dpr;
      G.roundRect(g, -BASE_X, BASE_TOP, BASE_X * 2, BASE_BOT - BASE_TOP, 0.55);
      g.fillStyle = st.frame;
      g.fill();
      g.restore();
      // back arch (further away: a little higher, thinner and darker)
      this.tube(g, arch(0.3, BAR - 0.62, BASE_TOP + 0.08), TUBE * 0.78, G.shade(st.frame, -0.22), null);
      // base: front face, top face with felt inset
      G.roundRect(g, -BASE_X, BASE_MID - 0.1, BASE_X * 2, BASE_BOT - BASE_MID + 0.1, 0.5);
      const fg = g.createLinearGradient(0, BASE_MID, 0, BASE_BOT);
      fg.addColorStop(0, G.shade(st.frame, 0.08));
      fg.addColorStop(1, G.shade(st.frame, -0.3));
      g.fillStyle = fg;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.fillRect(-BASE_X + 0.45, BASE_MID + 0.08, BASE_X * 2 - 0.9, 0.12);
      G.roundRect(g, -BASE_X + 0.1, BASE_TOP, BASE_X * 2 - 0.2, BASE_MID - BASE_TOP + 0.05, 0.3);
      g.fillStyle = G.shade(st.frame, 0.16);
      g.fill();
      G.roundRect(g, -BASE_X + 0.75, BASE_TOP + 0.08, BASE_X * 2 - 1.5, BASE_MID - BASE_TOP - 0.16, 0.14);
      const felt = g.createLinearGradient(0, BASE_TOP, 0, BASE_MID);
      felt.addColorStop(0, G.shade(st.felt, -0.12));
      felt.addColorStop(1, G.shade(st.felt, 0.08));
      g.fillStyle = felt;
      g.fill();
      if (st.trim) {
        g.strokeStyle = st.trim;
        g.lineWidth = 0.07;
        g.beginPath();
        g.moveTo(-BASE_X + 0.5, BASE_BOT - 0.28);
        g.lineTo(BASE_X - 0.5, BASE_BOT - 0.28);
        g.stroke();
      }
      if (st.neon) {
        g.save();
        g.shadowColor = st.neon;
        g.shadowBlur = 0.5 * k * dpr;
        g.strokeStyle = st.neon;
        g.lineWidth = 0.08;
        g.beginPath();
        g.moveTo(-BASE_X + 0.5, BASE_MID + 0.05);
        g.lineTo(BASE_X - 0.5, BASE_MID + 0.05);
        g.stroke();
        g.restore();
      }
      // front arch (its bar is drawn again in front of the strings)
      this.tube(g, arch(0, BAR, FOOT), TUBE, st.frame, st.neon);
      for (const sx of [-POST, POST]) {
        G.roundRect(g, sx - 0.55, FOOT - 0.2, 1.1, 0.36, 0.16);
        g.fillStyle = G.shade(st.frame, -0.15);
        g.fill();
      }
    });
    const front = make((g) => {
      const bar = new Path2D();
      bar.moveTo(-POST + RC, BAR);
      bar.lineTo(POST - RC, BAR);
      g.save();
      this.tube(g, bar, TUBE, st.frame, st.neon);
      g.restore();
      g.lineCap = 'butt';
      // eyelets under the bar where the strings are tied
      for (let i = 0; i < N; i++) {
        for (const sx of [-0.55, 0.55]) {
          const x = (i - 2) * 2 + sx;
          g.fillStyle = G.shade(st.frame, -0.45);
          g.beginPath();
          g.arc(x, BAR + TUBE * 0.42, 0.09, 0, G.TAU);
          g.fill();
        }
      }
    });
    this.layers = { back, front, x0, y0, w, h };
  }

  // ---------------------------------------------------------------- drawing
  drawStars(ctx) {
    const app = this.app;
    if (!this.stars) {
      const rnd = mulberry(77);
      this.stars = Array.from({ length: 80 }, () => ({ u: rnd(), v: rnd(), s: 0.5 + rnd() * 1.3, ph: rnd() * G.TAU }));
    }
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 1.7 + s.ph));
      ctx.fillRect(s.u * app.w, s.v * app.h, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    const app = this.app, st = STYLES[this.variant], k = this.k;
    G.drawSoftBackground(ctx, app.w, app.h, st.bg[0], st.bg[1], st.neon || st.stars ? { glow: 'rgba(160,120,255,0.12)', dots: !st.stars } : undefined);
    if (st.stars) this.drawStars(ctx);
    if (!this.layers) this.renderLayers();
    const Ly = this.layers;
    const lx = this.screenX(Ly.x0), ly = this.screenY(Ly.y0), lw = Ly.w * k, lh = Ly.h * k;
    ctx.drawImage(Ly.back, lx, ly, lw, lh);
    const R = k;
    const bx = [], by = [];
    for (let i = 0; i < N; i++) {
      bx.push(this.screenX(this.ballX(i)));
      by.push(this.screenY(this.L * Math.cos(this.phi[i])));
    }
    // soft shadows on the felt (smaller and fainter as a ball rises)
    const sh = this.shadowSprite();
    const shadowY = this.screenY(this.L + 1.15 + 0.22);
    for (let i = 0; i < N; i++) {
      const gap = (shadowY - by[i]) / k - 1;
      const rx = (1.05 + gap * 0.12) * k, ry = rx * 0.24;
      ctx.globalAlpha = G.clamp(0.42 / (1 + gap * 0.45), 0.05, 0.42);
      ctx.drawImage(sh.c, bx[i] + gap * 0.1 * k - rx, shadowY - ry, rx * 2, ry * 2);
    }
    ctx.globalAlpha = 1;
    // strings: a V from the bar to the cap on top of each ball
    ctx.strokeStyle = st.string;
    ctx.lineWidth = Math.max(1, k * 0.05);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const s = Math.sin(this.phi[i]), c = Math.cos(this.phi[i]);
      const ax = bx[i] - s * 1.25 * k, ay = by[i] - c * 1.25 * k;
      const px = this.screenX((i - 2) * 2), top = this.screenY(BAR + TUBE * 0.4);
      ctx.moveTo(px - 0.55 * k, top);
      ctx.lineTo(ax, ay);
      ctx.lineTo(px + 0.55 * k, top);
    }
    ctx.stroke();
    this.drawTrails(ctx, bx, by, R);
    // balls (Saturn last so its ring overlaps its neighbours)
    const order = st.ball === 'planet' ? [0, 1, 2, 4, 3] : [0, 1, 2, 3, 4];
    const cap = this.capSprite(R);
    for (const i of order) {
      const spr = this.ballSprite(i, R);
      const half = spr.size / 2, rot = -this.phi[i];
      if (spr.glow) {
        // neon halo, breathing gently and flaring with speed
        const flare = Math.min(1, Math.abs(this.om[i]) / 4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.75 + 0.15 * Math.sin(this.t * 2.2 + i * 1.3) + 0.1 * flare;
        ctx.drawImage(spr.glow, bx[i] - half, by[i] - half, spr.size, spr.size);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(bx[i], by[i]);
      ctx.rotate(rot);
      ctx.drawImage(cap.c, -cap.w / 2, -R * 1.22, cap.w, cap.h);
      if (spr.ringBack) ctx.drawImage(spr.ringBack, -half, -half, spr.size, spr.size);
      if (spr.tex) ctx.drawImage(spr.tex, -half, -half, spr.size, spr.size);
      ctx.rotate(-rot);
      ctx.drawImage(spr.body, -half, -half, spr.size, spr.size);
      if (spr.ringFront) {
        ctx.rotate(rot);
        ctx.drawImage(spr.ringFront, -half, -half, spr.size, spr.size);
      }
      ctx.restore();
    }
    ctx.drawImage(Ly.front, lx, ly, lw, lh);
    this.drawFlashes(ctx, R);
  }

  drawTrails(ctx, bx, by, R) {
    const st = STYLES[this.variant];
    const neon = st.ball === 'neon';
    for (let i = 0; i < N; i++) {
      const speed = Math.abs(this.om[i]) * this.L; // units per second
      const amt = G.clamp((speed - (neon ? 2 : 6)) / 22, 0, 1) * st.trail;
      const hl = this.hist[i];
      if (amt <= 0.01 || hl.length < 6) continue;
      if (neon) {
        // glowing light streak through the recent positions
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.strokeStyle = st.colors[i];
        const n = hl.length / 2;
        for (let j = 1; j < n; j++) {
          const f = j / n;
          ctx.globalAlpha = amt * f * 0.8;
          ctx.lineWidth = R * (0.5 + 1.2 * f);
          ctx.beginPath();
          ctx.moveTo(this.screenX(hl[(j - 1) * 2]), this.screenY(hl[(j - 1) * 2 + 1]));
          ctx.lineTo(this.screenX(hl[j * 2]), this.screenY(hl[j * 2 + 1]));
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      // faint ghost copies (motion blur)
      const spr = this.ballSprite(i, R);
      const half = spr.size / 2;
      for (const back of [2, 4, 6]) {
        const j = hl.length / 2 - 1 - back;
        if (j < 0) break;
        ctx.globalAlpha = amt * (1 - back / 8);
        ctx.drawImage(spr.body, this.screenX(hl[j * 2]) - half, this.screenY(hl[j * 2 + 1]) - half, spr.size, spr.size);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawFlashes(ctx, R) {
    if (!this.flashes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const k = 1 - f.t / f.life;
      const x = this.screenX(f.x), y = this.screenY(f.y);
      const s = R * (0.35 + 0.65 * f.p) * (0.6 + 0.4 * k);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, s * 1.6);
      gr.addColorStop(0, `rgba(255,255,255,${0.7 * k})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2);
      ctx.globalAlpha = k;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      G.softStarPath(ctx, x, y, 4, s, s * 0.18, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  hud() {
    return G.countLabel(this.app.getStat('clacks'), LABEL, this.app.lang);
  }

  drawVariantIcon(ctx, i, x, y, r) {
    const st = STYLES[i];
    ctx.fillStyle = st.bg[1];
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const R = r * 0.34;
    // three touching balls; for planets: earth, jupiter, then saturn in the middle (ring on top)
    const pick = st.ball === 'planet' ? [[-1, 0], [1, 2], [0, 3]] : [[-1, 0], [0, 1], [1, 2]];
    for (const [b, ball] of pick) {
      const spr = this.ballSprite(ball, R, i, this.icons);
      const half = spr.size / 2, cx = x + b * R * 2, cy = y + r * 0.08;
      if (spr.glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(spr.glow, cx - half, cy - half, spr.size, spr.size);
        ctx.restore();
      }
      if (spr.ringBack) ctx.drawImage(spr.ringBack, cx - half, cy - half, spr.size, spr.size);
      if (spr.tex) ctx.drawImage(spr.tex, cx - half, cy - half, spr.size, spr.size);
      ctx.drawImage(spr.body, cx - half, cy - half, spr.size, spr.size);
      if (spr.ringFront) ctx.drawImage(spr.ringFront, cx - half, cy - half, spr.size, spr.size);
    }
  }
}
