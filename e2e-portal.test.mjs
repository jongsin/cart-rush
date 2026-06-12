// cart-rush ↔ 포털 연동 e2e — 회원 쿠키로 접속해 방 생성→레이스 완주→점수 제출 확인
import WebSocket from 'ws';

const URL = process.env.WS_URL || 'ws://127.0.0.1:3300';
const COOKIE = process.env.MEMBER_COOKIE || ''; // "ygp_member=<jwt>" (없으면 게스트 시나리오)
const EXPECT_PORTAL = Boolean(COOKIE);

const ws = new WebSocket(URL, COOKIE ? { headers: { Cookie: COOKIE } } : {});
const send = (type, data = {}) => ws.send(JSON.stringify({ type, ...data }));
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
setTimeout(() => fail('15s timeout'), 15000);

let sawProfile = null;

ws.on('open', () => send('create', { name: '입력닉네임' }));
ws.on('error', (e) => fail(e.message));

ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  switch (m.type) {
    case 'portalProfile':
      sawProfile = m;
      console.log('[e2e] portalProfile:', m.nickname, m.avatarUrl);
      break;

    case 'roomJoined': {
      const me = m.players.find((p) => p.id === m.you);
      console.log('[e2e] roomJoined as:', JSON.stringify(me));
      if (EXPECT_PORTAL) {
        if (!sawProfile) fail('portalProfile 이 roomJoined 전에 안 옴');
        if (me.name !== '카트장인') fail(`포털 닉네임이 아님: ${me.name}`);
        if (!me.avatarUrl) fail('avatarUrl 누락');
      } else {
        if (sawProfile) fail('게스트인데 portalProfile 수신');
        if (me.name !== '입력닉네임') fail(`입력 닉네임이 아님: ${me.name}`);
        if (me.avatarUrl) fail('게스트인데 avatarUrl 존재');
      }
      send('start');
      break;
    }

    case 'gameStart': {
      // 쇼핑 리스트에 필요한 아이템만 골라 collect → finish
      const need = {};
      for (const e of m.map.list) need[e.type] = e.need;
      let sent = 0;
      for (const it of m.map.items) {
        if ((need[it.type] ?? 0) > 0) { need[it.type]--; send('collect', { id: it.id }); sent++; }
      }
      console.log(`[e2e] collect ${sent}개 전송`);
      setTimeout(() => send('finish'), 300);
      break;
    }

    case 'gameEnd': {
      const r = m.results.find((x) => x.place === 1);
      console.log('[e2e] gameEnd:', JSON.stringify(r));
      if (r.dnf) fail('완주 처리 안 됨');
      if (typeof r.score !== 'number' || r.score <= 0) fail('score 누락');
      if (EXPECT_PORTAL) {
        if (!r.portal) fail('portal 플래그 false');
        if (!r.avatarUrl) fail('결과에 avatarUrl 누락');
      } else if (r.portal) fail('게스트인데 portal 플래그 true');
      console.log(`[e2e] OK (${EXPECT_PORTAL ? '회원' : '게스트'} 시나리오)`);
      process.exit(0);
    }
  }
});
