# Toy API — Fidget Toy Box

Vanilla ES modules + Canvas 2D. No libraries, no network, no audio/image files beyond what is
already in `assets/`. Every sound is synthesized through `app.audio`. Every toy lives in
`src/toys/<id>.js` and extends `Toy` from `./_base.js`. `src/toys/popit.js` is the reference
implementation — read it first and match its structure, quality and comment density.

## Class shape

```js
import { Toy } from './_base.js';
import * as G from '../gfx.js';

export class SpinnerToy extends Toy {
  static id = 'spinner';          // title, hint, thumb and variants come from meta.js via this id
  constructor(app) { super(app); this.buttons = [ /* optional */ ]; }
  enter() {}                       // each time the toy opens; app.area + this.variant are set
  exit() {}                        // leaving: stop audio loops (loop.set({vol:0}) or loop.stop()), clear drags
  resize(area) {}                  // after enter and on every viewport change — KEEP STATE
  setVariant(i) {}                 // player switched style while open (this.variant === i already)
  update(dt) {}                    // dt in seconds (≤ 0.05)
  draw(ctx) {}                     // draw the FULL screen 0..app.w × 0..app.h including background
  pointerDown(p) {} pointerMove(p) {} pointerUp(p) {}   // p = { id, x, y, type, cancel? } in CSS px
  keyDown(e) { return false; }     // return true if you used the key
  hud() { return ''; }             // short status above the play area, e.g. "1,234 pops"
  drawVariantIcon(ctx, i, x, y, r) // preview of style i inside a circle of radius r (already clipped)
}
```

Metadata (names in 10 languages, hint, style colors, unlock costs) is already defined in
`src/toys/meta.js` — do not duplicate it. `this.constructor.variants[i].color` gives the style's
main color. There are 6 styles per toy (index 0 free). Toy-specific strings (HUD labels) are
objects `{ en, vi, es, pt, fr, de, id, it, tr, ru }` passed to `this.tr(obj)`.

## Layout rules (very important)

- `this.area` / the `area` arg = `{ x, y, w, h }`: the free rectangle for the toy (toolbar, HUD and
  style chips are outside it). Fit the toy inside it. The background must still cover the whole
  screen (`app.w × app.h`), e.g. `G.drawSoftBackground(ctx, app.w, app.h, top, bottom)`.
- Must look good and stay playable at EVERY aspect ratio from 9:32 (very tall) to 32:9 (very
  wide), and from 320 px to 2560 px. Typical approach: compute a size `S = min(area.w, area.h)*k`
  and center; for toys made of several elements (pads, bars, switches) choose rows/cols from the
  area's aspect ratio.
- Resizing must never reset the toy's state. Store positions in normalized/design units and map
  to screen at draw time (popit does this), or re-layout without clearing state.
- Text must be crisp: the canvas already has the devicePixelRatio transform. If you pre-render to an
  offscreen canvas, size it `w * app.dpr` and `scale(dpr, dpr)` (see popit `renderBoard`/`sprite`),
  and rebuild caches in `resize()`.
- Touch AND mouse must work for everything. Support multi-touch (track by `p.id`). Pointer events
  for one pointer always come as down → move* → up (up may carry `cancel: true`).

## App services (`this.app`)

- `app.w, app.h, app.dpr, app.time` (seconds), `app.area`, `app.lang`
- `app.audio` — synth (see `src/audio.js`): presets `pop(pitch, vol, pan)`, `snap`, `click`,
  `toggle(on)`, `thunk`, `squish`, `mallet(freq, vol, kind 'xylo'|'marimba'|'glass'|'toy')`,
  `chime(freq)`, `balloonPop`, `crumble(vol, pan, len)`, `clack(vol)`, `whoosh(vol, up)`,
  `drum(kind, kit, pan)` (kinds: kick snare clap hat openhat tom tomHi rim cowbell shaker bass;
  kits: classic chip lofi bubble), `star()`, `fanfare()`, `tap()`, `deny()`;
  primitives `tone({freq, freqEnd, type, dur, vol, attack, pan, reverb, when})`,
  `noise({dur, vol, type, freq, freqEnd, q, attack, pan, reverb, when, color:'white'|'brown'})`;
  continuous `const l = app.audio.loop({source:'noise'|'osc', type, freq, q, color, oscType})`
  then every frame `l.set({ vol, freq, q, oscFreq, rate })`, and `l.set({vol:0})` / `l.stop()` in
  `exit()`. `midi(n)` → Hz is exported from `audio.js`. Keep volumes modest (0.05–0.5); avoid harsh
  or loud sounds; add slight random pitch variation so repeated sounds feel organic.
- `app.haptic(ms)` — short vibration (respects the setting). Use 6–15 ms for taps.
- `app.fx` — shared particle overlay drawn above the toy: `app.fx.burst(x, y, opts)`,
  `app.fx.ring(x, y, color, r0, r1, life, width)`, `app.fx.spawn(p)` (see `src/fx.js`). For particles
  that must be drawn *inside* your scene ordering, create your own `new Particles()`.
- `app.addProgress(amount, x, y)` — fills the global ★ meter; every full unit spawns a star that
  flies from (x, y) to the counter. Target ≈ 1 star per 12–20 s of active play: ~0.03–0.06 per
  discrete action (a pop, a tap, a note), ~0.2–0.3 per second for continuous actions, a bonus
  0.3–0.6 for completing something (finished sheet, finished song).
- `app.stat(key, delta=1)` → new value (saved per toy), `app.getStat(key)`, `app.statMax(key, v)`
  → true on a new record.
- `app.tr(obj)` / `this.tr(obj)` for localized strings; `G.formatNum(n)` for counters;
  `G.countLabel(n, { en: ['pop', 'pops'], vi: 'lần bấm', ru: ['щелчок', 'щелчка', 'щелчков'], … }, app.lang)`
  for "1 pop" / "1,234 pops" HUD labels with correct plurals.

## Toolbar buttons

`this.buttons = [{ icon: 'refresh', color: '#3cb4e6', onTap: () => ... }]` — the app positions
and draws them (max 3). Icons available in `G.drawIcon`: home gear refresh play pause stop music
note sound vibrate star lock check plus minus palette shuffle trash brush rake sparkle speed swap
drop video heart circle. You may change `button.icon` / `button.highlight` at runtime. Never add
a quit/close/X button, sharing prompts, external links or a master mute (rules of the platform).

## Visual quality bar

Bright, glossy, toy-like, satisfying — consistent with the menu art (glossy 3D cartoon renders on
a wooden shelf). Soft gradients, highlights, soft shadows (`G.groundShadow`), squash & stretch,
easing (`G.ease.*`), juicy particles, subtle idle motion. Use `G.drawSoftBackground` with pastel
colors matching the current style. Draw everything procedurally (you may also draw
`app.images['thumb_<id>']` but prefer procedural for the toy itself). Keep 60 fps on phones:
cache expensive static layers in offscreen canvases, avoid creating thousands of gradients per
frame, cap particle counts.

## Performance / safety

- Never throw: guard against zero/negative sizes (`Math.max(1, …)`), empty arrays, NaN.
- No `setTimeout`/`setInterval` for game logic — drive everything from `update(dt)` (the app
  pauses the loop when YouTube pauses the game).
- No `localStorage`, no network, no `navigator.language`, no Page Visibility API.

## Testing

A dev server runs at http://localhost:5173. Open a toy directly with
`http://localhost:5173/?toy=<id>`. Use your own browser tab (create one with the browser tools and
pass its `tabId`), check `read_console_messages` for errors, take screenshots, simulate drags /
clicks, and test at least a tall (e.g. 390×844), a square-ish and a very wide (e.g. 1200×400)
viewport via `resize_window` on your tab (reset with preset "desktop" when done).
