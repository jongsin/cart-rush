// 테스트용 가짜 플레이어 — 방에 들어가서 천천히 달리며 위치를 전송한다.
// 사용법: node scripts/fake-player.js <방코드> [닉네임] [포트]
import WebSocket from 'ws';

const code = process.argv[2];
const name = process.argv[3] || '봇친구';
const port = process.argv[4] || 3000;
if (!code) {
  console.error('사용법: node scripts/fake-player.js <방코드> [닉네임] [포트]');
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:${port}`);
let map = null;
let startAt = 0;
let y = 90;
let lap = 0;
let x = 350;
let posTimer = null;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', code, name }));
  console.log(`[bot ${name}] 접속, 방 ${code} 참가 시도`);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type === 'errorMsg') console.log(`[bot] 에러: ${msg.code || msg.msg}`);
  if (msg.type === 'roomJoined') console.log(`[bot] 방 참가 성공 (id=${msg.you})`);
  if (msg.type === 'gameStart') {
    map = msg.map;
    startAt = msg.t ? startAt : 0;
    startAt = msg.startAt;
    y = 90;
    lap = 0;
    console.log(`[bot] 게임 시작! 레벨 ${msg.level}, 트랙 ${map.L}px`);
    clearInterval(posTimer);
    posTimer = setInterval(() => {
      const gt = (Date.now() - startAt) / 1000;
      if (gt < 0) return;
      y += 230 * 0.06; // 살짝 느리게 달린다
      if (y >= map.L) { y -= map.L; lap++; }
      x = 350 + Math.sin(gt * 0.8) * 220;
      ws.send(JSON.stringify({ type: 'pos', x: Math.round(x), y: Math.round(y), lap, s: 0 }));
    }, 60);
  }
  if (msg.type === 'gameEnd') {
    console.log(`[bot] 게임 종료:`, msg.results.map((r) => `${r.place}위 ${r.name}`).join(', '));
    clearInterval(posTimer);
  }
});

ws.on('close', () => {
  clearInterval(posTimer);
  console.log('[bot] 연결 종료');
});
