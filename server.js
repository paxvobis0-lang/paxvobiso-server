const express = require('express');
const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY || null;
const STALE_MS = 60 * 1000;

// 현재 상태
const fermenters = {};

// 온도 기록 (발효기별 최대 500건)
const history = {};  // { "1": [{time, temp1, temp2}, ...], "2": [...] }
const MAX_HISTORY = 500;

// ── ESP32 → 서버: 데이터 수신 ──────────────────────────────
app.post('/api/data', (req, res) => {
  if (API_KEY) {
    const key = req.get('X-API-KEY');
    if (key !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  }

  const { id, temp1, temp2, setTemp, relay1, relay2 } = req.body;
  if (!id) return res.status(400).json({ error: 'id 필드가 필요합니다' });

  const now = Date.now();

  fermenters[id] = {
    id,
    temp1: Number(temp1),
    temp2: Number(temp2),
    setTemp: Number(setTemp),
    relay1: !!relay1,
    relay2: !!relay2,
    updatedAt: now
  };

  // 기록 저장 (15초마다 ESP32가 보내므로 그대로 전부 쌓음)
  if (!history[id]) history[id] = [];
  history[id].push({ time: now, temp1: Number(temp1), temp2: Number(temp2) });
  if (history[id].length > MAX_HISTORY) history[id].shift(); // 오래된 것 제거

  res.json({ ok: true });
});

// ── 브라우저 → 서버: 현재 상태 조회 ───────────────────────
app.get('/api/data', (req, res) => {
  const now = Date.now();
  const list = Object.values(fermenters)
    .map(f => ({ ...f, online: (now - f.updatedAt) < STALE_MS }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  res.json(list);
});

// ── 기록 조회 API ───────────────────────────────────────────
app.get('/api/history/:id', (req, res) => {
  const data = history[req.params.id] || [];
  res.json(data);
});

// ── 메인 대시보드 ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>발효기 모니터</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #f0f4f8; padding: 20px; }
  h1 { font-size: 22px; font-weight: 600; color: #1a202c; text-align: center; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px; max-width: 900px; margin: 0 auto; }
  .card { background: white; border-radius: 16px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 20px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
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
  .history-btn { display: block; text-align: center; margin-top: 12px; padding: 8px;
                 background: #ebf8ff; color: #2b6cb0; border-radius: 10px;
                 font-size: 13px; font-weight: 600; text-decoration: none; }
  .empty { text-align: center; color: #a0aec0; margin-top: 60px; }
</style></head><body>
<h1>🌡 발효기 모니터</h1>
<div class="grid" id="grid"><div class="empty">데이터를 불러오는 중...</div></div>
<script>
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
          <div class="card-title">발효기 \${f.id}번</div>
          <div class="status \${f.online ? 'online' : 'offline'}">\${f.online ? '온라인' : '오프라인'}</div>
        </div>
        <div class="row"><div class="row-label">S1 온도</div><div class="row-value">\${f.temp1.toFixed(1)} °C</div></div>
        <div class="row"><div class="row-label">S2 온도</div><div class="row-value">\${f.temp2.toFixed(1)} °C</div></div>
        <div class="row"><div class="row-label">설정온도</div><div class="row-value">\${f.setTemp.toFixed(1)} °C</div></div>
        <div class="relay-row">
          <div class="relay-badge \${f.relay1 ? 'on' : 'off'}">릴레이1: \${f.relay1 ? 'ON' : 'OFF'}</div>
          <div class="relay-badge \${f.relay2 ? 'on' : 'off'}">릴레이2: \${f.relay2 ? 'ON' : 'OFF'}</div>
        </div>
        <a class="history-btn" href="/history/\${f.id}">📋 온도 기록 보기</a>
        <div class="updated">마지막 수신: \${new Date(f.updatedAt).toLocaleTimeString('ko-KR')}</div>
      </div>
    \`).join('');
  } catch(e) { console.error(e); }
}
refresh();
setInterval(refresh, 5000);
</script></body></html>`);
});

// ── 기록 페이지 ────────────────────────────────────────────
app.get('/history/:id', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>발효기 ${req.params.id}번 온도 기록</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #f0f4f8; padding: 20px; }
  h2 { font-size: 18px; font-weight: 600; color: #1a202c; margin-bottom: 16px; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  a.back { font-size: 13px; color: #3182ce; text-decoration: none; }
  table { width: 100%; border-collapse: collapse; background: white;
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  th { background: #3182ce; color: white; padding: 10px 12px; font-size: 13px; text-align: center; }
  td { padding: 8px 12px; font-size: 13px; text-align: center;
       border-bottom: 1px solid #e2e8f0; color: #2d3748; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f7fafc; }
  .empty { text-align: center; color: #a0aec0; padding: 40px; }
</style></head><body>
<div class="top">
  <h2>📋 발효기 ${req.params.id}번 온도 기록</h2>
  <a class="back" href="/">← 대시보드</a>
</div>
<table>
  <thead><tr><th>시간</th><th>S1 (°C)</th><th>S2 (°C)</th></tr></thead>
  <tbody id="tbody"><tr><td colspan="3" class="empty">불러오는 중...</td></tr></tbody>
</table>
<script>
async function load() {
  const r = await fetch('/api/history/${req.params.id}');
  const data = await r.json();
  const tbody = document.getElementById('tbody');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">기록이 없습니다</td></tr>';
    return;
  }
  // 최신이 위로
  tbody.innerHTML = [...data].reverse().map(d => {
    const t = new Date(d.time).toLocaleString('ko-KR');
    return \`<tr><td>\${t}</td><td>\${d.temp1.toFixed(1)}</td><td>\${d.temp2.toFixed(1)}</td></tr>\`;
  }).join('');
}
load();
</script></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`발효기 모니터 서버 실행 중: 포트 ${PORT}`));
