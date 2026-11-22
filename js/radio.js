'use strict';
// Rádio do carro: música sintetizada, notícias faladas e emissoras ao vivo.

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

const RADIO_STATIONS = [
  { id: 'off', name: 'Rádio desligado' },
  {
    id: 'funk', name: '150 BPM FM · funk', bpm: 130,
    kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: '..x...x...x...x.',
    chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], bass: 'kick', lead: 'stab', scale: [57, 60, 62, 64, 67, 69, 72],
  },
  {
    id: 'sertanejo', name: 'Sertaneja 98 · modão', bpm: 96,
    kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    chords: [[55, 59, 62], [50, 54, 57], [52, 55, 59], [48, 52, 55]], bass: 'roots', lead: 'pluck', scale: [62, 64, 66, 67, 69, 71, 74],
  },
  {
    id: 'pagode', name: 'Pagodão FM · samba', bpm: 100,
    kick: '....x.......x...', snare: '..x..x.x..x..x.x', hat: 'xxxxxxxxxxxxxxxx',
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]], bass: 'walk', lead: 'cavaco', scale: [60, 62, 64, 67, 69, 72],
  },
  { id: 'news', name: 'Rádio Trânsito · notícias', talk: true },
  { id: 'fm-o-dia', name: 'FM O Dia', stream: 'https://streaming.livespanel.com:8016/fmodia' },
  { id: 'tupi', name: 'Super Rádio Tupi', stream: 'https://8923.brasilstream.com.br/stream' },
  { id: 'cidade', name: 'Rádio Cidade', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOCIDADEAAC.aac' },
  { id: 'jb', name: 'JB FM', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/JBFMAAC.aac' },
  { id: 'antena1', name: 'Antena 1', stream: 'https://www.antena1.com.br/stream/stream/1;' },
  { id: 'globo-rio', name: 'Rádio Globo do Rio', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_GLOBO_RJAAC.aac' },
  { id: 'bandnews-rio', name: 'BandNews FM Rio', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/BANDNEWSFM_RJAAC.aac' },
  { id: 'cbn-rio', name: 'CBN Rio', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CBN_RJAAC.aac' },
];

const RADIO_LINES = [
  'Trânsito lento na região central. Se puder, evite.',
  'Atenção motorista: horário de saída dos colégios, trânsito parado nas escolas.',
  'A gasolina subiu de novo. Tem posto vendendo baratinho, mas desconfie.',
  'Polícia faz blitz durante a noite. Respeite a sinalização.',
  'Tarifa dinâmica alta perto da praça. Bora faturar!',
  'Moradores relatam assaltos na área de risco. Não pare o carro por lá.',
  'Previsão do tempo: céu limpo e calor. Ar-condicionado no máximo.',
  'E atenção, ouvinte: avaliação cinco estrelas é com direção suave!',
  'Você está ouvindo a Rádio Trânsito. A rádio que anda com você.',
  'Passageiro voltando da praia? Prepare o aspirador.',
];

const Radio = {
  st: 0, out: null, timer: 0, nextBar: 0, bar: 0, phrase: null, talkT: 0, voice: null, live: null,

  get station() { return RADIO_STATIONS[this.st]; },

  // R: próxima estação
  next() {
    clearInterval(this.timer);
    this.timer = 0;
    if (this.out) { this.out.disconnect(); this.out = null; }
    this.stopLive();
    this.st = (this.st + 1) % RADIO_STATIONS.length;
    this.stopTalk();
    const s = this.station;
    toast('📻 ' + s.name);
    if (s.stream) { this.playLive(s); return; }
    if (s.id === 'off' || !Sfx.ac) return;
    this.ensureOut();
    this.bar = 0; this.phrase = null;
    this.nextBar = Sfx.ac.currentTime + 0.25;
    this.talkT = 0.5;
    this.timer = setInterval(() => this.pump(), 30);
  },

  playLive(station) {
    const audio = new Audio();
    this.live = audio;
    audio.volume = Sfx.vol * 0.55;
    audio.muted = Sfx.muted;
    const unavailable = () => {
      if (this.live !== audio) return;
      this.stopLive();
      toast(station.name + ' sem sinal · R troca de estação');
    };
    audio.onerror = audio.onended = unavailable;
    audio.src = station.stream;
    audio.play().catch(unavailable);
  },

  stopLive() {
    const audio = this.live;
    if (!audio) return;
    this.live = null;
    audio.onerror = audio.onended = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  },

  setMuted(muted) {
    if (this.live) this.live.muted = muted;
    if (muted) this.stopTalk();
  },

  ensureOut() {
    if (this.out || !Sfx.ac) return;
    this.out = Sfx.ac.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(Sfx.master);
  },

  // agenda os compassos que começam nos próximos 0,25 s
  pump() {
    const s = this.station, ac = Sfx.ac;
    if (!ac || s.id === 'off') return;
    if (s.talk) {
      this.talkT -= 0.03;
      if (this.talkT <= 0) { this.talkT = 9 + Math.random() * 6; this.say(R.pick(RADIO_LINES)); }
      return;
    }
    // no menu de pausa a música segue; fora do jogo (tela inicial) não toca
    while (this.nextBar < ac.currentTime + 0.25) {
      if (this.nextBar < ac.currentTime - 0.1) this.nextBar = ac.currentTime + 0.05; // aba ficou parada
      this.playBar(s, this.nextBar);
      this.nextBar += 16 * this.step(s);
      this.bar++;
    }
  },

  step(s) { return 60 / s.bpm / 4; },

  // frase de melodia de 2 compassos, trocada a cada 8 compassos
  makePhrase(s) {
    const notes = [];
    for (let k = 0; k < 32; k++) notes.push(Math.random() < (s.lead === 'pluck' ? 0.45 : 0.3) ? R.pick(s.scale) : 0);
    return notes;
  },

  playBar(s, t0) {
    if (!this.phrase || this.bar % 8 === 0) this.phrase = this.makePhrase(s);
    const dt = this.step(s), chord = s.chords[Math.floor(this.bar / 2) % s.chords.length];
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * dt;
      if (s.kick[i] === 'x') this.kick(t, s.id === 'funk' ? 0.5 : 0.35);
      if (s.snare[i] === 'x') this.snare(t, s.id === 'pagode' ? 0.08 : 0.16, s.id === 'funk');
      if (s.hat[i] === 'x') this.hat(t, s.id === 'pagode' ? (i % 4 === 0 ? 0.07 : 0.035) : 0.04);
      // baixo
      const root = chord[0] - 24;
      if (s.bass === 'kick' && s.kick[i] === 'x') this.bass(t, root, dt * 2.5, 0.16);
      else if (s.bass === 'roots' && (i === 0 || i === 8)) this.bass(t, i === 0 ? root : root + 7, dt * 6, 0.12);
      else if (s.bass === 'walk' && i % 4 === 0) this.bass(t, root + [0, 4, 7, 4][i / 4], dt * 3, 0.12);
      // acordes
      if (s.lead === 'stab' && (i === 0 || i === 6 || i === 10)) this.chord(t, chord, dt * 1.5, 'square', 0.025);
      if (s.lead === 'cavaco' && (i % 4 === 2 || i === 7 || i === 15)) this.chord(t, chord.map((n) => n + 12), dt * 0.8, 'square', 0.018);
      if (s.lead === 'pluck' && i % 4 === 0) this.chord(t, chord, dt * 3.5, 'triangle', 0.035);
      // melodia
      const n = this.phrase[(this.bar % 2) * 16 + i];
      if (n) this.note(t, n + (s.lead === 'stab' ? 12 : 0), dt * (s.lead === 'pluck' ? 1.8 : 1.2), s.lead === 'pluck' ? 'triangle' : 'square', 0.03);
    }
  },

  // ---------- instrumentos ----------
  env(t, dur, vol) {
    const g = Sfx.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    return g;
  },
  osc(type, f, t, dur, vol, slideTo) {
    const o = Sfx.ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(this.env(t, dur, vol));
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(t, dur, vol, type, freq) {
    const s = Sfx.ac.createBufferSource(); s.buffer = Sfx.noiseBuf;
    const f = Sfx.ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    s.connect(f); f.connect(this.env(t, dur, vol));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  kick(t, v) { this.osc('sine', 150, t, 0.28, v, 42); },
  snare(t, v, clap) { this.noise(t, clap ? 0.09 : 0.14, v, 'highpass', clap ? 1500 : 900); if (!clap) this.osc('triangle', 190, t, 0.08, v * 0.4); },
  hat(t, v) { this.noise(t, 0.035, v, 'highpass', 7000); },
  bass(t, n, dur, v) { this.osc('sawtooth', midiHz(n), t, dur, v); this.osc('sine', midiHz(n), t, dur, v); },
  note(t, n, dur, type, v) { this.osc(type, midiHz(n), t, dur, v); },
  chord(t, ns, dur, type, v) { for (const n of ns) this.osc(type, midiHz(n), t, dur, v); },

  // ---------- estação falada ----------
  say(text) {
    const sp = window.speechSynthesis;
    if (!sp || Sfx.muted || typeof SpeechSynthesisUtterance === 'undefined') return;
    if (!this.voice) this.voice = sp.getVoices().find((v) => /^pt/i.test(v.lang)) || null;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = 1.12; u.pitch = 0.9; u.volume = 0.8;
    if (this.voice) u.voice = this.voice;
    sp.speak(u);
  },
  stopTalk() { if (window.speechSynthesis) window.speechSynthesis.cancel(); },
};
