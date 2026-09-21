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

  // Track each officer's total assignment count in the last 30 days, so the
  // pick can be biased away from whoever already has the heaviest recent
  // load — this keeps the choice random (fair to predict) while stopping
  // the same one or two officers from being picked far more than everyone
  // else purely by chance over many rounds.
  const countRows = db.prepare(`
    SELECT assigned_to AS officerId, COUNT(*) AS n
    FROM inspections
    WHERE assigned_to IS NOT NULL AND assigned_at >= datetime('now', '-30 days')
    GROUP BY assigned_to
  `).all();
  const loadCount = {};
  pmuUsers.forEach((o) => { loadCount[o.id] = 0; });
  countRows.forEach((row) => { loadCount[row.officerId] = row.n; });

  const assigned = [];

  for (const inspection of pendingInspections) {
    // Pick randomly among whichever officer(s) currently have the fewest
    // assignments in the last 30 days — a "least-loaded, then random" pick.
    const minLoad = Math.min(...pmuUsers.map((o) => loadCount[o.id]));
    const leastLoaded = pmuUsers.filter((o) => loadCount[o.id] === minLoad);
    const chosenOfficer = leastLoaded[Math.floor(Math.random() * leastLoaded.length)];

    update.run(chosenOfficer.id, inspection.id);
    loadCount[chosenOfficer.id] += 1; // so the next pick in this same batch also balances

    assigned.push({
      inspectionId: inspection.id,
      instituteId: inspection.institute_id,
      assignedTo: chosenOfficer.id,
      assigneeName: chosenOfficer.name,
    });
  }

  res.json({ message: `${assigned.length} inspection(s) randomly assigned.`, assigned });
});

// PUT /api/inspections/:id — admin-only: edit due date and/or manually
// reassign the officer. This is separate from the random-assign engine —
// it's an explicit admin override, so both actions are always available
// as a matched pair rather than as silent side effects of each other.
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { dueDate, assignedTo } = req.body || {};

  const inspection = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });

  let newAssignedTo = inspection.assigned_to;
  let newStatus = inspection.status;

  if (assignedTo !== undefined) {
    if (assignedTo === null || assignedTo === '') {
      newAssignedTo = null;
      newStatus = 'pending';
    } else {
      const officer = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'pmu'`).get(assignedTo);
      if (!officer) return res.status(400).json({ error: 'assignedTo must be an existing PMU user.' });
      newAssignedTo = assignedTo;
      // Manually assigning a pending/unassigned inspection moves it to 'assigned'.
      if (inspection.status === 'pending') newStatus = 'assigned';
    }
  }

  const newDueDate = dueDate !== undefined ? dueDate : inspection.due_date;

  db.prepare(
    `UPDATE inspections SET due_date = ?, assigned_to = ?, status = ?,
       assigned_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE assigned_at END
     WHERE id = ?`
  ).run(newDueDate, newAssignedTo, newStatus, newAssignedTo, req.params.id);

  const updated = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  res.json({ inspection: updated });
});

// DELETE /api/inspections/:id — admin-only: remove an inspection entirely.
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM inspections WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Inspection not found.' });
  res.json({ message: 'Inspection deleted.' });
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
