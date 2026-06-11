// CART RUSH 게임 엔진 — 물리, 충돌, 렌더링, HUD
import { sfx } from './sfx.js';
import { i18n, t } from './i18n.js';

const BASE_SPEED = 300;   // 기본 전진 속도 px/s
const LAT_SPEED = 290;    // 좌우 이동 속도 px/s
const CART_HW = 17;       // 카트 절반 너비
const CART_HH = 26;       // 카트 절반 높이
const WALL_DECO = ['🥫', '🧃', '🍪', '🧂', '🥤', '🍫', '🥣', '🧺'];
const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif";
const FONT_DISPLAY = "'Black Han Sans', 'Jua', sans-serif";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────── 키보드 입력 ─────────
const keys = new Set();
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sfx.ensure();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ───────── 터치 입력 (모바일) — 화면 버튼이 keys Set에 키코드를 넣는다 ─────────
if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch');
}
for (const btn of document.querySelectorAll('.tbtn')) {
  const code = btn.dataset.key;
  const press = (e) => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트는 캡처 불가 */ }
    keys.add(code);
    btn.classList.add('held');
    sfx.ensure();
  };
  const release = () => { keys.delete(code); btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

export class Game {
  constructor(canvas, net) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.net = net;
    this.running = false;
    this.map = null;
    this.remote = new Map();
    this.collected = new Set();
    this.emojiByType = {};
    this.ended = true;

    this.el = {
      level: document.getElementById('hud-level'),
      timer: document.getElementById('hud-timer'),
      lap: document.getElementById('hud-lap'),
      list: document.getElementById('list-items'),
      listDone: document.getElementById('list-done-msg'),
      standings: document.getElementById('standings-items'),
      boostFill: document.getElementById('boost-fill'),
      toastArea: document.getElementById('toast-area'),
      countdown: document.getElementById('countdown')
    };

    window.addEventListener('resize', () => this.resize());
  }

  // ───────── 시작/정지 ─────────
  start({ map, startAt, players, level, myId }) {
    this.map = map;
    this.startAt = startAt;
    this.level = level;
    this.myId = myId;
    this.ended = false;
    this.gameTime = -99;
    this.lastCount = null;

    const meInfo = players.find((p) => p.id === myId);
    const slotX = (slot) => map.W / 2 + (slot - (players.length - 1) / 2) * 80;
    const orderedSlots = [...players].sort((a, b) => a.slot - b.slot);
    const startX = (p) => slotX(orderedSlots.indexOf(p));

    this.me = {
      id: myId, name: meInfo.name, color: meInfo.color,
      x: clamp(startX(meInfo), 60, map.W - 60), y: 90, lap: 0, vx: 0,
      stunT: 0, iframeT: 0, slowT: 0, thudCool: 0,
      boost: 100, boosting: false,
      finished: false, place: 0, time: null,
      items: 0, basket: []
    };
    this.remote = new Map(
      players.filter((p) => p.id !== myId).map((p) => [p.id, {
        id: p.id, name: p.name, color: p.color,
        x: clamp(startX(p), 60, map.W - 60), y: 90, lap: 0,
        tx: clamp(startX(p), 60, map.W - 60), ty: 90, tlap: 0, s: 0,
        finished: false, place: 0, time: null, items: 0, basket: []
      }])
    );

    this.camY = 90;
    this.progress = {};
    this.collected = new Set();
    this.listDone = false;
    this.listByType = Object.fromEntries(map.list.map((e) => [e.type, e]));
    this.emojiByType = Object.fromEntries(map.list.map((e) => [e.type, e.emoji]));
    this.itemFx = new Map(); // id -> {bounceT}
    this.floaters = [];
    this.particles = [];
    this.confetti = [];
    this.flashT = 0;
    this.shakeT = 0;
    this.boostCool = 0;

    this.updateListUI();
    this.el.listDone.classList.add('hidden');
    this.el.level.textContent = `LV ${level}`;
    this.el.toastArea.innerHTML = '';
    this.standingsAt = 0;

    this.resize();
    if (!this.running) {
      this.running = true;
      this.lastTs = performance.now();
      requestAnimationFrame((ts) => this.loop(ts));
    }
    clearInterval(this.posTimer);
    this.posTimer = setInterval(() => this.sendPos(), 60);
    sfx.startMusic(level);
  }

  stop() {
    this.running = false;
    clearInterval(this.posTimer);
    sfx.stopMusic();
  }

  end() {
    this.ended = true;
    clearInterval(this.posTimer);
    sfx.stopMusic();
  }

  // ───────── 네트워크 수신 ─────────
  onPos(m) {
    const r = this.remote.get(m.id);
    if (!r) return;
    r.tx = m.x; r.ty = m.y; r.tlap = m.lap; r.s = m.s || 0;
  }

  onCollected(m) {
    const emoji = this.emojiByType[m.itemType] || '🛍️';
    if (m.pid === this.myId) {
      // 서버 확정 (이미 낙관적으로 반영됨)
      if (!this.collected.has(m.itemId)) {
        this.collected.add(m.itemId);
        this.progress[m.itemType] = m.have;
        this.recomputeList();
      }
    } else {
      const r = this.remote.get(m.pid);
      if (r) {
        r.items = m.count;
        if (r.basket.length < 4) r.basket.push(emoji);
        if (m.listDone) this.toast(t('doneShopping', r.name), '', 1600);
      }
    }
  }

  onFinished(m) {
    const who = m.pid === this.myId ? this.me : this.remote.get(m.pid);
    if (!who) return;
    who.finished = true;
    who.place = m.place;
    who.time = m.time;
    const medal = ['🥇', '🥈', '🥉', '4️⃣'][m.place - 1] || '🏁';
    this.toast(t('arrived', medal, who.name, m.place), m.pid === this.myId ? 'good' : '', 2200);
  }

  removePlayer(pid, name) {
    if (this.remote.delete(pid) && name) this.toast(t('playerLeft', name), '', 1500);
  }

  // ───────── 좌표 도우미 (루프 트랙) ─────────
  relTo(y, ref) {
    const L = this.map.L;
    return ((y - ref + L * 1.5) % L) - L / 2;
  }
  relY(y) { return this.relTo(y, this.camY); }

  totalDist(p) { return p.lap * this.map.L + p.y; }

  // ───────── 위치 전송 ─────────
  sendPos() {
    if (this.ended || !this.map) return;
    const s = (this.me.boosting ? 1 : 0) | (this.me.stunT > 0 ? 2 : 0);
    this.net.send('pos', {
      x: Math.round(this.me.x), y: Math.round(this.me.y), lap: this.me.lap, s
    });
  }

  // ───────── 메인 루프 ─────────
  loop(ts) {
    if (!this.running) return;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.gameTime = (this.net.now() - this.startAt) / 1000;
    this.update(dt);
    this.render();
    this.updateHud();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ───────── 게임 로직 ─────────
  update(dt) {
    const gt = this.gameTime;
    const me = this.me;
    const map = this.map;

    // 타이머 감소
    me.stunT = Math.max(0, me.stunT - dt);
    me.iframeT = Math.max(0, me.iframeT - dt);
    me.slowT = Math.max(0, me.slowT - dt);
    me.thudCool = Math.max(0, me.thudCool - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.boostCool = Math.max(0, (this.boostCool || 0) - dt);

    if (gt >= 0 && !me.finished && !this.ended) {
      // 입력
      const left = keys.has('ArrowLeft') || keys.has('KeyA');
      const right = keys.has('ArrowRight') || keys.has('KeyD');
      const brake = keys.has('ArrowDown') || keys.has('KeyS');
      const wantBoost = keys.has('ArrowUp') || keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight');

      // 부스트 게이지
      if (wantBoost && me.boost > 1 && me.stunT <= 0) {
        // 점화 순간에만 슝 — 게이지 경계 진동으로 연사되지 않게 쿨다운
        if (!me.boosting && this.boostCool <= 0) {
          sfx.boost();
          this.boostCool = 0.6;
        }
        me.boosting = true;
        me.boost = Math.max(0, me.boost - 55 * dt);
      } else {
        me.boosting = false;
        me.boost = Math.min(100, me.boost + 16 * dt);
      }

      // 전진
      let mult = 1;
      if (me.boosting) mult *= 1.45;
      if (brake) mult *= 0.45;
      if (me.stunT > 0) mult *= 0.22;
      else if (me.slowT > 0) mult *= 0.6;
      me.y += BASE_SPEED * mult * dt;

      // 좌우
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      me.vx += (dir * LAT_SPEED - me.vx) * Math.min(1, dt * 10);
      me.x = clamp(me.x + me.vx * dt, CART_HW + 8, map.W - CART_HW - 8);

      this.resolveShelves(dt);

      // 랩 / 골인
      if (this.listDone && me.y >= map.finishY && me.y < map.L) {
        me.finished = true;
        this.net.send('finish');
        sfx.finish();
        this.spawnConfetti();
        this.sendPos();
      } else if (me.y >= map.L) {
        me.y -= map.L;
        me.lap++;
        this.toast(t('moreLap'), 'bad', 1800);
      }

      // NPC 충돌
      if (me.iframeT <= 0) {
        for (const n of map.npcs) {
          const dy = this.relTo(n.y, me.y);
          if (Math.abs(dy) > 60) continue;
          const nx = clamp(n.x0 + n.amp * Math.sin(n.omega * Math.max(0, gt) + n.phase), 36, map.W - 36);
          const dx = nx - me.x;
          if (dx * dx + dy * dy < 38 * 38) {
            me.stunT = 0.9;
            me.iframeT = 1.6;
            me.boosting = false;
            this.flashT = 0.25;
            this.shakeT = 0.35;
            sfx.crash();
            this.floater(me.x, me.y + 50, t('bonk'), '#ff6b6b');
            break;
          }
        }
      }

      // 상품 줍기 (히트박스는 이모지 크기와 비슷하게)
      for (const it of map.items) {
        if (this.collected.has(it.id)) continue;
        const dy = this.relTo(it.y, me.y);
        if (Math.abs(dy) > 46) continue;
        const dx = Math.abs(it.x - me.x);
        if (dx > 40) continue;

        const entry = this.listByType[it.type];
        const needMore = entry && (this.progress[it.type] || 0) < entry.need;
        if (needMore) {
          this.collected.add(it.id);
          this.progress[it.type] = (this.progress[it.type] || 0) + 1;
          me.items++;
          if (me.basket.length < 4) me.basket.push(it.emoji);
          this.net.send('collect', { id: it.id });
          sfx.ding();
          this.spawnParticles(it.x, it.y);
          this.floater(it.x, it.y, `${it.emoji} +1`, '#2ec27e');
          this.recomputeList();
        } else {
          const fx = this.itemFx.get(it.id) || { bounceT: 0 };
          if (fx.bounceT <= 0) {
            fx.bounceT = 1.4;
            this.itemFx.set(it.id, fx);
            me.slowT = 0.5;
            sfx.wrong();
            this.floater(it.x, it.y, entry ? t('gotEnough') : t('notOnList'), '#ff6b6b');
          }
        }
      }
    }

    // 아이템 이펙트 타이머
    for (const [id, fx] of this.itemFx) {
      fx.bounceT -= dt;
      if (fx.bounceT <= 0) this.itemFx.delete(id);
    }

    // 원격 카트 보간
    for (const r of this.remote.values()) {
      const k = Math.min(1, dt * 10);
      r.x += (r.tx - r.x) * k;
      const dy = this.relTo(r.ty, r.y);
      r.y = ((r.y + dy * k) % map.L + map.L) % map.L;
      r.lap = r.tlap;
    }

    // 카메라: 내가 끝났으면 선두 추적, 아니면 내 카트
    let camTarget = me.y;
    if ((me.finished || this.ended) && this.remote.size) {
      let leader = null;
      for (const r of this.remote.values()) {
        if (!r.finished && (!leader || this.totalDist(r) > this.totalDist(leader))) leader = r;
      }
      if (leader) camTarget = leader.y;
    }
    const cdy = this.relTo(camTarget, this.camY);
    this.camY = ((this.camY + cdy * Math.min(1, dt * 8)) % map.L + map.L) % map.L;

    // 파티클/플로터
    this.floaters = this.floaters.filter((f) => (f.t += dt) < f.life);
    this.particles = this.particles.filter((p) => {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 300 * dt;
      return p.t < p.life;
    });
    this.confetti = this.confetti.filter((c) => {
      c.t += dt; c.sy += c.vy * dt; c.sx += Math.sin(c.t * 5 + c.spin) * 40 * dt;
      return c.t < c.life;
    });
  }

  resolveShelves(dt) {
    const me = this.me;
    for (const s of this.map.shelves) {
      const dyC = this.relTo(s.y + s.h / 2, me.y);
      if (Math.abs(dyC) > s.h / 2 + 80) continue;
      // 선반 좌표를 내 기준 상대좌표로 변환해 AABB 충돌
      const sTop = dyC + s.h / 2;     // 선반 위쪽(전방) 모서리의 상대 y
      const sBot = dyC - s.h / 2;
      const ox = Math.min(me.x + CART_HW, s.x + s.w) - Math.max(me.x - CART_HW, s.x);
      const oy = Math.min(CART_HH, sTop) - Math.max(-CART_HH, sBot);
      if (ox <= 0 || oy <= 0) continue;

      if (ox < oy) {
        me.x += me.x < s.x + s.w / 2 ? -ox : ox;
        me.vx = 0;
      } else {
        if (-CART_HH < sBot) {
          // 정면으로 박음 → 뒤로 밀고 옆으로 슬라이드 보조
          me.y -= oy;
          const center = s.x + s.w / 2;
          me.x = clamp(me.x + Math.sign(me.x - center || 1) * 90 * dt, CART_HW + 8, this.map.W - CART_HW - 8);
          if (me.thudCool <= 0) {
            me.thudCool = 0.7;
            sfx.thud();
          }
        } else {
          me.y += oy;
        }
      }
      me.x = clamp(me.x, CART_HW + 8, this.map.W - CART_HW - 8);
    }
  }

  recomputeList() {
    this.listDone = this.map.list.every((e) => (this.progress[e.type] || 0) >= e.need);
    this.updateListUI();
    if (this.listDone) {
      sfx.listDone();
      this.toast(t('listComplete'), 'good', 2200);
      this.el.listDone.classList.remove('hidden');
    }
  }

  // ───────── 이펙트 ─────────
  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, t: 0, life: 1.1 });
  }

  spawnParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 120;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 100,
        t: 0, life: 0.5 + Math.random() * 0.3,
        color: ['#ffd700', '#ffb703', '#ff7a3c'][i % 3]
      });
    }
  }

  spawnConfetti() {
    const w = this.canvas.clientWidth;
    for (let i = 0; i < 44; i++) {
      this.confetti.push({
        sx: Math.random() * w, sy: -30 - Math.random() * 200,
        vy: 180 + Math.random() * 200, spin: Math.random() * 6,
        emoji: ['🎉', '🎊', '⭐', '✨'][i % 4],
        t: 0, life: 2.6
      });
    }
  }

  toast(text, cls = '', dur = 1800) {
    for (const t of this.el.toastArea.children) {
      if (t.textContent === text) return;
    }
    const div = document.createElement('div');
    div.className = `toast ${cls}`;
    div.textContent = text;
    this.el.toastArea.appendChild(div);
    setTimeout(() => div.remove(), dur);
  }

  // ───────── HUD ─────────
  updateListUI() {
    this.el.list.innerHTML = '';
    for (const e of this.map.list) {
      const have = this.progress[e.type] || 0;
      const li = document.createElement('li');
      if (have >= e.need) li.className = 'done';
      const em = document.createElement('span'); em.textContent = e.emoji;
      const nm = document.createElement('span'); nm.textContent = i18n.itemName(e);
      const ct = document.createElement('b'); ct.textContent = `${have}/${e.need}`;
      li.append(em, nm, ct);
      this.el.list.appendChild(li);
    }
  }

  updateHud() {
    const gt = this.gameTime;

    // 카운트다운
    if (gt < 0) {
      const n = Math.min(3, Math.ceil(-gt));
      this.el.countdown.classList.remove('hidden');
      this.el.countdown.textContent = n;
      if (this.lastCount !== n) { this.lastCount = n; if (n <= 3) sfx.beep(); }
    } else if (gt < 0.9) {
      this.el.countdown.classList.remove('hidden');
      this.el.countdown.textContent = 'GO!';
      if (this.lastCount !== 'go') { this.lastCount = 'go'; sfx.go(); }
    } else {
      this.el.countdown.classList.add('hidden');
    }

    // 타이머
    const remain = Math.max(0, this.map.cfg.timeLimit - Math.max(0, gt));
    const mm = Math.floor(remain / 60);
    const ss = String(Math.floor(remain % 60)).padStart(2, '0');
    this.el.timer.textContent = `${mm}:${ss}`;
    this.el.timer.classList.toggle('danger', remain < 20 && !this.ended);

    this.el.lap.textContent = t('lap', this.me.lap + 1);
    this.el.boostFill.style.width = `${this.me.boost}%`;

    if (this.listDone) {
      if (this.me.finished) {
        this.el.listDone.textContent = t('finishedHud');
      } else {
        const d = (this.map.finishY - this.me.y + this.map.L) % this.map.L;
        this.el.listDone.textContent = t('checkoutIn', Math.max(1, Math.ceil(d / 10)));
      }
    }

    // 순위표 (250ms 마다)
    const now = performance.now();
    if (now - this.standingsAt > 250) {
      this.standingsAt = now;
      const all = [this.me, ...this.remote.values()];
      all.sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.items - a.items || this.totalDist(b) - this.totalDist(a);
      });
      this.el.standings.innerHTML = '';
      for (const p of all) {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'sdot';
        dot.style.background = p.color;
        const nm = document.createElement('span');
        nm.className = 'sname';
        nm.textContent = p.name + (p.id === this.myId ? t('me') : '');
        const info = document.createElement('span');
        info.className = 'sinfo';
        info.textContent = p.finished
          ? `${['🥇', '🥈', '🥉', '4️⃣'][p.place - 1] || '🏁'} ${(p.time / 1000).toFixed(1)}s`
          : t('itemsOf', p.items, this.map.itemTarget);
        li.append(dot, nm, info);
        this.el.standings.appendChild(li);
      }
    }
  }

  // ───────── 렌더링 ─────────
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
  }

  render() {
    const { ctx, canvas, map } = this;
    if (!map) return;
    const gt = Math.max(0, this.gameTime);

    const scale = Math.min(canvas.height / 1000, canvas.width / (map.W + 80));
    const viewW = canvas.width / scale;
    const viewH = canvas.height / scale;
    const offX = (viewW - map.W) / 2;
    const cartSy = viewH * 0.7;
    const sy = (worldRel) => cartSy - worldRel; // relY → 화면 y

    let shakeX = 0, shakeY = 0;
    if (this.shakeT > 0) {
      const a = this.shakeT * 22;
      shakeX = (Math.random() - 0.5) * a;
      shakeY = (Math.random() - 0.5) * a;
    }
    ctx.setTransform(scale, 0, 0, scale, shakeX * scale, shakeY * scale);

    // 바닥
    ctx.fillStyle = '#352d27';
    ctx.fillRect(-10, -10, viewW + 20, viewH + 20);
    ctx.fillStyle = '#f1ead9';
    ctx.fillRect(offX, -10, map.W, viewH + 20);

    // 바닥 타일 라인
    ctx.strokeStyle = 'rgba(58,46,38,0.06)';
    ctx.lineWidth = 2;
    const gridTop = this.camY + cartSy;
    for (let gy = Math.floor((gridTop - viewH) / 250) * 250; gy <= gridTop + 250; gy += 250) {
      const y = cartSy - (gy - this.camY);
      ctx.beginPath(); ctx.moveTo(offX, y); ctx.lineTo(offX + map.W, y); ctx.stroke();
    }
    for (let gx = 100; gx < map.W; gx += 100) {
      ctx.beginPath(); ctx.moveTo(offX + gx, -10); ctx.lineTo(offX + gx, viewH + 10); ctx.stroke();
    }

    // 양쪽 벽 진열대
    const wallW = Math.min(44, offX - 2);
    ctx.fillStyle = '#c8a87c';
    ctx.fillRect(offX - wallW, -10, wallW, viewH + 20);
    ctx.fillRect(offX + map.W, -10, wallW, viewH + 20);
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let gy = Math.floor((gridTop - viewH) / 170) * 170; gy <= gridTop + 170; gy += 170) {
      const y = cartSy - (gy - this.camY);
      const deco = WALL_DECO[((Math.floor(gy / 170) % WALL_DECO.length) + WALL_DECO.length) % WALL_DECO.length];
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(offX - wallW, y - 3, wallW, 5);
      ctx.fillRect(offX + map.W, y - 3, wallW, 5);
      ctx.fillStyle = '#000';
      ctx.fillText(deco, offX - wallW / 2, y - 80);
      ctx.fillText(deco, offX + map.W + wallW / 2, y - 80);
    }

    const drawVisible = (y, margin, fn) => {
      const d = this.relY(y);
      if (Math.abs(d) < viewH * 0.75 + margin) fn(d);
    };

    // 스타트 라인
    drawVisible(60, 60, (d) => {
      const y = sy(d);
      ctx.strokeStyle = 'rgba(58,46,38,0.5)';
      ctx.setLineDash([18, 12]);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(offX, y); ctx.lineTo(offX + map.W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(58,46,38,0.4)';
      ctx.font = `30px ${FONT_DISPLAY}`;
      ctx.fillText('S T A R T', offX + map.W / 2, y + 28);
    });

    // 계산대 구역
    drawVisible((map.checkoutY + map.L) / 2, (map.L - map.checkoutY) / 2 + 60, () => {
      const dTop = this.relY(map.checkoutY);
      const bandTop = sy(dTop + (map.L - map.checkoutY)); // 트랙 끝(L) 쪽
      const bandBot = sy(dTop);
      ctx.fillStyle = '#e3d6bd';
      ctx.fillRect(offX, bandTop, map.W, bandBot - bandTop);

      // 결승 체커 라인
      const dFin = dTop + (map.finishY - map.checkoutY);
      const finY = sy(dFin);
      const sq = 25;
      for (let i = 0; i < Math.ceil(map.W / sq); i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#2b2420' : '#f6f1e7';
          ctx.fillRect(offX + i * sq, finY - sq + j * sq, Math.min(sq, map.W - i * sq), sq);
        }
      }

      // 계산대 데스크
      const deskY = finY - 95;
      for (let i = 0; i < 4; i++) {
        const dx = offX + 50 + i * ((map.W - 100) / 3) - 45;
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath(); ctx.roundRect(dx, deskY, 90, 44, 8); ctx.fill();
        ctx.fillStyle = '#a1887f';
        ctx.beginPath(); ctx.roundRect(dx + 6, deskY + 6, 78, 14, 5); ctx.fill();
        ctx.font = '22px sans-serif';
        ctx.fillText('💰', dx + 45, deskY + 30);
      }
      ctx.fillStyle = '#5d4037';
      ctx.font = `32px ${FONT_DISPLAY}`;
      ctx.fillText('🧾 CHECK OUT', offX + map.W / 2, bandBot - 40);
    });

    // 진열대
    for (const s of map.shelves) {
      drawVisible(s.y + s.h / 2, s.h / 2, () => {
        const d = this.relY(s.y);
        const top = sy(d + s.h);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath(); ctx.roundRect(offX + s.x + 5, top + 7, s.w, s.h, 10); ctx.fill();
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.roundRect(offX + s.x, top, s.w, s.h, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(58,46,38,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(offX + s.x, top, s.w, s.h, 10); ctx.stroke();
        ctx.strokeStyle = 'rgba(58,46,38,0.12)';
        ctx.lineWidth = 2;
        for (let yy = top + 36; yy < top + s.h - 10; yy += 36) {
          ctx.beginPath(); ctx.moveTo(offX + s.x + 8, yy); ctx.lineTo(offX + s.x + s.w - 8, yy); ctx.stroke();
        }
        ctx.font = '17px sans-serif';
        ctx.globalAlpha = 0.85;
        for (let yy = top + 20; yy < top + s.h - 12; yy += 36) {
          ctx.fillText(s.deco, offX + s.x + s.w * 0.3, yy);
          ctx.fillText(s.deco, offX + s.x + s.w * 0.7, yy);
        }
        ctx.globalAlpha = 1;
      });
    }

    // 상품
    for (const it of map.items) {
      if (this.collected.has(it.id)) continue;
      drawVisible(it.y, 50, (d) => {
        const y = sy(d);
        const x = offX + it.x;
        const entry = this.listByType[it.type];
        const needed = entry && (this.progress[it.type] || 0) < entry.need;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.ellipse(x, y + 17, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
        if (needed) {
          const pulse = 1 + Math.sin(gt * 6 + it.id) * 0.12;
          ctx.strokeStyle = 'rgba(255,183,3,0.75)';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = 'rgba(255,215,0,0.12)';
          ctx.beginPath(); ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2); ctx.fill();
        }
        const fx = this.itemFx.get(it.id);
        const jitter = fx && fx.bounceT > 1.1 ? (Math.random() - 0.5) * 6 : 0;
        ctx.fillStyle = '#000'; // fillStyle 알파가 컬러 이모지에 적용되는 것 방지
        ctx.font = `${needed ? 40 : 33}px sans-serif`;
        ctx.fillText(it.emoji, x + jitter, y);
      });
    }

    // NPC 쇼핑객
    for (const n of map.npcs) {
      drawVisible(n.y, 40, (d) => {
        const y = sy(d);
        const nx = offX + clamp(n.x0 + n.amp * Math.sin(n.omega * gt + n.phase), 36, map.W - 36);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(nx, y + 16, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(nx, y);
        ctx.rotate(Math.sin(gt * 3 + n.phase) * 0.09);
        ctx.fillStyle = '#000';
        ctx.font = '31px sans-serif';
        ctx.fillText(n.emoji, 0, 0);
        ctx.restore();
        const dy = this.relTo(n.y, this.me.y);
        const dxm = nx - offX - this.me.x;
        if (!this.me.finished && dy > 20 && dy < 130 && Math.abs(dxm) < 60) {
          ctx.fillStyle = '#000';
          ctx.font = '15px sans-serif';
          ctx.fillText('💢', nx + 16, y - 20);
        }
      });
    }

    // 원격 카트
    for (const r of this.remote.values()) {
      drawVisible(r.y, 80, (d) => {
        this.drawCart(offX + r.x, sy(d), r, false, gt);
      });
    }
    // 내 카트
    this.drawCart(offX + this.me.x, sy(this.relY(this.me.y)), this.me, true, gt);

    // 파티클
    for (const p of this.particles) {
      drawVisible(p.y, 60, (d) => {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(offX + p.x, sy(d), 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    // 플로터 텍스트
    ctx.font = `19px ${FONT}`;
    for (const f of this.floaters) {
      drawVisible(f.y, 80, (d) => {
        ctx.globalAlpha = 1 - f.t / f.life;
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, offX + f.x, sy(d) - 30 - f.t * 45);
        ctx.globalAlpha = 1;
      });
    }

    // 충돌 빨간 플래시
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,60,60,${this.flashT * 0.5})`;
      ctx.fillRect(-10, -10, viewW + 20, viewH + 20);
    }

    // 컨페티 (화면 좌표)
    if (this.confetti.length) {
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.font = '26px sans-serif';
      for (const c of this.confetti) {
        ctx.globalAlpha = Math.min(1, (c.life - c.t) / 0.5);
        ctx.fillText(c.emoji, c.sx, c.sy);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawCart(x, y, p, isMe, gt) {
    const { ctx } = this;
    ctx.save();
    if (!isMe) ctx.globalAlpha = 0.82;
    ctx.translate(x, y);

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 30, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

    const vx = isMe ? this.me.vx : (p.tx - p.x) * 4;
    ctx.rotate(clamp(vx / LAT_SPEED, -1, 1) * 0.14);

    const stunned = isMe ? this.me.stunT > 0 : (p.s & 2) !== 0;
    const boosting = isMe ? this.me.boosting : (p.s & 1) !== 0;

    // 부스트 불꽃 (카트 뒤 = 화면 아래)
    if (boosting && !p.finished) {
      ctx.fillStyle = '#000';
      ctx.font = '17px sans-serif';
      ctx.globalAlpha *= 0.9;
      ctx.fillText('🔥', -8, 38 + Math.random() * 4);
      ctx.fillText('🔥', 8, 40 + Math.random() * 4);
      ctx.globalAlpha = isMe ? 1 : 0.82;
    }

    if (stunned) ctx.globalAlpha *= 0.55 + Math.sin(gt * 25) * 0.2;

    // 바퀴
    ctx.fillStyle = '#332b25';
    for (const [wx, wy] of [[-13, -18], [13, -18], [-13, 16], [13, 16]]) {
      ctx.beginPath(); ctx.arc(wx, wy, 4.5, 0, Math.PI * 2); ctx.fill();
    }

    // 카트 바구니
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.roundRect(-CART_HW, -CART_HH, CART_HW * 2, 46, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-CART_HW, -CART_HH, CART_HW * 2, 46, 8); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.roundRect(-12, -21, 24, 36, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1.5;
    for (let gy2 = -12; gy2 <= 6; gy2 += 9) {
      ctx.beginPath(); ctx.moveTo(-12, gy2); ctx.lineTo(12, gy2); ctx.stroke();
    }

    // 손잡이 (뒤쪽)
    ctx.fillStyle = '#4a3f37';
    ctx.beginPath(); ctx.roundRect(-19, 22, 38, 6, 3); ctx.fill();

    // 담은 상품
    ctx.font = '13px sans-serif';
    const basket = p.basket || [];
    basket.slice(0, 4).forEach((em, i) => {
      ctx.fillText(em, -7 + (i % 2) * 14, -12 + Math.floor(i / 2) * 15);
    });

    // 스턴 별
    if (stunned) {
      ctx.globalAlpha = 1;
      ctx.font = '16px sans-serif';
      const a = gt * 7;
      ctx.fillText('⭐', Math.cos(a) * 16, -34 + Math.sin(a) * 5);
      ctx.fillText('⭐', Math.cos(a + Math.PI) * 16, -34 + Math.sin(a + Math.PI) * 5);
    }

    // 골인 깃발
    if (p.finished) {
      ctx.font = '20px sans-serif';
      ctx.fillText('🏁', 0, -38);
    }

    ctx.restore();

    // 이름표
    if (!isMe) {
      ctx.save();
      ctx.font = `13px ${FONT}`;
      const tw = ctx.measureText(p.name).width;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.roundRect(x - tw / 2 - 8, y + 38, tw + 16, 20, 10); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillText(p.name, x, y + 48);
      ctx.restore();
    }
  }
}
