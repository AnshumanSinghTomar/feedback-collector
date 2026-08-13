# Feedback Collector

A full-stack feedback platform. Admins build custom forms — conditional
questions, deadlines, targeted recipients, anonymous responses — publish
announcements, and manage accounts. Users fill in the forms shared with them and
can revise their answers while a form stays open.

React (MUI) frontend, Express + Prisma + PostgreSQL backend, JWT auth with
revocable sessions and two roles.

**Try it without signing up:** the sign-in screen has *Demo Admin* and
*Demo User* buttons. They share a sandboxed workspace, so demo forms are
invisible to real accounts and vice versa.

**Zero-setup install:** with Docker installed, `docker compose up` is the only
command you need — see [Run with Docker](#run-with-docker-easiest).

---

## Table of Contents
- [Run with Docker (easiest)](#run-with-docker-easiest)
- [Quick Start (manual)](#quick-start-manual)
- [Detailed Setup](#detailed-setup)
- [Environment Variables](#environment-variables)
- [First Login](#first-login)
- [Using the App](#using-the-app)
- [Making Changes](#making-changes)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Roles & Permissions](#roles--permissions)
- [How Key Rules Work](#how-key-rules-work)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Run with Docker (easiest)

**Only requirement: [Docker Desktop](https://www.docker.com/products/docker-desktop/).**
No Node.js, no PostgreSQL, no database setup — Docker starts Postgres, applies
the migrations, seeds the accounts and runs both servers for you.

```bash
git clone https://github.com/AnshumanSinghTomar/feedback-collector.git
cd feedback-collector
docker compose up
```

First run takes a few minutes while images download and dependencies install.
When you see `Compiled successfully!`, open **http://localhost:3000**.

Sign in with the **Demo Admin** button, or `admin@example.com` / `admin123`.

| Command | What it does |
|---|---|
| `docker compose up` | Start everything (Ctrl+C to stop) |
| `docker compose up -d` | Start in the background |
| `docker compose down` | Stop and remove the containers |
| `docker compose down -v` | Also delete the database volume — full reset |
| `docker compose logs -f server` | Tail the API logs |
| `docker compose up --build` | Rebuild after changing dependencies |

What runs where:

| Service | Port | Notes |
|---|---|---|
| `client` | 3000 | React dev server |
| `server` | 5000 | Express API; runs migrations + seed on startup |
| `db` | 5432 | PostgreSQL 16; data persists in the `dbdata` volume |

Postgres is published on `5432`, so you can point pgAdmin at
`localhost:5432` with user `postgres`, password `postgres`, database
`feedback_collector` if you want to inspect the tables.

> The credentials in `docker-compose.yml` are deliberate throwaways for local
> use. Anything deployed publicly needs a real `JWT_SECRET` and database
> password supplied as secrets, not committed values.

---

## Quick Start (manual)

Prefer running things natively, or don't want Docker? This path needs
**Node.js 18+, PostgreSQL 12+, and Git.**

```bash
# 1. Clone
git clone https://github.com/AnshumanSinghTomar/feedback-collector.git
cd feedback-collector

# 2. Create the database (any Postgres client works)
#    psql -U postgres -c "CREATE DATABASE feedback_collector;"

# 3. Backend
cd server
npm install
cp .env.example .env          # Windows: copy .env.example .env
#    → edit .env and set DATABASE_URL + JWT_SECRET
npx prisma migrate deploy     # creates all 10 tables
npm run seed                  # creates the admin + demo accounts
npm run dev                   # http://localhost:5000

# 4. Frontend — in a second terminal
cd client
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm start                     # http://localhost:3000
```

Open `http://localhost:3000` and either click **Demo Admin**, or sign in as
`admin@example.com` / `admin123`.

> Both servers must be running at once. The backend on port 5000 and the
> frontend on port 3000 are two separate processes in two separate terminals.

---

## Detailed Setup

### 1. Database

Create an empty PostgreSQL database. Nothing else is needed — Prisma creates
every table.

```sql
CREATE DATABASE feedback_collector;
```

No Postgres? Point Prisma at SQLite instead by changing the provider in
`server/prisma/schema.prisma` to `sqlite` and setting
`DATABASE_URL="file:./dev.db"`. You'll then need `npx prisma migrate dev`
rather than `migrate deploy`, since the committed migration is Postgres SQL.

### 2. Backend

```bash
cd server
npm install
```

Copy the env template and fill it in:

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Then apply the schema and seed the starting accounts:

```bash
npx prisma migrate deploy   # applies migrations to a fresh database
npm run seed                # admin + two demo accounts
npm run dev                 # nodemon, restarts on change
```

You should see `Server running on http://localhost:5000`. Visiting that URL
directly returns `Feedback Collector API is running.`

### 3. Frontend

```bash
cd client
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start
```

Compiles and opens `http://localhost:3000`.

---

## Environment Variables

### `server/.env`
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `PORT` | no | API port, defaults to `5000` |
| `JWT_SECRET` | yes | Signs session tokens. Use a long random string — anyone holding it can forge logins |
| `ADMIN_SIGNUP_CODE` | yes | Must be typed on the signup form to create an `ADMIN`. Without it, self-registration can only produce a `USER` |

```dotenv
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/feedback_collector?schema=public"
PORT=5000
JWT_SECRET="a-long-random-string-you-generate"
ADMIN_SIGNUP_CODE="your-own-code"
```

### `client/.env`
| Variable | Required | Purpose |
|---|---|---|
| `REACT_APP_API_URL` | yes | Backend API base URL |

```dotenv
REACT_APP_API_URL=http://localhost:5000/api
```

> `.env` files are gitignored. Only `.env.example` is committed. Never commit
> real credentials — and note that Create React App bakes `REACT_APP_*` values
> into the built JS bundle, so never put a secret in `client/.env`.

---

## First Login

`npm run seed` creates three accounts:

| Account | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@example.com` | `admin123` | Change this immediately for anything but local use |
| Demo Admin | `demo.admin@example.com` | none | Sign in via the **Demo Admin** button |
| Demo User | `demo.user@example.com` | none | Sign in via the **Demo User** button |

Demo accounts have random unusable passwords — the buttons are the only way in.
They live in a sandbox: forms and announcements created by the demo admin are
visible only to the demo user, never to real accounts.

To create your own admin, register normally, pick **Admin**, and enter the
`ADMIN_SIGNUP_CODE` from `server/.env`.

---

## Using the App

A five-minute walkthrough of the whole feature set. Open two browser windows
(or one normal + one incognito) so you can be admin and user at the same time.

### As an admin

1. Sign in with **Demo Admin**, or `admin@example.com` / `admin123`.
2. **Create a Form** — the builder is the first panel.
   - Type a title, e.g. `Team Health Check`.
   - Click a preset chip (**NPS**, **Satisfaction**, **Retro**) to prefill
     questions, or build your own.
   - Add questions with **Add Question**, pick a type per question, and tick
     **Required** where needed.
   - For choice types, fill in the options; **Add Option** adds more.
   - Optional: set **Closes On** to auto-close the form, choose **Recipients**
     to target specific people (empty = everyone), tick **Hide respondent
     names** for anonymity, or flip **Keep as draft** to hold it back.
   - Click **Publish Form**.
3. The form appears under **Active Feedbacks**. Each card offers:
   - **Responses** — analytics, individual answers, and who hasn't replied
   - **CSV** — download all responses as a spreadsheet
   - **Edit** — reopen it in the builder
   - **Duplicate** — start a copy as a new draft
   - **Close** / **Reopen** — stop or resume accepting responses
   - **Delete** — remove the form and its responses
4. **Post an Announcement** publishes a message to the Announcements board.
5. **Users** lets you promote, demote, deactivate and reactivate accounts.
6. **Activity Log** records every admin action with who and when.

### As a user

1. In the second window, sign in with **Demo User**.
2. The new form is under **Active Feedbacks** — click **Fill Out**.
3. Answer and **Submit Response**. Conditional questions appear only once the
   answer they depend on matches.
4. The form moves to **Filled Feedbacks**, where **Edit Response** lets you
   revise it for as long as the form stays open.
5. The **bell icon** shows a notification for each newly published form.

### Back as the admin

1. Click **Responses** on the form. You'll see per-question analytics — averages
   for ratings, bar distributions for choice questions — then each individual
   response, and a **Still waiting on** list of people who haven't answered.
2. Click **CSV** to export.
3. Try **Close**, and watch the form move to **Closed Feedbacks** on both sides.

### Other things to try

- **Dark mode** — the sun/moon icon in the header. The choice saves to your
  account, so it follows you to another browser.
- **Account** → change your password. Every *other* signed-in session is
  signed out automatically.
- **Sign Out**, then confirm the old session is genuinely dead rather than just
  cleared locally.

---

## Making Changes

### Editing code
Both dev servers hot-reload. Save a file in `client/src` and the browser
refreshes; save one in `server/src` and nodemon restarts the API.

### Changing the database schema
1. Edit `server/prisma/schema.prisma`.
2. Create and apply a migration:
   ```bash
   cd server
   npx prisma migrate dev --name describe_your_change
   ```
   This also regenerates the Prisma Client.
3. On Windows, stop the backend first if you hit `EPERM` — the running process
   holds the query engine file open.

With Docker, rebuild afterwards so the image picks up the new client:
```bash
docker compose up --build
```

### Inspecting data
```bash
cd server
npm run prisma:studio      # GUI at http://localhost:5555
```
Or connect pgAdmin to `localhost:5432`.

### Pushing your changes
```bash
git add -A
git commit -m "describe what changed"
git push
```
`.env` files are gitignored — keep real credentials out of commits.

---

## Features

**Form builder (admin)**
- Six question types: short answer, long answer, 1–5 rating, multiple choice,
  dropdown, checkboxes
- Conditional questions — reveal a question only when an earlier answer matches
- Optional closing date; forms auto-close once it passes
- Draft mode — save without publishing, publish later
- Target specific recipients, or leave open to everyone
- Anonymous mode — hides respondent identity in results and CSV
- Duplicate any form, or start from an NPS / Satisfaction / Retro preset
- Edit published forms; questions with existing answers are preserved

**Responses**
- One response per user per form, editable while the form is open
- Per-question analytics: rating averages and option distributions
- "Still waiting on" list of who hasn't answered yet
- CSV export

**Announcements** — admin-authored board with keyword/date filters, sorting and
pagination.

**Accounts & security**
- Register as `USER`, or `ADMIN` with the signup code
- Revocable sessions: sign-out actually invalidates the token server-side
- Changing your password signs out every other device
- Password reset via single-use expiring token
- Login rate limiting (5 failed attempts per 15 minutes)
- Admin panel: promote, demote, activate, deactivate
- Activity log of every admin action

**UI** — light/dark mode saved to your account, responsive down to mobile with
full-screen dialogs, in-app notification bell, show/hide password toggles.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, MUI 9, Emotion |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL via Prisma 5 |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs`, sessions tracked in the database |

---

## Project Structure
```
feedback-collector/
├── docker-compose.yml           # Whole stack: db + api + frontend
├── client/                      # React frontend
│   ├── Dockerfile
│   ├── public/index.html
│   └── src/
│       ├── index.js             # Theme (light/dark) + app bootstrap
│       ├── App.js               # Auth screens, app bar, notifications, account
│       ├── pages/FeedbackPage.js
│       ├── components/
│       │   ├── FeedbackForm.js  # FormBuilder, FormFiller, ChangePasswordForm
│       │   ├── FeedbackItem.js  # Cards: form, response, summary, user, audit
│       │   ├── FeedbackList.js  # Lists + pagination
│       │   └── ModalComponent.js
│       ├── services/feedbackService.js   # Every API call + token storage
│       └── utils/               # validation.js, formatDate.js
└── server/                      # Express + Prisma backend
    ├── Dockerfile
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.js
    └── src/
        ├── index.js             # Entry point
        ├── app.js               # Express app, auth router, rate limiter
        ├── controllers/         # authController.js, feedbackController.js
        ├── services/            # authService.js, feedbackService.js
        ├── middleware/auth.js   # JWT + session + role guards
        ├── routes/feedbackRoutes.js
        └── utils/validation.js
```

---

## Available Scripts

### `server`
| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart) |
| `npm start` | Start without nodemon |
| `npm run seed` | Create admin + demo accounts (safe to re-run) |
| `npx prisma migrate deploy` | Apply migrations to a database |
| `npm run prisma:studio` | Browse the database in a GUI |
| `npm run prisma:generate` | Regenerate the Prisma Client after schema edits |

### `client`
| Command | Description |
|---|---|
| `npm start` | Dev server on port 3000 |
| `npm run build` | Production build into `build/` |
| `npm test` | Run tests |

---

## Data Model

Ten tables, all created by the migration:

| Table | Purpose |
|---|---|
| `User` | Account, role, active/demo flags, theme preference, `promotedById` |
| `Session` | One row per issued JWT, so tokens can be revoked before expiry |
| `Notification` | In-app alerts for new forms and incoming responses |
| `Form` | Definition: `questions` JSON, draft/open/anonymous flags, deadline |
| `FormAssignment` | Which users a form targets; no rows means everyone |
| `FormResponse` | One user's answers to one form (unique per form + respondent) |
| `Feedback` | An announcement board entry |
| `PasswordResetToken` | Hashed, single-use, expiring reset tokens |
| `AuditEvent` | Admin action log; actor name copied in so it survives deletion |

`Form.questions` is JSON shaped like:
```json
[{
  "id": "uuid",
  "label": "How satisfied are you?",
  "type": "rating",
  "required": true,
  "options": [],
  "condition": { "questionId": "uuid-of-earlier-question", "equals": "Yes" },
  "deleted": false
}]
```
`type` ∈ `text | textarea | rating | radio | select | checkbox`. `options` is
only used by the choice types. `condition` is `null` unless the question is
conditional. `deleted` marks a question dropped from an edited form that still
has answers attached.

---

## API Reference

Base path `/api`. Protected routes need `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register; `role: "ADMIN"` also needs `adminCode` |
| POST | `/auth/login` | Public, rate-limited | Returns `{ user, token }` |
| POST | `/auth/demo` | Public | `{ role }` — sign in to a demo account, no credentials |
| GET | `/auth/me` | Any | Current user |
| POST | `/auth/logout` | Any | Revokes the current session |
| GET | `/auth/sessions` | Any | List your active sessions |
| PATCH | `/auth/preferences` | Any | `{ themeMode }` |
| POST | `/auth/change-password` | Any | Also signs out all other sessions |
| POST | `/auth/forgot-password` | Public, rate-limited | Issues a reset token (logged to the server console) |
| POST | `/auth/reset-password` | Public | `{ token, password }` |
| GET | `/auth/notifications` | Any | Paginated, with unread count |
| PATCH | `/auth/notifications/:id/read` | Any | Mark one read |
| PATCH | `/auth/notifications/read-all` | Any | Mark all read |
| GET | `/auth/users` | Admin | Users in your workspace |
| PATCH | `/auth/users/:id/role` | Admin | `{ role }` |
| PATCH | `/auth/users/:id/status` | Admin | `{ isActive }` |
| GET | `/auth/audit` | Admin | Admin activity log |

### Announcements
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/feedback` | Admin | Create |
| GET | `/feedback` | Any | `?keyword=&date=&sort=&page=&pageSize=` |
| DELETE | `/feedback/:id` | Admin | Delete |

### Forms
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/feedback/forms` | Admin | Create |
| GET | `/feedback/forms` | Any | Forms visible to you |
| GET | `/feedback/forms/:id` | Any | Single form |
| PUT | `/feedback/forms/:id` | Admin | Replace definition |
| PATCH | `/feedback/forms/:id` | Admin | `{ isOpen }` / `{ isDraft }` |
| DELETE | `/feedback/forms/:id` | Admin | Delete form + responses |
| POST | `/feedback/forms/:id/responses` | Audience | Submit or revise answers |
| GET | `/feedback/forms/:id/responses` | Admin | Responses + summary + pending |
| GET | `/feedback/forms/:id/responses/export` | Admin | CSV download |

---

## Roles & Permissions

| Action | USER | ADMIN |
|---|---|---|
| Fill in / revise a form shared with them | ✅ | — |
| See draft forms | ❌ | ✅ |
| Create, edit, duplicate, delete forms | ❌ | ✅ |
| View responses, analytics, pending list, CSV | ❌ | ✅ |
| Post / delete announcements | ❌ | ✅ |
| Manage users | ❌ | ✅ (with limits) |
| View activity log | ❌ | ✅ |

---

## How Key Rules Work

**Admin promotion** — an admin cannot demote whoever promoted *them*
(`User.promotedById` records it), but can demote anyone they promoted. The last
active admin can never be demoted or deactivated, and nobody can change their
own role.

**Sessions** — every login writes a `Session` row and `authenticate` checks it
on every request, so sign-out, a password change, or a reset invalidates tokens
immediately rather than waiting out the 12-hour expiry.

**Conditional questions** — a question may only depend on an earlier one, so
chains can't loop. Hidden questions are never required, and answers to a
question that becomes hidden are dropped before saving.

**Form buckets** — closed takes priority over answered: a form you answered that
later closed appears under *Closed Feedbacks*, not *Filled Feedbacks*.

**Demo sandbox** — `User.isDemo` splits everything into two workspaces. Filtered
on forms, announcements, users, notifications and the audit log, and enforced on
the response endpoint too so a leaked form id can't be answered across the line.

---

## Known Limitations

Deliberate trade-offs, not oversights:

- **No email delivery.** Password reset tokens are printed to the server console.
  Wiring up `nodemailer` is the natural next step.
- **Tokens live in `localStorage`,** readable by any script on the page. An
  httpOnly cookie resists XSS better but needs CORS credentials and a cookie
  parser.
- **Rate limiting is in-memory.** It resets on restart and doesn't span multiple
  server instances; a shared store like Redis is needed behind a load balancer.
- **Expired `Session` rows are never deleted.** They're filtered out of queries
  but the table grows; a cleanup job would fix it.
- **Editing a form tombstones removed questions** rather than deleting them, so
  old responses keep their labels. They stay in the `questions` JSON forever.
- **Anonymous forms are hidden, not erased.** `respondentId` is still stored to
  enforce one-response-per-user; anonymity means the UI and CSV omit it.
- **Demo accounts are shared.** Every visitor clicking *Demo Admin* lands in the
  same workspace and sees what other visitors created.

---

## Troubleshooting

**`The table 'public.User' does not exist`**
Migrations haven't run. `npx prisma migrate deploy`, then `npm run seed`.

**`Authentication failed against database server`**
Wrong credentials in `DATABASE_URL`. Confirm the Postgres user, password, and
that the database exists.

**`Can't reach database server at localhost:5432`**
Postgres isn't running, or is on another port. Check the service and the port in
`DATABASE_URL`.

**`EPERM: operation not permitted` on `prisma generate` (Windows)**
The dev server holds the query engine file open. Stop the backend, run
`npx prisma generate`, restart.

**Blank white page in the browser**
A runtime error. Open DevTools (F12) → Console for the actual message. A stale
bundle sometimes clears with Ctrl+Shift+R.

**Frontend loads but every request fails**
The backend isn't running, or `REACT_APP_API_URL` is wrong. CRA only reads
`.env` at startup — restart `npm start` after editing it.

**`429 Too many attempts`**
Five failed logins for the same IP + email within 15 minutes. Wait it out or
restart the server to clear the in-memory counter.

**Port already in use**
Change `PORT` in `server/.env`, or run the frontend on another port with
`set PORT=3001 && npm start` (Windows) / `PORT=3001 npm start` (macOS/Linux).
With Docker, edit the left-hand side of the port mappings in
`docker-compose.yml` (e.g. `"3001:3000"`).

### Docker-specific

**`error during connect` / `docker daemon is not running`**
Docker Desktop isn't started. Launch it, wait for the whale icon to settle, then
retry `docker compose up`.

**Port conflicts on 3000, 5000 or 5432**
Something is already using them — often a local Postgres on 5432 or a previously
started `npm start`. Stop the other process, or remap ports in
`docker-compose.yml`.

**Database looks stale or migrations are half-applied**
Wipe the volume and start clean:
```bash
docker compose down -v
docker compose up
```

**Changed `package.json` and the container doesn't see it**
Dependencies are installed at image build time. Rebuild:
```bash
docker compose up --build
```
