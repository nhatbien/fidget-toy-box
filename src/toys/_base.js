// Base class for every toy. See docs/TOY_API.md for the full contract.
import { circle, glossyBall } from '../gfx.js';
import { TOY_META, VARIANT_COSTS } from './meta.js';

export { VARIANT_COSTS };

export class Toy {
  /** Unique id: the key into TOY_META and the save data. Subclasses set this. */
  static id = 'base';

  /** Display name per language (from meta.js). */
  static get title() {
    return TOY_META[this.id]?.title || { en: this.id };
  }
  /** One-line hint shown the first few times the toy is opened. */
  static get hint() {
    return TOY_META[this.id]?.hint || null;
  }
  /** Image key of the menu thumbnail (assets/img/thumb_<id>.webp). */
  static get thumb() {
    return `thumb_${this.id}`;
  }
  /** Unlockable styles: [{ cost, color }]. Index 0 is free. */
  static get variants() {
    if (!Object.prototype.hasOwnProperty.call(this, '_variants')) {
      const colors = TOY_META[this.id]?.colors || ['#ff8a3d'];
      this._variants = colors.map((color, i) => ({ cost: VARIANT_COSTS[i] ?? 60, color }));
    }
    return this._variants;
  }

  constructor(app) {
    this.app = app;
    this.variant = 0;
    /** Extra round buttons shown in the toy toolbar: [{ icon, color, onTap, highlight? }]. */
    this.buttons = [];
  }

  get area() {
    return this.app.area;
  }
  tr(obj) {
    return this.app.tr(obj);
  }

  /** Called every time the toy is opened (app.area and this.variant are already set). */
  enter() {}
  /** Called when leaving the toy: stop loops, release pointers. Keep state for the next visit. */
  exit() {}
  /** Layout changed (also called right after enter). Must keep the toy's state. */
  resize(area) {}
  /** The player picked another unlocked style while the toy is open (this.variant already set). */
  setVariant(i) {}
  update(dt) {}
  /** Draw the whole screen (app.w × app.h), background included. */
  draw(ctx) {}
  pointerDown(p) {}
  pointerMove(p) {}
  pointerUp(p) {}
  /** Return true if the key was used (the app then calls preventDefault). */
  keyDown(e) {
    return false;
  }
  /** Short status text shown above the play area, e.g. "1,234 pops". Return '' for none. */
  hud() {
    return '';
  }
  /** Draw a small preview of style i inside a circle of radius r (used by the style chips). */
  drawVariantIcon(ctx, i, x, y, r) {
    const v = this.constructor.variants[i];
    glossyBall(ctx, x, y, r * 0.72, v.color || '#ff8a3d');
  }
}

/** Placeholder used until a toy is implemented. */
export class ComingSoonToy extends Toy {
  draw(ctx) {
    const { w, h } = this.app;
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(0, 0, w, h);
    const img = this.app.images[this.constructor.thumb];
    const a = this.area;
    const s = Math.min(a.w, a.h) * 0.6;
    if (img) ctx.drawImage(img, a.x + (a.w - s) / 2, a.y + (a.h - s) / 2, s, s);
    else {
      circle(ctx, a.x + a.w / 2, a.y + a.h / 2, s / 3);
      ctx.fillStyle = '#ff8a3d';
      ctx.fill();
    }
  }
}
