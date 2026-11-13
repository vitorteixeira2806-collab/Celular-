// Áudio 100% sintetizado (Web Audio API): motor que varia com a rotação, pneus, batidas, sirene,
// efeitos de interface e uma rádio com 3 estações de música procedural original.
import { clamp, mulberry32 } from '../core/util.js';

const PITCH = { compact: 1.15, sedan: 1.0, pickup: 0.85, suv: 0.88, muscle: 0.78, sport: 1.05, super: 1.22 };
export const STATION_NAMES = ['Onda FM', 'Brasa 99', 'Maré Calma'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// progressões: [fundamental MIDI, intervalos do acorde]
const STATIONS = [
  { bpm: 102, swing: 0, prog: [[45, [0, 3, 7, 10]], [41, [0, 4, 7, 11]], [48, [0, 4, 7, 11]], [43, [0, 4, 7, 10]]], scale: [0, 3, 5, 7, 10], style: 'synth' },
  { bpm: 126, swing: 0, prog: [[40, [0, 3, 7]], [36, [0, 4, 7]], [38, [0, 4, 7]], [35, [0, 3, 7]]], scale: [0, 3, 5, 7, 10], style: 'house' },
  { bpm: 78, swing: 0.16, prog: [[50, [0, 4, 7, 11]], [47, [0, 3, 7, 10]], [43, [0, 4, 7, 11]], [45, [0, 4, 7, 10]]], scale: [0, 2, 4, 7, 9], style: 'lofi' },
];

export class AudioSys {
  constructor(game) {
    this.g = game; this.ctx = null; this.ready = false; this.paused = false;
    this.step16 = 0; this.nextT = 0; this.melody = []; this.lastRadio = -2;
  }

  // chamado no primeiro toque (exigência do iOS para liberar o áudio)
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.world = ctx.createGain(); this.world.connect(this.sfx); // sons contínuos (motor etc.), silenciados na pausa

    // ruído branco reutilizável
    const len = ctx.sampleRate * 1.5;
    const buf = (this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate));
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.world);
      src.start();
      return { f, g };
    };

    // motor: três osciladores -> filtro passa-baixa
    this.eOsc = ['sawtooth', 'square', 'sawtooth'].map((type) => { const o = ctx.createOscillator(); o.type = type; return o; });
    this.eMix = [0.5, 0.35, 0.25].map((v) => { const g = ctx.createGain(); g.gain.value = v; return g; });
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 600; this.eFilter.Q.value = 1.2;
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eOsc.forEach((o, i) => { o.connect(this.eMix[i]); this.eMix[i].connect(this.eFilter); o.start(); });
    this.eFilter.connect(this.eGain); this.eGain.connect(this.world);

    this.tire = noise('bandpass', 1200, 4);
    this.wind = noise('lowpass', 380, 0);
    this.nitro = noise('highpass', 1800, 0);
    // sirene (dois tons)
    this.sOsc = ctx.createOscillator(); this.sOsc.type = 'triangle';
    this.sGain = ctx.createGain(); this.sGain.gain.value = 0;
    this.sOsc.connect(this.sGain); this.sGain.connect(this.world); this.sOsc.start();

    // barramentos da rádio
    this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 1100; this.padF.connect(this.music);
    this.bassF = ctx.createBiquadFilter(); this.bassF.type = 'lowpass'; this.bassF.frequency.value = 420; this.bassF.connect(this.music);
    this.leadF = ctx.createBiquadFilter(); this.leadF.type = 'lowpass'; this.leadF.frequency.value = 2600; this.leadF.connect(this.music);
    // eco simples para a melodia
    const delay = ctx.createDelay(0.6); delay.delayTime.value = 0.29;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    this.leadF.connect(delay); delay.connect(fb); fb.connect(delay);
    const wet = ctx.createGain(); wet.gain.value = 0.35; delay.connect(wet); wet.connect(this.music);

    this.ready = true;
    this.applyOptions();
    this.timer = setInterval(() => this.schedule(), 90);
    this.resume();
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  applyOptions() {
    if (!this.ready) return;
    const o = this.g.opt, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(o.mute ? 0 : o.volMaster, t, 0.03);
    this.sfx.gain.setTargetAtTime(o.volSfx, t, 0.03);
    this.music.gain.setTargetAtTime(o.radioOn ? o.volMusic * 0.5 : 0, t, 0.05);
    const cur = o.radioOn ? o.station : -1;
    if (cur !== this.lastRadio) {
      if (this.lastRadio !== -2 && cur >= 0) this.g.hud.toast('Rádio: ' + STATION_NAMES[cur]);
      this.lastRadio = cur; this.step16 = 0; this.nextT = 0;
    }
  }
  nextStation() {
    const o = this.g.opt;
    if (!o.radioOn) { o.radioOn = true; o.station = 0; }
    else if (o.station >= 2) { o.radioOn = false; this.g.hud.toast('Rádio desligado'); }
    else o.station++;
    this.g.applyOptions();
    this.play('tick');
  }
  setPaused(p) {
    this.paused = p;
    if (this.ready) this.world.gain.setTargetAtTime(p ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  // ---------- Sons contínuos ----------
  update(dt) {
    if (!this.ready) return;
    const g = this.g, p = g.player, t = this.ctx.currentTime;
    const active = (g.state === 'roam' || g.state === 'race' || g.state === 'title') && !g.paused;
    const k = PITCH[p.model] || 1;
    const f = (52 + p.rpm * 150) * k;
    this.eOsc[0].frequency.setTargetAtTime(f, t, 0.03);
    this.eOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.eOsc[2].frequency.setTargetAtTime(f * 1.505, t, 0.03);
    const thr = p.in.throttle;
    this.eFilter.frequency.setTargetAtTime(280 + p.rpm * 1500 + thr * 900, t, 0.05);
    const vol = g.state === 'title' ? 0.035 : 0.07 + thr * 0.075 + p.rpm * 0.03;
    this.eGain.gain.setTargetAtTime(active ? vol : 0, t, 0.06);
    const slip = p.grounded ? Math.max(p.slip, p.drift * 0.7) : 0;
    this.tire.g.gain.setTargetAtTime(active && p.speed > 5 && p.surface < 2 ? slip * 0.2 : 0, t, 0.05);
    this.tire.f.frequency.setTargetAtTime(900 + slip * 700 + p.speed * 6, t, 0.08);
    this.wind.g.gain.setTargetAtTime(active ? clamp(p.speed / 70, 0, 1) * (p.surface >= 2 ? 0.22 : 0.12) : 0, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(250 + p.speed * 9, t, 0.1);
    this.nitro.g.gain.setTargetAtTime(active && p.nitroOn ? 0.16 : 0, t, 0.05);
    const s = g.police ? g.police.siren : 0;
    this.sGain.gain.setTargetAtTime(active && g.police && g.police.stars > 0 ? s * 0.07 : 0, t, 0.1);
    this.sOsc.frequency.setTargetAtTime(Math.floor(g.time * 1.7) & 1 ? 930 : 690, t, 0.06);
  }

  // ---------- Efeitos pontuais ----------
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0, bus) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfx);
    o.start(t); o.stop(t + dur + 0.03);
  }
  burst(dur, vol, type, freq, when = 0, bus, q) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus || this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.03);
  }
  play(name, a = 1) {
    if (!this.ready || this.ctx.state !== 'running') return;
    switch (name) {
      case 'crash': {
        const v = clamp(a, 0.15, 1);
        this.burst(0.28 + v * 0.3, 0.5 * v, 'lowpass', 900 + v * 1800);
        this.tone(95, 0.22, 'sine', 0.5 * v, 0, 38);
        if (v > 0.5) this.burst(0.5, 0.18, 'highpass', 3000, 0.05); // vidro/lataria
        break;
      }
      case 'land': this.tone(70, 0.2, 'sine', 0.4 * clamp(a, 0.2, 1), 0, 35); this.burst(0.15, 0.2, 'lowpass', 500); break;
      case 'beep': this.tone(440, 0.16, 'square', 0.14); break;
      case 'go': this.tone(880, 0.5, 'square', 0.16); break;
      case 'cp': this.tone(880, 0.09, 'triangle', 0.22); this.tone(1320, 0.14, 'triangle', 0.22, 0.08); break;
      case 'lap': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.22, i * 0.09)); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.22, i * 0.11)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, i * 0.16)); break;
      case 'tick': this.tone(1300, 0.04, 'square', 0.06); break;
      case 'buy': this.tone(988, 0.08, 'square', 0.12); this.tone(1319, 0.2, 'square', 0.12, 0.08); break;
      case 'deny': this.tone(140, 0.18, 'sawtooth', 0.14); break;
      case 'alert': [0, 0.18].forEach((w) => { this.tone(700, 0.16, 'square', 0.12, w, 1000); }); break;
      case 'nitro': this.burst(0.5, 0.25, 'bandpass', 1400, 0, null, 1.5); this.tone(180, 0.5, 'sawtooth', 0.1, 0, 520); break;
      default:
    }
  }

  // ---------- Rádio: sequenciador procedural ----------
  note(bus, type, midi, t, dur, vol, attack = 0.01) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = mtof(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  kick(t, v = 0.7) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.3);
  }
  drum(t, kind, v) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    let dur;
    if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7500; dur = 0.045; }
    else if (kind === 'ohat') { f.type = 'highpass'; f.frequency.value = 6500; dur = 0.16; }
    else { f.type = 'bandpass'; f.frequency.value = kind === 'clap' ? 1300 : 1900; f.Q.value = 0.8; dur = kind === 'clap' ? 0.2 : 0.16; }
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.music);
    src.start(t, Math.random()); src.stop(t + dur + 0.03);
  }

  schedule() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const o = this.g.opt;
    if (!o.radioOn || o.mute || o.volMusic <= 0 || o.volMaster <= 0) { this.nextT = 0; return; }
    const ctx = this.ctx, S = STATIONS[o.station] || STATIONS[0];
    const spb = 60 / S.bpm, s16 = spb / 4;
    if (this.nextT < ctx.currentTime) { this.nextT = ctx.currentTime + 0.08; }
    while (this.nextT < ctx.currentTime + 0.3) {
      this.playStep(S, this.step16, this.nextT + ((this.step16 & 1) ? S.swing * s16 : 0), s16);
      this.step16++;
      this.nextT += s16;
    }
  }

  playStep(S, n, t, s16) {
    const st = n % 16, bar = Math.floor(n / 16), sec = Math.floor(bar / 8);
    const [root, chord] = S.prog[bar % S.prog.length];
    const rng = mulberry32(sec * 977 + S.bpm * 31 + (bar % 2) * 7919 + st * 13);
    const fill = bar % 8 === 7;         // virada no fim de cada seção
    const breakdown = sec % 4 === 3 && bar % 8 < 2; // respiro sem bateria
    // melodia da seção (gerada uma vez a cada 2 compassos, repetida)
    if (st === 0 && bar % 2 === 0) {
      const mr = mulberry32(sec * 131 + S.bpm + (bar % 4) * 17);
      this.melody = [];
      let deg = Math.floor(mr() * 5);
      for (let i = 0; i < 16; i++) {
        deg = clamp(deg + Math.round((mr() - 0.5) * 3.2), 0, 9);
        this.melody.push(mr() < (S.style === 'lofi' ? 0.3 : 0.42) ? deg : -1);
      }
    }
    const mel = this.melody.length ? this.melody[st] : -1;
    const tonic = S.prog[0][0] + 24;
    const melNote = (d) => tonic + S.scale[d % 5] + 12 * Math.floor(d / 5);

    if (S.style === 'synth') {
      if (!breakdown) {
        if (st % 8 === 0) this.kick(t, 0.6);
        if (st % 8 === 4) this.drum(t, 'snare', 0.3);
        if (st % 2 === 0) this.drum(t, 'hat', st % 4 === 2 ? 0.12 : 0.07);
        if (fill && st >= 12) this.drum(t, 'snare', 0.16 + (st - 12) * 0.04);
      }
      if (st % 2 === 0) this.note(this.bassF, 'sawtooth', root + (st % 4 === 2 ? 12 : 0) - 12, t, s16 * 1.8, 0.3);
      // arpejo
      const a = chord[(st + (bar % 2)) % chord.length] + (st % 8 >= 4 ? 12 : 0);
      this.note(this.leadF, 'square', root + 24 + a, t, s16 * 0.9, 0.05);
      if (st === 0) for (const iv of chord) { this.note(this.padF, 'sawtooth', root + 12 + iv, t, s16 * 16, 0.045, 0.4); this.note(this.padF, 'sawtooth', root + 12.08 + iv, t, s16 * 16, 0.04, 0.4); }
      if (mel >= 0 && sec % 2 === 1 && st % 2 === 0) this.note(this.leadF, 'sawtooth', melNote(mel) + 12, t, s16 * 2.6, 0.085, 0.02);
    } else if (S.style === 'house') {
      if (!breakdown) {
        if (st % 4 === 0) this.kick(t, 0.7);
        if (st % 8 === 4) this.drum(t, 'clap', 0.3);
        if (st % 4 === 2) this.drum(t, 'ohat', 0.13);
        if (rng() < 0.3 && st % 2 === 1) this.drum(t, 'hat', 0.06);
        if (fill && st >= 8 && st % 2 === 0) this.drum(t, 'snare', 0.12 + (st - 8) * 0.025);
      }
      // baixo sincopado
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0];
      if (pat[st]) this.note(this.bassF, 'square', root + (st === 11 ? 7 : 0) - 12 + (rng() < 0.15 ? 12 : 0), t, s16 * 1.5, 0.3);
      // acordes em staccato no contratempo
      if (st === 3 || st === 6 || st === 11 || st === 14) for (const iv of chord) this.note(this.padF, 'sawtooth', root + 24 + iv, t, s16 * 1.4, 0.05, 0.005);
      if (mel >= 0 && sec % 2 === 0) this.note(this.leadF, 'triangle', melNote(mel) + 12, t, s16 * 1.8, 0.11, 0.008);
    } else {
      if (!breakdown) {
        if (st === 0 || st === 10 || (st === 7 && rng() < 0.4)) this.kick(t, 0.5);
        if (st % 8 === 4) this.drum(t, 'snare', 0.2);
        if (st % 2 === 0) this.drum(t, 'hat', 0.04 + rng() * 0.03);
      }
      if (st === 0 || st === 6 || st === 10) this.note(this.bassF, 'sine', root - 12 + (st === 6 ? 7 : 0), t, s16 * 3.5, 0.34, 0.02);
      // acordes tipo piano elétrico
      if (st === 0 || st === 8) chord.forEach((iv, i) => { this.note(this.padF, 'triangle', root + 12 + iv, t + i * 0.018, s16 * 7, 0.085, 0.015); this.note(this.padF, 'sine', root + 24 + iv, t + i * 0.018, s16 * 5, 0.03, 0.015); });
      if (mel >= 0 && st % 2 === 0) this.note(this.leadF, 'sine', melNote(mel) + 12, t, s16 * 3.2, 0.1, 0.03);
    }
  }
}
