'use strict';
// Sons sintetizados com Web Audio (sem arquivos): motor, cantada de pneu, buzina, batida, caixa registradora.

const SirenSound = {
  startSiren() {
    const ac = Sfx.ac;
    if (!ac || this.siren) return;
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 760;
    lfo.type = 'triangle'; lfo.frequency.value = 1.4; lg.gain.value = 260;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(Sfx.master);
    o.start(); lfo.start();
    this.siren = { o, lfo, g };
  },
  sirenVol(d) {
    if (this.siren) this.siren.g.gain.setTargetAtTime(mode === 'play' ? 0.05 * clamp(1 - d / 650, 0.08, 1) : 0, Sfx.ac.currentTime, 0.1);
  },
  stopSiren() {
    if (!this.siren) return;
    const { o, lfo, g } = this.siren;
    g.gain.setTargetAtTime(0, Sfx.ac.currentTime, 0.05);
    o.stop(Sfx.ac.currentTime + 0.3); lfo.stop(Sfx.ac.currentTime + 0.3);
    this.siren = null;
  },
};

const Sfx = {
  ac: null, master: null, muted: false, vol: 0.45,

  init() {
    if (this.ac) {
      if (this.ac.state === 'suspended' || this.ac.state === 'interrupted') this.ac.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch (e) { this.ac = null; return; }
    const ac = this.ac;
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    this.master.connect(ac.destination);

    this.eOsc = ac.createOscillator(); this.eOsc.type = 'sawtooth';
    this.eOsc2 = ac.createOscillator(); this.eOsc2.type = 'square';
    this.eFilt = ac.createBiquadFilter(); this.eFilt.type = 'lowpass'; this.eFilt.frequency.value = 400;
    this.eGain = ac.createGain(); this.eGain.gain.value = 0;
    const half = ac.createGain(); half.gain.value = 0.5;
    this.eOsc.connect(this.eFilt); this.eOsc2.connect(half); half.connect(this.eFilt);
    this.eFilt.connect(this.eGain); this.eGain.connect(this.master);
    this.eOsc.start(); this.eOsc2.start();

    const len = ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.sSrc = ac.createBufferSource(); this.sSrc.buffer = buf; this.sSrc.loop = true;
    this.sFilt = ac.createBiquadFilter(); this.sFilt.type = 'bandpass'; this.sFilt.frequency.value = 1800; this.sFilt.Q.value = 4;
    this.sGain = ac.createGain(); this.sGain.gain.value = 0;
    this.sSrc.connect(this.sFilt); this.sFilt.connect(this.sGain); this.sGain.connect(this.master);
    this.sSrc.start();
  },

  engine(sp, thr, on) {
    if (!this.ac) return;
    const t = this.ac.currentTime, f = 34 + sp * 90 + thr * 14;
    this.eOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.eOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.eFilt.frequency.setTargetAtTime(250 + sp * 700 + thr * 250, t, 0.06);
    this.eGain.gain.setTargetAtTime(on ? (0.035 + 0.045 * thr + 0.02 * sp) : 0, t, 0.08);
  },

  screech(level) {
    if (!this.ac) return;
    this.sGain.gain.setTargetAtTime(level * 0.09, this.ac.currentTime, 0.05);
  },

  tone(freq, dur, type = 'square', vol = 0.08, delay = 0, slide = 0) {
    if (!this.ac) return;
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(dur, vol, freq = 1000, delay = 0) {
    if (!this.ac) return;
    const ac = this.ac, t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },

  crash(k) { this.noise(0.18 + 0.25 * k, 0.25 + 0.35 * k, 700 + 600 * k); this.tone(80, 0.15 + 0.1 * k, 'square', 0.06 * k, 0, -30); },
  ding() { this.tone(880, 0.12, 'sine', 0.12); this.tone(1318, 0.22, 'sine', 0.12, 0.11); },
  cash() { this.tone(1046, 0.07, 'square', 0.05); this.tone(1568, 0.25, 'square', 0.05, 0.07); },
  horn(v = 0.08) { this.tone(392, 0.32, 'square', v); this.tone(494, 0.32, 'square', v * 0.8); },
  bad() { this.tone(240, 0.3, 'sawtooth', 0.06, 0, -90); },
  door() { this.noise(0.07, 0.25, 500); this.noise(0.06, 0.2, 400, 0.12); },
  sputter() { for (let k = 0; k < 4; k++) this.noise(0.07, 0.22, 300, k * 0.13); },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.vol;
    Radio.setMuted(m);
  },
};
