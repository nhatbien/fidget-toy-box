// Drawing + math helpers shared by every scene and toy.

export const FONT = "'Baloo 2', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const TAU = Math.PI * 2;

// ---------- math ----------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
/** Frame-rate independent smoothing toward a target. */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

export const ease = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
};

/** Distance from point to segment. */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ---------- color ----------
const _rgbCache = new Map();
/** Parse '#rgb', '#rrggbb', 'rgb()', 'rgba()' into [r,g,b,a]. */
export function parseColor(c) {
  let v = _rgbCache.get(c);
  if (v) return v;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  } else {
    const m = c.match(/[\d.]+/g) || [0, 0, 0];
    v = [+m[0], +m[1], +m[2], m[3] !== undefined ? +m[3] : 1];
  }
  _rgbCache.set(c, v);
  return v;
}
export const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
/** amt in [-1, 1]: negative darkens toward black, positive lightens toward white. */
export function shade(c, amt, a) {
  const [r, g, b, a0] = parseColor(c);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  return rgba(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k, a === undefined ? a0 : a);
}
export function alpha(c, a) {
  const [r, g, b] = parseColor(c);
  return rgba(r, g, b, a);
}
export function mixColor(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  return rgba(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t));
}
export const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export const RAINBOW = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#3ddc84', '#3a86ff', '#9b5de5'];

// ---------- paths ----------
export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}
export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}
export function starPath(ctx, cx, cy, spikes, outerR, innerR, rot = -Math.PI / 2) {
  const step = Math.PI / spikes;
  ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? innerR : outerR;
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
  }
  ctx.closePath();
}
/** Rounded star (soft spikes) — friendlier for toys. */
export function softStarPath(ctx, cx, cy, spikes, outerR, innerR, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rot + (i * Math.PI) / spikes;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const n = pts.length;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}
/** Heart centered at (cx, cy) fitting roughly in a size×size box. */
export function heartPath(ctx, cx, cy, size) {
  const s = size / 2;
  const top = cy - s * 0.55;
  ctx.moveTo(cx, cy + s * 0.95);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.1, cx - s * 1.05, top - s * 0.75, cx, top + s * 0.05);
  ctx.bezierCurveTo(cx + s * 1.05, top - s * 0.75, cx + s * 1.25, cy + s * 0.1, cx, cy + s * 0.95);
  ctx.closePath();
}
export function polygonPath(ctx, cx, cy, sides, r, rot = -Math.PI / 2) {
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * TAU) / sides;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
/** Smooth closed curve through points [[x,y],...] using quadratic midpoints. */
export function smoothClosedPath(ctx, pts) {
  const n = pts.length;
  if (n < 3) return;
  const mx = (pts[n - 1][0] + pts[0][0]) / 2, my = (pts[n - 1][1] + pts[0][1]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

// ---------- canvases ----------
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---------- text ----------
export function font(size, weight = 800) {
  return `${weight} ${Math.round(size)}px ${FONT}`;
}
/**
 * Draw text. opt: size, weight, color, align, baseline, stroke (line width), strokeColor,
 * shadow (color or true), maxWidth (shrinks the font to fit), alpha.
 */
export function drawText(ctx, str, x, y, opt = {}) {
  const {
    size = 20, weight = 800, color = '#fff', align = 'center', baseline = 'middle',
    stroke = 0, strokeColor = 'rgba(0,0,0,0.35)', shadow = null, maxWidth = 0,
  } = opt;
  str = String(str);
  let s = size;
  ctx.save();
  ctx.font = font(s, weight);
  if (maxWidth > 0) {
    const w = ctx.measureText(str).width;
    if (w > maxWidth) {
      s = Math.max(8, (s * maxWidth) / w);
      ctx.font = font(s, weight);
    }
  }
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha;
  if (shadow) {
    ctx.shadowColor = shadow === true ? 'rgba(0,0,0,0.3)' : shadow;
    ctx.shadowBlur = s * 0.15;
    ctx.shadowOffsetY = s * 0.08;
  }
  if (stroke > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(str, x, y);
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
  return s;
}
export function measureText(ctx, str, size, weight = 800) {
  ctx.save();
  ctx.font = font(size, weight);
  const w = ctx.measureText(String(str)).width;
  ctx.restore();
  return w;
}
/**
 * Plural form for a count. `forms` is a string (no plural, e.g. Vietnamese) or
 * [one, other] — Russian takes [one, few, many].
 */
export function pluralize(n, forms, lang) {
  if (!Array.isArray(forms)) return forms;
  if (lang === 'ru' && forms.length >= 3) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }
  if (lang === 'fr') return n <= 1 ? forms[0] : forms[forms.length - 1];
  return n === 1 ? forms[0] : forms[forms.length - 1];
}

/** "1 pop" / "1,234 pops" from a per-language label table of pluralize() forms. */
export function countLabel(n, labels, lang) {
  const forms = labels[lang] ?? labels.en;
  return `${formatNum(n)} ${pluralize(Math.floor(n || 0), forms, lang)}`;
}

/** 1234 → "1,234", 123456 → "123K", 1234567 → "1.2M". */
export function formatNum(n) {
  n = Math.max(0, Math.floor(n || 0));
  if (n < 1e5) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (n < 1e6) return Math.floor(n / 1000) + 'K';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
}

// ---------- glossy shapes ----------
/** Shiny sphere / dome. */
export function glossyBall(ctx, x, y, r, color, opt = {}) {
  const { highlight = 0.55, shadowAmt = 0.35, outline = 0 } = opt;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, shade(color, highlight));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -shadowAmt));
  circle(ctx, x, y, r);
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) {
    ctx.lineWidth = outline;
    ctx.strokeStyle = shade(color, -0.45);
    ctx.stroke();
  }
  // specular
  ctx.save();
  ctx.globalAlpha *= 0.85;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.33, y - r * 0.42, r * 0.28, r * 0.17, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Raised rounded rectangle with a darker base "lip" for a chunky 3D look. */
export function chunkyRect(ctx, x, y, w, h, r, color, depth = 6, opt = {}) {
  const { pressed = 0, outline = 0, gloss = true } = opt;
  const d = depth * (1 - pressed);
  // lip
  roundRect(ctx, x, y + depth - d + d, w, h, r);
  ctx.fillStyle = shade(color, -0.35);
  ctx.fill();
  const top = y + (depth - d);
  roundRect(ctx, x, top, w, h, r);
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, shade(color, 0.18));
  g.addColorStop(1, shade(color, -0.06));
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) {
    ctx.lineWidth = outline;
    ctx.strokeStyle = shade(color, -0.4);
    ctx.stroke();
  }
  if (gloss) {
    ctx.save();
    roundRect(ctx, x + r * 0.35, top + h * 0.08, w - r * 0.7, h * 0.32, Math.min(r, h * 0.16));
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.restore();
  }
  return top;
}

// ---------- backgrounds ----------
let _dotPattern = null;
function dotPattern(ctx) {
  if (_dotPattern) return _dotPattern;
  const c = makeCanvas(48, 48);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath();
  g.arc(12, 12, 3, 0, TAU);
  g.arc(36, 36, 3, 0, TAU);
  g.fill();
  _dotPattern = ctx.createPattern(c, 'repeat');
  return _dotPattern;
}
/** Soft vertical gradient + center glow + subtle dots — the shared toy backdrop. */
export function drawSoftBackground(ctx, w, h, top, bottom, opt = {}) {
  const { glow = 'rgba(255,255,255,0.18)', dots = true } = opt;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.6);
  rg.addColorStop(0, glow);
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  if (dots) {
    ctx.fillStyle = dotPattern(ctx);
    ctx.fillRect(0, 0, w, h);
  }
  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/** Soft drop shadow ellipse under an object. */
export function groundShadow(ctx, x, y, rx, ry, a = 0.25) {
  if (!(rx > 0) || !(ry > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------- icons ----------
/** Simple vector icons, drawn centered at (x, y) inside an s×s box. */
export function drawIcon(ctx, name, x, y, s, color = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  const u = s / 24; // icons designed on a 24-unit grid centered at 0
  ctx.scale(u, u);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = () => ctx.beginPath();
  switch (name) {
    case 'home':
      P();
      ctx.moveTo(-9, -1); ctx.lineTo(0, -9); ctx.lineTo(9, -1);
      ctx.stroke();
      P();
      ctx.moveTo(-6.5, -3); ctx.lineTo(-6.5, 8); ctx.lineTo(6.5, 8); ctx.lineTo(6.5, -3);
      ctx.stroke();
      P(); roundRectPath(ctx, -2.2, 2, 4.4, 6, 1.2); ctx.fill();
      break;
    case 'gear': {
      P();
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        ctx.save(); ctx.rotate(a);
        roundRectPath(ctx, -2.2, -10, 4.4, 5, 1.2);
        ctx.restore();
      }
      ctx.fill();
      P(); ctx.arc(0, 0, 6.6, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      P(); ctx.arc(0, 0, 2.8, 0, TAU); ctx.fill();
      break;
    }
    case 'refresh':
      P(); ctx.arc(0, 0, 7.5, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
      P(); ctx.moveTo(4.2, -10.5); ctx.lineTo(5.6, -5.4); ctx.lineTo(0.5, -4.2); ctx.stroke();
      break;
    case 'play':
      P(); ctx.moveTo(-5, -8); ctx.lineTo(8, 0); ctx.lineTo(-5, 8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'pause':
      P(); roundRectPath(ctx, -7, -8, 5, 16, 1.5); roundRectPath(ctx, 2, -8, 5, 16, 1.5); ctx.fill();
      break;
    case 'stop':
      P(); roundRectPath(ctx, -7, -7, 14, 14, 2.5); ctx.fill();
      break;
    case 'music':
      P(); ctx.ellipse(-5, 6, 3.6, 2.8, -0.4, 0, TAU); ctx.fill();
      P(); ctx.ellipse(6, 4, 3.6, 2.8, -0.4, 0, TAU); ctx.fill();
      P(); ctx.moveTo(-1.8, 6); ctx.lineTo(-1.8, -8); ctx.lineTo(9.2, -10); ctx.lineTo(9.2, 4); ctx.stroke();
      P(); ctx.moveTo(-1.8, -4); ctx.lineTo(9.2, -6); ctx.stroke();
      break;
    case 'note':
      P(); ctx.ellipse(-3, 6, 4.2, 3.2, -0.4, 0, TAU); ctx.fill();
      P(); ctx.moveTo(1, 5); ctx.lineTo(1, -9); ctx.quadraticCurveTo(7, -7, 7, -2); ctx.stroke();
      break;
    case 'sound':
      P(); ctx.moveTo(-9, -3.5); ctx.lineTo(-5, -3.5); ctx.lineTo(0, -8); ctx.lineTo(0, 8); ctx.lineTo(-5, 3.5); ctx.lineTo(-9, 3.5); ctx.closePath(); ctx.fill();
      P(); ctx.arc(1, 0, 5, -0.8, 0.8); ctx.stroke();
      P(); ctx.arc(1, 0, 9, -0.8, 0.8); ctx.stroke();
      break;
    case 'vibrate':
      P(); roundRectPath(ctx, -4.5, -8.5, 9, 17, 2); ctx.stroke();
      P(); ctx.moveTo(-8.5, -4); ctx.lineTo(-8.5, 4); ctx.moveTo(8.5, -4); ctx.lineTo(8.5, 4); ctx.stroke();
      break;
    case 'star':
      P(); softStarPath(ctx, 0, 0.8, 5, 11, 5.2); ctx.fill();
      break;
    case 'lock':
      P(); roundRectPath(ctx, -7, -2, 14, 11, 2.5); ctx.fill();
      P(); ctx.arc(0, -3, 4.6, Math.PI, 0); ctx.lineTo(4.6, -1); ctx.moveTo(-4.6, -1); ctx.lineTo(-4.6, -3); ctx.stroke();
      break;
    case 'check':
      P(); ctx.moveTo(-8, 0.5); ctx.lineTo(-2.5, 6); ctx.lineTo(8.5, -6); ctx.lineWidth = 3.4; ctx.stroke();
      break;
    case 'plus':
      P(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.lineWidth = 3.2; ctx.stroke();
      break;
    case 'minus':
      P(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineWidth = 3.2; ctx.stroke();
      break;
    case 'palette':
      P(); ctx.moveTo(0, -9);
      ctx.bezierCurveTo(-11, -9, -11, 9, 0, 9);
      ctx.bezierCurveTo(3, 9, 3, 5.5, 2, 4.5);
      ctx.bezierCurveTo(0.5, 2.5, 3, 0.5, 5, 1);
      ctx.bezierCurveTo(10, 2, 10, -9, 0, -9);
      ctx.closePath(); ctx.stroke();
      P(); ctx.arc(-4.5, -2, 1.6, 0, TAU); ctx.arc(-1, -5.5, 1.6, 0, TAU); ctx.arc(3.5, -4.5, 1.6, 0, TAU); ctx.arc(-4, 3, 1.6, 0, TAU); ctx.fill();
      break;
    case 'shuffle':
      P(); ctx.moveTo(-9, -5); ctx.lineTo(-4, -5); ctx.lineTo(4, 5); ctx.lineTo(8, 5);
      ctx.moveTo(-9, 5); ctx.lineTo(-4, 5); ctx.lineTo(4, -5); ctx.lineTo(8, -5); ctx.stroke();
      P(); ctx.moveTo(5, -8); ctx.lineTo(8.5, -5); ctx.lineTo(5, -2); ctx.moveTo(5, 2); ctx.lineTo(8.5, 5); ctx.lineTo(5, 8); ctx.stroke();
      break;
    case 'trash':
      P(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.moveTo(-3, -6); ctx.lineTo(-2, -9); ctx.lineTo(2, -9); ctx.lineTo(3, -6); ctx.stroke();
      P(); ctx.moveTo(-6, -3); ctx.lineTo(-5, 9); ctx.lineTo(5, 9); ctx.lineTo(6, -3); ctx.stroke();
      break;
    case 'brush':
      P(); ctx.moveTo(8, -9); ctx.lineTo(-1, 2); ctx.lineWidth = 3.6; ctx.stroke();
      P(); ctx.moveTo(-1.5, 1); ctx.quadraticCurveTo(-7, 0, -7, 6); ctx.quadraticCurveTo(-7, 9, -9.5, 9.5); ctx.quadraticCurveTo(-1, 11, 1, 4); ctx.closePath(); ctx.fill();
      break;
    case 'rake':
      P(); ctx.moveTo(0, -10); ctx.lineTo(0, 2); ctx.moveTo(-8, 2); ctx.lineTo(8, 2);
      for (let i = -8; i <= 8; i += 4) { ctx.moveTo(i, 2); ctx.lineTo(i, 9); }
      ctx.stroke();
      break;
    case 'sparkle':
      P(); softStarPath(ctx, -1, 1, 4, 10, 3, 0); ctx.fill();
      P(); softStarPath(ctx, 7.5, -7, 4, 4, 1.3, 0); ctx.fill();
      break;
    case 'speed':
      P(); ctx.arc(0, 3, 9, Math.PI, 0); ctx.stroke();
      P(); ctx.moveTo(0, 3); ctx.lineTo(5, -3); ctx.stroke();
      P(); ctx.arc(0, 3, 1.8, 0, TAU); ctx.fill();
      break;
    case 'swap':
      P(); ctx.moveTo(-8, -4); ctx.lineTo(7, -4); ctx.moveTo(3, -8); ctx.lineTo(7, -4); ctx.lineTo(3, 0);
      ctx.moveTo(8, 4); ctx.lineTo(-7, 4); ctx.moveTo(-3, 0); ctx.lineTo(-7, 4); ctx.lineTo(-3, 8); ctx.stroke();
      break;
    case 'drop':
      P(); ctx.moveTo(0, -10); ctx.bezierCurveTo(5, -3, 8, 1, 8, 4); ctx.arc(0, 4, 8, 0, Math.PI); ctx.bezierCurveTo(-8, 1, -5, -3, 0, -10); ctx.fill();
      break;
    case 'video':
      P(); roundRectPath(ctx, -10, -7, 20, 14, 3.5); ctx.fill();
      ctx.fillStyle = '#e8384f';
      P(); ctx.moveTo(-2.5, -3.8); ctx.lineTo(4, 0); ctx.lineTo(-2.5, 3.8); ctx.closePath(); ctx.fill();
      break;
    case 'heart':
      P(); heartPath(ctx, 0, 0.5, 19); ctx.fill();
      break;
    case 'circle':
      P(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      break;
    default:
      P(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
