// CART RUSH 서버 — 정적 파일 서빙 + WebSocket 방/게임 관리
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { generateMap } from './mapgen.js';
import { portalEnabled, verifyMember, submitScore, raceScore } from './portal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 4;
const COLORS = ['#ff5a5f', '#3a86ff', '#2ec27e', '#ffb703'];

// 서브패스 배포 옵션: BASE_PATH=/cart-rush 처럼 주면 그 경로에서도 서빙
// (리버스 프록시가 프리픽스를 제거해 주면 설정할 필요 없음)
const rawBase = (process.env.BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '');
const BASE_PATH = rawBase ? `/${rawBase}` : '';

const app = express();
// no-cache = 매번 ETag로 재검증(변경 없으면 304라 빠름) — 폰이 옛 CSS/JS를 캐시로 들고 버티는 것 방지
const pub = express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
});
app.use(pub);
if (BASE_PATH) app.use(BASE_PATH, pub);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // code -> room
let playerSeq = 1;

function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, type, data = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, t: Date.now(), ...data }));
}

function broadcast(room, type, data = {}, exceptId = null) {
  for (const p of room.players.values()) {
    if (p.id !== exceptId) send(p.ws, type, data);
  }
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    slot: p.slot,
    isHost: p.id === room.hostId,
    avatarUrl: p.portal ? p.portal.avatarUrl : null
  }));
}

function cleanName(raw) {
  const name = String(raw ?? '').trim().slice(0, 10);
  return name.length ? name : 'Player';
}

function joinRoom(room, player, name) {
  // 포털 로그인 회원이면 포털(게임별) 닉네임이 입력값보다 우선
  player.name = cleanName(player.portal?.nickname ?? name);
  player.color = COLORS.find((c) => ![...room.players.values()].some((p) => p.color === c)) || COLORS[0];
  player.slot = [0, 1, 2, 3].find((s) => ![...room.players.values()].some((p) => p.slot === s)) ?? 0;
  room.players.set(player.id, player);
  player.room = room;
  send(player.ws, 'roomJoined', {
    code: room.code,
    you: player.id,
    hostId: room.hostId,
    players: publicPlayers(room),
    level: room.level
  });
  broadcast(room, 'playerJoined', { players: publicPlayers(room), hostId: room.hostId }, player.id);
}

function startGame(room) {
  room.state = 'racing';
  room.map = generateMap(room.level);
  room.itemIndex = Object.fromEntries(room.map.items.map((i) => [i.id, i]));
  room.startAt = Date.now() + 3800; // 3-2-1 카운트다운 여유
  room.finishOrder = [];
  for (const p of room.players.values()) {
    p.progress = {};
    p.collected = new Set();
    p.listDone = false;
    p.finished = false;
    p.finishTime = null;
    p.itemsCount = 0;
    p.lastPos = { x: 0, y: 0, lap: 0 };
  }
  clearTimeout(room.endTimer);
  room.endTimer = setTimeout(
    () => endGame(room, 'timeout'),
    room.startAt - Date.now() + room.map.cfg.timeLimit * 1000 + 1500
  );
  broadcast(room, 'gameStart', {
    level: room.level,
    map: room.map,
    startAt: room.startAt,
    players: publicPlayers(room)
  });
  console.log(`[room ${room.code}] level ${room.level} start (${room.players.size}명)`);
}

function endGame(room, reason) {
  if (room.state !== 'racing') return;
  clearTimeout(room.endTimer);
  room.state = 'results';
  const players = [...room.players.values()];
  const dist = (p) => p.lastPos.lap * room.map.L + p.lastPos.y;
  const finishers = players.filter((p) => p.finished).sort((a, b) => a.finishTime - b.finishTime);
  const rest = players
    .filter((p) => !p.finished)
    .sort((a, b) => b.itemsCount - a.itemsCount || dist(b) - dist(a));
  const results = [...finishers, ...rest].map((p, i) => {
    // 완주자만 포털 점수 산출 (레벨 + 순위 + 시간 보너스), DNF 는 제출 안 함
    const score = p.finished ? raceScore(room.level, i + 1, p.finishTime, room.map.cfg.timeLimit) : null;
    if (score !== null && p.portal) submitScore(p.portal.memberId, score);
    return {
      place: i + 1,
      id: p.id,
      name: p.name,
      color: p.color,
      time: p.finishTime,
      items: p.itemsCount,
      total: room.map.itemTarget,
      dnf: !p.finished,
      score,
      portal: !!p.portal,
      avatarUrl: p.portal ? p.portal.avatarUrl : null
    };
  });
  broadcast(room, 'gameEnd', { results, level: room.level, reason });
  room.level++;
  console.log(`[room ${room.code}] game end (${reason}), next level ${room.level}`);
}

function removePlayer(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  player.room = null;
  if (room.players.size === 0) {
    clearTimeout(room.endTimer);
    rooms.delete(room.code);
    console.log(`[room ${room.code}] empty, removed`);
    return;
  }
  if (room.hostId === player.id) room.hostId = [...room.players.keys()][0];
  broadcast(room, 'playerLeft', { pid: player.id, players: publicPlayers(room), hostId: room.hostId });
  if (room.state === 'racing' && [...room.players.values()].every((p) => p.finished)) {
    endGame(room, 'all');
  }
}

wss.on('connection', (ws, req) => {
  const player = {
    id: playerSeq++,
    ws,
    name: '',
    color: COLORS[0],
    slot: 0,
    room: null,
    portal: null, // 포털 회원 프로필 { memberId, nickname, avatarUrl, ... } | null(게스트)
    progress: {},
    collected: new Set(),
    listDone: false,
    finished: false,
    finishTime: null,
    itemsCount: 0,
    lastPos: { x: 0, y: 0, lap: 0 }
  };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  // 같은 도메인 서브패스 서빙이라 업그레이드 요청에 포털 쿠키가 실려온다 → 회원 검증
  player.portalReady = verifyMember(req.headers.cookie).then((profile) => {
    player.portal = profile;
    if (profile) send(ws, 'portalProfile', { nickname: profile.nickname, avatarUrl: profile.avatarUrl });
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const room = player.room;

    switch (msg.type) {
      case 'create': {
        await player.portalReady; // 닉네임 결정 전에 포털 검증 완료 보장 (최대 3초)
        if (room) removePlayer(player);
        const newRoom = {
          code: makeCode(),
          hostId: player.id,
          players: new Map(),
          state: 'lobby',
          level: 1,
          map: null,
          itemIndex: null,
          startAt: 0,
          finishOrder: [],
          endTimer: null
        };
        rooms.set(newRoom.code, newRoom);
        joinRoom(newRoom, player, msg.name);
        break;
      }

      case 'join': {
        await player.portalReady;
        if (room) removePlayer(player);
        const target = rooms.get(String(msg.code ?? '').trim().toUpperCase());
        // 클라이언트가 code를 현재 언어로 번역해 보여준다
        if (!target) return send(ws, 'errorMsg', { code: 'ROOM_NOT_FOUND' });
        if (target.players.size >= MAX_PLAYERS) return send(ws, 'errorMsg', { code: 'ROOM_FULL' });
        if (target.state === 'racing') return send(ws, 'errorMsg', { code: 'IN_PROGRESS' });
        joinRoom(target, player, msg.name);
        break;
      }

      case 'start': {
        if (!room || room.hostId !== player.id) break;
        if (room.state === 'racing') break;
        startGame(room);
        break;
      }

      case 'pos': {
        if (!room || room.state !== 'racing') break;
        player.lastPos = { x: +msg.x || 0, y: +msg.y || 0, lap: msg.lap | 0 };
        broadcast(
          room,
          'p',
          { id: player.id, x: player.lastPos.x, y: player.lastPos.y, lap: player.lastPos.lap, s: msg.s | 0 },
          player.id
        );
        break;
      }

      case 'collect': {
        if (!room || room.state !== 'racing' || player.finished) break;
        const item = room.itemIndex[msg.id];
        if (!item || player.collected.has(item.id)) break;
        const entry = room.map.list.find((e) => e.type === item.type);
        if (!entry) break;
        const have = player.progress[item.type] || 0;
        if (have >= entry.need) break;
        player.collected.add(item.id);
        player.progress[item.type] = have + 1;
        player.itemsCount++;
        player.listDone = room.map.list.every((e) => (player.progress[e.type] || 0) >= e.need);
        broadcast(room, 'collected', {
          pid: player.id,
          itemId: item.id,
          itemType: item.type,
          have: have + 1,
          need: entry.need,
          count: player.itemsCount,
          total: room.map.itemTarget,
          listDone: player.listDone
        });
        break;
      }

      case 'finish': {
        if (!room || room.state !== 'racing' || player.finished || !player.listDone) break;
        player.finished = true;
        player.finishTime = Date.now() - room.startAt;
        room.finishOrder.push(player.id);
        broadcast(room, 'finished', {
          pid: player.id,
          time: player.finishTime,
          place: room.finishOrder.length
        });
        if ([...room.players.values()].every((p) => p.finished)) endGame(room, 'all');
        break;
      }

      case 'leave': {
        removePlayer(player);
        break;
      }
    }
  });

  ws.on('close', () => removePlayer(player));
});

// 끊긴 연결 정리용 ping
const pingTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(pingTimer));

server.listen(PORT, () => {
  console.log('\n🛒 CART RUSH — 마트 카트 레이스 서버 시작!');
  console.log(`   Local:   http://localhost:${PORT}${BASE_PATH}`);
  if (BASE_PATH) console.log(`   BASE_PATH: ${BASE_PATH} (서브패스 모드)`);
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`   Network: http://${i.address}:${PORT}  ← 친구는 이 주소로!`);
    }
  }
  console.log('');
});
