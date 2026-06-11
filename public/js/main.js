// 화면 전환(홈 → 로비 → 게임 → 결과) + 네트워크 이벤트 배선
import { Net } from './net.js';
import { Game } from './game.js';
import { sfx } from './sfx.js';
import { i18n, t } from './i18n.js';

const $ = (id) => document.getElementById(id);

// 언어 적용 + 토글
i18n.applyStatic();
for (const b of document.querySelectorAll('.lang-btn')) {
  b.addEventListener('click', () => i18n.set(b.dataset.lang));
}

const net = new Net();
const game = new Game($('canvas'), net);
window.__game = game; // 디버그용 핸들
window.__sfx = sfx;

// ───────── 사운드 토글 (HUD 버튼 + M 키) ─────────
const soundBtn = $('btn-sound');
const syncSoundBtn = () => { soundBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
soundBtn.addEventListener('click', () => { sfx.toggleMuted(); syncSoundBtn(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) { sfx.toggleMuted(); syncSoundBtn(); }
});
syncSoundBtn();

let myId = null;
let hostId = null;
let roomCode = null;
let playerList = [];
let nextLevel = 1;

// ───────── 화면 전환 ─────────
function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
  $(`screen-${name}`).classList.add('active');
}

// ───────── 홈 ─────────
const nameInput = $('input-name');
nameInput.value = localStorage.getItem('cartrush-name') || '';

function myName() {
  const n = nameInput.value.trim().slice(0, 10) || `${t('guest')}${Math.floor(Math.random() * 99) + 1}`;
  localStorage.setItem('cartrush-name', n);
  return n;
}

async function ensureConnected() {
  if (net.ws && net.ws.readyState === 1) return true;
  try {
    await net.connect();
    return true;
  } catch {
    alert(t('connectFail'));
    return false;
  }
}

$('btn-create').addEventListener('click', async () => {
  sfx.ensure();
  if (await ensureConnected()) net.send('create', { name: myName() });
});

$('btn-join').addEventListener('click', async () => {
  sfx.ensure();
  const code = $('input-code').value.trim().toUpperCase();
  if (code.length !== 4) return alert(t('needCode'));
  if (await ensureConnected()) net.send('join', { code, name: myName() });
});

$('input-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });

// ───────── 로비 ─────────
function renderLobby() {
  $('lobby-code').textContent = roomCode || '----';
  $('lobby-level').textContent = `LEVEL ${nextLevel}`;
  const grid = $('lobby-players');
  grid.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = playerList[i];
    const chip = document.createElement('div');
    if (p) {
      chip.className = 'player-chip';
      const dot = document.createElement('span');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      const nm = document.createElement('span');
      nm.className = 'pname';
      nm.textContent = p.name + (p.id === myId ? t('me') : '');
      chip.append(dot, nm);
      if (p.isHost) {
        const crown = document.createElement('span');
        crown.className = 'host-badge';
        crown.textContent = '👑';
        chip.append(crown);
      }
    } else {
      chip.className = 'player-chip empty';
      chip.textContent = t('emptySlot');
    }
    grid.appendChild(chip);
  }
  const isHost = myId === hostId;
  $('btn-start').classList.toggle('hidden', !isHost);
  $('lobby-wait').classList.toggle('hidden', isHost);
}

$('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    $('btn-copy').textContent = '✅';
    setTimeout(() => ($('btn-copy').textContent = '📋'), 1200);
  } catch { /* clipboard 권한 없으면 무시 */ }
});

$('btn-start').addEventListener('click', () => net.send('start'));
$('btn-leave').addEventListener('click', () => { net.send('leave'); location.reload(); });
$('btn-results-leave').addEventListener('click', () => { net.send('leave'); location.reload(); });
$('btn-next').addEventListener('click', () => net.send('start'));

// ───────── 네트워크 이벤트 ─────────
net.on('roomJoined', (m) => {
  myId = m.you;
  hostId = m.hostId;
  roomCode = m.code;
  playerList = m.players;
  nextLevel = m.level;
  renderLobby();
  showScreen('lobby');
});

net.on('playerJoined', (m) => {
  playerList = m.players;
  hostId = m.hostId;
  renderLobby();
});

net.on('playerLeft', (m) => {
  const gone = playerList.find((p) => p.id === m.pid);
  playerList = m.players;
  hostId = m.hostId;
  renderLobby();
  game.removePlayer(m.pid, gone && gone.name);
  // 결과 화면에서 호스트가 바뀌었을 수도 있으니 버튼 갱신
  updateResultsButtons();
});

net.on('errorMsg', (m) => alert(m.code ? t(m.code) : m.msg));

net.on('gameStart', (m) => {
  playerList = m.players;
  $('results-overlay').classList.add('hidden');
  showScreen('game');
  game.start({ map: m.map, startAt: m.startAt, players: m.players, level: m.level, myId });
});

net.on('p', (m) => game.onPos(m));
net.on('collected', (m) => game.onCollected(m));
net.on('finished', (m) => game.onFinished(m));

net.on('gameEnd', (m) => {
  nextLevel = m.level + 1;
  game.end();
  showResults(m);
});

net.on('_close', () => {
  if (document.querySelector('#screen-game.active')) {
    $('disconnect-overlay').classList.remove('hidden');
    game.stop();
  } else if (roomCode) {
    alert(t('lostConn'));
    location.reload();
  }
});

// ───────── 결과 화면 ─────────
function updateResultsButtons() {
  const isHost = myId === hostId;
  $('btn-next').classList.toggle('hidden', !isHost);
  $('results-wait').classList.toggle('hidden', isHost);
}

function showResults(m) {
  const mine = m.results.find((r) => r.id === myId);
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  $('results-title').textContent = t('resultsTitle', m.level);
  $('results-my-place').textContent = mine
    ? mine.dnf ? t('timeUp') : t('placeBig', medals[mine.place - 1] || '', mine.place)
    : '';

  const body = $('results-body');
  body.innerHTML = '';
  for (const r of m.results) {
    const tr = document.createElement('tr');
    if (r.id === myId) tr.className = 'me';
    const tdMedal = document.createElement('td');
    tdMedal.className = 'medal';
    tdMedal.textContent = r.dnf ? '💤' : medals[r.place - 1] || r.place;
    const tdName = document.createElement('td');
    tdName.className = 'rname';
    const dot = document.createElement('span');
    dot.className = 'sdot';
    dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;background:${r.color}`;
    tdName.append(dot, document.createTextNode(r.name));
    const tdTime = document.createElement('td');
    tdTime.className = 'rtime' + (r.dnf ? ' dnf' : '');
    tdTime.textContent = r.dnf ? t('dnf') : t('secs', (r.time / 1000).toFixed(2));
    const tdItems = document.createElement('td');
    tdItems.textContent = `🛍️ ${r.items}/${r.total}`;
    tr.append(tdMedal, tdName, tdTime, tdItems);
    body.appendChild(tr);
  }

  $('btn-next').textContent = t('nextLevel', nextLevel);
  updateResultsButtons();
  $('results-overlay').classList.remove('hidden');
}
