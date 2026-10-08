// Shared UI widgets: round icon buttons, pills, modal dialogs.
import * as G from './gfx.js';

/**
 * Round chunky icon button. b: { x, y, r, icon, color, iconColor, pressed, disabled, highlight, _press }
 * _press is animated by updateButton().
 */
export function drawRoundButton(ctx, b, time = 0) {
  const { x, y, r, icon, color = '#ff8a3d', iconColor = '#fff', disabled = false, highlight = false } = b;
  const press = b._press || 0;
  const depth = r * 0.16;
  const fy = y - depth * 0.5 + depth * press;
  ctx.save();
  if (disabled) ctx.globalAlpha *= 0.5;
  G.circle(ctx, x, y + depth * 0.5 + r * 0.08, r);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();
  G.circle(ctx, x, y + depth * 0.5, r);
  ctx.fillStyle = G.shade(color, -0.38);
  ctx.fill();
  const g = ctx.createLinearGradient(0, fy - r, 0, fy + r);
  g.addColorStop(0, G.shade(color, 0.22));
  g.addColorStop(1, G.shade(color, -0.05));
  G.circle(ctx, x, fy, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, fy - r * 0.48, r * 0.62, r * 0.3, 0, 0, G.TAU);
  ctx.fill();
  G.drawIcon(ctx, typeof icon === 'function' ? icon() : icon, x, fy + r * 0.02, r * 1.0, iconColor);
  if (highlight) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    G.circle(ctx, x, fy, r + 3 + pulse * 3);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * pulse})`;
    ctx.stroke();
  }
  ctx.restore();
}

export function updateButton(b, dt) {
  b._press = G.damp(b._press || 0, b.pressed ? 1 : 0, 30, dt);
}

export function hitCircle(b, p, slop = 4) {
  return G.dist(p.x, p.y, b.x, b.y) <= b.r + slop;
}

export function drawPill(ctx, x, y, w, h, fill = 'rgba(40,22,10,0.45)') {
  G.roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Word-wrap text into lines that fit maxWidth at the given font size. */
export function wrapText(ctx, text, maxWidth, size, weight = 700) {
  ctx.save();
  ctx.font = G.font(size, weight);
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}

/** Toggle switch graphic. */
export function drawToggle(ctx, x, y, w, h, on, anim) {
  const t = anim === undefined ? (on ? 1 : 0) : anim;
  G.roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = G.mixColor('#c9bba9', '#3ccf7a', t);
  ctx.fill();
  const kr = h * 0.42;
  const kx = G.lerp(x + h / 2, x + w - h / 2, t);
  G.circle(ctx, kx, y + h / 2 + 1.5, kr);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fill();
  G.circle(ctx, kx, y + h / 2, kr);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

/**
 * Modal dialog. opt: { title, text, rows: [{label, get(), toggle()}], buttons: [{label, icon, color,
 * onTap, disabled}], preview(ctx, x, y, r), dismissible, onClose }.
 * Buttons close the modal unless onTap returns false.
 */
export class Modal {
  constructor(app, opt) {
    this.app = app;
    this.opt = opt;
    this.t = 0;
    this.closing = false;
    this.items = [];
    this.pressed = null;
    this.rowAnim = (opt.rows || []).map((r) => (r.get() ? 1 : 0));
  }

  layout() {
    const app = this.app, ctx = app.ctx, o = this.opt;
    const W = app.w, H = app.h;
    const k0 = G.clamp(Math.min(W, H) / 420, 0.75, 1.25);
    const build = (k) => {
      const pw = Math.min(W - 24, 400 * k);
      const pad = 22 * k;
      let y = pad;
      const items = [];
      const titleSize = 30 * k;
      if (o.title) {
        items.push({ type: 'title', y: y + titleSize * 0.6, size: titleSize });
        y += titleSize * 1.3;
      }
      if (o.preview) {
        const pr = 54 * k;
        items.push({ type: 'preview', y: y + pr, r: pr });
        y += pr * 2 + 12 * k;
      }
      if (o.text) {
        const size = 19 * k;
        const lines = wrapText(ctx, o.text, pw - pad * 2, size);
        items.push({ type: 'text', y: y + size * 0.6, size, lines });
        y += lines.length * size * 1.25 + 10 * k;
      }
      (o.rows || []).forEach((r, i) => {
        const rh = 50 * k;
        items.push({ type: 'row', y, h: rh, row: r, index: i, size: 21 * k });
        y += rh + 6 * k;
      });
      if (o.rows && o.rows.length) y += 8 * k;
      const bh = 52 * k;
      (o.buttons || []).forEach((b) => {
        items.push({ type: 'button', y, h: bh, b, size: 22 * k });
        y += bh + 10 * k;
      });
      if (o.footer) {
        items.push({ type: 'footer', y: y + 6 * k, size: 13 * k });
        y += 22 * k;
      }
      y += pad - 10 * k;
      return { pw, ph: y, pad, items, k };
    };
    let L = build(k0);
    if (L.ph > H - 24) L = build((k0 * (H - 24)) / L.ph);
    this.L = L;
    this.px = (W - L.pw) / 2;
    this.py = (H - L.ph) / 2;
    for (const it of L.items) {
      if (it.type === 'button' || it.type === 'row') {
        it.x = this.px + L.pad;
        it.w = L.pw - L.pad * 2;
      }
    }
  }

  hit(p) {
    for (const it of this.L.items) {
      if ((it.type === 'button' || it.type === 'row') && p.x >= it.x && p.x <= it.x + it.w && p.y >= this.py + it.y && p.y <= this.py + it.y + it.h) return it;
    }
    return null;
  }
  inside(p) {
    return p.x >= this.px && p.x <= this.px + this.L.pw && p.y >= this.py && p.y <= this.py + this.L.ph;
  }

  down(p) {
    this.pressed = this.hit(p);
    this.downInside = this.inside(p);
  }
  move(p) {
    if (this.pressed && this.hit(p) !== this.pressed) this.pressed = null;
  }
  up(p) {
    const it = this.pressed;
    this.pressed = null;
    if (it && this.hit(p) === it) {
      if (it.type === 'row') {
        it.row.toggle();
        this.app.audio.tap();
      } else if (!it.b.disabled) {
        this.app.audio.tap();
        const r = it.b.onTap ? it.b.onTap() : undefined;
        if (r !== false) this.close();
      } else this.app.audio.deny();
    } else if (!this.downInside && !this.inside(p) && this.opt.dismissible !== false) {
      this.close();
    }
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.t = Math.min(this.t, 1);
    this.opt.onClose?.();
  }

  update(dt) {
    this.t += dt * (this.closing ? -6 : 5);
    (this.opt.rows || []).forEach((r, i) => {
      this.rowAnim[i] = G.damp(this.rowAnim[i], r.get() ? 1 : 0, 18, dt);
    });
    return !(this.closing && this.t <= 0);
  }

  draw(ctx) {
    this.layout();
    const L = this.L, app = this.app;
    const a = G.clamp(this.t, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(20,10,4,${0.55 * a})`;
    ctx.fillRect(0, 0, app.w, app.h);
    const s = this.closing ? G.lerp(0.9, 1, a) : G.ease.outBack(a) * 0.15 + 0.85;
    ctx.globalAlpha = a;
    ctx.translate(app.w / 2, app.h / 2);
    ctx.scale(s, s);
    ctx.translate(-app.w / 2, -app.h / 2);
    const { px, py } = this;
    const r = 26 * L.k;
    G.roundRect(ctx, px, py + 8 * L.k, L.pw, L.ph, r);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    G.roundRect(ctx, px, py, L.pw, L.ph, r);
    ctx.fillStyle = '#fff7ea';
    ctx.fill();
    ctx.lineWidth = 5 * L.k;
    ctx.strokeStyle = '#f0c98e';
    ctx.stroke();
    const cx = px + L.pw / 2;
    const o = this.opt;
    for (const it of L.items) {
      const y = py + it.y;
      switch (it.type) {
        case 'title':
          G.drawText(ctx, o.title, cx, y, { size: it.size, color: '#5a3416', maxWidth: L.pw - L.pad * 2 });
          break;
        case 'preview':
          o.preview(ctx, cx, y, it.r);
          break;
        case 'text':
          it.lines.forEach((ln, i) => G.drawText(ctx, ln, cx, y + i * it.size * 1.25, { size: it.size, weight: 700, color: '#7a5434' }));
          break;
        case 'row': {
          G.roundRect(ctx, it.x, y, it.w, it.h, it.h * 0.3);
          ctx.fillStyle = this.pressed === it ? '#f6e3c8' : '#fbecd6';
          ctx.fill();
          if (it.row.icon) G.drawIcon(ctx, it.row.icon, it.x + it.h * 0.5, y + it.h / 2, it.h * 0.5, '#b07a45');
          G.drawText(ctx, it.row.label, it.x + it.h * (it.row.icon ? 0.95 : 0.4), y + it.h / 2 + 1, { size: it.size, color: '#5a3416', align: 'left', maxWidth: it.w - it.h * 2.4 });
          const tw = it.h * 1.25, th = it.h * 0.62;
          drawToggle(ctx, it.x + it.w - tw - it.h * 0.25, y + (it.h - th) / 2, tw, th, it.row.get(), this.rowAnim[it.index]);
          break;
        }
        case 'button': {
          const b = it.b;
          const press = this.pressed === it ? 1 : 0;
          ctx.save();
          if (b.disabled) ctx.globalAlpha *= 0.55;
          const top = G.chunkyRect(ctx, it.x, y, it.w, it.h - 6 * L.k, it.h * 0.3, b.color || '#ff8a3d', 6 * L.k, { pressed: press });
          const ty = top + (it.h - 6 * L.k) / 2 + 1;
          const label = b.label;
          const iconW = b.icon ? it.size * 1.3 : 0;
          const tw = G.measureText(ctx, label, it.size);
          const total = Math.min(it.w - 20, tw + iconW);
          const sx = cx - total / 2;
          if (b.icon) G.drawIcon(ctx, b.icon, sx + it.size * 0.55, ty, it.size * 1.1, '#fff');
          G.drawText(ctx, label, sx + iconW + Math.min(tw, it.w - 20 - iconW) / 2, ty, { size: it.size, color: '#fff', stroke: 4 * L.k, strokeColor: 'rgba(0,0,0,0.18)', maxWidth: it.w - 20 - iconW });
          ctx.restore();
          break;
        }
        case 'footer':
          G.drawText(ctx, o.footer, cx, y, { size: it.size, weight: 600, color: '#b0916f' });
          break;
      }
    }
    ctx.restore();
  }
}
