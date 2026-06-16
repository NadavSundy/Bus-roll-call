# Bus Role Call App

A React + Vite + TypeScript + Supabase app for school programme and camp bus check-in operations.

The app models a programme as a group with one roster, multiple buses, and multiple attendance sessions. Helpers can use a public tokenized check-in link without creating an account. Admins manage rosters, buses, sessions, summaries, and exports.

## Features

- Supabase email/password admin login, account creation, and password reset
- Programme/group dashboard
- CSV roster import with duplicate normalized-name skipping
- Manual registered student and walk-on support
- Managed buses with deactivate-instead-of-delete behaviour when history exists
- One open attendance session per programme
- Public check-in links using `sessionId` and long `public_checkin_token`
- Public RPC check-in, checkout, move, and walk-on creation
- Polling refresh, visible last-updated time, and manual refresh for public check-in
- Signed-in dashboard realtime refresh
- Locked read-only closed sessions
- WhatsApp summary copy and CSV export
- Supabase keep-alive GitHub Actions workflow

## Setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Add your public Supabase browser values:

```bash
VITE_SUPABASE_URL=https://your-supabase-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_APP_URL=https://your-production-app-url.com
```

4. Install dependencies:

```bash
npm install
```

5. Start the app:

```bash
npm run dev
```

## Supabase Schema Reset

This version expects the schema in `supabase-schema.sql`.

It is a reset-oriented schema. It drops and recreates the old app tables:

- `groups`
- `group_members`
- `buses`
- `students`
- `attendance_sessions`
- `attendance_records`
- `attendance_audit_log`
- `app_keepalive`

Run the SQL in the Supabase SQL editor. Existing old attendance stored on `students.checked_in` / `students.bus_number` is not migrated.

## RLS And Public Check-In

RLS stays enabled. The frontend uses the Supabase anon key only.

Signed-in users access programme data through RLS policies based on `group_members`.

Anonymous helpers do not get broad table access. Public check-in screens call only security-definer RPC functions:

- `public_get_session_for_checkin(session_id, public_checkin_token)`
- `public_check_in_student(session_id, public_checkin_token, student_id, bus_id, helper_name, override_existing)`
- `public_check_out_student(session_id, public_checkin_token, student_id, helper_name)`
- `public_add_walk_on_student(session_id, public_checkin_token, name, bus_id, helper_name)`

The RPCs validate the session token, open/closed status, student ownership, bus ownership, active bus status, and helper name. Writes are handled in the database so race conditions are controlled by constraints and row locks.

## Auth Email Setup

The app uses Supabase Auth for user accounts, passwords, email confirmation, and password reset emails.

To send auth emails through Gmail, configure Supabase Custom SMTP in the Supabase dashboard. Do not put Gmail SMTP credentials, Gmail passwords, or SMTP app passwords in frontend code, `.env`, `.env.example`, or committed files.

For Gmail SMTP, Google requires 2-Step Verification and an App Password.

In Supabase Auth URL Configuration:

- Set Site URL to your production app URL.
- Add redirect URLs for production and local Vite dev:
  - `https://your-production-app-url.com/**`
  - `http://localhost:5173/**`

Set `VITE_APP_URL` in `.env` and in deployment environment variables. The app uses it for auth email redirects:

- Account confirmation: `${VITE_APP_URL}/auth/callback`
- Password reset: `${VITE_APP_URL}/auth/reset-password`

## Day-Of Use

1. Admin signs in.
2. Admin creates a programme.
3. Admin imports a CSV roster or manually adds students.
4. Admin creates buses.
5. Admin starts an attendance session.
6. Admin copies the public check-in link.
7. Helpers open the link, enter a display name, choose their bus, and check students in.
8. If a student is already on another bus, the helper sees a move confirmation before overriding.
9. Admin monitors live counts from the dashboard.
10. Admin can reset only the selected open session.
11. Admin ends the session to lock it read-only.
12. Admin exports a WhatsApp summary or CSV.
13. Admin can start another session later with the same roster and buses.

## GitHub Actions Keep Alive

The workflow `.github/workflows/supabase-keepalive.yml` calls `keepalive_ping()` twice per week and supports manual `workflow_dispatch`.

Add these GitHub repository secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Scheduled GitHub workflows run in UTC. The included cron runs at 08:00 UTC on Mondays and Thursdays.

The workflow does not use a service-role key.

## Build

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

## Deployment

Build the production site and publish `dist`. The existing GitHub Pages workflow uses:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL`
