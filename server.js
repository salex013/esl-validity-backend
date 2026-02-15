'use strict';

const express = require('express');
const cors = require('cors');

const { adminAuth } = require('./src/middleware/admin');
const { routesSummary } = require('./src/routes');
const { runValidityReport } = require('./src/validity');
const { runDesign } = require('./src/design');
const { upload, extractTextFromUpload } = require('./src/extract');
const { buildReportPdfBuffer } = require('./src/export/pdf');
const { buildReportDocxBuffer } = require('./src/export/docx');

const app = express();
app.disable('x-powered-by');

// If you have a specific Netlify origin, set CORS_ORIGIN=https://your-site.netlify.app
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));

app.use(express.json({ limit: '2mb' }));

// In-memory store (simple + free). Swap to a DB later if you want.
const REPORTS = [];

function nowISO() {
  return new Date().toISOString();
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'ESL Validity Tool Backend',
    timestamp: nowISO(),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    adminConfigured: Boolean(process.env.ADMIN_KEY)
  });
});

app.get('/api/routes', (req, res) => {
  res.json({ ok: true, routes: routesSummary() });
});

// Optional: show a friendlier message at the root
app.get('/', (req, res) => {
  res.status(200).send('ESL Validity Tool Backend is running. Use /api/health');
});

// Extract text from uploaded files (pdf/docx/txt). Accepts multipart/form-data with field "file".
app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    const text = await extractTextFromUpload(req.file);
    res.json({ ok: true, text });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'Extraction failed' });
  }
});

// Build a validity report from instructions + rubric
app.post('/api/report', async (req, res) => {
  try {
    const input = req.body || {};
    const report = await runValidityReport(input);

    const id = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    const record = {
      id,
      createdAt: nowISO(),
      input,
      report
    };
    REPORTS.unshift(record);
    if (REPORTS.length > 100) REPORTS.length = 100;

    res.json({ ok: true, id, report });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Report failed' });
  }
});

// NEW: Design an assessment (generate strong instructions + rubric) from teacher idea + criteria.
app.post('/api/design', async (req, res) => {
  try {
    const input = req.body || {};
    const design = await runDesign(input);
    res.json({ ok: true, design });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Design failed' });
  }
});

// Admin: list recent reports
app.get('/api/history', adminAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 100);
  res.json({ ok: true, items: REPORTS.slice(0, limit) });
});

// Admin: download report as PDF
app.get('/api/report/:id/pdf', adminAuth, async (req, res) => {
  const found = REPORTS.find(r => r.id === req.params.id);
  if (!found) return res.status(404).json({ ok: false, error: 'Not found' });

  const buf = await buildReportPdfBuffer(found);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="validity-report-${found.id}.pdf"`);
  res.send(buf);
});

// Public: download by id (used by the teacher UI download buttons)
app.get('/api/report/pdf', async (req, res) => {
  const id = String(req.query.id || '');
  const found = REPORTS.find(r => r.id === id);
  if (!found) return res.status(404).json({ ok: false, error: 'Not found' });
  const buf = await buildReportPdfBuffer(found);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="validity-report-${found.id}.pdf"`);
  res.send(buf);
});

// Admin: download report as DOCX
app.get('/api/report/:id/docx', adminAuth, async (req, res) => {
  const found = REPORTS.find(r => r.id === req.params.id);
  if (!found) return res.status(404).json({ ok: false, error: 'Not found' });

  const buf = await buildReportDocxBuffer(found);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="validity-report-${found.id}.docx"`);
  res.send(buf);
});

// Public: download by id (used by the teacher UI download buttons)
app.get('/api/report/docx', async (req, res) => {
  const id = String(req.query.id || '');
  const found = REPORTS.find(r => r.id === id);
  if (!found) return res.status(404).json({ ok: false, error: 'Not found' });
  const buf = await buildReportDocxBuffer(found);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="validity-report-${found.id}.docx"`);
  res.send(buf);
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
