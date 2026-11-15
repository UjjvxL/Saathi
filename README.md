# Saathi: elder care & medication management

Saathi ("companion") is a shared care circle for an elderly person, their family and their caretakers.
Everyone sees the same medicine schedule, marks doses as taken, tracks doctor appointments and gets
email reminders, while the elder stays in charge of their own care.

Built for the **PromptWars × Catalyst** challenge *Elderly Care & Medication Management Platform*.

## What it does

Saathi goes beyond reminders: when a dose isn’t confirmed, it makes sure **someone follows up**, and
everyone can see who did what.

| Challenge requirement | How Saathi does it |
| --- | --- |
| Shared ecosystem with secure, passcode-based access | Each elder profile has a public **Care ID** and a secret **6-digit passcode** (only a bcrypt hash is stored). Invitations **expire after 7 days** and admins can turn them off at any time; joining is rate-limited and admins are emailed when someone joins. Roles: **elder/owner, caretaker, family**, with permissions enforced on the server. |
| View, add, edit and manage medication schedules | Medicines with dose, form, instructions, several times a day, every day or chosen weekdays, start/end dates, an optional pill count and a **responsible person**. Caretakers and admins edit schedules; family can view. |
| Track adherence | Every dose is **Taken, Pending, Skipped, Missed** (recorded by a person) or **Unconfirmed** (nobody confirmed it in time). Saathi never marks a dose as taken by itself. |
| Monitor upcoming doctor appointments | Appointments with doctor, speciality, address and notes; edit, mark done or cancel, and assign who takes the elder. |
| Email reminders for upcoming doses, missed doses and appointments | **Smart escalation**: reminder when a dose is due → follow-up after 15 min → the **responsible caretaker** is alerted at 30 min → if nobody taps **“I’m on it”** within 15 min, the rest of the circle is alerted. Appointment reminders ~24 h and 2 h before, low-stock alerts and a **weekly summary** for the family. Every email is sent exactly once. |
| Go beyond a basic reminder app | **Care Circle dashboard** (who is responsible for what, pending and completed tasks, outstanding alerts), **Health Insights** (weekly adherence, missed-dose patterns, optional Gemini summary), an **accountability timeline**, a **voice-first Elderly mode**, **AI prescription scan**, one-tap confirm from email, and installable as an app (PWA). |
| Elder at the centre of their own decisions | The elder is always an admin, can’t be removed by others, is told when anyone joins, uses a simplified **Elderly mode** they can talk to, and every action is in the **care timeline** (“Priya acknowledged the 8:00 AM alert and is following up”). |

### The five upgrades

1. **Smart missed-medication escalation**: each dose slot moves through *pending → follow-up → unconfirmed → acknowledged → resolved*, with timestamps for every step (see [How reminders work](#how-reminders-work)). Caretakers acknowledge from the email (no login needed) or in the app, and the alert closes itself once the dose is recorded.
2. **Care Circle**: invitation codes, roles and a permission matrix, responsibilities for medicines and visits, a dashboard of pending and completed responsibilities, outstanding alerts and recent activity.
3. **Voice-first Elderly mode** (`/elder/<profile>`): large type and buttons, high contrast, one screen. A voice assistant (Web Speech API, no paid services) answers “What medicines do I need to take today?”, “Have I taken my morning medicines?”, “When is my next doctor’s appointment?” and records “I have taken my medicine”, always asking **“Is that right?”** first. It also speaks reminders aloud, and there’s a typed fallback where speech isn’t supported.
4. **Health Insights**: weekly adherence %, taken vs missed vs unconfirmed vs skipped, daily trend, frequently missed doses, recurring patterns over 28 days (only claimed with enough data), per-medicine history, upcoming visits and recent escalations. Everything is computed from recorded doses and shows the period and data used. An optional Gemini summary only sees aggregated numbers and is safety-checked (no advice, no new numbers), with a rule-based fallback.
5. **Accountability timeline**: every reminder, escalation, acknowledgement, dose update, responsibility and change, with who did it and the status after it. Filter by dates, event type and member.

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, Partial Prerendering) + **TypeScript**
- **Tailwind CSS 4**, Geist + Instrument Serif fonts, lucide icons
- **MongoDB Atlas** with Mongoose
- **Own authentication**: bcrypt password hashes, signed JWT session in an httpOnly cookie (jose), session versioning, rate limiting stored in MongoDB
- **Nodemailer** (Gmail SMTP) for email
- **Gemini API** (`@google/genai`) for prescription scanning
- **Vitest**, **Testing Library**, **mongodb-memory-server**, **Playwright** and **axe-core** for tests
- Deploys to **Vercel** (free) or **Google Cloud Run** (Dockerfile included); GitHub Actions for CI and the 5-minute reminder schedule

## Project structure

```
src/
  app/
    page.tsx                     Landing page
    (auth)/                      Log in, sign up, forgot / reset password
    (app)/dashboard              All care circles you belong to
    (app)/profiles/new           Create a care profile (shows Care ID + passcode once)
    (app)/join                   Join with Care ID + passcode
    (app)/p/[profileId]/         One elder's profile:
      page.tsx                     Today: dose timeline, mark taken, read aloud
      medications/                 List, add (scan or manual), edit
      appointments/                Upcoming & past visits
      history/                     Adherence charts + activity log
      circle/                      Members, passcode, reminder timing, settings
    confirm/                     "I've taken them" page opened from reminder emails
    actions/                     Server Actions (every one re-checks auth + input)
    api/cron/reminders           Reminder engine endpoint (called by Cloud Scheduler)
    api/profiles/[id]/scan       AI prescription reader
    api/auth/logout              Logout (full page reload clears the browser)
    api/health                   Health check
  components/                    UI (forms, dose timeline, buttons, ...)
  lib/
    auth/                        JWT, sessions, passwords, reset links, Data Access Layer, guards
    models.ts                    Mongoose models
    schedule.ts                  Pure timezone-aware dose scheduling
    reminders.ts                 Reminder & escalation engine
    data.ts                      Read queries for pages
    email/                       Email templates + sender
    ai/gemini.ts                 Gemini prescription reader
    validation.ts                Zod schemas for every input
  proxy.ts                       Redirects signed-out users to /login
tests/
  unit/                          Pure logic: scheduling, validation, tokens, emails
  integration/                   Server actions, reminders, data and API routes on a real MongoDB
  components/                    Interactive components in jsdom
e2e/                             Playwright journeys + automated accessibility checks
```

## Run it locally

Requirements: Node.js 20.9+ and a MongoDB database.

```bash
npm install
cp .env.example .env.local     # then fill it in (see below)
npm run dev                    # http://localhost:3000
```

### 1. MongoDB Atlas

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. **Database Access**: add a database user with a password.
3. **Network Access**: add your IP. For Cloud Run, allow `0.0.0.0/0` (Cloud Run has no fixed IP).
4. **Connect → Drivers**: copy the connection string into `MONGODB_URI` (put your password in it).

Collections and indexes are created automatically on first use.

### 2. Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB Atlas connection string |
| `MONGODB_DB` | no | Database name (default `saathi`) |
| `AUTH_SECRET` | yes | 32+ random characters for signing sessions: `openssl rand -base64 48` |
| `APP_URL` | yes* | Public URL, used in email links. *Optional on Vercel (the production domain is used automatically) |
| `CRON_SECRET` | yes | Secret the scheduler sends to the reminder endpoint: `openssl rand -hex 32` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | no | Email sending. Without them, emails are printed to the server console. |
| `EMAIL_OUTBOX_DIR` | no | Development only: also save previewed emails as JSON files in this folder |
| `REMINDER_INTERVAL_SECONDS` | no | How often the app checks reminders by itself (default 60 in dev, off in production) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | no | AI prescription scanning ([get a key](https://aistudio.google.com/apikey)) |

**Gmail:** turn on 2-Step Verification, create an [App Password](https://myaccount.google.com/apppasswords),
then use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, your Gmail address as `SMTP_USER` and the app
password as `SMTP_PASS`.

### 3. Reminders locally

During `npm run dev` the app checks reminders by itself every minute (see `src/instrumentation.ts`),
so emails arrive on time locally. You can also click **Care circle → Check reminders now** (admins) or
run `npm run reminders:local`. In production a scheduler calls `/api/cron/reminders` instead (see below).

## How reminders work

For each dose time (all medicines due at, say, 8:00 AM are grouped together):

| When *(defaults; admins can change them)* | What happens |
| --- | --- |
| When the dose is due | Elder + caretakers (+ the responsible person): reminder with an **I’ve taken them** button. Status: **Pending** |
| Still not confirmed after 15 min | Follow-up reminder to the same people |
| Still not confirmed after 30 min | The dose is recorded as **Unconfirmed** (never as taken) and an alert goes to the **responsible person**, or every caretaker and family member if nobody is responsible. Each gets a personal **I’m on it** link |
| Nobody acknowledged within 15 more minutes | The rest of the circle is alerted, once (no loops) |
| Someone acknowledges | Everyone sees who is following up; widening stops |
| The dose is recorded (taken, skipped or not taken) | The alert resolves itself |
| ~24 h and 2 h before an appointment | Everyone in the circle |
| Stock at or below the alert level | Everyone (once a day) |
| Monday morning | A summary of last week for the whole circle |

Each step is claimed in the database before anything is sent (unique keys, and a unique index on alerts),
so overlapping runs never send duplicates; if every send fails, the claim is released and the next run
retries. Every step is written to the timeline. Times follow the elder’s own timezone, and doses
scheduled before a medicine was added are never expected.

## Testing

| Layer | What it covers | Command |
| --- | --- | --- |
| Unit | Timezone-aware scheduling (incl. daylight saving), dose statuses, permissions, insights calculations, voice commands, validation, tokens, email privacy, security helpers | `npm run test:unit` |
| Integration | Every server action and permission, the escalation engine through every stage (fixed clock), acknowledgements, responsibilities, invitations, insights and timeline queries and API routes against a real in-memory MongoDB; Next.js request APIs mocked | `npm run test:integration` |
| Components | Forms, dose timeline, Elderly mode, scan review, text-size toggle, read aloud, copy, navigation (jsdom + Testing Library) | `npm run test:components` |
| End-to-end | Family journey (sign up → profile → medicine → caretaker joins → reminder email → elder confirms), escalation (reminder → follow-up → alert → “I’m on it” from email → dose recorded → timeline), role limits, voice assistant with simulated speech, insights, password reset, privacy between families; desktop and mobile Chrome | `npm run test:e2e` |
| Accessibility | axe-core WCAG 2.1 AA scans of every page; serious or critical issues fail the build | part of `npm run test:e2e` |

```bash
npm test                 # unit + integration + components (≈5 seconds)
npm run test:coverage    # the same, with a coverage report
npm run build && npm run test:e2e   # end-to-end in Google Chrome (starts its own server and database)
npm run test:all         # lint, types, all tests, build and end-to-end
```

Integration and end-to-end tests start a throwaway MongoDB automatically (`mongodb-memory-server`);
set `MONGODB_TEST_URI` to use an existing one instead. GitHub Actions runs everything on every push
(see `.github/workflows/ci.yml`), plus a Docker build.

## Deploy to Vercel (free)

The project is ready for Vercel's free Hobby plan. `vercel.json` pins the server functions to
Mumbai (`bom1`), next to the MongoDB Atlas cluster (AWS `ap-south-1`). Change it if your database lives
elsewhere, because every page makes several database calls.

1. **Push the code to GitHub.**
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import the repository. Vercel detects Next.js; keep the defaults.
3. Under **Environment Variables**, paste the contents of your `.env.local` (Vercel accepts a whole `.env` file pasted at once). Then:
   - generate a fresh `AUTH_SECRET` and `CRON_SECRET` for production (`openssl rand -base64 48`, `openssl rand -hex 32`);
   - leave out `APP_URL`: the production domain is detected automatically (or set it to your custom domain).
4. Click **Deploy**. Check `https://<your-app>.vercel.app/api/health` shows `"database":"ok"`.
5. In MongoDB Atlas, keep `0.0.0.0/0` in **Network Access** (Vercel has no fixed IP addresses).

### Reminders every 5 minutes

Vercel's free plan runs cron jobs **once a day** at most. `vercel.json` registers that daily run as a
backstop; the 5-minute schedule comes from one of these (both free):

- **GitHub Actions (already in the repo).** In GitHub go to **Settings → Secrets and variables → Actions** and
  add two repository secrets: `APP_URL` (your live address, e.g. `https://saathi.vercel.app`) and
  `CRON_SECRET` (same value as in Vercel). `.github/workflows/reminders.yml` then runs every 5 minutes;
  use **Actions → Reminders → Run workflow** to test it. GitHub can start scheduled runs a few minutes
  late, and it's only free for public repositories.
- **cron-job.org (most punctual).** Create a free account, add a cron job for
  `https://<your-app>.vercel.app/api/cron/reminders`, every 5 minutes, method `POST`, with the header
  `Authorization: Bearer <CRON_SECRET>`.

On Vercel Pro you can instead set the schedule in `vercel.json` to `*/5 * * * *`.

## Deploy to Google Cloud Run

```bash
gcloud run deploy saathi \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "MONGODB_URI=...,AUTH_SECRET=...,CRON_SECRET=...,APP_URL=https://<your-service-url>,SMTP_HOST=smtp.gmail.com,SMTP_PORT=465,SMTP_USER=...,SMTP_PASS=...,EMAIL_FROM=Saathi <you@gmail.com>,GEMINI_API_KEY=..."
```

After the first deploy, set `APP_URL` to the service URL Cloud Run gives you (redeploy or update the
variable). For real deployments, prefer `--set-secrets` with Secret Manager over plain env vars.

Then schedule the reminder engine every 5 minutes:

```bash
gcloud scheduler jobs create http saathi-reminders \
  --location asia-south1 \
  --schedule "*/5 * * * *" \
  --uri "https://<your-service-url>/api/cron/reminders" \
  --http-method POST \
  --headers "Authorization=Bearer <CRON_SECRET>"
```

## Security

- Passwords and passcodes are bcrypt-hashed; sessions are signed JWTs in httpOnly, SameSite cookies.
- **Role-based permissions are enforced in every Server Action and API route** (caretakers manage medicines, family can view, confirm doses, acknowledge alerts and handle visits, admins manage the circle). Hiding a button is never the only check.
- Invitations expire after 7 days and can be revoked; joining is rate-limited per Care ID, account and IP, and an expired code is only reported after a correct passcode.
- Assignees must be members of the circle; dose logs are only accepted for genuinely scheduled doses; all input is validated with Zod.
- **Email subjects and preview text never contain medicine names** (they show on lock screens).
- Email links use short-lived, single-purpose signed tokens: “I’ve taken them” (12 h, one time slot) and “I’m on it” (24 h, one alert and one member, who must still be in the circle). Opening a link changes nothing; a button press does.
- Resetting a password signs out every other device; reset links are single-use and expire in 30 minutes.
- The AI summary only receives aggregated numbers (no names or emails) and its answer is checked before it’s shown.
- API keys stay on the server; logout is a full page reload, so nothing stays on a shared device.
- Security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy allowing only camera and microphone for this site).
- Test-only switches (`E2E_ALLOW_CLOCK_OVERRIDE`, `RATE_LIMIT_SCALE`) are set by `e2e/start-server.mjs`; never set them in production.

## Accessibility

18px base text with **bigger-text** modes, high-contrast colours (WCAG AA, checked automatically with
axe-core), 48px+ touch targets (larger in Elderly mode), full keyboard support with visible focus,
labelled forms whose visible text is part of each button’s accessible name, screen-reader text, a
**voice assistant** and read-aloud reminders in Elderly mode, and reduced-motion support.

> Saathi helps families coordinate care. It doesn't replace advice from a doctor or pharmacist.
