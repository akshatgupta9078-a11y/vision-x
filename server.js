// server.js
// Entry point. Run with: npm start
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const instituteRoutes = require('./routes/institutes');
const inspectionRoutes = require('./routes/inspections');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const { seedIfEmpty } = require('./data/seed');

// Auto-create demo accounts/institutes on first boot. Safe to run every
// startup — it only inserts records that don't already exist. This means
// a fresh cloud deploy works out of the box without a separate seed step.
try {
  seedIfEmpty({ verbose: true });
} catch (err) {
  console.error('Seeding skipped due to an error:', err.message);
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded evidence photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the frontend (login page, dashboard, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/institutes', instituteRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Fallback: send index.html for any unmatched non-API route so client-side
// links like /dashboard.html still resolve when typed directly.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Centralized error handler (e.g. multer file-type errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`\nVISION-X backend running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/login.html in your browser.\n`);
});
