// Local stand-in for the YouTube Playables SDK (dev only — never shipped).
// Checks the integration rules and lets you simulate the host:
//   M = toggle YouTube mute, P = pause / resume, ?lang=vi to change the language.
// Every call is logged to the console with a [ytgame] prefix; rule violations log as errors.
(function () {
  const params = new URLSearchParams(location.search);
  const state = {
    firstFrame: false, ready: false, loaded: false, audio: true, paused: false,
    pause: [], resume: [], audioCbs: [], store: localStorage.getItem('ytgame-mock-save') || '',
  };
  const log = (...a) => console.log('[ytgame]', ...a);
  const fail = (msg) => console.error('[ytgame] RULE VIOLATION:', msg);
  window.__ytmock = state;

  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: 'mock-1',
    game: {
      firstFrameReady() {
        if (state.firstFrame) fail('firstFrameReady called twice');
        state.firstFrame = true;
        log('firstFrameReady', Math.round(performance.now()) + 'ms');
      },
      gameReady() {
        if (!state.firstFrame) fail('gameReady before firstFrameReady');
        if (state.ready) fail('gameReady called twice');
        state.ready = true;
        log('gameReady', Math.round(performance.now()) + 'ms');
      },
      loadData() {
        log('loadData');
        return new Promise((r) => setTimeout(() => { state.loaded = true; r(state.store); }, 150));
      },
      saveData(data) {
        if (!state.loaded) { fail('saveData before loadData resolved'); return Promise.reject(new Error('not loaded')); }
        if (typeof data !== 'string') fail('saveData needs a string');
        if (data.length * 2 > 3 * 1024 * 1024) fail('save > 3 MiB');
        state.store = data;
        localStorage.setItem('ytgame-mock-save', data);
        log('saveData', data.length + ' chars');
        return Promise.resolve();
      },
    },
    system: {
      isAudioEnabled: () => state.audio,
      onAudioEnabledChange(cb) { state.audioCbs.push(cb); return () => {}; },
      onPause(cb) { state.pause.push(cb); return () => {}; },
      onResume(cb) { state.resume.push(cb); return () => {}; },
      getLanguage: () => Promise.resolve(params.get('lang') || 'en-US'),
    },
    engagement: {
      sendScore(s) { log('sendScore', s && s.value); return Promise.resolve(); },
      openYTContent() { return Promise.resolve(); },
    },
    ads: {
      requestInterstitialAd() { log('requestInterstitialAd'); return new Promise((r) => setTimeout(r, 500)); },
      requestRewardedAd(id) { log('requestRewardedAd', id); return new Promise((r) => setTimeout(() => r(true), 800)); },
    },
    health: { logError() { log('health.logError'); }, logWarning() { log('health.logWarning'); } },
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      state.audio = !state.audio;
      log('audio enabled →', state.audio);
      state.audioCbs.forEach((cb) => cb(state.audio));
    } else if (e.key === 'p' || e.key === 'P') {
      state.paused = !state.paused;
      log(state.paused ? 'onPause' : 'onResume');
      (state.paused ? state.pause : state.resume).forEach((cb) => cb());
    }
  });
})();
