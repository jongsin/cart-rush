// 맵 생성기 — 매 게임마다 서버가 새 맵을 만들어 모든 플레이어에게 동일하게 전송한다.

export const CATALOG = [
  { type: 'apple', emoji: '🍎', name: '사과', en: 'Apple' },
  { type: 'banana', emoji: '🍌', name: '바나나', en: 'Banana' },
  { type: 'milk', emoji: '🥛', name: '우유', en: 'Milk' },
  { type: 'bread', emoji: '🍞', name: '식빵', en: 'Bread' },
  { type: 'egg', emoji: '🥚', name: '달걀', en: 'Eggs' },
  { type: 'cheese', emoji: '🧀', name: '치즈', en: 'Cheese' },
  { type: 'carrot', emoji: '🥕', name: '당근', en: 'Carrot' },
  { type: 'fish', emoji: '🐟', name: '생선', en: 'Fish' },
  { type: 'chicken', emoji: '🍗', name: '치킨', en: 'Chicken' },
  { type: 'tissue', emoji: '🧻', name: '휴지', en: 'Tissue' },
  { type: 'shampoo', emoji: '🧴', name: '샴푸', en: 'Shampoo' },
  { type: 'ramen', emoji: '🍜', name: '라면', en: 'Ramen' },
  { type: 'grape', emoji: '🍇', name: '포도', en: 'Grapes' },
  { type: 'donut', emoji: '🍩', name: '도넛', en: 'Donut' },
  { type: 'icecream', emoji: '🍦', name: '아이스크림', en: 'Ice Cream' },
  { type: 'watermelon', emoji: '🍉', name: '수박', en: 'Watermelon' }
];

const NPC_EMOJIS = ['🚶‍♀️', '🚶‍♂️', '👵', '👴', '🧍‍♀️', '🧍‍♂️'];
const SHELF_COLORS = ['#ffd9a0', '#ffc4c4', '#c4e3ff', '#d3f0c8', '#eedcff'];

export function levelConfig(level) {
  return {
    itemTarget: Math.min(3 + (level - 1) * 2, 12),       // 담아야 할 총 상품 수
    typeCount: Math.min(2 + Math.ceil(level / 2), 6),    // 리스트 품목 종류 수
    trackLength: Math.min(7500 + (level - 1) * 1500, 14000),
    npcCount: Math.min(9 + (level - 1) * 5, 34),
    npcSpeed: Math.min(55 + (level - 1) * 12, 110),      // NPC 최대 이동속도(px/s)
    decoyCount: Math.min(42 + level * 8, 80),            // 리스트에 없는 미끼 상품 수
    timeLimit: Math.min(160 + (level - 1) * 25, 280)     // 제한시간(초)
  };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function generateMap(level) {
  const cfg = levelConfig(level);
  const W = 700;
  const L = cfg.trackLength;
  let idSeq = 1;

  // 1) 쇼핑 리스트: 품목별 필요 개수 분배 (합계 = itemTarget)
  const typeCount = Math.min(cfg.typeCount, cfg.itemTarget);
  const chosen = shuffle(CATALOG).slice(0, typeCount);
  const list = chosen.map((t) => ({ type: t.type, emoji: t.emoji, name: t.name, en: t.en, need: 1 }));
  for (let r = cfg.itemTarget - list.length; r > 0; r--) {
    pick(list).need++;
  }

  // 2) 진열대 섬 — 3개 열 위치 중 골라 배치, 통로는 항상 확보
  const shelves = [];
  const cols = [175, 350, 525];
  const SHELF_W = 120;
  const bandStart = 700;
  const bandEnd = L - 1100;
  for (let y = bandStart; y < bandEnd - 460; y += 520) {
    const h = 240 + Math.random() * 180;
    const double = Math.random() < 0.3;
    const colIdx = double ? [0, 2] : [Math.floor(Math.random() * 3)];
    for (const ci of colIdx) {
      shelves.push({
        id: idSeq++,
        x: cols[ci] - SHELF_W / 2,
        y: Math.round(y + Math.random() * 90),
        w: SHELF_W,
        h: Math.round(h),
        color: pick(SHELF_COLORS),
        deco: pick(CATALOG).emoji
      });
    }
  }

  // 3) 상품 배치 — 진열대와 겹치면 옆으로 밀어낸다
  const items = [];
  const yMin = 500;
  const yMax = L - 1000;
  const placeItem = (t, y) => {
    let x = 50 + Math.random() * (W - 100);
    for (const s of shelves) {
      if (x > s.x - 35 && x < s.x + s.w + 35 && y > s.y - 35 && y < s.y + s.h + 35) {
        x = x < s.x + s.w / 2 ? s.x - 48 : s.x + s.w + 48;
        x = Math.max(40, Math.min(W - 40, x));
      }
    }
    items.push({ id: idSeq++, type: t.type, emoji: t.emoji, x: Math.round(x), y: Math.round(y) });
  };
  // 필요한 상품: 필요 개수의 3배 + 2개를 트랙 전체에 고르게 흩뿌림
  for (const e of list) {
    const copies = e.need * 3 + 2;
    const seg = (yMax - yMin) / copies;
    for (let i = 0; i < copies; i++) {
      placeItem(e, yMin + seg * i + Math.random() * seg);
    }
  }
  // 미끼 상품 (리스트에 없는 것들)
  const chosenTypes = new Set(list.map((e) => e.type));
  const decoys = CATALOG.filter((c) => !chosenTypes.has(c.type));
  for (let i = 0; i < cfg.decoyCount; i++) {
    placeItem(pick(decoys), yMin + Math.random() * (yMax - yMin));
  }

  // 4) 쇼핑객 NPC — 좌우로 패트롤: x(t) = x0 + amp * sin(omega * t + phase)
  const npcs = [];
  for (let i = 0; i < cfg.npcCount; i++) {
    const amp = 60 + Math.random() * 180;
    const speed = cfg.npcSpeed * (0.6 + Math.random() * 0.8);
    npcs.push({
      id: idSeq++,
      emoji: pick(NPC_EMOJIS),
      x0: Math.round(120 + Math.random() * (W - 240)),
      y: Math.round(700 + Math.random() * (L - 1900)),
      amp: Math.round(amp),
      omega: speed / amp,
      phase: Math.random() * Math.PI * 2
    });
  }

  return {
    W,
    L,
    level,
    cfg,
    list,
    itemTarget: cfg.itemTarget,
    items,
    shelves,
    npcs,
    checkoutY: L - 420, // 계산대 구역 시작
    finishY: L - 220    // 결승(체크아웃) 라인
  };
}
