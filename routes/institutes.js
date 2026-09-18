// routes/institutes.js
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/institutes — list all institutes (any logged-in role can view)
router.get('/', authenticate, (req, res) => {
  const { district } = req.query;
  let rows;
  if (district) {
    rows = db.prepare('SELECT * FROM institutes WHERE district = ? ORDER BY name').all(district);
  } else {
    rows = db.prepare('SELECT * FROM institutes ORDER BY name').all();
  }
  res.json({ institutes: rows });
});

// GET /api/institutes/:id
router.get('/:id', authenticate, (req, res) => {
  const institute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(req.params.id);
  if (!institute) return res.status(404).json({ error: 'Institute not found.' });
  res.json({ institute });
});

// POST /api/institutes — create a new institute (admin or authority only)
router.post('/', authenticate, authorize('admin', 'authority'), (req, res) => {
  const {
    name, type, district, address,
    ngoContactName, ngoContactPhone,
    latitude, longitude, cctvStreamUrl,
  } = req.body || {};

  if (!name || !type || !district) {
    return res.status(400).json({ error: 'name, type and district are required.' });
  }

  const info = db.prepare(
    `INSERT INTO institutes
      (name, type, district, address, ngo_contact_name, ngo_contact_phone, latitude, longitude, cctv_stream_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, type, district, address || null,
    ngoContactName || null, ngoContactPhone || null,
    latitude ?? null, longitude ?? null, cctvStreamUrl || null
  );

  const institute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ institute });
});

// PUT /api/institutes/:id — update an institute
router.put('/:id', authenticate, authorize('admin', 'authority'), (req, res) => {
  const existing = db.prepare('SELECT * FROM institutes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Institute not found.' });

  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE institutes SET
      name = ?, type = ?, district = ?, address = ?,
      ngo_contact_name = ?, ngo_contact_phone = ?,
      latitude = ?, longitude = ?, cctv_stream_url = ?
     WHERE id = ?`
  ).run(
    merged.name, merged.type, merged.district, merged.address,
    merged.ngo_contact_name, merged.ngo_contact_phone,
    merged.latitude, merged.longitude, merged.cctv_stream_url,
    req.params.id
  );

  const institute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(req.params.id);
  res.json({ institute });
});

// DELETE /api/institutes/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM institutes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Institute not found.' });
  res.json({ message: 'Institute deleted.' });
});

module.exports = router;
