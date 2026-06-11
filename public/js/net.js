// WebSocket 클라이언트 래퍼 + 서버 시각 동기화
export class Net {
  constructor() {
    this.handlers = new Map();
    this.offset = null; // serverTime - clientTime
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}`);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('서버에 연결할 수 없어요'));
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (typeof msg.t === 'number') {
          const o = msg.t - Date.now();
          this.offset = this.offset === null ? o : this.offset * 0.8 + o * 0.2;
        }
        const h = this.handlers.get(msg.type);
        if (h) h(msg);
      };
      ws.onclose = () => {
        const h = this.handlers.get('_close');
        if (h) h({});
      };
      this.ws = ws;
    });
  }

  on(type, fn) { this.handlers.set(type, fn); }

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type, ...data }));
  }

  // 서버 기준 현재 시각 (ms)
  now() { return Date.now() + (this.offset || 0); }
}
