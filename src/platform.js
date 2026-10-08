// Host platform adapter. Inside YouTube Playables it uses the official SDK (ytgame.*) for
// lifecycle, cloud save, audio state, pause/resume, language and ads, as required by the
// Playables certification rules. On any other host (itch.io, CrazyGames, your own site)
// it falls back to standard web APIs. Inside the iOS app (WKWebView) save data and haptics go
// through the native bridge `window.webkit.messageHandlers.ftb`.

const SAVE_KEY = 'fidget-toy-box-save-v1';

function getYt() {
  try {
    // eslint-disable-next-line no-undef
    if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) return ytgame;
  } catch (e) { /* not in Playables */ }
  return null;
}

function getNative() {
  try {
    if (window.__FTB_IOS__ && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ftb) {
      return window.webkit.messageHandlers.ftb;
    }
  } catch (e) { /* not in the iOS app */ }
  return null;
}

class Platform {
  constructor() {
    this.yt = getYt();
    this.native = this.yt ? null : getNative();
    this.name = this.yt ? 'youtube' : this.native ? 'ios' : 'web';
    this.loaded = false; // cloud save must be loaded before saving
    this._pauseCbs = [];
    this._resumeCbs = [];
    this._audioCbs = [];
    this._saving = Promise.resolve();
  }

  get isYouTube() {
    return !!this.yt;
  }

  // ---------- lifecycle ----------
  firstFrameReady() {
    try { this.yt?.game.firstFrameReady(); } catch (e) { this.warn(e); }
  }
  gameReady() {
    try { this.yt?.game.gameReady(); } catch (e) { this.warn(e); }
  }

  /** Register pause/resume. YouTube: SDK callbacks only. Web: Page Visibility API. */
  initLifecycle(onPause, onResume) {
    if (this.yt) {
      try {
        this.yt.system.onPause(() => onPause());
        this.yt.system.onResume(() => onResume());
      } catch (e) { this.warn(e); }
      return;
    }
    // The iOS app also calls these directly when the scene goes to the background.
    window.__ftbPause = () => onPause();
    window.__ftbResume = () => onResume();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause();
      else onResume();
    });
    window.addEventListener('pagehide', () => onPause());
  }

  // ---------- audio ----------
  isAudioEnabled() {
    if (this.yt) {
      try { return !!this.yt.system.isAudioEnabled(); } catch (e) { this.warn(e); }
    }
    return true;
  }
  onAudioEnabledChange(cb) {
    if (this.yt) {
      try { this.yt.system.onAudioEnabledChange((on) => cb(!!on)); } catch (e) { this.warn(e); }
    }
  }

  // ---------- language ----------
  async getLanguage() {
    if (this.yt) {
      try { return (await this.yt.system.getLanguage()) || 'en'; } catch (e) { this.warn(e); return 'en'; }
    }
    try { return navigator.language || 'en'; } catch (e) { return 'en'; }
  }

  // ---------- save data ----------
  async loadData() {
    let str = '';
    if (this.yt) {
      try {
        str = (await this.yt.game.loadData()) || '';
      } catch (e) {
        this.warn(e);
      }
    } else if (this.native) {
      str = typeof window.__FTB_SAVE__ === 'string' ? window.__FTB_SAVE__ : '';
    } else {
      try { str = localStorage.getItem(SAVE_KEY) || ''; } catch (e) { /* storage blocked */ }
    }
    this.loaded = true;
    return str;
  }

  /** Saves are serialized so an older write never lands after a newer one. */
  saveData(str) {
    if (!this.loaded) return Promise.resolve(false);
    this._saving = this._saving.then(async () => {
      if (this.yt) {
        try {
          await this.yt.game.saveData(str);
          return true;
        } catch (e) {
          this.warn(e);
          return false;
        }
      }
      if (this.native) {
        try {
          this.native.postMessage({ type: 'save', data: str });
          return true;
        } catch (e) {
          return false;
        }
      }
      try {
        localStorage.setItem(SAVE_KEY, str);
        return true;
      } catch (e) {
        return false;
      }
    });
    return this._saving;
  }

  // ---------- haptics ----------
  /** True when vibration is handled natively (iOS Taptic Engine). */
  get hasNativeHaptics() {
    return !!this.native;
  }
  haptic(ms) {
    try { this.native?.postMessage({ type: 'haptic', ms }); } catch (e) { /* ignore */ }
  }

  // ---------- ads (YouTube-provided only) ----------
  get hasRewardedAds() {
    return !!this.yt;
  }
  async showInterstitial() {
    if (!this.yt) return false;
    try {
      await this.yt.ads.requestInterstitialAd();
      return true;
    } catch (e) {
      return false;
    }
  }
  /** Resolves true only if the player earned the reward. */
  async showRewarded(rewardId) {
    if (!this.yt) return false;
    try {
      return !!(await this.yt.ads.requestRewardedAd(rewardId));
    } catch (e) {
      return false;
    }
  }

  // ---------- engagement ----------
  sendScore(value) {
    if (!this.yt) return;
    try { this.yt.engagement.sendScore({ value: Math.floor(value) }).catch(() => {}); } catch (e) { /* optional */ }
  }

  // ---------- health ----------
  logError() {
    try { this.yt?.health.logError(); } catch (e) { /* ignore */ }
  }
  warn(e) {
    try { this.yt?.health.logWarning(); } catch (err) { /* ignore */ }
    if (e) console.warn('[platform]', e);
  }
}

export const platform = new Platform();
