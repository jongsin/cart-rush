# 🛒 CART RUSH! — 마트 카트 레이스

대형 마트를 배경으로 한 최대 4인 멀티플레이 쇼핑카트 레이싱 게임.
쇼핑 리스트의 상품을 가장 빨리 모아서 계산대를 통과하면 승리!

## 실행 방법

```bash
npm install
npm start
```

서버가 켜지면 브라우저에서 `http://localhost:3000` 접속.
같은 네트워크의 친구는 터미널에 출력되는 `Network:` 주소로 접속하면 함께 플레이할 수 있어요.

## 언어 / Language

홈 화면 오른쪽 위 토글로 **한국어 / English**를 선택할 수 있어요 (상품 이름까지 번역, 선택은 브라우저에 저장).
첫 방문 시 브라우저 언어를 따라갑니다.

## 🐳 Docker로 실행

```bash
docker compose up -d          # 빌드 + 백그라운드 실행 (http://localhost:3000)
HOST_PORT=8080 docker compose up -d   # 다른 호스트 포트로 띄우고 싶을 때
docker compose down           # 종료
```

- compose 없이 직접: `docker build -t cart-rush . && docker run -d -p 3000:3000 --name cart-rush cart-rush`
- 컨테이너 로그에 찍히는 `Network:` 주소는 **컨테이너 내부 IP**라 친구가 접속할 수 없어요 — 같은 네트워크의 친구는 **호스트 머신의 IP**(`http://<내 컴퓨터 IP>:3000`)로 접속하면 됩니다.
- 클라우드/NAS에 올릴 때도 이 compose 파일 그대로 동작해요 (헬스체크 포함).

## 🌐 서브패스 배포 (예: `https://games.example.com/cart-rush`)

클라이언트는 페이지 경로를 기준으로 WebSocket에 접속하므로 서브패스 배포를 그대로 지원해요.
서버(예: nginx)에서 프리픽스를 제거해 컨테이너로 넘기는 구성을 권장:

```nginx
# games.example.com 의 server 블록 안에
location = /cart-rush { return 301 /cart-rush/; }
location /cart-rush/ {
    proxy_pass http://127.0.0.1:3000/;   # 끝 슬래시 = /cart-rush/ 프리픽스 제거
    proxy_http_version 1.1;              # ↓ WebSocket 업그레이드에 필수
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h;               # 게임 중 WS가 끊기지 않게
}
```

[Caddy](https://caddyserver.com)라면 TLS 인증서까지 자동이라 더 간단해요:

```
games.example.com {
    handle_path /cart-rush/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

- 프록시가 프리픽스를 **제거하지 못하는** 환경이면 컨테이너에 `BASE_PATH=/cart-rush`를 주면 됩니다: `BASE_PATH=/cart-rush docker compose up -d`
- HTTPS로 서빙하면 클라이언트가 자동으로 `wss://`를 사용해요 (코드 수정 불필요).

## 🎮 게임 포털 연동 (선택)

YoonIT 게임 포털(games.hometown.co.kr)과 **같은 도메인의 서브패스**(`/cart-rush/`)로 서빙하면
포털 로그인 회원의 닉네임·아바타를 게임에서 쓰고, 완주 점수를 포털 리더보드에 자동 제출해요.

```bash
PORTAL_API_BASE=https://games.hometown.co.kr \
PORTAL_API_KEY=<포털 BO에서 발급한 API 키> \
BASE_PATH=/cart-rush \
docker compose up -d --build
```

- 두 변수를 안 주면 기존 그대로 **독립 실행 모드**(게스트 전용)로 동작해요.
- 동작 원리: 같은 도메인이라 WebSocket 접속에 포털 로그인 쿠키가 실려오고, 서버가 포털
  verify API로 회원을 확인해요. 비로그인 사용자는 그냥 게스트로 플레이.
- 점수 공식(완주자만): `레벨×10000 + 순위 보너스(3000/2400/1800/1200) + 시간 보너스(최대 3000)`
  — 상위 레벨 완주가 항상 우선이고, 같은 레벨에선 순위·기록 순.

## 📱 모바일로 참가하기

1. PC에서 서버를 켜고(`npm start`), 폰을 **같은 Wi-Fi**에 연결
2. 폰 브라우저로 터미널에 표시된 `Network: http://192.168.x.x:3000` 주소에 접속
3. 방 코드로 참가 — 터치 기기에서는 화면 아래에 **◀ ▶ 이동 · 🛑 브레이크 · ⚡ 부스트** 버튼이 자동으로 나타나요

멀리 있는 친구와는 [Tailscale](https://tailscale.com) 또는 `npx localtunnel --port 3000` 같은 터널로 접속하면 돼요.
클라우드(Render/Railway/Fly.io 등)에 올려도 코드 수정 없이 동작합니다 (`PORT` 환경변수 + `wss://` 자동 처리).

## 게임 방법

1. **방 만들기** → 4글자 방 코드를 친구에게 공유 (최대 4명)
2. 호스트가 **게임 시작**을 누르면 3초 카운트다운 후 레이스 시작
3. 카트는 자동으로 전진! 키보드로 조종하세요:

   | 키 | 동작 |
   |----|------|
   | `←` `→` (또는 `A` `D`) | 좌우 이동 |
   | `Shift` 또는 `↑` (`W`) | 부스트 (게이지 소모) |
   | `↓` (`S`) | 브레이크 (정밀하게 줍고 싶을 때) |
   | `M` (또는 HUD의 🔊) | 음소거 토글 |
   | (모바일) 화면 버튼 ◀ ▶ 🛑 ⚡ | 터치 조작 — 터치 기기에서 자동 표시 |

4. 화면 왼쪽 **쇼핑 리스트**에 있는 상품만 담으세요.
   - 리스트에 없는 상품을 건드리면 잠깐 느려져요!
   - 쇼핑객 🚶과 부딪히면 스턴!
   - 진열대는 피해서 다니세요.
5. 리스트를 다 채우고 **계산대(CHECK OUT)** 를 통과하면 골인!
   - 다 못 채우고 끝까지 가면 한 바퀴 더 돌아야 해요.

## 규칙

- 맵(상품 배치, 진열대, 쇼핑객)은 **매 게임 랜덤 생성**되며, 같은 방의 모든 플레이어는 **동일한 맵**에서 경쟁합니다.
- 레벨이 올라갈수록: 담아야 할 상품 수 증가(3 → 5 → 7 → ...), 트랙이 길어지고, 쇼핑객이 많아지고 빨라집니다.
- 상품은 플레이어별로 독립적으로 주울 수 있어요 (남이 주워도 내 몫은 그대로).
- 제한시간 안에 못 들어오면 DNF — 담은 상품 수로 순위가 결정됩니다.

## 기술 구성

- **서버**: Node.js + Express + ws — 방 관리, 맵 생성, 상태 검증/중계 (`server/`)
- **클라이언트**: 순수 HTML5 Canvas + ES Modules, 빌드 도구 없음 (`public/`)
- **사운드**: 전부 WebAudio 실시간 합성 (외부 음원 파일 없음) — 레이스 중 BGM은 스텝 시퀀서(드럼/베이스/멜로디/아르페지오, 레벨이 오르면 템포 상승), 효과음은 레이어드 신스(노이즈 임팩트 + 서브 붐 + 리버브 + 컴프레서). `M` 키 또는 HUD 🔊 버튼으로 음소거.
- 그래픽은 캔버스 드로잉 + 이모지
- **폰트**: [Jua](https://fonts.google.com/specimen/Jua)(본문) + [Black Han Sans](https://fonts.google.com/specimen/Black+Han+Sans)(로고/카운트다운/기록) — Google Fonts
- **다국어**: `public/js/i18n.js` 사전 기반 ko/en — 서버는 에러를 코드로 보내고 상품 이름은 `name`(ko)/`en` 둘 다 내려보냄
