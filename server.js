// ── 발효기 클라우드 모니터링 서버 (Render.com 배포용) ──────────────
// ESP32가 여기로 온도 데이터를 POST하면, 이 서버가 최신값을 저장하고
// 하나의 웹 대시보드에서 여러 발효기를 동시에 보여줍니다.

const express = require('express');
const app = express();

app.use(express.json());

// ── 간단한 인증 (선택) ─────────────────────────────────────────
// Render.com 환경변수에 API_KEY를 설정하면, ESP32가 같은 키를 헤더에
// 실어 보내야만 데이터가 저장됩니다. 설정 안 하면 인증 없이 동작합니다.
const API_KEY = process.env.API_KEY || null;

// ── 발효기 데이터 저장 (메모리, 서버 재시작 시 초기화됨) ─────────
// fermenters = {
//   "1": { temp1, temp2, setTemp, relay1, relay2, updatedAt },
//   "2": { ... }
// }
const fermenters = {};

// 이 시간(ms)보다 오래 업데이트가 없으면 "오프라인"으로 표시
const STALE_MS = 60 * 1000; // 60초

// ── ESP32 → 서버: 데이터 수신 ───────────────────────────────────
app.post('/api/data', (req, res) => {
  if (API_KEY) {
    const key = req.get('X-API-KEY');
    if (key !== API_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { id, temp1, temp2, setTemp, relay1, relay2 } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'id 필드가 필요합니다' });
  }

  fermenters[id] = {
    id,
    temp1: Number(temp1),
    temp2: Number(temp2),
    setTemp: Number(setTemp),
    relay1: !!relay1,
    relay2: !!relay2,
    updatedAt: Date.now()
  };

  res.json({ ok: true });
});

// ── 브라우저 → 서버: 전체 발효기 최신 상태 조회 ──────────────────
app.get('/api/data', (req, res) => {
  const now = Date.now();
  const list = Object.values(fermenters)
    .map(f => ({ ...f, online: (now - f.updatedAt) < STALE_MS }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  res.json(list);
});

// ── 대시보드 페이지 ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>발효기 모니터</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #f0f4f8;
         padding: 20px; }
  h1 { font-size: 22px; font-weight: 600; color: #1a202c;
       text-align: center; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px; max-width: 900px; margin: 0 auto; }
  .card { background: white; border-radius: 16px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 20px; }
  .card-header { display: flex; justify-content: space-between; align-items: center;
                 margin-bottom: 12px; }
  .card-title { font-size: 16px; font-weight: 700; color: #2d3748; }
  .status { font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
  .online  { background: #c6f6d5; color: #276749; }
  .offline { background: #fed7d7; color: #9b2c2c; }
  .row { display: flex; justify-content: space-between; align-items: baseline;
         padding: 6px 0; border-bottom: 1px solid #edf2f7; }
  .row:last-of-type { border-bottom: none; }
  .row-label { font-size: 13px; color: #718096; }
  .row-value { font-size: 20px; font-weight: 600; color: #2d3748; }
  .relay-row { display: flex; gap: 8px; margin-top: 12px; }
  .relay-badge { flex: 1; text-align: center; padding: 6px 0; border-radius: 10px;
                 font-size: 12px; font-weight: 600; }
  .on  { background: #c6f6d5; color: #276749; }
  .off { background: #e2e8f0; color: #718096; }
  .updated { font-size: 11px; color: #a0aec0; margin-top: 10px; text-align: right; }
  .empty { text-align: center; color: #a0aec0; margin-top: 60px; }
</style>
</head><body>
<h1>🌡 발효기 모니터</h1>
<div class="grid" id="grid">
  <div class="empty">데이터를 불러오는 중...</div>
</div>
<script>
function fermenterLabel(id) {
  return '발효기 ' + id + '번';
}

async function refresh() {
  try {
    const r = await fetch('/api/data');
    const list = await r.json();
    const grid = document.getElementById('grid');

    if (list.length === 0) {
      grid.innerHTML = '<div class="empty">아직 접속한 발효기가 없습니다</div>';
      return;
    }

    grid.innerHTML = list.map(f => \`
      <div class="card">
        <div class="card-header">
          <div class="card-title">\${fermenterLabel(f.id)}</div>
          <div class="status \${f.online ? 'online' : 'offline'}">
            \${f.online ? '온라인' : '오프라인'}
          </div>
        </div>
        <div class="row">
          <div class="row-label">S1 온도</div>
          <div class="row-value">\${f.temp1.toFixed(1)} °C</div>
        </div>
        <div class="row">
          <div class="row-label">S2 온도</div>
          <div class="row-value">\${f.temp2.toFixed(1)} °C</div>
        </div>
        <div class="row">
          <div class="row-label">설정온도</div>
          <div class="row-value">\${f.setTemp.toFixed(1)} °C</div>
        </div>
        <div class="relay-row">
          <div class="relay-badge \${f.relay1 ? 'on' : 'off'}">릴레이1: \${f.relay1 ? 'ON' : 'OFF'}</div>
          <div class="relay-badge \${f.relay2 ? 'on' : 'off'}">릴레이2: \${f.relay2 ? 'ON' : 'OFF'}</div>
        </div>
        <div class="updated">
          마지막 수신: \${new Date(f.updatedAt).toLocaleTimeString('ko-KR')}
        </div>
      </div>
    \`).join('');
  } catch (e) {
    console.error(e);
  }
}

refresh();
setInterval(refresh, 5000);
</script>
</body></html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`발효기 모니터 서버 실행 중: 포트 ${PORT}`);
});
