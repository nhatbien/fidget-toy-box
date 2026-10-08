// WebAudio synth. Every sound in the game is generated at runtime — no audio files to load.
import { clamp, rand, pick } from './gfx.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.platformEnabled = true; // YouTube / host mute state
    this.paused = false;
    this.sfxOn = true;
    this.musicOn = true;
    this.music = null;
    this._musicTimer = 0;
    this._loops = new Set();
  }

  /** Create / resume the AudioContext. Call from inside a user gesture (pointerdown, keydown). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        try {
          this.ctx = new AC(); // older Safari rejects the options bag
        } catch (err) {
          return;
        }
      }
      this._build();
      // iOS needs a sound started inside the gesture to fully unlock output.
      try {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
      } catch (e) { /* ignore */ }
    }
    this._applyState();
    if (this.musicOn && !this.paused) this.startMusic();
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.reverbIn = ctx.createConvolver();
    this.reverbIn.buffer = this._makeIR(2.6, 3.2);
    const ret = ctx.createGain();
    ret.gain.value = 0.55;
    this.reverbIn.connect(ret);
    ret.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown-ish noise for sand / rumble
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
  }

  _makeIR(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ---------- state ----------
  setPlatformEnabled(on) {
    this.platformEnabled = !!on;
    this._applyState();
  }
  setPaused(p) {
    this.paused = !!p;
    if (p) this._stopMusicTimer();
    this._applyState();
    if (!p && this.musicOn && this.ctx) this.startMusic();
  }
  setSfx(on) {
    this.sfxOn = !!on;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }
  setMusic(on) {
    this.musicOn = !!on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
    if (on) this.startMusic();
    else this.stopMusic();
  }
  _applyState() {
    const ctx = this.ctx;
    if (!ctx) return;
    const audible = this.platformEnabled && !this.paused;
    this.master.gain.setValueAtTime(this.platformEnabled ? 1 : 0, ctx.currentTime);
    if (audible) {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } else if (ctx.state === 'running') {
      ctx.suspend().catch(() => {});
    }
  }
  get active() {
    return !!this.ctx && this.platformEnabled && !this.paused;
  }
  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Voice output: gain node → (panner) → bus (+ reverb send). */
  _voice(bus, pan, reverb) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let last = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      last = p;
    }
    last.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      last.connect(s);
      s.connect(this.reverbIn);
    }
    return g;
  }
  _ok(bus) {
    return this.active && (bus === 'music' ? this.musicOn : this.sfxOn);
  }

  // ---------- primitives ----------
  /** Oscillator voice with an exponential decay envelope. */
  tone({ freq = 440, freqEnd = 0, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.003, pan = 0, reverb = 0, when = 0, bus = 'sfx', detune = 0 } = {}) {
    if (!this._ok(bus)) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = this._voice(bus, pan, reverb);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst. type: 'bandpass' | 'lowpass' | 'highpass'. color: 'white' | 'brown'. */
  noise({ dur = 0.1, vol = 0.3, type = 'bandpass', freq = 1000, freqEnd = 0, q = 1, attack = 0.001, pan = 0, reverb = 0, when = 0, bus = 'sfx', color = 'white' } = {}) {
    if (!this._ok(bus)) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = color === 'brown' ? this.brownBuf : this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = this._voice(bus, pan, reverb);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    src.connect(f);
    f.connect(g);
    const off = Math.random() * (src.buffer.duration - dur - 0.1);
    src.start(t, Math.max(0, off), dur + 0.05);
  }

  /**
   * Continuous sound you modulate every frame (spinner whirr, sand scrape, motor hum).
   * Returns { set({vol, freq, q, rate}), stop() }. Nodes are created lazily once audio is unlocked.
   */
  loop({ source = 'noise', oscType = 'sawtooth', type = 'bandpass', freq = 800, q = 1, color = 'white', bus = 'sfx' } = {}) {
    const self = this;
    const h = {
      nodes: null, vol: 0,
      set(p = {}) {
        if (!self.ctx) return;
        if (!this.nodes) this._build();
        const t = self.ctx.currentTime;
        const n = this.nodes;
        if (p.vol !== undefined) {
          this.vol = p.vol;
          const v = self._ok(bus) ? Math.max(0, p.vol) : 0;
          n.g.gain.setTargetAtTime(v, t, 0.04);
        }
        if (p.freq !== undefined) n.f.frequency.setTargetAtTime(Math.max(20, p.freq), t, 0.04);
        if (p.q !== undefined) n.f.Q.setTargetAtTime(p.q, t, 0.05);
        if (p.rate !== undefined && n.src.playbackRate) n.src.playbackRate.setTargetAtTime(p.rate, t, 0.05);
        if (p.oscFreq !== undefined && n.src.frequency) n.src.frequency.setTargetAtTime(p.oscFreq, t, 0.03);
      },
      _build() {
        const ctx = self.ctx;
        let src;
        if (source === 'noise') {
          src = ctx.createBufferSource();
          src.buffer = color === 'brown' ? self.brownBuf : self.noiseBuf;
          src.loop = true;
        } else {
          src = ctx.createOscillator();
          src.type = oscType;
          src.frequency.value = freq;
        }
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = self._voice(bus, 0, 0);
        g.gain.value = 0;
        src.connect(f);
        f.connect(g);
        src.start();
        this.nodes = { src, f, g };
        self._loops.add(this);
      },
      stop() {
        if (!this.nodes) return;
        const n = this.nodes;
        this.nodes = null;
        self._loops.delete(this);
        try {
          n.g.gain.setTargetAtTime(0, self.ctx.currentTime, 0.03);
          n.src.stop(self.ctx.currentTime + 0.2);
        } catch (e) { /* already stopped */ }
      },
    };
    return h;
  }

  // ---------- sound presets ----------
  /** Soft silicone "pok" (pop-it). */
  pop(p = 1, v = 1, pan = 0) {
    const r = rand(0.93, 1.07) * p;
    this.tone({ freq: 560 * r, freqEnd: 170 * r, dur: 0.09, vol: 0.42 * v, attack: 0.001, pan });
    this.noise({ dur: 0.035, vol: 0.22 * v, type: 'bandpass', freq: 1500 * r, q: 1.3, pan });
  }
  /** Sharp plastic crack (bubble wrap). */
  snap(p = 1, v = 1, pan = 0) {
    const r = rand(0.85, 1.2) * p;
    this.noise({ dur: 0.045, vol: 0.55 * v, type: 'highpass', freq: 1400 * r, q: 0.7, attack: 0.0005, pan });
    this.noise({ dur: 0.1, vol: 0.16 * v, type: 'bandpass', freq: 420 * r, q: 2, pan });
    this.tone({ freq: 2300 * r, freqEnd: 900 * r, type: 'triangle', dur: 0.03, vol: 0.1 * v, pan });
  }
  /** Tiny mechanical tick. */
  click(p = 1, v = 1, pan = 0) {
    this.noise({ dur: 0.012, vol: 0.4 * v, type: 'highpass', freq: 3000 * p, q: 0.8, attack: 0.0005, pan });
    this.tone({ freq: 1800 * p, freqEnd: 1200 * p, type: 'square', dur: 0.015, vol: 0.05 * v, pan });
  }
  /** Toggle switch "clack". */
  toggle(on = true, v = 1, pan = 0) {
    const p = on ? 1.15 : 0.9;
    this.noise({ dur: 0.02, vol: 0.45 * v, type: 'bandpass', freq: 2600 * p, q: 1.5, attack: 0.0005, pan });
    this.tone({ freq: 150 * p, freqEnd: 70 * p, dur: 0.06, vol: 0.3 * v, pan });
    this.noise({ dur: 0.01, vol: 0.22 * v, type: 'highpass', freq: 5000, when: 0.03, pan });
  }
  /** Big chunky button press. */
  thunk(p = 1, v = 1, pan = 0) {
    this.tone({ freq: 230 * p, freqEnd: 90 * p, dur: 0.13, vol: 0.45 * v, pan });
    this.noise({ dur: 0.045, vol: 0.22 * v, type: 'lowpass', freq: 1100 * p, q: 0.8, pan });
  }
  /** Wet slime squelch. */
  squish(p = 1, v = 1, pan = 0) {
    const d = rand(0.16, 0.3);
    this.noise({ dur: d, vol: 0.32 * v, type: 'lowpass', freq: 260 * p, freqEnd: 1300 * p, q: 7, attack: 0.02, pan });
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: rand(160, 380) * p, freqEnd: rand(520, 900) * p, dur: 0.05, vol: 0.05 * v, when: rand(0.02, d), pan });
    }
  }
  /** Mallet percussion. kind: 'xylo' | 'marimba' | 'glass' | 'toy'. */
  mallet(freq, v = 1, kind = 'xylo', pan = 0) {
    const sets = {
      xylo: [[1, 0.4, 1.1], [3.93, 0.1, 0.25], [9.2, 0.04, 0.07]],
      marimba: [[1, 0.45, 1.4], [4, 0.08, 0.35], [10, 0.02, 0.08]],
      glass: [[1, 0.3, 2.4], [2.76, 0.12, 1.3], [5.4, 0.06, 0.7]],
      toy: [[1, 0.3, 0.6], [2, 0.12, 0.3], [3, 0.08, 0.15]],
    };
    const parts = sets[kind] || sets.xylo;
    const rev = kind === 'glass' ? 0.4 : 0.18;
    for (const [m, vol, dur] of parts) {
      this.tone({ freq: freq * m, dur, vol: vol * v, attack: 0.001, pan, reverb: rev, type: kind === 'toy' && m === 1 ? 'triangle' : 'sine' });
    }
    this.noise({ dur: 0.012, vol: 0.12 * v, type: 'bandpass', freq: Math.min(9000, freq * 3), q: 2, pan });
  }
  /** Soft bell / chime with reverb. */
  chime(freq, v = 1, pan = 0, bus = 'sfx') {
    this.tone({ freq, dur: 1.6, vol: 0.18 * v, attack: 0.002, pan, reverb: 0.5, bus });
    this.tone({ freq: freq * 2.01, dur: 0.9, vol: 0.07 * v, attack: 0.002, pan, reverb: 0.5, bus });
    this.tone({ freq: freq * 3.02, dur: 0.4, vol: 0.03 * v, attack: 0.002, pan, reverb: 0.5, bus });
  }
  /** Balloon burst. */
  balloonPop(v = 1, pan = 0) {
    this.noise({ dur: 0.14, vol: 0.6 * v, type: 'highpass', freq: 380, q: 0.5, attack: 0.0005, pan });
    this.noise({ dur: 0.05, vol: 0.4 * v, type: 'bandpass', freq: 2400, q: 0.8, pan });
    this.tone({ freq: 130, freqEnd: 40, dur: 0.16, vol: 0.4 * v, pan });
  }
  /** Sand crumble — a cluster of tiny grains. */
  crumble(v = 1, pan = 0, len = 0.35) {
    const n = Math.round(6 + 10 * len);
    for (let i = 0; i < n; i++) {
      this.noise({ dur: rand(0.02, 0.06), vol: rand(0.05, 0.14) * v, type: 'bandpass', freq: rand(900, 3200), q: 0.9, when: rand(0, len), pan, color: 'brown' });
    }
    this.noise({ dur: len, vol: 0.12 * v, type: 'lowpass', freq: 900, freqEnd: 300, q: 0.5, pan, color: 'brown', attack: 0.03 });
  }
  /** Steel ball click (Newton's cradle). */
  clack(v = 1, pan = 0) {
    v = clamp(v, 0, 1.2);
    this.noise({ dur: 0.03, vol: 0.45 * v, type: 'bandpass', freq: 3300, q: 10, attack: 0.0005, pan, reverb: 0.08 });
    this.tone({ freq: 2650, dur: 0.05, vol: 0.12 * v, type: 'triangle', pan, reverb: 0.08 });
    this.tone({ freq: 5900, dur: 0.02, vol: 0.05 * v, pan });
  }
  /** Airy swoosh for transitions / flips. */
  whoosh(v = 1, up = true) {
    this.noise({ dur: 0.32, vol: 0.16 * v, type: 'bandpass', freq: up ? 400 : 2200, freqEnd: up ? 2200 : 400, q: 1.4, attack: 0.08 });
  }
  /** UI tap. */
  tap(v = 1) {
    this.tone({ freq: 880, freqEnd: 620, type: 'triangle', dur: 0.06, vol: 0.16 * v });
    this.noise({ dur: 0.01, vol: 0.12 * v, type: 'highpass', freq: 4000 });
  }
  /** Denied / not enough stars. */
  deny() {
    this.tone({ freq: 330, type: 'triangle', dur: 0.12, vol: 0.18 });
    this.tone({ freq: 262, type: 'triangle', dur: 0.18, vol: 0.18, when: 0.1 });
  }
  /** Star earned ding. */
  star(p = 1) {
    this.tone({ freq: 1318 * p, dur: 0.25, vol: 0.13, reverb: 0.3, type: 'triangle' });
    this.tone({ freq: 1976 * p, dur: 0.35, vol: 0.1, reverb: 0.3, when: 0.06 });
  }
  /** Celebration arpeggio. */
  fanfare() {
    [72, 76, 79, 84, 88].forEach((n, i) => {
      const f = midi(n), when = i * 0.075, pan = (i - 2) * 0.2;
      this.tone({ freq: f, type: 'triangle', dur: 0.55, vol: 0.13, when, pan, reverb: 0.45 });
      this.tone({ freq: f * 2.01, dur: 0.35, vol: 0.05, when, pan, reverb: 0.45 });
    });
  }

  /** Drum kit voices. kit: 'classic' | 'chip' | 'lofi' | 'bubble'. */
  drum(kind, kit = 'classic', pan = 0) {
    const chip = kit === 'chip';
    const lofiCut = kit === 'lofi' ? 0.45 : 1;
    switch (kind) {
      case 'kick':
        if (kit === 'bubble') return this.tone({ freq: 300, freqEnd: 60, dur: 0.25, vol: 0.7, pan });
        this.tone({ freq: chip ? 220 : 150, freqEnd: 42, dur: 0.38, vol: 0.85, type: chip ? 'square' : 'sine', pan });
        this.noise({ dur: 0.006, vol: 0.3, type: 'highpass', freq: 3000, pan });
        break;
      case 'snare':
        if (kit === 'bubble') return this.pop(1.6, 1.2, pan);
        this.noise({ dur: 0.18, vol: 0.42, type: chip ? 'bandpass' : 'highpass', freq: 1300 * lofiCut, q: chip ? 0.5 : 0.7, pan });
        this.tone({ freq: 200, freqEnd: 150, dur: 0.1, vol: 0.28, type: chip ? 'square' : 'triangle', pan });
        break;
      case 'clap':
        if (kit === 'bubble') return this.snap(1.3, 1, pan);
        for (let i = 0; i < 3; i++) this.noise({ dur: 0.02, vol: 0.4, type: 'bandpass', freq: 1150 * lofiCut, q: 0.9, when: i * 0.011, pan });
        this.noise({ dur: 0.16, vol: 0.25, type: 'bandpass', freq: 1150 * lofiCut, q: 0.9, when: 0.033, pan, reverb: 0.15 });
        break;
      case 'hat':
        if (kit === 'bubble') return this.click(2, 1.2, pan);
        this.noise({ dur: 0.05, vol: 0.24, type: 'highpass', freq: 7200 * lofiCut, q: 0.7, pan });
        break;
      case 'openhat':
        if (kit === 'bubble') return this.noise({ dur: 0.3, vol: 0.2, type: 'bandpass', freq: 5000, q: 3, pan });
        this.noise({ dur: 0.38, vol: 0.2, type: 'highpass', freq: 6500 * lofiCut, q: 0.7, pan });
        break;
      case 'tom':
      case 'tomHi':
        {
          const f = kind === 'tom' ? 150 : 230;
          if (kit === 'bubble') return this.tone({ freq: f * 2, freqEnd: f * 4, dur: 0.12, vol: 0.4, pan });
          this.tone({ freq: f, freqEnd: f * 0.55, dur: 0.32, vol: 0.6, type: chip ? 'square' : 'sine', pan });
        }
        break;
      case 'rim':
        this.tone({ freq: 1700, dur: 0.03, vol: 0.22, type: chip ? 'square' : 'triangle', pan });
        this.noise({ dur: 0.02, vol: 0.2, type: 'bandpass', freq: 2600, q: 3, pan });
        break;
      case 'cowbell':
        this.tone({ freq: 545, dur: 0.28, vol: 0.14, type: 'square', pan });
        this.tone({ freq: 815, dur: 0.24, vol: 0.12, type: 'square', pan });
        break;
      case 'shaker':
        this.noise({ dur: 0.09, vol: 0.2, type: 'bandpass', freq: 6000, q: 0.8, attack: 0.03, pan });
        break;
      case 'bass':
        this.tone({ freq: midi(36 + pick([0, 0, 3, 5, 7])), dur: 0.35, vol: 0.38, type: chip ? 'square' : 'sawtooth', pan });
        break;
      default:
        this.click(1, 1, pan);
    }
  }

  // ---------- ambient music ----------
  startMusic() {
    if (!this.ctx || !this.musicOn || this.paused || this._musicTimer) return;
    if (!this.music) this.music = { next: this.ctx.currentTime + 0.4, step: 0 };
    this._musicTimer = setInterval(() => this._tickMusic(), 250);
  }
  _stopMusicTimer() {
    clearInterval(this._musicTimer);
    this._musicTimer = 0;
  }
  stopMusic() {
    this._stopMusicTimer();
    this.music = null;
  }
  _tickMusic() {
    if (!this.active || !this.musicOn || !this.music) return;
    const ctx = this.ctx, m = this.music;
    if (m.next < ctx.currentTime) m.next = ctx.currentTime + 0.05;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
    const scale = [72, 74, 76, 79, 81, 84, 86, 88];
    const beat = 0.8;
    while (m.next < ctx.currentTime + 1.2) {
      const chord = chords[Math.floor(m.step / 8) % chords.length];
      if (m.step % 8 === 0) {
        chord.forEach((n, i) => this._pad(midi(n - 12), m.next + i * 0.05, beat * 8.4, 0.03));
      }
      if (m.step % 2 === 0 || Math.random() < 0.35) {
        if (Math.random() < 0.7) {
          const options = scale.filter((s) => chord.some((c) => (s - c) % 12 === 0) || Math.random() < 0.3);
          const n = pick(options.length ? options : scale);
          this._bell(midi(n), m.next + rand(0, 0.06), 0.05);
        }
      }
      m.step++;
      m.next += beat;
    }
  }
  _pad(freq, t, dur, vol) {
    const ctx = this.ctx;
    const g = this._voice('music', 0, 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.6);
    g.gain.setTargetAtTime(0.0001, t + dur - 2.2, 0.8);
    f.connect(g);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1);
    }
  }
  _bell(freq, t, vol) {
    const ctx = this.ctx;
    for (const [m, v, d] of [[1, 1, 2.2], [2.01, 0.35, 1.2], [3.98, 0.12, 0.6]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * m;
      const g = this._voice('music', rand(-0.4, 0.4), 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }
}

export { midi };
