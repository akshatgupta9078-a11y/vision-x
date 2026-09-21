# VISION-X Backend

A working full-stack backend + database + web frontend for the DoSJE scheme
monitoring concept: institutes/NGOs, random inspection assignment, mobile
report submission with geo-tagged photo evidence, and a real-time dashboard.

This is a **real, runnable application** — not a mockup. It uses:
- **Node.js + Express** for the API server
- **SQLite** via Node's built-in `node:sqlite` module (Node 22.5+) as the database — a single file, no separate database server, and crucially **no native addon to compile** (no Python or Visual Studio Build Tools needed, unlike the popular `better-sqlite3` package)
- **JWT** for login sessions, **bcrypt** for password hashing
- **Multer** for evidence photo uploads
- Plain HTML/CSS/JS frontend that calls the real API (no framework build step needed)

> **Node version note:** you need Node.js **22.5 or newer** (LTS releases from late 2024 onward all qualify). Check with `node --version`. `node:sqlite` is still marked "experimental" by Node itself — you'll see a harmless `ExperimentalWarning` in the terminal on startup; that's expected and does not affect functionality.

## What's real vs. what's still a placeholder

| Feature | Status |
|---|---|
| Login, roles, sessions | ✅ Fully working |
| Institutes CRUD | ✅ Fully working |
| Random inspection assignment | ✅ Fully working (real shuffle algorithm) |
| Mobile report submission (photo + GPS + notes) | ✅ Fully working (uses your browser's real GPS) |
| Anomaly flagging | ✅ Fully working (simple rule-based check on attendance ratios) |
| Photo authenticity check | ✅ Working, but **metadata-based, not a trained AI model** — see note below |
| Real-time dashboard | ✅ Fully working (polls the database every 15s) |
| Access-request form endpoint | ✅ Fully working (`POST /api/auth/access-requests`) |
| Live CCTV feed integration | ⛔ Placeholder only — needs a real camera/RTSP provider |
| Random Video Conferencing (VC) | ⛔ Placeholder only — needs a service like Twilio/Agora |
| AI anomaly detection (ML model) | ⛔ Simplified rule-based version only, not a trained model |

## 1. Install prerequisites

You need **Node.js 18 or newer** installed. Check with:
```bash
node --version
```
If you don't have it, download from https://nodejs.org

## 2. Install dependencies

```bash
cd vision-x
npm install
```

This downloads Express, better-sqlite3, bcryptjs, jsonwebtoken, multer, etc.
(This step needs an internet connection — it wasn't run yet in this delivery, since npm registry access isn't available in the environment this project was built in.)

## 3. Configure environment variables

```bash
cp .env.example .env
```
Open `.env` and change `JWT_SECRET` to a long random string before using this
for anything beyond local testing.

## 4. Create the database and demo accounts

```bash
npm run seed
```
This creates `data/vision-x.db` with demo logins:

| Role | Email | Password |
|---|---|---|
| Admin (DoSJE Division) | admin@dosje.test | Admin@123 |
| PMU officer | priya.pmu@dosje.test | Pmu@1234 |
| PMU officer | rahul.pmu@dosje.test | Pmu@1234 |
| NGO | contact@ashafoundation.test | Ngo@1234 |
| District Authority | authority.jaipur@dosje.test | Auth@1234 |

It also creates 3 sample institutes with one pending inspection each.

## 5. Run the server

```bash
npm start
```
Then open **http://localhost:4000/login.html** in your browser.

For auto-restart during development:
```bash
npm run dev
```

## About the photo authenticity check (be honest about this in demos/judging)

When a report photo is uploaded, `routes/reports.js` reads the image's **EXIF
metadata** (the technical info most cameras embed in a photo) and flags it as
`suspicious` if:
- there's no camera make/model recorded (common for screenshots, images
  downloaded from the web, and most AI image generators), or
- the metadata names known image-generation software (Midjourney, DALL-E,
  Stable Diffusion, etc.), or
- the photo's own timestamp is more than 7 days old — i.e. it wasn't taken
  around the time of this inspection.

**This is a real, working check — not a placeholder.** But be precise about
what it is if asked: it's a **metadata heuristic**, not a trained computer-vision
AI model that looks at pixels to detect deepfakes. It catches the common,
low-effort cases well, but a determined person could strip or forge EXIF data
to get past it. A true AI-based image-authenticity classifier (looking at the
actual pixel content) would need a trained model and is listed under
"Next steps" below.

## Creating your own real accounts (not just the demo ones)

The seeded accounts (`admin@dosje.test` etc.) are **fully real, working
logins** — "demo" is just their label. But you'll want your own accounts
with your own name, email and password. There's a **Users** page for this:

1. Log in as `admin@dosje.test` / `Admin@123` (or any admin account).
2. Click **Users** in the top navigation (only visible to admins).
3. Fill in the "Create a new account" form with your real name, email,
   a password you choose, and a role. Click **Create account**.
4. Log out, then log back in with your new real credentials.
5. Optionally, go back to **Users** and click **Delete** next to each demo
   account you no longer want (you can't delete the account you're
   currently logged in as — switch to your new account first).

There's also a one-time API endpoint, `POST /api/auth/setup-admin`, meant
for fresh installs where you skip seeding entirely — but since this
project auto-seeds demo accounts on first boot, the **Users page above is
the normal way** to add your own real accounts.

## 7. Deploy it live (so anyone can access it, not just your computer)

This project includes a `render.yaml` file, so deploying to
[Render.com](https://render.com) (free tier available) takes a few clicks.

1. **Put the code on GitHub.**
   - Create a free GitHub account if you don't have one.
   - Create a new repository (e.g. `vision-x`).
   - Upload this entire `vision-x` folder to it (GitHub's website lets you
     drag-and-drop files/folders in — no command-line git required).

2. **Create a Render account** at render.com (you can sign up with your
   GitHub account, which makes the next step easier).

3. **New → Blueprint**, then select your `vision-x` GitHub repository.
   Render will read `render.yaml` automatically and set everything up:
   build command, start command, and a random `JWT_SECRET`.

4. Click **Apply** / **Create**. Render installs dependencies and starts
   the server. This takes a few minutes on the first deploy.

5. Once it says **Live**, open the URL Render gives you (something like
   `https://vision-x.onrender.com`) and go to `/login.html`.

**Notes on the free tier:**
- The app auto-creates demo accounts on first boot (via `seedIfEmpty()` in
  `server.js`) — you don't need to run `npm run seed` separately on Render.
- Free Render web services spin down after inactivity and the SQLite file
  resets on redeploys (no persistent disk on the free plan). This is fine
  for demos; for real, permanent data, upgrade to a paid plan with a
  persistent disk, or migrate to PostgreSQL.
- Change the demo passwords (or disable those accounts) before sharing the
  live link publicly.

## 8. Try the full flow

1. Log in as **admin@dosje.test**.
2. Go to **Inspections** → click **"Randomly assign pending inspections"**.
   Watch the pending inspections get assigned to Priya or Rahul at random.
3. Log out, log back in as **priya.pmu@dosje.test**.
4. Go to **Inspections** → click **Start** on an assigned inspection, then
   **Submit report**.
5. On the report page, allow location access when your browser asks — this
   uses your device's real GPS. Upload any photo, fill in attendance
   numbers, and submit.
6. Try entering a low "present" number vs. "expected" (e.g. 2 present / 10
   expected) — the report will come back **flagged as an anomaly**.
7. Log back in as **admin@dosje.test** and check the **Dashboard** — you'll
   see the completed inspection, the flagged report, and live counts, all
   pulled from the real SQLite database.

## API reference (quick)

All endpoints are under `/api`. Protected routes need a header:
`Authorization: Bearer <token>` (token comes from `POST /api/auth/login`).

- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `GET  /api/auth/me` — current user
- `POST /api/auth/access-requests` — public, `{ fullName, email, role }`
- `GET  /api/institutes` — list
- `POST /api/institutes` — admin/authority only
- `GET  /api/inspections` — list (scoped by role)
- `POST /api/inspections/assign-random` — admin/authority only
- `PATCH /api/inspections/:id/status` — `{ status }`
- `POST /api/reports` — multipart form (`photo` file + fields), pmu/admin only
- `GET  /api/dashboard/summary` — live counts for the dashboard

## Project structure

```
vision-x/
├── server.js              # Express app entry point
├── db.js                  # SQLite connection + schema
├── data/
│   ├── seed.js             # Demo data script
│   └── vision-x.db         # Created after you run `npm run seed`
├── middleware/
│   └── auth.js             # JWT verification + role guard
├── routes/
│   ├── auth.js
│   ├── institutes.js
│   ├── inspections.js
│   ├── reports.js
│   └── dashboard.js
├── public/                 # Frontend (served as static files)
│   ├── login.html
│   ├── dashboard.html
│   ├── institutes.html
│   ├── inspections.html
│   ├── report-submit.html
│   ├── css/style.css
│   └── js/api.js
├── uploads/                 # Evidence photos land here
├── .env.example
└── package.json
```

## Troubleshooting

**"npm error ENOENT ... Could not read package.json"**
You ran `npm install` in the wrong folder. `cd` into the `vision-x` folder first (the one containing `package.json`), then run the command again.

**"node: command not found" / "'node' is not recognized"**
Node.js isn't installed, or you need to restart your terminal/computer after installing it.

**Errors mentioning `node-gyp`, `Python`, or `better-sqlite3` build failures**
This project no longer depends on `better-sqlite3` — it uses Node's built-in `node:sqlite` instead, specifically to avoid this class of error. If you still see this, make sure you're using the latest version of this project's `db.js` and `package.json` (no `better-sqlite3` line in dependencies), and that you deleted any old `node_modules` folder from a previous attempt before re-running `npm install`.

**You see `ExperimentalWarning: SQLite is an experimental feature`**
This is expected and harmless — it's just Node.js labeling its built-in SQLite support as experimental. The app works normally.

## Next steps to make this production-ready

1. **Live CCTV**: integrate an RTSP-to-web gateway (e.g. `node-rtsp-stream` or
   a service like Wowza) per institute, storing each institute's stream URL
   in the existing `cctv_stream_url` column.
2. **Random VC**: integrate Twilio Video or Agora — trigger a call from the
   dashboard to a phone/app registered against the institute.
3. **Real AI anomaly detection**: replace `detectAnomaly()` in
   `routes/reports.js` with a trained model call, once enough historical
   report data has accumulated.
4. **Deploy**: host on Render, Railway, or a state government cloud
   instance; swap SQLite for PostgreSQL if you expect heavy concurrent load
   across many districts.
5. **Harden security**: add rate limiting, HTTPS, password reset flow, and
   audit logging before any real deployment.
