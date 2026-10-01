# TuskMed Teleconsult

A web-based doctor teleconsultation platform: patients log in with WhatsApp
OTP, manage multiple family member profiles, find a doctor (browse or
describe symptoms), book video/in-clinic appointments against live
availability, pay online with optional promo codes, join the video call
from their appointments list, and receive digital prescriptions and
reports. Admins manage doctors, slots and payments through the same
passwordless login.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + React Router + Tailwind CSS |
| Backend | Node.js + Express (REST over HTTPS in production) |
| Database | PostgreSQL via Prisma ORM (migrations + seed) |
| Realtime | Socket.IO (live slot availability) |
| Auth | Mobile + OTP only, no passwords, JWT httpOnly session cookie |

### The four required external integrations

All four are abstracted behind a thin module in `server/src/integrations/`
and default to a **mock mode** (`MOCK_INTEGRATIONS=true`) that needs no
credentials at all — the whole booking/payment/video/upload lifecycle works
out of the box for local dev and the automated tests. Flip in real
sandbox keys and the same code paths call the real APIs.

1. **WhatsApp Business messaging** (OTP + reminders) — `integrations/whatsapp.js`,
   targets the Meta WhatsApp Cloud API. Mock mode logs the message and
   returns the OTP in the API response (`devCode`) so you can log in without
   a real WhatsApp number.
2. **Payment gateway** (no raw card data ever touches this server) —
   `integrations/payment.js`, targets Razorpay via the official SDK: order
   creation, checkout signature verification, webhook verification, and
   refunds. Mock mode simulates orders/signatures/refunds deterministically.
3. **WebRTC video calling** — `integrations/video.js`, targets Daily.co's
   REST API (a room is created once, at payment confirmation, and its URL
   is stored on the appointment). Mock mode returns a fake room URL; the
   frontend falls back to a local camera/mic preview so mute/video/end-call
   are still demonstrably real.
4. **Cloud file storage** — `integrations/storage.js`, targets any
   S3-compatible bucket. Mock mode writes to `server/uploads/` and serves
   it statically.

## Project layout

```
server/            Express API, Prisma schema/migrations/seed, Jest tests
  prisma/schema.prisma   Full data model (accounts, patients, doctors,
                         slots, appointments, payments, promo codes,
                         reports, prescriptions, documents, tickets, ...)
  src/routes/            One router per feature area
  src/integrations/      The four external service abstractions
  src/jobs/slotSweeper.js  Releases expired slot locks
  tests/                 auth / booking (slot-lock+payment) / active-patient
client/            React SPA (Vite)
  src/pages/patient/     Dashboard, Doctors, Post Query, Book Appointment,
                         Appointments, Video Call, Support, Messages, ...
  src/pages/doctor/      Doctor dashboard + report/prescription authoring
  src/pages/admin/       Admin panel (tabs per management area)
docker-compose.yml Local Postgres for development
```

## Setup

### Prerequisites
- Node.js 18+
- Docker (for local Postgres) — or point `DATABASE_URL` at any Postgres 14+

### 1. Database
```bash
docker compose up -d db     # Postgres on localhost:5433
```

### 2. Backend
```bash
cd server
cp .env.example .env        # defaults already work with the compose DB
npm install
npm run prisma:migrate      # creates schema (or: npm run prisma:push)
npm run seed                # specialities, doctors, slots, promo codes, admin account
npm run dev                 # http://localhost:4000
```

The seed script creates:
- An **admin** account (`8101421053`)
- Six **doctors** across different specialities (each with a linked login mobile, e.g. `+919000000001`)
- Five days of morning/afternoon **slots** (video + in-clinic) per doctor
- Promo codes: `WELCOME10` (10% off), `FLAT100` (20% off), `EXPIRED5` (already expired, for testing)

In mock mode, the OTP endpoint's response includes `devCode` — use it directly
instead of checking WhatsApp.

### 3. Frontend
```bash
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api and /socket.io to :4000)
```

Log in with any of the seeded mobile numbers above (or a brand new number,
which self-registers as a patient), grab the `devCode` from the OTP request
response (shown in the sandbox banner on the login screen), and go.

### 4. Tests
```bash
cd server
npm test
```

Covers, per the required scope:
- **OTP login**: request → verify → session; wrong code; resend cooldown;
  max-attempt lockout; re-using a consumed OTP session; policy acceptance.
- **Slot-lock / payment path**: booking atomically locks a slot so a second
  patient racing for the same slot is rejected (`409 SLOT_UNAVAILABLE`);
  successful payment confirms the appointment and books the slot; failed
  payment releases the slot back to `AVAILABLE` so it can be rebooked;
  promo code preview returns `valid` / `invalid` / `expired` correctly.
- **Active-patient scoping**: booking is rejected with no active patient
  selected; the first registered family member becomes active
  automatically; appointments booked under one active patient are not
  visible when a different patient is switched active on the same account;
  an account cannot activate a patient profile it doesn't own.

## Core rules and how they're enforced

- **Active-patient context** — `Account.activePatientId` persists server-side
  (not just client state), so it survives across devices/tabs. The
  `requireActivePatient` middleware re-validates ownership on every write
  (booking, document upload, post-query) — see
  `server/src/middleware/activePatient.js`.
- **No double-booking** — booking a slot does an atomic conditional update
  (`UPDATE slots SET status='LOCKED' WHERE id=? AND status='AVAILABLE'`), so
  two concurrent requests can't both win the same slot. At the DB level, a
  **partial unique index** (`appointment_active_slot_unique`, see
  `prisma/migrations/.../slot_partial_unique/migration.sql`) guarantees a
  slot can never have more than one *non-cancelled* appointment — while
  still allowing a slot to be released and rebooked after a failed/expired
  payment attempt. A background sweeper (`src/jobs/slotSweeper.js`) releases
  locks whose payment window timed out.
- **Fee transparency** — `GET /api/appointments/promo/preview` computes the
  exact discount/final amount before the patient commits; Book Appointment
  step 3 shows it live as the promo code is typed.

## Environment variables

See `server/.env.example` for the full list (OTP rules, slot lock duration,
join-call window, and all four integrations' credentials). Everything has a
safe default for local development.

## Notes on scope

This is a complete, runnable reference implementation of the spec — not a
UI mockup. Every route in the backend is backed by real Prisma queries
against Postgres, and the flows above have been exercised end-to-end
(both via the Jest suite and manual `curl` smoke tests) against a live
Postgres instance during development. Production hardening you'd still want
before a real launch: HTTPS termination (the app assumes a TLS-terminating
proxy in front of it), structured log shipping, retry/backoff around the
external APIs, and a real S3/Daily/Razorpay/WhatsApp account per environment.
