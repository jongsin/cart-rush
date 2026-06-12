// 한국어/영어 다국어 지원
const ord = (p) => ['1st', '2nd', '3rd', '4th'][p - 1] || `${p}th`;

const DICT = {
  ko: {
    title: 'CART RUSH! 🛒 마트 카트 레이스',
    tagline: '마트 카트 레이스 · 최대 4인 멀티플레이',
    nicknameLabel: '닉네임',
    nicknamePh: '닉네임 (10자 이내)',
    createBtn: '🏁 새 방 만들기',
    or: '또는',
    codePh: '방 코드',
    joinBtn: '참가',
    howtoTitle: '🎮 게임 방법',
    howto1: '🛒 카트는 자동으로 앞으로! <b>← →</b> 로 좌우 이동',
    howto2: '🧾 쇼핑 리스트의 상품만 골라 담기 (다른 건 담으면 느려져요!)',
    howto3: '🚶 쇼핑객과 부딪히면 잠시 스턴!',
    howto4: '⚡ <b>Shift / ↑</b> 부스트, <b>↓</b> 브레이크',
    howto5: '🏁 리스트를 다 채우고 가장 먼저 계산대 통과하면 승리!',
    lobbySub: '친구에게 코드를 알려주세요!',
    startBtn: '🏁 게임 시작!',
    lobbyWait: '호스트가 시작하길 기다리는 중...',
    leave: '나가기',
    emptySlot: '비어 있음',
    shoppingList: '🧾 쇼핑 리스트',
    standingsTitle: '🏆 순위',
    keyHints: '←→ 이동 · Shift/↑ 부스트 · ↓ 브레이크 · M 음소거',
    thPlayer: '플레이어',
    thTime: '기록',
    thItems: '담은 상품',
    resultsWait: '호스트가 다음 레벨을 시작하길 기다리는 중...',
    disconnectTitle: '😢 연결이 끊겼어요',
    disconnectBody: '서버와의 연결이 끊어졌어요. 새로고침 해주세요!',
    refresh: '새로고침',
    me: ' (나)',
    guest: '손님',
    lap: (n) => `${n}바퀴`,
    itemsOf: (a, b) => `${a}/${b}개`,
    listComplete: '🧾 리스트 완성! 계산대로 달려요!',
    moreLap: '아직 장 볼 게 남았어요! 한 바퀴 더 🛒',
    checkoutIn: (m) => `✅ 계산대까지 ${m}m`,
    finishedHud: '🏁 골인! 수고했어요!',
    bonk: '💥 쿵!',
    gotEnough: '✕ 이미 충분해요!',
    notOnList: '✕ 목록에 없어요!',
    doneShopping: (n) => `${n} 장보기 완료! 🧾`,
    arrived: (medal, n, p) => `${medal} ${n} ${p}등으로 도착!`,
    playerLeft: (n) => `${n}님이 나갔어요 👋`,
    resultsTitle: (lv) => `🏁 레벨 ${lv} 결과`,
    timeUp: '😵 시간 초과...',
    placeBig: (medal, p) => `${medal} ${p}등!`,
    secs: (s) => `${s}초`,
    dnf: 'DNF',
    nextLevel: (lv) => `다음 레벨 (LV ${lv}) ▶`,
    ROOM_NOT_FOUND: '그 코드의 방이 없어요!',
    ROOM_FULL: '방이 꽉 찼어요! (최대 4명)',
    IN_PROGRESS: '게임이 진행 중이에요. 끝나면 들어올 수 있어요!',
    connectFail: '서버에 연결할 수 없어요! 서버가 켜져 있는지 확인해주세요.',
    needCode: '4글자 방 코드를 입력해주세요!',
    lostConn: '서버와의 연결이 끊겼어요 😢',
    portalLinked: (n) => `🟢 포털 로그인: ${n}`,
    portalScore: (s) => `🏆 포털 점수 +${s}점 저장!`
  },
  en: {
    title: 'CART RUSH! 🛒 Supermarket Cart Race',
    tagline: 'Supermarket cart racing · Up to 4 players',
    nicknameLabel: 'Nickname',
    nicknamePh: 'Nickname (max 10)',
    createBtn: '🏁 Create a Room',
    or: 'or',
    codePh: 'CODE',
    joinBtn: 'Join',
    howtoTitle: '🎮 How to Play',
    howto1: '🛒 Your cart rolls forward — steer with <b>← →</b>',
    howto2: '🧾 Grab only items on your shopping list (others slow you down!)',
    howto3: '🚶 Bump into a shopper and you get stunned!',
    howto4: '⚡ <b>Shift / ↑</b> to boost, <b>↓</b> to brake',
    howto5: '🏁 Fill your list, then cross the checkout first to win!',
    lobbySub: 'Share this code with your friends!',
    startBtn: '🏁 Start Race!',
    lobbyWait: 'Waiting for the host to start...',
    leave: 'Leave',
    emptySlot: 'Empty',
    shoppingList: '🧾 Shopping List',
    standingsTitle: '🏆 Standings',
    keyHints: '←→ Steer · Shift/↑ Boost · ↓ Brake · M Mute',
    thPlayer: 'Player',
    thTime: 'Time',
    thItems: 'Items',
    resultsWait: 'Waiting for the host to start the next level...',
    disconnectTitle: '😢 Disconnected',
    disconnectBody: 'Lost connection to the server. Please refresh!',
    refresh: 'Refresh',
    me: ' (me)',
    guest: 'Guest',
    lap: (n) => `Lap ${n}`,
    itemsOf: (a, b) => `${a}/${b}`,
    listComplete: '🧾 List complete! Race to the checkout!',
    moreLap: 'Still missing items! One more lap 🛒',
    checkoutIn: (m) => `✅ Checkout in ${m}m`,
    finishedHud: '🏁 Finished! Great run!',
    bonk: '💥 Bonk!',
    gotEnough: '✕ Already got enough!',
    notOnList: '✕ Not on the list!',
    doneShopping: (n) => `${n} finished shopping! 🧾`,
    arrived: (medal, n, p) => `${medal} ${n} finished ${ord(p)}!`,
    playerLeft: (n) => `${n} left 👋`,
    resultsTitle: (lv) => `🏁 Level ${lv} Results`,
    timeUp: "😵 Time's up...",
    placeBig: (medal, p) => `${medal} ${ord(p)}!`,
    secs: (s) => `${s}s`,
    dnf: 'DNF',
    nextLevel: (lv) => `Next Level (LV ${lv}) ▶`,
    ROOM_NOT_FOUND: 'No room with that code!',
    ROOM_FULL: 'That room is full! (max 4)',
    IN_PROGRESS: 'Game in progress — join when it ends!',
    connectFail: "Can't reach the server! Make sure it's running.",
    needCode: 'Enter the 4-letter room code!',
    lostConn: 'Lost connection to the server 😢',
    portalLinked: (n) => `🟢 Portal login: ${n}`,
    portalScore: (s) => `🏆 +${s} pts saved to portal!`
  }
};

export const i18n = {
  lang: localStorage.getItem('cartrush-lang') ||
    ((navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en'),

  t(key, ...args) {
    const v = DICT[this.lang]?.[key] ?? DICT.ko[key] ?? key;
    return typeof v === 'function' ? v(...args) : v;
  },

  set(lang) {
    this.lang = lang;
    localStorage.setItem('cartrush-lang', lang);
    this.applyStatic();
  },

  // data-i18n 속성이 붙은 정적 요소들을 현재 언어로 갱신
  applyStatic() {
    document.documentElement.lang = this.lang;
    document.title = this.t('title');
    for (const el of document.querySelectorAll('[data-i18n]')) {
      const key = el.dataset.i18n;
      if ('i18nHtml' in el.dataset) el.innerHTML = this.t(key);
      else el.textContent = this.t(key);
    }
    for (const el of document.querySelectorAll('[data-i18n-ph]')) {
      el.placeholder = this.t(el.dataset.i18nPh);
    }
    for (const b of document.querySelectorAll('.lang-btn')) {
      b.classList.toggle('active', b.dataset.lang === this.lang);
    }
  },

  // 맵 상품 이름 (서버가 ko/en 둘 다 보냄)
  itemName(entry) {
    return this.lang === 'ko' ? entry.name : entry.en || entry.name;
  }
};

export const t = (...args) => i18n.t(...args);
