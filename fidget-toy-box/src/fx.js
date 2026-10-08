// Lightweight particle system used for confetti, sparkles, dust and pop rings.
import { TAU, rand, pick, softStarPath, heartPath, alpha } from './gfx.js';

export class Particles {
  constructor(max = 900) {
    this.list = [];
    this.max = max;
  }

  /**
   * Add one particle. Fields: x, y, vx, vy, life (s), size, color, shape
   * ('circle' | 'confetti' | 'star' | 'spark' | 'ring' | 'heart' | 'bubble' | 'square' | 'note'),
   * gravity, drag (per second, 0..1 kept), rot, vr, grow (size per second), fade (bool).
   */
  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.t = 0;
    p.life = p.life ?? 1;
    p.size = p.size ?? 6;
    p.vx = p.vx ?? 0;
    p.vy = p.vy ?? 0;
    p.gravity = p.gravity ?? 0;
    p.drag = p.drag ?? 0.2;
    p.rot = p.rot ?? rand(TAU);
    p.vr = p.vr ?? 0;
    p.grow = p.grow ?? 0;
    p.fade = p.fade ?? true;
    p.shape = p.shape ?? 'circle';
    p.color = p.color ?? '#fff';
    p.alpha = p.alpha ?? 1;
    this.list.push(p);
    return p;
  }

  /**
   * Radial burst. opt: count, colors, speed [min,max], size [min,max], life [min,max], gravity,
   * shape (string or array), angle, spread, drag, vr, grow, alpha.
   */
  burst(x, y, opt = {}) {
    const {
      count = 16, colors = ['#fff'], speed = [80, 260], size = [3, 7], life = [0.5, 1.1],
      gravity = 500, shape = 'circle', angle = 0, spread = TAU, drag = 0.3, vr = 8, grow = 0, alpha: a = 1,
    } = opt;
    for (let i = 0; i < count; i++) {
      const ang = angle + (spread >= TAU ? rand(TAU) : rand(-spread / 2, spread / 2));
      const sp = rand(speed[0], speed[1]);
      this.spawn({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(life[0], life[1]),
        size: rand(size[0], size[1]),
        color: pick(colors),
        shape: Array.isArray(shape) ? pick(shape) : shape,
        gravity, drag, vr: rand(-vr, vr), grow, alpha: a,
      });
    }
  }

  /** Expanding ring, e.g. for taps and pops. */
  ring(x, y, color = '#fff', r0 = 6, r1 = 40, life = 0.35, width = 3) {
    this.spawn({ x, y, shape: 'ring', size: r0, grow: (r1 - r0) / life, life, color, lineWidth: width, gravity: 0, drag: 0 });
  }

  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const k = Math.pow(1 - Math.min(0.99, p.drag), dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0, p.size + p.grow * dt);
      L[j++] = p;
    }
    L.length = j;
  }

  draw(ctx) {
    for (const p of this.list) {
      const lifeT = p.t / p.life;
      const a = p.alpha * (p.fade ? (lifeT > 0.6 ? 1 - (lifeT - 0.6) / 0.4 : 1) : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const s = p.size;
      switch (p.shape) {
        case 'confetti': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.t * 9 + p.rot) * 0.9);
          ctx.fillStyle = p.color;
          ctx.fillRect(-s, -s * 0.55, s * 2, s * 1.1);
          ctx.restore();
          break;
        }
        case 'square':
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          break;
        case 'star':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          softStarPath(ctx, 0, 0, 5, s, s * 0.45);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
          break;
        case 'sparkle':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          softStarPath(ctx, 0, 0, 4, s, s * 0.28, 0);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
          break;
        case 'heart':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.sin(p.rot) * 0.3);
          ctx.beginPath();
          heartPath(ctx, 0, 0, s * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
          break;
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(s * 4, sp * 0.05);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, s * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = (p.lineWidth || 3) * (1 - lifeT * 0.7);
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, TAU);
          ctx.stroke();
          break;
        case 'bubble':
          ctx.strokeStyle = alpha(p.color, 0.8);
          ctx.lineWidth = Math.max(1, s * 0.15);
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.beginPath();
          ctx.arc(p.x - s * 0.35, p.y - s * 0.35, s * 0.22, 0, TAU);
          ctx.fill();
          break;
        case 'note':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.sin(p.t * 4 + p.rot) * 0.25);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(-s * 0.3, s * 0.5, s * 0.42, s * 0.32, -0.4, 0, TAU);
          ctx.fill();
          ctx.fillRect(s * 0.05, -s * 0.8, s * 0.16, s * 1.35);
          ctx.beginPath();
          ctx.moveTo(s * 0.2, -s * 0.8);
          ctx.quadraticCurveTo(s * 0.75, -s * 0.6, s * 0.7, -s * 0.1);
          ctx.lineWidth = s * 0.16;
          ctx.strokeStyle = p.color;
          ctx.stroke();
          ctx.restore();
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, TAU);
          ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.list.length = 0;
  }
}
