// Main menu: a cozy wooden shelf holding every toy. Adapts its grid to any aspect ratio.
import * as G from './gfx.js';
import { drawRoundButton, hitCircle, drawPill } from './ui.js';
import { TOYS } from './toys/index.js';

export class Menu {
  constructor(app) {
    this.app = app;
    this.items = TOYS.map((T, i) => ({ T, i, hover: 0, press: 0, x: 0, y: 0, cw: 0, ch: 0 }));
    this.focus = -1;
    this.t = 0;
    this.down = null; // { id, item }
  }

  enter() {
    // Full pop-in the first time; a quick cascade when coming back from a toy.
    this.t = this.entered ? 0.55 : 0;
    this.entered = true;
    this.down = null;
    for (const it of this.items) it.press = 0;
    this.layout();
  }
  resize() {
    this.layout();
  }

  layout() {
    const app = this.app;
    const { w, h, pad, btn } = app;
    this.wide = w / h > 1.25;
    const r = btn / 2;
    app.settingsBtn.r = r;
    let grid;
    if (!this.wide) {
      const headerH = G.clamp(h * 0.22, 90, 250);
      app.settingsBtn.x = w - pad - r;
      app.settingsBtn.y = pad + r;
      this.starPill = { x: pad, y: pad + r, h: btn * 0.7 };
      const top = pad + btn * 0.75;
      this.logoBox = { x: pad + btn * 0.2, y: top, w: w - pad * 2 - btn * 0.4, h: headerH - top - pad * 0.3 };
      grid = { x: pad, y: headerH, w: w - pad * 2, h: h - headerH - pad };
    } else {
      const leftW = G.clamp(w * 0.3, 170, 460);
      app.settingsBtn.x = leftW - pad - r;
      app.settingsBtn.y = pad + r;
      this.starPill = { x: pad, y: pad + r, h: btn * 0.7 };
      const top = pad * 2 + btn;
      this.logoBox = { x: pad, y: top, w: leftW - pad * 2, h: h - top - pad * 2 };
      grid = { x: leftW, y: pad, w: w - leftW - pad, h: h - pad * 2 };
    }
    // Pick the column count that gives the biggest cells (cells are a bit taller than wide).
    const n = this.items.length;
    const aspect = 1.18;
    const inner = { w: grid.w - pad * 1.2, h: grid.h - pad * 1.2 };
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = Math.min(inner.w / cols, inner.h / (rows * aspect));
      const empty = rows * cols - n;
      const score = cw * (1 - empty * 0.04);
      if (!best || score > best.score) best = { cols, rows, cw, score };
    }
    const cw = Math.max(1, Math.min(best.cw, G.clamp(Math.min(w, h) * 0.46, 120, 250)));
    const ch = cw * aspect;
    const gw = cw * best.cols, gh = ch * best.rows;
    const gx = grid.x + (grid.w - gw) / 2, gy = grid.y + (grid.h - gh) / 2;
    this.grid = { x: gx, y: gy, w: gw, h: gh, cols: best.cols, rows: best.rows, cw, ch };
    this.items.forEach((it, i) => {
      const c = i % best.cols, rr = Math.floor(i / best.cols);
      it.x = gx + c * cw;
      it.y = gy + rr * ch;
      it.cw = cw;
      it.ch = ch;
    });
  }

  itemAt(p) {
    for (const it of this.items) {
      if (p.x >= it.x && p.x <= it.x + it.cw && p.y >= it.y && p.y <= it.y + it.ch) return it;
    }
    return null;
  }

  hitUi(p) {
    const app = this.app;
    if (hitCircle(app.settingsBtn, p, 6)) return app.settingsBtn;
    const sp = app.starPillRect;
    if (sp && p.x >= sp.x && p.x <= sp.x + sp.w && p.y >= sp.y && p.y <= sp.y + sp.h) return app.starInfoBtn();
    return null;
  }

  pointerDown(p) {
    const it = this.itemAt(p);
    if (it) {
      this.down = { id: p.id, item: it };
      this.app.audio.click(1.2, 0.6);
    }
  }
  pointerMove(p) {
    if (this.down && this.down.id === p.id && this.itemAt(p) !== this.down.item) this.down = null;
  }
  pointerUp(p) {
    const d = this.down;
    this.down = null;
    if (!d || d.id !== p.id || p.cancel) return;
    if (this.itemAt(p) === d.item) this.open(d.item);
  }
  pointerHover(p) {
    const it = this.itemAt(p);
    for (const x of this.items) x.hoverTarget = x === it ? 1 : 0;
  }
  open(it) {
    this.app.audio.pop(1.3, 0.8);
    this.app.haptic(15);
    this.app.openToy(it.T.id);
  }

  keyDown(e) {
    const { cols } = this.grid;
    const n = this.items.length;
    const k = e.key;
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(k)) {
      if (this.focus < 0) this.focus = 0;
      else if (k === 'ArrowRight') this.focus = (this.focus + 1) % n;
      else if (k === 'ArrowLeft') this.focus = (this.focus - 1 + n) % n;
      else if (k === 'ArrowDown') this.focus = Math.min(n - 1, this.focus + cols);
      else if (k === 'ArrowUp') this.focus = Math.max(0, this.focus - cols);
      this.app.audio.click(1.3, 0.5);
      return true;
    }
    if ((k === 'Enter' || k === ' ') && this.focus >= 0) {
      this.open(this.items[this.focus]);
      return true;
    }
    return false;
  }

  update(dt) {
    this.t += dt;
    for (const it of this.items) {
      const pressed = this.down && this.down.item === it;
      it.press = G.damp(it.press, pressed ? 1 : 0, 25, dt);
      it.hover = G.damp(it.hover, it.hoverTarget || 0, 14, dt);
    }
  }

  drawBackground(ctx) {
    const { w, h } = this.app;
    const img = this.app.images.bg_wood;
    if (img) {
      const s = G.clamp(Math.min(w, h) / 900, 0.4, 0.9);
      const tw = img.width * s, th = img.height * s;
      for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) ctx.drawImage(img, x, y, tw + 0.5, th + 0.5);
    } else {
      ctx.fillStyle = '#b8743a';
      ctx.fillRect(0, 0, w, h);
    }
    const lg = ctx.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, Math.max(w, h) * 1.1);
    lg.addColorStop(0, 'rgba(255,225,170,0.28)');
    lg.addColorStop(0.5, 'rgba(255,200,140,0.04)');
    lg.addColorStop(1, 'rgba(40,15,0,0.45)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
  }

  drawCabinet(ctx) {
    const g = this.grid, pad = this.app.pad;
    const fx = g.x - pad * 0.6, fy = g.y - pad * 0.6, fw = g.w + pad * 1.2, fh = g.h + pad * 1.2;
    const rr = Math.min(22, g.cw * 0.12);
    // drop shadow + frame
    G.roundRect(ctx, fx, fy + 6, fw, fh, rr);
    ctx.fillStyle = 'rgba(30,12,2,0.35)';
    ctx.fill();
    G.roundRect(ctx, fx, fy, fw, fh, rr);
    ctx.fillStyle = '#8a4f22';
    ctx.fill();
    ctx.lineWidth = Math.max(3, pad * 0.35);
    ctx.strokeStyle = '#c98a4b';
    ctx.stroke();
    // inner back panel: darker, with inner shadow
    const ix = g.x - pad * 0.15, iy = g.y - pad * 0.15, iw = g.w + pad * 0.3, ih = g.h + pad * 0.3;
    G.roundRect(ctx, ix, iy, iw, ih, rr * 0.6);
    const bg = ctx.createLinearGradient(0, iy, 0, iy + ih);
    bg.addColorStop(0, '#5b3214');
    bg.addColorStop(1, '#6e3e1a');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const img = this.app.images.bg_wood;
    if (img) {
      ctx.globalAlpha = 0.28;
      const s = g.cw / 300;
      const tw = img.width * s, th = img.height * s;
      for (let y = iy; y < iy + ih; y += th) for (let x = ix; x < ix + iw; x += tw) ctx.drawImage(img, x, y, tw + 0.5, th + 0.5);
      ctx.globalAlpha = 1;
    }
    // shelves
    for (let r = 0; r < g.rows; r++) {
      const rowTop = g.y + r * g.ch;
      const py = rowTop + g.ch * 0.74;
      const th = g.ch * 0.075;
      // soft shadow on the back wall above the plank
      const sh = ctx.createLinearGradient(0, py - g.ch * 0.08, 0, py);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = sh;
      ctx.fillRect(ix, py - g.ch * 0.08, iw, g.ch * 0.08);
      // plank top
      const top = ctx.createLinearGradient(0, py, 0, py + th * 0.45);
      top.addColorStop(0, '#e2a565');
      top.addColorStop(1, '#c9874a');
      ctx.fillStyle = top;
      ctx.fillRect(ix, py, iw, th * 0.45);
      // plank front
      const fr = ctx.createLinearGradient(0, py + th * 0.45, 0, py + th * 1.4);
      fr.addColorStop(0, '#a8662e');
      fr.addColorStop(1, '#7d4519');
      ctx.fillStyle = fr;
      ctx.fillRect(ix, py + th * 0.45, iw, th * 0.95);
      // shadow under plank
      const us = ctx.createLinearGradient(0, py + th * 1.4, 0, py + th * 1.4 + g.ch * 0.1);
      us.addColorStop(0, 'rgba(0,0,0,0.35)');
      us.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = us;
      ctx.fillRect(ix, py + th * 1.4, iw, g.ch * 0.1);
    }
    ctx.restore();
  }

  draw(ctx) {
    const app = this.app;
    this.drawBackground(ctx);
    // logo
    const lb = this.logoBox, logo = app.images.logo;
    if (logo) {
      const s = Math.min(lb.w / logo.width, lb.h / logo.height);
      const lw = logo.width * s, lh = logo.height * s;
      const bob = Math.sin(this.t * 1.6) * lh * 0.012;
      const intro = G.ease.outBack(G.clamp(this.t / 0.5, 0, 1));
      ctx.save();
      ctx.translate(lb.x + lb.w / 2, lb.y + lb.h / 2 + bob);
      ctx.scale(intro, intro);
      ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
      ctx.restore();
    } else {
      G.drawText(ctx, 'Fidget Toy Box', lb.x + lb.w / 2, lb.y + lb.h / 2, { size: Math.min(lb.h * 0.4, lb.w * 0.12), color: '#fff', stroke: 6, strokeColor: '#5a3416' });
    }
    // everything unlocked ribbon
    const { have, all } = app.countUnlocks();
    if (have === all) {
      const fs = G.clamp(app.btn * 0.3, 11, 17);
      const txt = app.t('allUnlocked');
      const tw = Math.min(G.measureText(ctx, txt, fs), lb.w);
      const y = this.wide ? lb.y + lb.h - fs : lb.y + lb.h + fs * 0.2;
      drawPill(ctx, lb.x + lb.w / 2 - tw / 2 - fs * 0.8, y - fs * 0.9, tw + fs * 1.6, fs * 1.8, 'rgba(255,210,63,0.92)');
      G.drawText(ctx, txt, lb.x + lb.w / 2, y + 1, { size: fs, color: '#6b3b0c', maxWidth: lb.w });
    }

    this.drawCabinet(ctx);
    const g = this.grid;
    const labelSize = G.clamp(g.cw * 0.105, 10, 19);
    for (const it of this.items) {
      const T = it.T;
      const img = app.images[T.thumb];
      const intro = G.ease.outBack(G.clamp((this.t - 0.05 - it.i * 0.035) / 0.45, 0, 1));
      if (intro <= 0) continue;
      const plankY = it.y + it.ch * 0.74;
      const size = it.cw * 0.86;
      const bob = Math.sin(this.t * 1.8 + it.i * 0.9) * it.cw * 0.006;
      const lift = it.hover * it.cw * 0.045;
      const sc = intro * (1 + it.hover * 0.05 - it.press * 0.08);
      const cx = it.x + it.cw / 2;
      // contact shadow on the plank
      G.groundShadow(ctx, cx, plankY + 2, size * 0.36 * (1 - it.hover * 0.15), size * 0.05, 0.4);
      ctx.save();
      ctx.translate(cx, plankY + size * 0.015);
      ctx.scale(sc, sc);
      ctx.translate(0, -lift + bob);
      if (img) ctx.drawImage(img, -size / 2, -size, size, size);
      else {
        G.glossyBall(ctx, 0, -size * 0.4, size * 0.3, G.RAINBOW[it.i % 6]);
      }
      ctx.restore();
      // "NEW" sticker
      if (!app.data.opened[T.id] && intro > 0.9) {
        const bx = cx + size * 0.32, by = plankY - size * 0.86;
        const bs = G.clamp(g.cw * 0.085, 9, 15);
        const txt = app.t('newBadge');
        const bw = G.measureText(ctx, txt, bs) + bs * 1.1;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(0.18 + Math.sin(this.t * 3 + it.i) * 0.05);
        G.roundRect(ctx, -bw / 2, -bs * 0.8, bw, bs * 1.6, bs * 0.8);
        ctx.fillStyle = '#ff3d5a';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        G.drawText(ctx, txt, 0, 1, { size: bs, color: '#fff' });
        ctx.restore();
      }
      // label (skipped on tiny cells, where it could not be read anyway)
      if (g.cw >= 72) {
        const ly = plankY + it.ch * 0.075 * 1.4 + (it.ch - it.ch * 0.74 - it.ch * 0.105) / 2;
        G.drawText(ctx, app.tr(T.title), cx, ly, { size: labelSize, color: '#fff3df', stroke: Math.max(3, labelSize * 0.28), strokeColor: 'rgba(50,20,4,0.75)', maxWidth: it.cw * 0.94, alpha: intro });
      }
      if (this.focus === it.i) {
        G.roundRect(ctx, it.x + 3, it.y + 3, it.cw - 6, it.ch - 6, 14);
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(255,230,120,${0.6 + 0.4 * Math.sin(this.t * 6)})`;
        ctx.stroke();
      }
    }
    // top UI
    app.drawStarPill(ctx, this.starPill.x, this.starPill.y, this.starPill.h);
    drawRoundButton(ctx, app.settingsBtn, this.t);
  }
}
