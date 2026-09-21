// routes/dashboard.js
const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/summary — headline numbers for the monitoring dashboard
router.get('/summary', authenticate, (req, res) => {
  const totalInstitutes = db.prepare('SELECT COUNT(*) AS n FROM institutes').get().n;

  const inspectionsByStatus = db.prepare(
    `SELECT status, COUNT(*) AS n FROM inspections GROUP BY status`
  ).all();

  const flaggedReports = db.prepare(
    `SELECT COUNT(*) AS n FROM reports WHERE anomaly_flag = 1`
  ).get().n;

  const totalReports = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n;

  const recentReports = db.prepare(`
    SELECT reports.id, reports.submitted_at, reports.anomaly_flag, reports.anomaly_reason,
           reports.photo_authenticity, reports.photo_authenticity_reason,
           institutes.name AS institute_name, users.name AS submitted_by_name
    FROM reports
    JOIN inspections ON inspections.id = reports.inspection_id
    JOIN institutes ON institutes.id = inspections.institute_id
    LEFT JOIN users ON users.id = reports.submitted_by
    ORDER BY reports.submitted_at DESC
    LIMIT 10
  `).all();

  const statusMap = { pending: 0, assigned: 0, in_progress: 0, completed: 0, missed: 0 };
  inspectionsByStatus.forEach((row) => { statusMap[row.status] = row.n; });

  res.json({
    totalInstitutes,
    inspections: statusMap,
    reports: { total: totalReports, flagged: flaggedReports },
    recentReports,
  });
});

module.exports = router;
