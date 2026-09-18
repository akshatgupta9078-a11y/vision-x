// data/seed.js
// Run directly with: npm run seed
// Also imported by server.js to auto-seed on first boot (useful for cloud
// deploys where you can't easily run a separate one-off command).
// Safe to call multiple times — it skips records that already exist.

const bcrypt = require('bcryptjs');
const db = require('../db');

function upsertUser(name, email, plainPassword, role, division) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return false;
  const hash = bcrypt.hashSync(plainPassword, 10);
  db.prepare(
    'INSERT INTO users (name, email, password_hash, role, division) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hash, role, division);
  return true;
}

function upsertInstitute(name, type, district, address, lat, lng) {
  const existing = db.prepare('SELECT id FROM institutes WHERE name = ?').get(name);
  if (existing) return existing.id;
  const info = db.prepare(
    `INSERT INTO institutes (name, type, district, address, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, type, district, address, lat, lng);
  return info.lastInsertRowid;
}

function ensureInspection(instituteId) {
  const existing = db.prepare('SELECT id FROM inspections WHERE institute_id = ?').get(instituteId);
  if (existing) return false;
  db.prepare(
    `INSERT INTO inspections (institute_id, status, due_date) VALUES (?, 'pending', date('now','+3 days'))`
  ).run(instituteId);
  return true;
}

function seedIfEmpty({ verbose = true } = {}) {
  const log = (...args) => { if (verbose) console.log(...args); };

  log('Seeding VISION-X demo data...\n');

  const created = [];
  if (upsertUser('DoSJE Admin', 'admin@dosje.test', 'Admin@123', 'admin', 'Headquarters')) created.push('admin@dosje.test');
  if (upsertUser('Priya Sharma', 'priya.pmu@dosje.test', 'Pmu@1234', 'pmu', 'Jaipur Division')) created.push('priya.pmu@dosje.test');
  if (upsertUser('Rahul Verma', 'rahul.pmu@dosje.test', 'Pmu@1234', 'pmu', 'Jodhpur Division')) created.push('rahul.pmu@dosje.test');
  if (upsertUser('Asha Foundation', 'contact@ashafoundation.test', 'Ngo@1234', 'ngo', null)) created.push('contact@ashafoundation.test');
  if (upsertUser('District Authority - Jaipur', 'authority.jaipur@dosje.test', 'Auth@1234', 'authority', 'Jaipur District')) created.push('authority.jaipur@dosje.test');

  const id1 = upsertInstitute('Girls Hostel - Jaipur East', 'Hostel', 'Jaipur', 'Malviya Nagar, Jaipur', 26.85, 75.82);
  const id2 = upsertInstitute('Asha Skill Development Centre', 'Skill Centre', 'Jodhpur', 'Ratanada, Jodhpur', 26.28, 73.02);
  const id3 = upsertInstitute('Sunrise Day-Care Institute', 'Day Care', 'Udaipur', 'Fatehpura, Udaipur', 24.58, 73.68);
  [id1, id2, id3].forEach((id) => { if (id) ensureInspection(id); });

  if (created.length > 0) {
    log(`Created ${created.length} demo user(s): ${created.join(', ')}`);
  } else {
    log('Demo data already present — nothing new to create.');
  }

  log('\nDemo logins:');
  log('  admin@dosje.test / Admin@123        (DoSJE Admin — full access)');
  log('  priya.pmu@dosje.test / Pmu@1234     (PMU / Inspection team)');
  log('  contact@ashafoundation.test / Ngo@1234 (NGO / Institute)');
  log('  authority.jaipur@dosje.test / Auth@1234 (District Authority)');
}

// If run directly (npm run seed), execute immediately.
if (require.main === module) {
  seedIfEmpty();
}

module.exports = { seedIfEmpty };
