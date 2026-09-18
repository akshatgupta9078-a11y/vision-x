// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const passwordMatches = bcrypt.compareSync(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    division: user.division,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: payload });
});

// GET /api/auth/me — return the currently authenticated user
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/access-requests — public form submission (no login required)
// This is what the "Request access" form on the marketing site should call.
router.post('/access-requests', (req, res) => {
  const { fullName, email, role } = req.body || {};

  if (!fullName || !email || !role) {
    return res.status(400).json({ error: 'fullName, email and role are all required.' });
  }

  const info = db.prepare(
    'INSERT INTO access_requests (full_name, email, requested_role) VALUES (?, ?, ?)'
  ).run(fullName.trim(), email.trim().toLowerCase(), role.trim());

  res.status(201).json({ id: info.lastInsertRowid, message: 'Access request received.' });
});

// GET /api/auth/access-requests — admin-only list of submitted requests
router.get('/access-requests', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can view access requests.' });
  }
  const rows = db.prepare('SELECT * FROM access_requests ORDER BY created_at DESC').all();
  res.json({ requests: rows });
});

// POST /api/auth/signup — PUBLIC self-registration. Anyone can create their
// own account here, like a real open platform. Admin role is deliberately
// excluded from public signup — only an existing admin can create another
// admin (via POST /api/auth/users) or hand-pick one via /setup-admin.
router.post('/signup', (req, res) => {
  const { name, email, password, role, division } = req.body || {};
  const publicRoles = ['pmu', 'ngo', 'authority'];

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are all required.' });
  }
  if (!publicRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${publicRoles.join(', ')}. Admin accounts are created by an existing admin.` });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Try logging in instead.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, division) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), normalizedEmail, hash, role, division || null);

  const payload = {
    id: info.lastInsertRowid,
    name: name.trim(),
    email: normalizedEmail,
    role,
    division: division || null,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  res.status(201).json({ token, user: payload, message: 'Account created successfully.' });
});

// POST /api/auth/setup-admin — public, but only works ONCE (while the
// system has zero users). This is how you create your first REAL admin
// account, replacing reliance on the seeded demo accounts.
router.post('/setup-admin', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are all required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) {
    return res.status(403).json({
      error: 'Setup has already been completed. Ask an existing admin to create your account instead (POST /api/auth/users).',
    });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, division) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), email.trim().toLowerCase(), hash, 'admin', 'Headquarters');

  res.status(201).json({
    message: 'Real admin account created. You can now log in with this email and password.',
    userId: info.lastInsertRowid,
  });
});

// POST /api/auth/users — admin-only, create a new real user of any role.
router.post('/users', authenticate, authorize('admin'), (req, res) => {
  const { name, email, password, role, division } = req.body || {};
  const allowedRoles = ['admin', 'pmu', 'ngo', 'authority'];

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are all required.' });
  }
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, division) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), normalizedEmail, hash, role, division || null);

  res.status(201).json({
    user: { id: info.lastInsertRowid, name: name.trim(), email: normalizedEmail, role, division: division || null },
  });
});

// GET /api/auth/users — admin-only, list all real accounts in the system.
router.get('/users', authenticate, authorize('admin'), (req, res) => {
  const rows = db.prepare('SELECT id, name, email, role, division, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users: rows });
});

// DELETE /api/auth/users/:id — admin-only, remove an account (e.g. a demo one).
router.delete('/users/:id', authenticate, authorize('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account while logged in as it.' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ message: 'User deleted.' });
});

module.exports = router;
