// App core: boot/loading, main loop, input routing, toy toolbar, stars & unlocks, saving, modals.
import * as G from './gfx.js';
import { platform } from './platform.js';
import { AudioEngine } from './audio.js';
import { Particles } from './fx.js';
import { STRINGS, pickLang } from './i18n.js';
import { drawRoundButton, updateButton, hitCircle, drawPill, Modal } from './ui.js';
import { Menu } from './menu.js';
import { TOYS } from './toys/index.js';

const IMAGE_KEYS = ['bg_wood', 'logo', ...TOYS.map((t) => t.thumb).filter(Boolean)];
const SAVE_INTERVAL = 8; // seconds between autosaves while something changed
const AD_INTERVAL = 180; // minimum seconds between interstitials

function defaultData() {
  return {
    v: 1,
    stars: 0,
    totalStars: 0,
    progress: 0,
    unlocked: {},
    sel: {},
    stats: {},
    opened: {},
    hints: {},
    settings: { music: true, sfx: true, haptics: true },
    playTime: 0,
  };
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = new AudioEngine();
    this.fx = new Particles();
    this.images = {};
    this.data = defaultData();
    this.lang = 'en';
    this.time = 0;
    this.scene = null;
    this.menu = null;
    this.toy = null;
    this.toyId = null;
    this.toyCache = new Map();
    this.ptr = new Map();
    this.paused = false;
    this.ready = false;
    this.modal = null;
    this.toast = null;
    this.celebration = null;
    this._autoT = 0;
    this.flying = [];
    this.starBump = 0;
    this.starPos = { x: 30, y: 30 };
    this.trans = null;
    this.hintT = 0;
    this.dirty = false;
    this.saveTimer = 0;
    this.lastAdAt = 0;
    this.area = { x: 0, y: 0, w: 100, h: 100 };
    this.homeBtn = { icon: 'home', color: '#ff8a3d', onTap: () => this.goHome() };
    this.settingsBtn = { icon: 'gear', color: '#8f6bff', onTap: () => this.openSettings() };
    this.chips = [];
    this.loadProgress = 0;
    this._errors = 0;
    this._lastHaptic = 0;
    this.frame = this.frame.bind(this);
  }

  // ======================================================== boot
  async boot() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    platform.initLifecycle(() => this.pause(), () => this.resume());
    this.drawLoading();
    await nextFrame();
    platform.firstFrameReady();

    let loadingRaf = 0;
    const loadingLoop = () => {
      if (!this.paused) this.drawLoading();
      loadingRaf = requestAnimationFrame(loadingLoop);
    };
    loadingRaf = requestAnimationFrame(loadingLoop);

    const total = IMAGE_KEYS.length + 2;
    let done = 0;
    const tick = () => (this.loadProgress = ++done / total);
    const fontP = (document.fonts ? Promise.race([document.fonts.load("800 24px 'Baloo 2'"), timeout(2500)]) : Promise.resolve())
      .catch(() => {})
      .then(tick);
    const dataP = Promise.all([platform.loadData(), platform.getLanguage()]).then((r) => {
      tick();
      return r;
    });
    const imgP = Promise.all(IMAGE_KEYS.map((k) => loadImage(`assets/img/${k}.webp`).then((img) => {
      if (img) this.images[k] = img;
      tick();
    })));
    const [[saveStr, lang]] = await Promise.all([dataP, imgP, fontP]);
    this.applySave(saveStr);
    this.lang = pickLang(lang);

    const s = this.data.settings;
    this.audio.sfxOn = s.sfx;
    this.audio.musicOn = s.music;
    this.audio.setPlatformEnabled(platform.isAudioEnabled());
    platform.onAudioEnabledChange((on) => this.audio.setPlatformEnabled(on));
    window.addEventListener('error', () => platform.logError());
    window.addEventListener('unhandledrejection', () => platform.logError());

    this.menu = new Menu(this);
    this.scene = this.menu;
    this.menu.enter();
    this.setupInput();
    cancelAnimationFrame(loadingRaf);
    this.ready = true;

    const deep = new URLSearchParams(location.search).get('toy');
    if (deep && TOYS.some((t) => t.id === deep)) this.openToy(deep, true);

    if (!this.paused) this.raf = requestAnimationFrame(this.frame);
    // The menu is interactive once its first frame is on screen.
    await nextFrame();
    await nextFrame();
    platform.gameReady();
  }

  drawLoading() {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a2c17');
    g.addColorStop(1, '#24140a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const cx = w / 2, cy = h / 2 - m * 0.06;
    const t = performance.now() / 1000;
    const R = m * 0.085;
    for (let i = 0; i < 6; i++) {
      const a = t * 2.4 + (i * G.TAU) / 6;
      const bounce = 1 + 0.18 * Math.max(0, Math.sin(t * 6 - i));
      G.glossyBall(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, m * 0.026 * bounce, G.RAINBOW[i]);
    }
    const label = (STRINGS.loading[this.lang] || STRINGS.loading.en);
    G.drawText(ctx, label, cx, cy + R + m * 0.1, { size: G.clamp(m * 0.055, 16, 30), color: '#ffe6c7' });
    const bw = G.clamp(m * 0.5, 140, 320), bh = 10;
    const by = cy + R + m * 0.17;
    G.roundRect(ctx, cx - bw / 2, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    G.roundRect(ctx, cx - bw / 2, by, Math.max(bh, bw * this.loadProgress), bh, bh / 2);
    ctx.fillStyle = '#ffb347';
    ctx.fill();
  }

  // ======================================================== save data
  applySave(str) {
    const base = defaultData();
    let d = null;
    try {
      d = str ? JSON.parse(str) : null;
    } catch (e) {
      d = null;
    }
    if (d && typeof d === 'object') {
      for (const k of Object.keys(base)) {
        if (k === 'settings') continue;
        if (d[k] !== undefined && typeof d[k] === typeof base[k]) base[k] = d[k];
      }
      if (d.settings && typeof d.settings === 'object') {
        for (const k of Object.keys(base.settings)) {
          if (typeof d.settings[k] === 'boolean') base.settings[k] = d.settings[k];
        }
      }
    }
    base.stars = Math.max(0, Math.floor(+base.stars || 0));
    base.totalStars = Math.max(base.stars, Math.floor(+base.totalStars || 0));
    base.progress = G.clamp(+base.progress || 0, 0, 0.999);
    this.data = base;
  }
  markDirty() {
    this.dirty = true;
  }
  saveNow() {
    this.dirty = false;
    this.saveTimer = 0;
    if (!platform.loaded) return;
    platform.saveData(JSON.stringify(this.data));
    if (this.data.totalStars > (this._sentScore || 0)) {
      this._sentScore = this.data.totalStars;
      platform.sendScore(this.data.totalStars);
    }
  }

  // ======================================================== i18n
  t(key, vars) {
    const e = STRINGS[key];
    let s = e ? e[this.lang] || e.en : key;
    if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
    return s;
  }
  tr(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[this.lang] ?? obj.en ?? '';
  }

  // ======================================================== services for toys
  haptic(ms = 12) {
    if (!this.data.settings.haptics) return;
    const now = performance.now();
    if (now - this._lastHaptic < 35) return;
    if (platform.hasNativeHaptics) {
      this._lastHaptic = now;
      platform.haptic(ms);
      return;
    }
    // Browsers block (and warn about) vibration before the first real user gesture.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    this._lastHaptic = now;
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* unsupported */ }
  }
  /** Fill the star meter; every full unit awards a ★ that flies from (x, y) to the counter. */
  addProgress(amount, x, y) {
    const d = this.data;
    d.progress += amount;
    while (d.progress >= 1) {
      d.progress -= 1;
      d.stars++;
      d.totalStars++;
      this.flyStar(x ?? this.w / 2, y ?? this.h / 2);
    }
    this.markDirty();
  }
  flyStar(x, y) {
    this.flying.push({ x0: x, y0: y, t: 0, dur: G.rand(0.7, 0.95), bend: G.rand(-0.35, 0.35) });
  }
  statsOf(id = this.toyId) {
    if (!id) return {};
    return this.data.stats[id] || (this.data.stats[id] = {});
  }
  stat(key, delta = 1) {
    const s = this.statsOf();
    s[key] = (s[key] || 0) + delta;
    this.markDirty();
    return s[key];
  }
  getStat(key) {
    return this.statsOf()[key] || 0;
  }
  statMax(key, v) {
    const s = this.statsOf();
    if (v > (s[key] || 0)) {
      s[key] = v;
      this.markDirty();
      return true;
    }
    return false;
  }
  showToast(text, life = 2.4) {
    this.toast = { text, t: 0, life };
  }

  // ======================================================== unlocks
  isUnlocked(id, i) {
    return i === 0 || (this.data.unlocked[id] || []).includes(i);
  }
  countUnlocks() {
    let have = 0, all = 0;
    for (const T of TOYS) {
      all += T.variants.length;
      for (let i = 0; i < T.variants.length; i++) if (this.isUnlocked(T.id, i)) have++;
    }
    return { have, all };
  }
  pickVariant(i) {
    const id = this.toyId, toy = this.toy;
    if (!toy) return;
    if (this.isUnlocked(id, i)) {
      if (toy.variant !== i) {
        toy.variant = i;
        this.data.sel[id] = i;
        toy.setVariant(i);
        this.markDirty();
      }
      return;
    }
    this.openUnlockModal(i);
  }
  openUnlockModal(i) {
    const T = this.toy.constructor, id = this.toyId;
    const cost = T.variants[i].cost;
    const can = this.data.stars >= cost;
    const buttons = [{
      label: `${this.t('unlock')}  ★ ${cost}`,
      color: can ? '#36c46f' : '#b9a58f',
      disabled: !can,
      onTap: () => this.unlockVariant(i, 'stars'),
    }];
    if (platform.hasRewardedAds) {
      buttons.push({ label: this.t('freeAd'), icon: 'video', color: '#7c5cff', onTap: () => { this.watchAdUnlock(id, i); } });
    }
    buttons.push({ label: this.t('notNow'), color: '#e39b55' });
    this.modal = new Modal(this, {
      title: this.t('unlockTitle'),
      text: can ? '' : this.t('needMore', { n: cost - this.data.stars }),
      preview: (ctx, x, y, r) => {
        G.circle(ctx, x, y, r + 6);
        ctx.fillStyle = '#f0c98e';
        ctx.fill();
        G.circle(ctx, x, y, r);
        ctx.fillStyle = '#2b1a10';
        ctx.fill();
        ctx.save();
        G.circle(ctx, x, y, r);
        ctx.clip();
        this.toy?.drawVariantIcon(ctx, i, x, y, r);
        ctx.restore();
      },
      buttons,
    });
  }
  unlockVariant(i, via) {
    const T = this.toy?.constructor, id = this.toyId;
    if (!T) return false;
    const cost = T.variants[i].cost;
    if (via === 'stars') {
      if (this.data.stars < cost) return false;
      this.data.stars -= cost;
    }
    const list = this.data.unlocked[id] || (this.data.unlocked[id] = []);
    if (!list.includes(i)) list.push(i);
    this.toy.variant = i;
    this.data.sel[id] = i;
    this.toy.setVariant(i);
    this.audio.fanfare();
    this.haptic(40);
    const chip = this.chips[i];
    const cx = chip ? chip.x : this.w / 2, cy = chip ? chip.y : this.h / 2;
    this.fx.burst(cx, cy, { count: 40, colors: G.RAINBOW, shape: ['confetti', 'star'], speed: [150, 420], gravity: 600, size: [4, 8], life: [0.8, 1.5] });
    const { have, all } = this.countUnlocks();
    if (have === all) this.showToast(this.t('allUnlocked'), 4);
    else if (T.variants.every((_, k) => this.isUnlocked(id, k))) this.showToast(this.t('allStyles'));
    else this.showToast(this.t('unlocked'));
    this.saveNow();
    return true;
  }
  async watchAdUnlock(id, i) {
    this.audio.setPaused(true);
    const ok = await platform.showRewarded(`style_${id}_${i}`);
    this.audio.setPaused(this.paused);
    if (ok && this.toyId === id) this.unlockVariant(i, 'ad');
    else if (!ok) this.showToast(this.t('noAd'));
  }
  /** First locked style of a toy (styles unlock in order), or -1 when all are open. */
  nextLocked(T) {
    for (let i = 1; i < T.variants.length; i++) if (!this.isUnlocked(T.id, i)) return i;
    return -1;
  }
  /**
   * Automatic unlocks: as soon as the player can afford the next style it is bought and celebrated.
   * Inside a toy we save up for that toy's next style; on the shelf (or once the current toy is
   * complete) the cheapest next style of any toy is picked.
   */
  checkAutoUnlock() {
    if (this.celebration || this.modal || this.trans || this.flying.length) return;
    let pick = null;
    const cur = this.scene === this.toy && this.toy ? this.toy.constructor : null;
    if (cur && this.nextLocked(cur) > 0) {
      const i = this.nextLocked(cur);
      if (this.data.stars >= cur.variants[i].cost) pick = { T: cur, i };
    } else {
      for (const T of TOYS) {
        const i = this.nextLocked(T);
        if (i > 0 && this.data.stars >= T.variants[i].cost && (!pick || T.variants[i].cost < pick.T.variants[pick.i].cost)) pick = { T, i };
      }
    }
    if (!pick) return;
    const { T, i } = pick;
    this.data.stars -= T.variants[i].cost;
    const list = this.data.unlocked[T.id] || (this.data.unlocked[T.id] = []);
    if (!list.includes(i)) list.push(i);
    this.celebration = { T, i, t: 0, life: 6 };
    this.audio.fanfare();
    this.haptic(40);
    this.fx.burst(this.w / 2, this.h * 0.2, { count: 60, colors: G.RAINBOW, shape: ['confetti', 'star'], speed: [200, 520], gravity: 650, size: [4, 9], life: [1, 1.8] });
    const { have, all } = this.countUnlocks();
    if (have === all) this.showToast(this.t('allUnlocked'), 4);
    this.saveNow();
  }
  /** Instance used to draw style previews of toys that are not open. */
  toyInstance(T) {
    let toy = this.toyCache.get(T.id);
    if (!toy) {
      toy = new T(this);
      this.toyCache.set(T.id, toy);
    }
    return toy;
  }
  /** Tapping the celebration card: switch to the new style (opening its toy if needed). */
  tryCelebrated() {
    const c = this.celebration;
    if (!c) return;
    this.celebration = null;
    if (this.toy && this.toy.constructor === c.T) this.pickVariant(c.i);
    else {
      this.data.sel[c.T.id] = c.i;
      if (this.scene === this.toy) this.goHome();
      else this.openToy(c.T.id);
    }
  }
  celebrationRect() {
    const w = Math.min(this.w - 24, 380), h = G.clamp(this.btn * 1.5, 70, 96);
    const c = this.celebration;
    const k = c ? G.ease.outBack(G.clamp(c.t / 0.4, 0, 1)) * G.clamp((c.life - c.t) / 0.35, 0, 1) : 0;
    const top = this.scene === this.toy && !this.wide ? this.area.y : this.pad;
    return { x: (this.w - w) / 2, y: G.lerp(-h - 10, top, k), w, h };
  }
  drawCelebration(ctx) {
    const c = this.celebration;
    if (!c) return;
    const R = this.celebrationRect();
    const r = R.h * 0.36;
    ctx.save();
    G.roundRect(ctx, R.x, R.y + 5, R.w, R.h, R.h * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    G.roundRect(ctx, R.x, R.y, R.w, R.h, R.h * 0.3);
    ctx.fillStyle = '#fff7ea';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = `hsl(${(this.time * 120) % 360},90%,62%)`;
    ctx.stroke();
    const px = R.x + R.h * 0.55, py = R.y + R.h / 2;
    G.circle(ctx, px, py, r + 4);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    G.circle(ctx, px, py, r);
    ctx.fillStyle = '#2b1a10';
    ctx.fill();
    ctx.save();
    G.circle(ctx, px, py, r);
    ctx.clip();
    this.guard(() => this.toyInstance(c.T).drawVariantIcon(ctx, c.i, px, py, r));
    ctx.restore();
    const tx = R.x + R.h * 1.05, tw = R.w - R.h * 1.2;
    const fs = R.h * 0.24;
    G.drawText(ctx, `${this.t('unlocked')} · ${this.tr(c.T.title)}`, tx, py - fs * 0.62, { size: fs, color: '#5a3416', align: 'left', maxWidth: tw });
    G.drawText(ctx, this.t('tapToTry'), tx, py + fs * 0.72, { size: fs * 0.8, weight: 700, color: '#b07a45', align: 'left', maxWidth: tw });
    ctx.restore();
  }
  async maybeInterstitial() {
    if (!platform.isYouTube || this.time < 120 || this.time - this.lastAdAt < AD_INTERVAL) return;
    this.lastAdAt = this.time;
    this.audio.setPaused(true);
    await platform.showInterstitial();
    this.audio.setPaused(this.paused);
  }

  // ======================================================== settings
  openSettings() {
    const s = this.data.settings;
    this.modal = new Modal(this, {
      title: this.t('settings'),
      rows: [
        { icon: 'music', label: this.t('music'), get: () => s.music, toggle: () => { s.music = !s.music; this.audio.setMusic(s.music); this.markDirty(); } },
        { icon: 'sound', label: this.t('sounds'), get: () => s.sfx, toggle: () => { s.sfx = !s.sfx; this.audio.setSfx(s.sfx); this.markDirty(); } },
        { icon: 'vibrate', label: this.t('vibration'), get: () => s.haptics, toggle: () => { s.haptics = !s.haptics; this.haptic(30); this.markDirty(); } },
      ],
      buttons: [{ label: this.t('ok'), color: '#36c46f' }],
      footer: this.t('credits'),
      onClose: () => this.saveNow(),
    });
  }

  // ======================================================== scenes
  transition(mid) {
    if (this.trans) return;
    this.trans = { t: 0, dur: 0.38, mid, done: false };
    this.audio.whoosh(0.5);
  }
  openToy(id, instant = false) {
    const Cls = TOYS.find((t) => t.id === id);
    if (!Cls) return;
    const go = () => {
      this.releasePointers();
      let toy = this.toyCache.get(id);
      if (!toy) {
        toy = new Cls(this);
        this.toyCache.set(id, toy);
      }
      let v = this.data.sel[id] ?? 0;
      if (v >= Cls.variants.length || !this.isUnlocked(id, v)) v = 0;
      toy.variant = v;
      this.toy = toy;
      this.toyId = id;
      this.scene = toy;
      this.layoutToyUI();
      toy.enter();
      toy.resize(this.area);
      this._areaKey = this.areaKey();
      if (!this.data.opened[id]) {
        this.data.opened[id] = 1;
        this.markDirty();
      }
      const shown = this.data.hints[id] || 0;
      this.hintT = Cls.hint && shown < 3 ? 5 : 0;
      if (this.hintT) this.data.hints[id] = shown + 1;
    };
    instant ? go() : this.transition(go);
  }
  goHome() {
    if (this.scene !== this.toy || !this.toy) return;
    this.transition(() => {
      this.releasePointers();
      this.toy.exit();
      this.toy = null;
      this.toyId = null;
      this.scene = this.menu;
      this.menu.enter();
      this.saveNow();
      this.maybeInterstitial();
    });
  }
  releasePointers() {
    for (const [id, t] of this.ptr) {
      if (t.kind === 'scene') t.scene.pointerUp?.({ id, x: t.x, y: t.y, type: t.type, cancel: true });
      else if (t.kind === 'btn') t.b.pressed = false;
    }
    this.ptr.clear();
  }

  // ======================================================== layout
  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    // Full device resolution up to ~1080p@2x so text stays sharp; only huge canvases are reduced.
    const maxPixels = 8.3e6;
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w * h * dpr * dpr > maxPixels) dpr = Math.max(1, Math.sqrt(maxPixels / (w * h)));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const m = Math.min(w, h);
    this.btn = G.clamp(m * 0.115, 42, 70);
    this.pad = G.clamp(m * 0.03, 8, 18);
    this.wide = w / h > 1.3;
    if (!this.ready) return;
    if (this.scene === this.toy && this.toy) {
      this.layoutToyUI();
      this.toy.resize(this.area);
      this._areaKey = this.areaKey();
    }
    this.menu?.resize();
    if (!this.paused) this.render();
  }
  areaKey() {
    const a = this.area;
    return `${a.x | 0},${a.y | 0},${a.w | 0},${a.h | 0}`;
  }
  /** Positions the toolbar (home, stars, toy buttons, style chips) and computes the play area. */
  layoutToyUI() {
    const { w, h, pad, btn } = this;
    const r = btn / 2;
    const toy = this.toy;
    const variants = toy ? toy.constructor.variants : [];
    const n = variants.length > 1 ? variants.length : 0;
    const tb = toy ? toy.buttons : [];
    this._btnCount = tb.length;
    const hudH = G.clamp(btn * 0.46, 18, 30);
    const tr = r * 0.86;
    this.homeBtn.r = r;
    if (!this.wide) {
      const topH = pad + btn + pad * 0.5;
      this.homeBtn.x = pad + r;
      this.homeBtn.y = pad + r;
      this.starPill = { x: pad * 1.7 + btn, y: pad + r, h: btn * 0.68 };
      tb.forEach((b, i) => {
        b.r = tr;
        b.x = w - pad - tr - i * (tr * 2 + pad * 0.8);
        b.y = pad + r;
      });
      let cr = G.clamp(btn * 0.42, 18, 30);
      if (n) cr = Math.min(cr, (w - pad * 2) / (n * 2.7));
      const gap = cr * 0.7;
      const total = n * cr * 2 + (n - 1) * gap;
      const cy = h - pad - cr - 2;
      this.chips = variants.length > 1 ? variants.map((v, i) => ({ kind: 'chip', index: i, r: cr, x: (w - total) / 2 + cr + i * (cr * 2 + gap), y: cy, onTap: () => this.pickVariant(i) })) : [];
      const bottomH = n ? cr * 2 + pad * 1.6 + 4 : pad;
      this.area = { x: pad, y: topH + hudH, w: w - pad * 2, h: Math.max(40, h - topH - hudH - bottomH) };
      this.hudPos = { x: w / 2, y: topH + hudH * 0.42 };
    } else {
      const colW = pad * 2 + btn;
      this.homeBtn.x = pad + r;
      this.homeBtn.y = pad + r;
      this.starPill = { x: pad, y: pad * 1.6 + btn + btn * 0.34, h: btn * 0.68 };
      tb.forEach((b, i) => {
        b.r = tr;
        b.x = pad + r;
        b.y = pad * 2.4 + btn * 1.68 + tr + i * (tr * 2 + pad * 0.7);
      });
      let cr = G.clamp(btn * 0.42, 18, 30);
      if (n) cr = Math.min(cr, (h - pad * 2) / (n * 2.6));
      const gap = cr * 0.6;
      const total = n * cr * 2 + (n - 1) * gap;
      this.chips = variants.length > 1 ? variants.map((v, i) => ({ kind: 'chip', index: i, r: cr, x: w - pad - cr - 2, y: (h - total) / 2 + cr + i * (cr * 2 + gap), onTap: () => this.pickVariant(i) })) : [];
      const rightW = n ? cr * 2 + pad * 2 + 4 : pad;
      this.area = { x: colW, y: pad + hudH, w: Math.max(40, w - colW - rightW), h: h - pad * 2 - hudH };
      this.hudPos = { x: this.area.x + this.area.w / 2, y: pad + hudH * 0.45 };
    }
  }
  toyUiButtons() {
    return [this.homeBtn, ...(this.toy ? this.toy.buttons : []), ...this.chips];
  }
  hitUi(p) {
    if (this.celebration) {
      const R = this.celebrationRect();
      if (p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) {
        if (!this._celebBtn) this._celebBtn = { kind: 'celebration', x: 0, y: 0, r: 0, onTap: () => this.tryCelebrated() };
        Object.assign(this._celebBtn, { x: R.x + R.w / 2, y: R.y + R.h / 2, r: Math.max(R.w, R.h) });
        return this._celebBtn;
      }
    }
    if (this.scene === this.toy && this.toy) {
      for (const b of this.toyUiButtons()) if (b.x !== undefined && hitCircle(b, p, b.kind === 'chip' ? 3 : 6)) return b;
      const sp = this.starPillRect;
      if (sp && p.x >= sp.x && p.x <= sp.x + sp.w && p.y >= sp.y && p.y <= sp.y + sp.h) return this.starInfoBtn();
      return null;
    }
    if (this.scene === this.menu) return this.menu.hitUi(p);
    return null;
  }
  starInfoBtn() {
    if (!this._starBtn) this._starBtn = { kind: 'star', x: 0, y: 0, r: 0, onTap: () => this.showToast(this.t('starsInfo'), 3) };
    const sp = this.starPillRect;
    Object.assign(this._starBtn, { x: sp.x + sp.w / 2, y: sp.y + sp.h / 2, r: Math.max(sp.w, sp.h) });
    return this._starBtn;
  }

  // ======================================================== input
  setupInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e, false));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }
  toPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, type: e.pointerType || 'mouse', button: e.button };
  }
  onDown(e) {
    this.audio.unlock();
    if (this.paused || !this.ready || this.trans) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = this.toPoint(e);
    if (this.modal) {
      this.ptr.set(p.id, { kind: 'modal' });
      this.modal.down(p);
      return;
    }
    const b = this.hitUi(p);
    if (b) {
      b.pressed = true;
      this.ptr.set(p.id, { kind: 'btn', b });
      return;
    }
    const scene = this.scene;
    this.ptr.set(p.id, { kind: 'scene', scene, x: p.x, y: p.y, type: p.type });
    if (scene === this.toy && this.hintT > 0.6) this.hintT = 0.6;
    this.guard(() => scene.pointerDown?.(p));
  }
  onMove(e) {
    const t = this.ptr.get(e.pointerId);
    if (!t) {
      if (e.pointerType === 'mouse' && this.ready && !this.modal) this.scene?.pointerHover?.(this.toPoint(e));
      return;
    }
    if (t.kind === 'scene') {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const list = evs && evs.length ? evs : [e];
      for (const ev of list) {
        const p = this.toPoint(ev);
        p.id = e.pointerId;
        t.x = p.x;
        t.y = p.y;
        this.guard(() => t.scene.pointerMove?.(p));
      }
    } else if (t.kind === 'modal') this.modal?.move(this.toPoint(e));
    else t.b.pressed = hitCircle(t.b, this.toPoint(e), 12);
  }
  onUp(e, cancel) {
    if (!cancel) this.audio.unlock();
    const t = this.ptr.get(e.pointerId);
    if (!t) return;
    this.ptr.delete(e.pointerId);
    const p = this.toPoint(e);
    if (t.kind === 'scene') {
      p.cancel = cancel;
      this.guard(() => t.scene.pointerUp?.(p));
    } else if (t.kind === 'modal') {
      if (!cancel) this.modal?.up(p);
    } else {
      const b = t.b;
      const fire = b.pressed && !cancel;
      b.pressed = false;
      if (fire) {
        if (b.kind !== 'chip') this.audio.tap();
        else this.audio.click(1.4, 0.8);
        b.onTap?.();
      }
    }
  }
  onKey(e) {
    this.audio.unlock();
    if (this.paused || !this.ready) return;
    if (e.key === 'Escape') {
      // Never preventDefault on Esc (Playables requirement).
      if (this.modal) this.modal.close();
      else if (this.scene === this.toy) this.goHome();
      return;
    }
    if (this.modal || this.trans || e.repeat && e.key === 'Enter') return;
    let handled = false;
    this.guard(() => { handled = !!this.scene?.keyDown?.(e); });
    if (handled) e.preventDefault();
  }

  // ======================================================== lifecycle
  pause() {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.releasePointers();
    this.audio.setPaused(true);
    if (this.ready) this.saveNow();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.audio.setPaused(false);
    this.lastTs = 0;
    if (this.ready) this.raf = requestAnimationFrame(this.frame);
  }

  guard(fn) {
    try {
      fn();
    } catch (err) {
      if (this._errors++ < 5) {
        console.error(err);
        platform.logError();
      }
    }
  }

  frame(ts) {
    if (this.paused) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastTs ? G.clamp((ts - this.lastTs) / 1000, 0, 0.05) : 1 / 60;
    this.lastTs = ts;
    this.update(dt);
    this.render();
  }

  update(dt) {
    this.time += dt;
    this.data.playTime += dt;
    if (this.scene === this.toy && this.toy) {
      if (this.toy.buttons.length !== this._btnCount) this.layoutToyUI();
      const key = this.areaKey();
      if (key !== this._areaKey) {
        this._areaKey = key;
        this.guard(() => this.toy.resize(this.area));
      }
      for (const b of this.toyUiButtons()) updateButton(b, dt);
    } else {
      updateButton(this.settingsBtn, dt);
    }
    this.guard(() => this.scene?.update(dt));
    this.fx.update(dt);
    for (const f of this.flying) {
      f.t += dt;
      if (f.t >= f.dur && !f.done) {
        f.done = true;
        this.starBump = 1;
        this.audio.star(G.rand(0.95, 1.1));
        this.fx.burst(this.starPos.x, this.starPos.y, { count: 8, colors: ['#ffd23f', '#fff3b0'], shape: 'sparkle', speed: [40, 140], gravity: 0, size: [3, 6], life: [0.3, 0.6] });
      }
    }
    this.flying = this.flying.filter((f) => !f.done);
    this.starBump = Math.max(0, this.starBump - dt * 3);
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > this.toast.life) this.toast = null;
    }
    if (this.hintT > 0) this.hintT -= dt;
    if (this.celebration) {
      this.celebration.t += dt;
      if (this.celebration.t >= this.celebration.life) this.celebration = null;
    }
    this._autoT += dt;
    if (this._autoT > 0.4 && this.ready) {
      this._autoT = 0;
      this.checkAutoUnlock();
    }
    if (this.modal && !this.modal.update(dt)) this.modal = null;
    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      if (!tr.done && tr.t >= tr.dur / 2) {
        tr.done = true;
        this.guard(tr.mid);
      }
      if (tr.t >= tr.dur) this.trans = null;
    }
    this.saveTimer += dt;
    if (this.dirty && this.saveTimer > SAVE_INTERVAL) this.saveNow();
  }

  render() {
    if (!this.ready) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    this.guard(() => this.scene?.draw(ctx));
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.scene === this.toy && this.toy) this.drawToyUI(ctx);
    this.fx.draw(ctx);
    this.drawFlying(ctx);
    this.drawToast(ctx);
    this.drawCelebration(ctx);
    if (this.modal) this.modal.draw(ctx);
    if (this.trans) {
      const tr = this.trans;
      const a = 1 - Math.abs(tr.t / (tr.dur / 2) - 1);
      ctx.fillStyle = `rgba(42,23,12,${G.clamp(a, 0, 1)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  // ======================================================== drawing UI
  /** Star counter pill. Returns its rect. */
  drawStarPill(ctx, x, y, h) {
    const shown = Math.max(0, this.data.stars - this.flying.length);
    const txt = G.formatNum(shown);
    const fs = h * 0.56;
    const tw = G.measureText(ctx, txt, fs);
    const w = h * 1.05 + tw + h * 0.42;
    const top = y - h / 2;
    drawPill(ctx, x, top, w, h);
    const sx = x + h * 0.52, sy = y;
    const ringR = h * 0.4;
    ctx.save();
    ctx.lineWidth = Math.max(2, h * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, G.TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, -Math.PI / 2, -Math.PI / 2 + G.TAU * this.data.progress);
    ctx.stroke();
    const bump = 1 + this.starBump * 0.35;
    ctx.translate(sx, sy);
    ctx.scale(bump, bump);
    G.drawIcon(ctx, 'star', 0, 0, h * 0.62, '#ffd23f');
    ctx.restore();
    G.drawText(ctx, txt, x + h * 1.02 + tw / 2, y + 1, { size: fs, color: '#fff' });
    this.starPos = { x: sx, y: sy };
    this.starPillRect = { x, y: top, w, h };
    return this.starPillRect;
  }

  drawToyUI(ctx) {
    const toy = this.toy, t = this.time;
    drawRoundButton(ctx, this.homeBtn, t);
    const sp = this.starPill;
    this.drawStarPill(ctx, sp.x, sp.y, sp.h);
    for (const b of toy.buttons) drawRoundButton(ctx, b, t);
    // style chips
    const T = toy.constructor;
    for (const c of this.chips) {
      const i = c.index;
      const unlocked = this.isUnlocked(this.toyId, i);
      const sel = toy.variant === i;
      const r = c.r * (sel ? 1.1 : 1) * (1 - 0.1 * (c._press || 0));
      G.circle(ctx, c.x, c.y + 2, r + 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
      G.circle(ctx, c.x, c.y, r + 3);
      ctx.fillStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.save();
      G.circle(ctx, c.x, c.y, r);
      ctx.fillStyle = '#2b1a10';
      ctx.fill();
      ctx.clip();
      this.guard(() => toy.drawVariantIcon(ctx, i, c.x, c.y, r));
      if (!unlocked) {
        ctx.fillStyle = 'rgba(25,12,5,0.55)';
        ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      }
      ctx.restore();
      if (!unlocked) {
        const cost = T.variants[i].cost;
        const afford = this.data.stars >= cost;
        G.drawIcon(ctx, 'lock', c.x, c.y - r * 0.18, r * 0.9, '#fff');
        G.drawText(ctx, `★${cost}`, c.x, c.y + r * 0.55, { size: r * 0.52, color: afford ? '#ffd23f' : '#fff', stroke: 3, strokeColor: 'rgba(0,0,0,0.5)' });
        if (afford) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
          G.circle(ctx, c.x, c.y, r + 5 + pulse * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = `rgba(255,210,63,${0.4 + 0.5 * pulse})`;
          ctx.stroke();
        }
      }
    }
    const hud = toy.hud?.();
    if (hud) {
      const hs = G.clamp(this.btn * 0.36, 14, 22);
      G.drawText(ctx, hud, this.hudPos.x, this.hudPos.y, { size: hs, color: '#fff', stroke: Math.max(3, hs * 0.22), strokeColor: 'rgba(0,0,0,0.35)', maxWidth: this.area.w * 0.9 });
    }
    if (this.hintT > 0 && T.hint) {
      const a = G.clamp(Math.min(this.hintT / 0.6, (5 - this.hintT) / 0.4), 0, 1);
      const hs = G.clamp(Math.min(this.w, this.h) * 0.045, 15, 24);
      const txt = this.tr(T.hint);
      const tw = Math.min(G.measureText(ctx, txt, hs), this.area.w * 0.86);
      const ph = hs * 2.1;
      const px = this.area.x + this.area.w / 2;
      const py = this.area.y + this.area.h - ph * 0.9 + (1 - a) * 12;
      ctx.save();
      ctx.globalAlpha = a;
      drawPill(ctx, px - tw / 2 - hs, py - ph / 2, tw + hs * 2, ph, 'rgba(30,16,6,0.72)');
      G.drawText(ctx, txt, px, py + 1, { size: hs, color: '#fff', maxWidth: this.area.w * 0.86 });
      ctx.restore();
    }
  }

  drawFlying(ctx) {
    for (const f of this.flying) {
      const k = G.ease.inOutCubic(G.clamp(f.t / f.dur, 0, 1));
      const tx = this.starPos.x, ty = this.starPos.y;
      const mx = (f.x0 + tx) / 2 + (ty - f.y0) * f.bend, my = (f.y0 + ty) / 2 - Math.abs(tx - f.x0) * 0.25;
      const x = (1 - k) * (1 - k) * f.x0 + 2 * (1 - k) * k * mx + k * k * tx;
      const y = (1 - k) * (1 - k) * f.y0 + 2 * (1 - k) * k * my + k * k * ty;
      const s = G.clamp(Math.min(this.w, this.h) * 0.06, 22, 40) * (1 - 0.4 * k) * (k < 0.15 ? G.ease.outBack(k / 0.15) : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(k * 4);
      ctx.shadowColor = 'rgba(255,200,40,0.8)';
      ctx.shadowBlur = 12;
      G.drawIcon(ctx, 'star', 0, 0, s, '#ffd23f');
      ctx.restore();
    }
  }

  drawToast(ctx) {
    const t = this.toast;
    if (!t) return;
    const a = G.clamp(Math.min(t.t / 0.2, (t.life - t.t) / 0.3), 0, 1);
    const fs = G.clamp(Math.min(this.w, this.h) * 0.045, 15, 24);
    const maxW = this.w * 0.86;
    const tw = Math.min(G.measureText(ctx, t.text, fs), maxW - fs * 2);
    const ph = fs * 2.2;
    const y = this.h * 0.5 - ph / 2 + (1 - a) * 10;
    ctx.save();
    ctx.globalAlpha = a;
    drawPill(ctx, this.w / 2 - tw / 2 - fs, y, tw + fs * 2, ph, 'rgba(30,16,6,0.85)');
    G.drawText(ctx, t.text, this.w / 2, y + ph / 2 + 1, { size: fs, color: '#fff', maxWidth: maxW - fs * 2 });
    ctx.restore();
  }
}
