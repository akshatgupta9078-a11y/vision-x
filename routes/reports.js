// routes/reports.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const stamp = Date.now();
    cb(null, `report-${stamp}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg, jpeg, png or webp images are allowed for evidence photos.'));
    }
  },
});

// A very simple, explainable anomaly rule: if attendance is well below
// what's expected, flag it for review. A real system would compare against
// historical patterns; this keeps the logic transparent for a demo.
function detectAnomaly({ staffPresent, staffExpected, beneficiariesPresent, beneficiariesExpected }) {
  const reasons = [];

  if (staffExpected > 0 && staffPresent / staffExpected < 0.6) {
    reasons.push(`Staff attendance is ${Math.round((staffPresent / staffExpected) * 100)}% of expected.`);
  }
  if (beneficiariesExpected > 0 && beneficiariesPresent / beneficiariesExpected < 0.5) {
    reasons.push(`Beneficiary presence is ${Math.round((beneficiariesPresent / beneficiariesExpected) * 100)}% of expected.`);
  }

  return { flagged: reasons.length > 0, reason: reasons.join(' ') || null };
}

// POST /api/reports — submit an inspection report (multipart/form-data)
// Fields: inspectionId, notes, staffPresent, staffExpected,
//         beneficiariesPresent, beneficiariesExpected, latitude, longitude
// File field name: photo
router.post('/', authenticate, authorize('pmu', 'admin'), upload.single('photo'), (req, res) => {
  const {
    inspectionId, notes,
    staffPresent, staffExpected,
    beneficiariesPresent, beneficiariesExpected,
    latitude, longitude,
  } = req.body || {};

  if (!inspectionId) {
    return res.status(400).json({ error: 'inspectionId is required.' });
  }

  const inspection = db.prepare('SELECT * FROM inspections WHERE id = ?').get(inspectionId);
  if (!inspection) {
    return res.status(404).json({ error: 'Inspection not found.' });
  }
  if (req.user.role === 'pmu' && inspection.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'This inspection is not assigned to you.' });
  }

  const sPresent = parseInt(staffPresent, 10) || 0;
  const sExpected = parseInt(staffExpected, 10) || 0;
  const bPresent = parseInt(beneficiariesPresent, 10) || 0;
  const bExpected = parseInt(beneficiariesExpected, 10) || 0;

  const anomaly = detectAnomaly({
    staffPresent: sPresent, staffExpected: sExpected,
    beneficiariesPresent: bPresent, beneficiariesExpected: bExpected,
  });

  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const info = db.prepare(
    `INSERT INTO reports
      (inspection_id, submitted_by, notes, staff_present, staff_expected,
       beneficiaries_present, beneficiaries_expected, photo_path,
       latitude, longitude, anomaly_flag, anomaly_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    inspectionId, req.user.id, notes || null, sPresent, sExpected,
    bPresent, bExpected, photoPath,
    latitude ?? null, longitude ?? null,
    anomaly.flagged ? 1 : 0, anomaly.reason
  );

  // Submitting a report closes out the inspection.
  db.prepare(`UPDATE inspections SET status = 'completed' WHERE id = ?`).run(inspectionId);

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ report, anomaly });
});

// GET /api/reports — list reports (admin/authority see all; PMU see their own)
router.get('/', authenticate, (req, res) => {
  const base = `
    SELECT reports.*, inspections.institute_id, institutes.name AS institute_name,
           users.name AS submitted_by_name
    FROM reports
    JOIN inspections ON inspections.id = reports.inspection_id
    JOIN institutes ON institutes.id = inspections.institute_id
    LEFT JOIN users ON users.id = reports.submitted_by
  `;

  let rows;
  if (req.user.role === 'pmu') {
    rows = db.prepare(`${base} WHERE reports.submitted_by = ? ORDER BY reports.submitted_at DESC`).all(req.user.id);
  } else {
    rows = db.prepare(`${base} ORDER BY reports.submitted_at DESC`).all();
  }
  res.json({ reports: rows });
});

// GET /api/reports/:id
router.get('/:id', authenticate, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  res.json({ report });
});

module.exports = router;
