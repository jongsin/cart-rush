// 게임 포털(games.hometown.co.kr) 연동 — 회원 검증 + 점수 제출
// PORTAL_API_BASE 와 PORTAL_API_KEY 가 둘 다 설정된 경우에만 동작하고,
// 없으면 기존처럼 완전한 독립 실행 모드(게스트 전용)로 돈다.
//
// 동작 원리: 게임이 포털과 같은 도메인 서브패스(/cart-rush/)로 서빙되면
// WebSocket 업그레이드 요청에 포털 로그인 쿠키(ygp_member)가 그대로 실려온다.
// 서버는 그 토큰을 포털 verify API 로 보내 회원을 확인하고(닉네임/아바타 수신),
// 게임 종료 시 memberId 로 점수를 제출한다. (API 계약: portal docs/design/api.md §3)

const BASE = (process.env.PORTAL_API_BASE || '').trim().replace(/\/+$/, '');
const KEY = (process.env.PORTAL_API_KEY || '').trim();
const SLUG = (process.env.PORTAL_GAME_SLUG || 'cart-rush').trim();
const MEMBER_COOKIE = 'ygp_member';
const TIMEOUT_MS = 3000; // 포털 응답 지연이 게임 입장을 오래 막지 않도록 짧게

export const portalEnabled = Boolean(BASE && KEY);

// 클라이언트가 포털 페이지(리더보드 등)로 이동할 때 쓰는 슬러그.
// 포털 연동이 켜진 경우 = 포털 도메인 서브패스로 서빙되는 경우에만 내려준다.
export const portalSlug = portalEnabled ? SLUG : null;

async function api(path, body) {
  const res = await fetch(`${BASE}/api/ext/v1/games/${SLUG}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    // 401/404 = 비로그인·만료·탈퇴 등 정상적인 "게스트 취급" 케이스
    const err = new Error(`portal ${path} → HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Cookie 헤더 문자열에서 ygp_member 토큰만 추출
export function memberTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of String(cookieHeader).split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === MEMBER_COOKIE) {
      const v = part.slice(i + 1).trim();
      if (v) return decodeURIComponent(v);
    }
  }
  return null;
}

// 회원 검증 → { memberId, nickname, portalNickname, avatarCode, avatarUrl } | null(게스트)
export async function verifyMember(cookieHeader) {
  if (!portalEnabled) return null;
  const token = memberTokenFromCookie(cookieHeader);
  if (!token) return null;
  try {
    return await api('/members/verify', { memberToken: token });
  } catch (e) {
    if (e.status !== 401 && e.status !== 404) console.warn(`[portal] verify 실패: ${e.message}`);
    return null;
  }
}

// 점수 제출 (fire-and-forget — 실패해도 게임 진행에는 영향 없음)
export function submitScore(memberId, score) {
  if (!portalEnabled) return;
  api('/scores', { memberId, score })
    .then((r) => console.log(`[portal] 점수 제출: member ${memberId} → ${score}점` +
      (r.isNewBest ? ` (신기록! 순위 ${r.rank ?? '-'})` : '')))
    .catch((e) => console.warn(`[portal] 점수 제출 실패: member ${memberId}, ${e.message}`));
}

// 레이스 점수 공식 — 포털 리더보드는 "단일 숫자, 높을수록 좋음"이라 종합 점수로 환산한다.
//   레벨 점수가 지배적(레벨당 10000점): 상위 레벨 완주는 하위 레벨 만점보다 항상 높다.
//   순위 보너스: 1등 3000 / 2등 2400 / 3등 1800 / 4등 1200
//   시간 보너스: 제한시간 대비 남긴 비율 × 3000 (빨리 도착할수록 높음)
//   → 레벨 내 최대 6000 < 10000 이므로 레벨 우선이 항상 보장된다. 완주자만 대상.
const PLACE_PTS = [3000, 2400, 1800, 1200];

export function raceScore(level, place, finishMs, timeLimitSec) {
  // 비정상 finishMs(음수 등)에도 보너스가 0~3000 을 벗어나지 않게 클램프
  const left = Math.max(0, Math.min(1, 1 - finishMs / (timeLimitSec * 1000)));
  return level * 10000 + (PLACE_PTS[place - 1] ?? 1000) + Math.round(left * 3000);
}

if (portalEnabled) {
  console.log(`[portal] 연동 활성: ${BASE} (slug: ${SLUG})`);
} else {
  console.log('[portal] PORTAL_API_BASE/PORTAL_API_KEY 미설정 — 독립 실행 모드');
}
