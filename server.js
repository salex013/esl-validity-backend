// src/server.js
'use strict';

const express = require('express');
const cors = require('cors');

const { runReport } = require('./validity');
const { runAutofix } = require('./autofix');

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // set in Render env
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------- In-memory storage ----------
const state = {
  startedAt: new Date().toISOString(),
  counters: {
    total: 0,
    byPath: {},
    byStatus: {},
    byMode: { groq: 0, lite: 0 },
  },
  logs: [],          // lightweight request/event log
  reports: new Map() // reportId -> { createdAt, mode, input, report }
};

function logEvent(type, data) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    ...data,
  };
  state.logs.push(entry);
  // keep last ~200
  if (state.logs.length > 200) state.logs.shift();
}

function track(req, res) {
  state.counters.total += 1;
  const p = req.path;
  state.counters.byPath[p] = (state.counters.byPath[p] || 0) + 1;

  res.on('finish', () => {
    const s = String(res.statusCode);
    state.counters.byStatus[s] = (state.counters.byStatus[s] || 0) + 1;
  });
}

// ---------- Admin auth ----------
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'ADMIN_KEY is not set on the server.',
    });
  }
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

app.use(track);

// ---------- Routes ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'ESL Validity Tool Backend',
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(GROQ_API_KEY),
    liteAvailable: true,
  });
});

app.get('/api/routes', (req, res) => {
  res.json({
    routes: [
      'GET  /api/health',
      'GET  /api/routes',
      'GET  /api/stats',
      'GET  /api/logs (in-memory sample)',
      'GET  /api/history (admin)',
      'POST /api/validity',
      'POST /api/report (alias of /api/validity)',
      'POST /api/autofix',
      'POST /api/fix (alias of /api/autofix)',
    ],
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    ok: true,
    startedAt: state.startedAt,
    totalInMemory: state.reports.size,
    sampleWindow: state.logs.length,
    counters: state.counters,
  });
});

app.get('/api/logs', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const slice = state.logs.slice(-limit);
  res.json({ ok: true, logs: slice });
});

app.get('/api/history', requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const items = Array.from(state.reports.entries())
    .map(([id, v]) => ({
      id,
      createdAt: v.createdAt,
      mode: v.mode,
      meta: v.report?.metadata || v.report?.meta || {},
      summary: v.report?.summary || '',
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);

  res.json({ ok: true, items });
});

// --- Validity / Report (alias) ---
async function handleReport(req, res) {
  try {
    const mode = String(req.query.mode || 'groq').toLowerCase() === 'lite' ? 'lite' : 'groq';
    state.counters.byMode[mode] = (state.counters.byMode[mode] || 0) + 1;

    const input = req.body || {};
    const report = await runReport(input, { mode });

    const reportId =
      'rpt_' +
      Math.random().toString(36).slice(2) +
      '_' +
      Date.now().toString(36);

    state.reports.set(reportId, {
      createdAt: new Date().toISOString(),
      mode,
      input,
      report,
    });

    logEvent('report', { mode, reportId });

    res.json({ ok: true, reportId, report });
  } catch (err) {
    logEvent('error', { where: 'handleReport', message: err?.message });
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
}

app.post('/api/validity', handleReport);
app.post('/api/report', handleReport);

// --- Autofix / Fix (alias) ---
async function handleAutofix(req, res) {
  try {
    const mode = String(req.query.mode || 'groq').toLowerCase() === 'lite' ? 'lite' : 'groq';
    const input = req.body || {};

    const result = await runAutofix(input, { mode });

    logEvent('autofix', { mode });

    res.json({ ok: true, mode, result });
  } catch (err) {
    logEvent('error', { where: 'handleAutofix', message: err?.message });
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
}

app.post('/api/autofix', handleAutofix);
app.post('/api/fix', handleAutofix);

// ---------- Fallback ----------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
