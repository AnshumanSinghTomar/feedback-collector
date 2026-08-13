# Feedback Collector

A full-stack app for collecting structured feedback. Admins build custom forms
(with conditional questions, deadlines, targeted recipients and anonymous
responses), publish announcements, and manage users. Regular users fill in the
forms shared with them and can revise their answers while a form stays open.

Built with React (MUI) on the frontend and Express + Prisma + PostgreSQL on the
backend, secured with JWT auth and two roles.

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Roles & Permissions](#roles--permissions)
- [Admin Promotion Rules](#admin-promotion-rules)
- [Conditional Questions](#conditional-questions)
- [Dark Mode](#dark-mode)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

## Features

**Forms**
- Drag-free builder: short answer, long answer, 1–5 rating, multiple choice,
  dropdown, and checkboxes
- Conditional questions ("show this only if an earlier answer equals X")
- Optional closing date; forms stop accepting responses automatically once it
  passes, or immediately if an admin closes them manually
- Draft state — a form can be saved without being visible to users, then
  published later
- Target a form at specific users, or leave it open to everyone
- Anonymous mode — response author is hidden from the admin's view and from
  the CSV export
- Duplicate an existing form, or start from an NPS / Satisfaction / Retro
  preset
- Edit a published form; questions that already have answers are preserved
  (tombstoned, not deleted) so historical responses keep their labels

**Responses**
- One response per user per form, editable while the form is open
- Per-question summary: rating averages and option distributions, computed
  over the full response set
- "Still waiting on" list of who has been shared the form but has not
  answered yet (hidden for anonymous forms)
- CSV export of every response

**Announcements**
- Admin-authored board entries with a title and message
- Keyword and date filtering, newest/oldest sort, pagination

**Accounts**
- Register as **USER** or **ADMIN**; admin signup requires a shared code so
  the role cannot be self-issued
- Change password from the account menu
- Forgot-password flow with a single-use, expiring token (printed to the
  server console — no email service is wired up)
- Admin panel: promote/demote, activate/deactivate, with activity counts
- Activity log of every admin action (who did what, to whom, when)

**Look and feel**
- Light and dark mode, toggle in the header, preference remembered
- Responsive layout, single column on mobile with full-screen dialogs
- Animated list entries and hover states throughout

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, MUI 9 (`@mui/material`, `@mui/icons-material`), Emotion |
| Backend | Node.js, Express |
| Database | PostgreSQL via Prisma ORM |
| Auth | JSON Web Tokens (`jsonwebtoken`), password hashing via `bcryptjs` |

## Project Structure
```
feedback-collector/
├── client/                  # React frontend
│   ├── public/
│   └── src/
│       ├── App.js           # Auth gate: sign in/up/reset + account menu
│       ├── index.js         # Theme (light/dark) + app bootstrap
│       ├── pages/
│       │   └── FeedbackPage.js
│       ├── components/
│       │   ├── FeedbackForm.js    # FeedbackForm, FormBuilder, FormFiller, ChangePasswordForm
│       │   ├── FeedbackItem.js    # FeedbackItem, FormItem, ResponseItem, ResponseSummary,
│       │   │                      # PendingRespondents, AuditItem, UserRow
│       │   ├── FeedbackList.js    # FeedbackList, FormList, UserList, AuditList, Pagination
│       │   └── ModalComponent.js
│       ├── services/
│       │   └── feedbackService.js # All API calls + token storage
│       └── utils/
│           ├── validation.js
│           └── formatDate.js
└── server/                  # Express + Prisma backend
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.js           # Creates the first ADMIN account
    └── src/
        ├── app.js             # Express app, inline auth router, rate limiter
        ├── index.js           # Entry point
        ├── controllers/
        │   ├── authController.js
        │   └── feedbackController.js
        ├── services/
        │   ├── authService.js     # Users, roles, audit log, password reset
        │   └── feedbackService.js # Forms, responses, announcements, CSV
        ├── middleware/
        │   └── auth.js            # JWT verification + admin guard
        ├── routes/
        │   └── feedbackRoutes.js
        └── utils/
            └── validation.js
```

## Prerequisites
- Node.js 18+
- PostgreSQL (or swap the Prisma provider to `sqlite`/`mysql` in
  `server/prisma/schema.prisma`)

## Backend Setup
```bash
cd server
npm install
# Edit .env — see Environment Variables below
npx prisma generate
npx prisma migrate dev --name init   # first-time setup only
npm run seed                          # creates the first admin account
npm run dev
```
The API runs on `http://localhost:5000` by default.

Seeded admin: `admin@example.com` / `admin123`. Change the password (or the
account) before using this anywhere but locally.

## Frontend Setup
```bash
cd client
npm install
# Edit .env if your API runs on a different URL
npm start
```
The app runs on `http://localhost:3000` by default.

## Environment Variables

**`server/.env`**
```dotenv
DATABASE_URL="postgresql://user:password@localhost:5432/feedback_collector?schema=public"
PORT=5000
JWT_SECRET="change-this-to-a-long-random-string"
ADMIN_SIGNUP_CODE="change-this-too"
```
- `JWT_SECRET` — signs and verifies session tokens. Use a long random string;
  anyone with this value can forge valid sessions.
- `ADMIN_SIGNUP_CODE` — required on the registration form when signing up as
  `ADMIN`. Without a matching code, self-registration can only produce a
  `USER` account.

**`client/.env`**
```dotenv
REACT_APP_API_URL=http://localhost:5000/api
```

## Data Model

| Model | Purpose |
|---|---|
| `User` | Account, role, active flag, and `promotedById` (see [Admin Promotion Rules](#admin-promotion-rules)) |
| `Feedback` | An announcement board entry |
| `Form` | A form definition: `questions` (JSON), draft/open/anonymous flags, optional deadline |
| `FormAssignment` | Which users a form was shared with; no rows means everyone can see it |
| `FormResponse` | One user's answers to one form (unique per form + respondent) |
| `PasswordResetToken` | Single-use, hashed, expiring reset tokens |
| `AuditEvent` | Admin action log; actor name is copied in so it survives account deletion |

`Form.questions` is a JSON array shaped like:
```json
[
  {
    "id": "uuid",
    "label": "How satisfied are you?",
    "type": "rating",
    "required": true,
    "options": [],
    "condition": null,
    "deleted": false
  }
]
```
`type` is one of `text`, `textarea`, `rating`, `radio`, `select`, `checkbox`.
`options` is only used by `radio`/`select`/`checkbox`. `condition`, when set,
is `{ "questionId": "...", "equals": "..." }`. `deleted` marks a question that
was removed from an edited form but has existing answers — see
[Known Limitations](#known-limitations).

## API Reference

All endpoints are prefixed with `/api`. Protected endpoints require an
`Authorization: Bearer <token>` header.

### Auth (`/auth`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public, rate-limited | Register (`role: "USER"` or `"ADMIN"` + `adminCode`) |
| POST | `/auth/login` | Public, rate-limited | Sign in, returns `{ user, token }` |
| GET | `/auth/me` | Any user | Current user |
| POST | `/auth/change-password` | Any user | `{ currentPassword, newPassword }` |
| POST | `/auth/forgot-password` | Public, rate-limited | Issues a reset token (logged server-side) |
| POST | `/auth/reset-password` | Public | `{ token, password }` |
| GET | `/auth/users` | Admin | List users with activity counts |
| PATCH | `/auth/users/:id/role` | Admin | `{ role }` — promote or demote |
| PATCH | `/auth/users/:id/status` | Admin | `{ isActive }` — activate or deactivate |
| GET | `/auth/audit` | Admin | Paginated admin activity log |

### Announcements (`/feedback`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/feedback` | Admin | Create an announcement |
| GET | `/feedback` | Any user | List, supports `?keyword=&date=&sort=&page=&pageSize=` |
| DELETE | `/feedback/:id` | Admin | Delete an announcement |

### Forms (`/feedback/forms`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/feedback/forms` | Admin | Create a form |
| GET | `/feedback/forms` | Any user | List forms visible to the caller |
| GET | `/feedback/forms/:id` | Any user | Fetch one form |
| PUT | `/feedback/forms/:id` | Admin | Replace a form's definition |
| PATCH | `/feedback/forms/:id` | Admin | `{ isOpen }` and/or `{ isDraft }` |
| DELETE | `/feedback/forms/:id` | Admin | Delete a form and its responses |
| POST | `/feedback/forms/:id/responses` | Any user in the audience | Submit or revise an answer set |
| GET | `/feedback/forms/:id/responses` | Admin | Paginated responses + summary + pending respondents |
| GET | `/feedback/forms/:id/responses/export` | Admin | Download responses as CSV |

## Roles & Permissions

| Action | USER | ADMIN |
|---|---|---|
| Fill in a form shared with them | ✅ | — |
| Revise their own response while the form is open | ✅ | — |
| See draft forms | ❌ | ✅ |
| Create / edit / delete forms | ❌ | ✅ |
| View responses, summary, pending list, export CSV | ❌ | ✅ |
| Post / delete announcements | ❌ | ✅ |
| Promote, demote, activate, deactivate users | ❌ | ✅ (with limits, below) |
| View the activity log | ❌ | ✅ |

## Admin Promotion Rules

- Self-registration can only produce a `USER` account unless the correct
  `ADMIN_SIGNUP_CODE` is supplied.
- An admin **cannot demote the admin who promoted them.** `User.promotedById`
  records who granted the role; the server rejects a demotion where
  `actingUser.promotedById === targetId`.
- An admin **can** demote anyone they promoted themselves — promoting someone
  does not cost you the ability to demote them later.
- The last remaining active admin cannot be demoted or deactivated, by anyone,
  including themselves.
- Nobody can change their own role or deactivate their own account.
- Demotion clears `promotedById`; a later promotion is attributed to whoever
  grants it next.

## Conditional Questions

A question can be set to only appear when an earlier question's answer
matches a specific value (e.g. "Which car?" only shown if "Do you drive?" was
answered "Yes"). Rules:
- A question may only depend on a question that comes **before** it in the
  form — no forward references, no cycles.
- Hidden questions are never required: if the condition isn't met, the answer
  is skipped during validation on both the client and the server.
- Answers to a question that becomes hidden (because an earlier answer
  changed) are dropped before saving, so stale values don't linger.

## Dark Mode

Toggled from the header (and from the sign-in screen) and persisted in
`localStorage`. The theme is built per-mode in `client/src/index.js` — palette,
gradients, and surface colours all branch on `mode`, rather than dark mode
being a CSS overlay on the light theme.

## Known Limitations

These are deliberate trade-offs for a project at this stage, not oversights:

- **No email delivery.** Password reset tokens are generated and logged to the
  server console; there is no mailer. Wiring up `nodemailer` or a transactional
  email API is a natural next step.
- **JWTs are not revocable.** There is no server-side session list, so a
  token is valid until it expires (12 hours) even if the password is changed
  or the account is deactivated in between — though `authenticate` does check
  `isActive` on every request, so a deactivated account is blocked immediately
  regardless of an unexpired token.
- **Tokens live in `localStorage`,** which is readable by any script that runs
  on the page. An httpOnly cookie would be more resistant to XSS but needs
  CORS credentials and a cookie parser on the server.
- **Login rate limiting is in-memory.** It resets on server restart and does
  not share state across multiple server instances. A production deployment
  behind a load balancer needs a shared store (Redis) instead.
- **Editing a form tombstones removed questions** rather than deleting them,
  so existing responses keep a label to render against. Tombstoned questions
  are excluded from new submissions and from the summary/CSV question list,
  but they do stay in the stored `questions` JSON indefinitely.
- **Anonymous forms are hidden-not-erased.** The respondent is still recorded
  in the database (`FormResponse.respondentId`) so the one-response-per-user
  rule can be enforced; "anonymous" means the admin's UI and CSV export omit
  that field, not that it doesn't exist.
- **The Prisma migration history was patched by hand** during development
  (schema changes were applied via ad hoc SQL and the migration checksum was
  re-synced) rather than always generated fresh via `prisma migrate dev`. If
  you're setting this up on a brand-new database, `npx prisma migrate dev`
  against the existing `migrations/` folder should apply cleanly — but this
  hasn't been proven on a database that didn't already go through the manual
  patching.

## Troubleshooting

**"The table `public.User` does not exist"** — the Prisma Client was
generated before running migrations, or a migration didn't apply. Run
`npx prisma generate` then `npx prisma migrate dev`.

**`EPERM` on `prisma generate`** — the dev server has the query engine DLL
open. Stop the backend process, run `prisma generate`, then restart it.

**401 immediately after signing in** — check that `JWT_SECRET` is identical
between when the token was issued and now; changing it invalidates every
existing token.

**429 on login** — five failed attempts from the same IP + email within 15
minutes trips the rate limiter. Wait for the `Retry-After` window or restart
the server to clear the in-memory counter.
