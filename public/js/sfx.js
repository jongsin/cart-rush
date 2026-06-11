// 사운드 엔진 — 전부 WebAudio 실시간 합성 (외부 에셋 없음)
// 구성: SFX 버스 + BGM 버스 → 컴프레서 → 출력, 노이즈 임펄스 리버브 센드.
// BGM은 16분음표 그리드 스텝 시퀀서가 1.1초 선행 스케줄로 돌린다 (탭 스로틀 대비).

const N = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// ── BGM 악보: C–Am–F–G 진행, 8마디 멜로디 루프 ──
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const BASS = [36, 33, 41, 43]; // C2 A1 F2 G2
// [시작(8분음표 0~63), MIDI, 길이(8분음표)]
const MELODY = [
  [0, 76, 1], [1, 79, 1], [2, 81, 1], [3, 79, 1], [4, 76, 2], [6, 74, 2],
  [8, 72, 1], [9, 74, 1], [10, 76, 2], [12, 81, 2], [14, 79, 2],
  [16, 77, 1], [17, 76, 1], [18, 74, 1], [19, 76, 1], [20, 77, 2], [22, 81, 2],
  [24, 79, 1], [25, 81, 1], [26, 83, 1], [27, 81, 1], [28, 79, 2], [30, 74, 2],
  [32, 76, 1], [33, 79, 1], [34, 81, 1], [35, 79, 1], [36, 84, 2], [38, 83, 2],
  [40, 81, 2], [42, 79, 1], [43, 76, 1], [44, 74, 2], [46, 76, 2],
  [48, 77, 1], [49, 81, 1], [50, 84, 2], [52, 83, 1], [53, 81, 1], [54, 79, 2],
  [56, 79, 1], [57, 76, 1], [58, 74, 1], [59, 76, 1], [60, 72, 4]
];

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('cartrush-muted') === '1';
    this.music = { playing: false, timer: null, step: 0, nextAt: 0, spb: 0 };
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());

      // 마스터 체인: 버스 → 컴프레서 → 출력 (효과음+음악이 겹쳐도 안 깨지게)
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 5;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);

      // 가벼운 리버브 (노이즈 임펄스) — 공간감용 센드
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(1.4, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      this.verb.connect(wet);
      wet.connect(this.master);

      // 노이즈 버퍼 캐시 (드럼/충돌/슝 공용)
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  impulse(dur, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('cartrush-muted', m ? '1' : '0');
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 1, t, 0.02);
    }
  }

  toggleMuted() {
    this.ensure();
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ───────── 저수준 보이스 ─────────
  osc({ t, dur, freq, slideTo, type = 'sine', vol = 0.2, attack = 0.004, lp, detune = 0, verb = 0, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let head = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(bus);
    if (verb) {
      const vs = ctx.createGain();
      vs.gain.value = verb;
      g.connect(vs);
      vs.connect(this.verb);
    }
    o.start(t);
    o.stop(t + dur + 0.06);
  }

  noise({ t, dur, vol = 0.3, type = 'lowpass', from = 3000, to, q = 0.8, attack = 0.002, verb = 0, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    if (verb) {
      const vs = ctx.createGain();
      vs.gain.value = verb;
      g.connect(vs);
      vs.connect(this.verb);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.06);
  }

  ready() {
    this.ensure();
    return !!this.ctx;
  }

  // ───────── 효과음 ─────────
  ding() { // 상품 획득 — 코인 스타일 2음 벨 + 스파클
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.osc({ t, dur: 0.07, freq: N(83), type: 'square', vol: 0.15, lp: 6000 });
    this.osc({ t: t + 0.07, dur: 0.32, freq: N(88), type: 'square', vol: 0.15, lp: 6000, verb: 0.5 });
    this.osc({ t: t + 0.07, dur: 0.28, freq: N(100), type: 'sine', vol: 0.055, verb: 0.4 });
  }

  wrong() { // 리스트에 없는 상품 — 낮은 부저
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.osc({ t, dur: 0.17, freq: 196, slideTo: 128, type: 'sawtooth', vol: 0.17, lp: 1100 });
    this.osc({ t: t + 0.02, dur: 0.17, freq: 98, slideTo: 64, type: 'square', vol: 0.11, lp: 700 });
  }

  thud() { // 진열대에 쿵 — 둔탁한 충격
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.osc({ t, dur: 0.16, freq: 120, slideTo: 48, type: 'sine', vol: 0.38 });
    this.noise({ t, dur: 0.1, vol: 0.16, from: 900, to: 180 });
  }

  crash() { // NPC 충돌 — 노이즈 임팩트 + 서브 붐 + 잔해 클래터
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.noise({ t, dur: 0.3, vol: 0.42, from: 3400, to: 220, verb: 0.5 });
    this.osc({ t, dur: 0.34, freq: 150, slideTo: 38, type: 'sine', vol: 0.5 });
    for (let i = 0; i < 3; i++) {
      this.osc({ t: t + 0.05 + i * 0.045, dur: 0.05, freq: 1400 + Math.random() * 1200, type: 'square', vol: 0.05, verb: 0.6 });
    }
  }

  boost() { // 부스트 점화 — 슝 하는 노이즈 스윕
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.noise({ t, dur: 0.3, vol: 0.13, type: 'bandpass', from: 500, to: 3800, q: 1.2 });
  }

  beep() { // 카운트다운
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.osc({ t, dur: 0.12, freq: 740, type: 'square', vol: 0.13, lp: 3000 });
    this.osc({ t, dur: 0.12, freq: 1480, type: 'sine', vol: 0.05 });
  }

  go() { // 출발! — 메이저 코드 스탭 + 상승 스윕
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    for (const m of [72, 76, 79, 84]) {
      this.osc({ t, dur: 0.5, freq: N(m), type: 'sawtooth', vol: 0.08, lp: 2800, verb: 0.5 });
    }
    this.noise({ t, dur: 0.4, vol: 0.11, type: 'bandpass', from: 700, to: 5200, q: 1 });
  }

  listDone() { // 리스트 완성 — 상승 아르페지오 벨
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [72, 74, 76, 79, 84].forEach((m, i) => {
      this.osc({ t: t + i * 0.07, dur: 0.26, freq: N(m), type: 'triangle', vol: 0.15, verb: 0.5 });
      this.osc({ t: t + i * 0.07, dur: 0.2, freq: N(m + 12), type: 'sine', vol: 0.05, verb: 0.4 });
    });
  }

  finish() { // 골인 팡파레 — 4음 + 코드 홀드
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [[0, 72], [0.11, 76], [0.22, 79], [0.33, 84]].forEach(([dt, m]) => {
      this.osc({ t: t + dt, dur: 0.3, freq: N(m), type: 'square', vol: 0.12, lp: 4000, verb: 0.5 });
    });
    for (const m of [72, 76, 79, 84]) {
      this.osc({ t: t + 0.46, dur: 0.9, freq: N(m), type: 'sawtooth', vol: 0.065, lp: 3000, verb: 0.7 });
      this.osc({ t: t + 0.46, dur: 0.9, freq: N(m), type: 'square', vol: 0.04, detune: 8, verb: 0.5 });
    }
    this.noise({ t: t + 0.46, dur: 0.5, vol: 0.09, type: 'bandpass', from: 900, to: 6000 });
  }

  // ───────── BGM 시퀀서 ─────────
  startMusic(level = 1) {
    if (!this.ready()) return;
    this.stopMusic(true);
    const m = this.music;
    const bpm = Math.min(124 + (level - 1) * 3, 144); // 레벨 오르면 살짝 빨라진다
    m.spb = 60 / bpm / 4; // 16분음표 길이(초)
    m.step = 0;
    m.playing = true;
    m.nextAt = this.ctx.currentTime + 0.1;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.linearRampToValueAtTime(0.3, t + 1.2);
    m.timer = setInterval(() => this.scheduleMusic(), 220);
    this.scheduleMusic();
  }

  stopMusic(hard = false) {
    const m = this.music;
    if (m.timer) {
      clearInterval(m.timer);
      m.timer = null;
    }
    if (!m.playing) return;
    m.playing = false;
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      if (hard) this.musicBus.gain.setValueAtTime(0.0001, t);
      else {
        this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
        this.musicBus.gain.linearRampToValueAtTime(0.0001, t + 0.7);
      }
    }
  }

  scheduleMusic() {
    const m = this.music;
    if (!m.playing) return;
    const horizon = this.ctx.currentTime + 1.1;
    while (m.nextAt < horizon) {
      this.scheduleStep(m.step, m.nextAt);
      m.step++;
      m.nextAt += m.spb;
    }
  }

  scheduleStep(step, t) {
    const bus = this.musicBus;
    const s16 = step % 16; // 마디 내 위치
    const bar = Math.floor(step / 16) % 8;
    const d16 = this.music.spb;

    // 드럼: 킥(4분) / 스네어(2·4박) / 햇(8분 오프비트)
    if (s16 % 4 === 0) this.osc({ t, dur: 0.13, freq: 140, slideTo: 44, type: 'sine', vol: 0.42, bus });
    if (s16 === 4 || s16 === 12) {
      this.noise({ t, dur: 0.09, vol: 0.19, type: 'bandpass', from: 1900, q: 0.9, verb: 0.25, bus });
      this.osc({ t, dur: 0.07, freq: 190, type: 'triangle', vol: 0.09, bus });
    }
    if (s16 % 2 === 0) this.noise({ t, dur: 0.03, vol: s16 % 4 === 2 ? 0.09 : 0.045, type: 'highpass', from: 8000, bus });

    // 베이스: 8분음표 옥타브 바운스
    if (step % 2 === 0) {
      const root = BASS[bar % 4] + (step % 4 === 2 ? 12 : 0);
      this.osc({ t, dur: d16 * 2 * 0.85, freq: N(root), type: 'triangle', vol: 0.26, lp: 900, attack: 0.006, bus });
    }

    // 아르페지오: 16분 오프비트, 은은한 반짝임
    if (s16 % 2 === 1) {
      const ch = CHORDS[bar % 4];
      const note = ch[Math.floor(step / 2) % 3] + 24;
      this.osc({ t, dur: d16 * 0.9, freq: N(note), type: 'triangle', vol: 0.05, verb: 0.3, bus });
    }

    // 멜로디: 살짝 디튠한 더블 스퀘어 리드
    if (step % 2 === 0) {
      const e8 = (step / 2) % 64;
      for (const [st, midi, len] of MELODY) {
        if (st !== e8) continue;
        const dur = d16 * 2 * len * 0.92;
        this.osc({ t, dur, freq: N(midi), type: 'square', vol: 0.1, lp: 2700, attack: 0.008, verb: 0.4, bus });
        this.osc({ t, dur, freq: N(midi), type: 'square', vol: 0.05, lp: 2700, detune: 9, bus });
      }
    }
  }
}

export const sfx = new Sfx();
