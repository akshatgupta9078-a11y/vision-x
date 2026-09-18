// routes/inspections.js
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/inspections — list inspections.
// PMU users only see inspections assigned to them; admin/authority see all.
router.get('/', authenticate, (req, res) => {
  const base = `
    SELECT inspections.*, institutes.name AS institute_name, institutes.district,
           users.name AS assignee_name
    FROM inspections
    JOIN institutes ON institutes.id = inspections.institute_id
    LEFT JOIN users ON users.id = inspections.assigned_to
  `;

  let rows;
  if (req.user.role === 'pmu') {
    rows = db.prepare(`${base} WHERE inspections.assigned_to = ? ORDER BY inspections.created_at DESC`).all(req.user.id);
  } else {
    rows = db.prepare(`${base} ORDER BY inspections.created_at DESC`).all();
  }
  res.json({ inspections: rows });
});

// POST /api/inspections — create a fresh pending inspection for an institute
router.post('/', authenticate, authorize('admin', 'authority'), (req, res) => {
  const { instituteId, dueDate } = req.body || {};
  if (!instituteId) return res.status(400).json({ error: 'instituteId is required.' });

  const institute = db.prepare('SELECT id FROM institutes WHERE id = ?').get(instituteId);
  if (!institute) return res.status(404).json({ error: 'Institute not found.' });

  const info = db.prepare(
    `INSERT INTO inspections (institute_id, status, due_date) VALUES (?, 'pending', ?)`
  ).run(instituteId, dueDate || null);

  const inspection = db.prepare('SELECT * FROM inspections WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ inspection });
});

// POST /api/inspections/assign-random
// Picks every 'pending' inspection and randomly assigns it to one of the
// available PMU users. This is the core "random assignment through
// automation" feature from the brief — no manager hand-picks who goes where.
router.post('/assign-random', authenticate, authorize('admin', 'authority'), (req, res) => {
  const pendingInspections = db.prepare(
    `SELECT * FROM inspections WHERE status = 'pending'`
  ).all();

  if (pendingInspections.length === 0) {
    return res.json({ message: 'No pending inspections to assign.', assigned: [] });
  }

  const pmuUsers = db.prepare(`SELECT id, name, division FROM users WHERE role = 'pmu'`).all();
  if (pmuUsers.length === 0) {
    return res.status(400).json({ error: 'No PMU users exist to assign inspections to.' });
  }

  const update = db.prepare(
    `UPDATE inspections SET assigned_to = ?, status = 'assigned', assigned_at = datetime('now') WHERE id = ?`
  );

  const assigned = [];

  // Fisher-Yates shuffle of the PMU pool per inspection keeps assignment
  // unpredictable rather than a simple round-robin, which would still be
  // guessable by whoever is watching the roster.
  for (const inspection of pendingInspections) {
    const pool = [...pmuUsers];
    const randomIndex = Math.floor(Math.random() * pool.length);
    const chosenOfficer = pool[randomIndex];

    update.run(chosenOfficer.id, inspection.id);
    assigned.push({
      inspectionId: inspection.id,
      instituteId: inspection.institute_id,
      assignedTo: chosenOfficer.id,
      assigneeName: chosenOfficer.name,
    });
  }

  res.json({ message: `${assigned.length} inspection(s) randomly assigned.`, assigned });
});

// PATCH /api/inspections/:id/status — update status (e.g. in_progress, missed)
router.patch('/:id/status', authenticate, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['pending', 'assigned', 'in_progress', 'completed', 'missed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const inspection = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });

  // PMU users may only update inspections assigned to them.
  if (req.user.role === 'pmu' && inspection.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'This inspection is not assigned to you.' });
  }

  db.prepare('UPDATE inspections SET status = ? WHERE id = ?').run(status, req.params.id);
  const updated = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  res.json({ inspection: updated });
});

module.exports = router;
