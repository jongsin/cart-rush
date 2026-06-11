# CART RUSH 서버 이미지 — 빌드 단계 없는 순수 Node 앱
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# 의존성 레이어 분리 (코드만 바뀌면 npm ci 캐시 재사용)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
