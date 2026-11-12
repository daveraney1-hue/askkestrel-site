# Kestrel client portal

**Version 20 (Nov 12, 2026):** extra questions, $10 a month each. Run
`supabase/migration_011_extra_questions.sql` first. Track and Fix & Track include 3
questions and Grow 10; clients can pay for extras (Track up to 6 questions in all).
Extras chosen on the pricing page come through the sign-up. On "Your questions" a client
can add a question: it fills a slot they already have, or, if they tick the $10-a-month
box, buys one more. Dave approves on Telegram, as with changes, and an approved paid
addition raises the client's paid extras by one (update their billing to match). On the
admin page Dave can set the paid extras, add questions and remove them. Extra areas keep
using the first three questions.

**Version 19 (Nov 11, 2026):** sign-ups stay under "New" until their client is active.
A sign-up whose client has been created but is still pending payment now stays in
"New" (labelled "Client created · pending payment") and moves out once the client's
subscription is marked active. No database change.

**Version 18 (Nov 10, 2026):** province-wide and Canada-wide areas. Run
`supabase/migration_010_wide_areas.sql` first. In "Areas and spots", pick a province and
press "Add province-wide", or press "Add Canada-wide". Such a client takes one of the three
spots for its business type in every town it covers: the database refuses it if any covered
town is already full, and refuses a town where province-wide and national clients already
fill the spots. The pricing page counts them in every area too. Priced by quote.

**Version 17 (Nov 10, 2026):** step-by-step instructions on to-dos. Run
`supabase/migration_009_task_steps.sql` first. The monthly report now writes 3 to 6
numbered steps for each to-do. Admins see the steps on every item (Kestrel's items are
labelled "not shown to the client"); clients see steps only on items assigned to them,
under "How to do it". The database enforces this, so a client login never receives the
steps for Kestrel's items.

**Version 16 (Nov 2, 2026):** extra areas on Fix & Track as well as Grow (same
add-on prices), and monthly reports for each extra area. Run
`supabase/migration_008_area_reports.sql` first. The n8n workflow "Kestrel – Extra
Area Reports" runs each extra area's check (the client's three questions asked about
that area) and saves it as an area report; area reports are published with the
month's home report. The Reports page lists them under "Extra areas"; the overview
and trend stay on the home area.

**Version 15 (Nov 2, 2026):** Areas and spots. Each client's admin page has an
"Areas and spots" card: set their business type (the same list as
askkestrel.ca/pricing), their home area and, on Grow, extra areas. At most three
Fix & Track and Grow clients of the same business type can hold an area; the
database refuses a fourth. Run `supabase/migration_007_areas_and_spots.sql`
first. The pricing page reads open spots through the n8n workflow
"Kestrel – Open Spots" (counts only, no names). Lists live in `public/data/`.

**Version 14 (Oct 28, 2026):** new look matching askkestrel.ca: a dark sidebar
(a top bar on phones), Kestrel colours and fonts, and separate client pages:
Overview (`/`), Reports (`/reports`), Action items (`/actions`), What the AI
reads (`/sources`), Your questions (`/questions`) and Team logins (`/team`).
The overview chart shows how often the client is named next to the business
the AI named most often each month. Admins see every section stacked on the
client's page.

## Phase 1

The client login at **app.askkestrel.ca**: monthly reports, the visibility
trend chart (with markers for completed fixes), the AI answers behind each
report, and the to-do list with its activity log. Admin screens show every
client, a work queue of Kestrel's open items, and each client's dashboard with
controls for status, owner and due dates.

Built with React + Vite, hosted on Cloudflare Pages, with Supabase for the
database and email-and-password login.

## What's in this folder

| Path | What it is |
| --- | --- |
| `supabase/schema.sql` | Tables, security rules, assignment rules, activity log. Run first. |
| `supabase/seed_task_types.sql` | Starter list of recommendation types and which packages include them. **Edit before launch.** |
| `supabase/migration_002_signups.sql` | Plan sign-ups from askkestrel.ca and the Create client step. Run after schema.sql. |
| `supabase/migration_003_monthly_reports.sql` | Monthly reports: start dates, draft reports, save and publish. Run after migration 002. |
| `supabase/migration_006_client_questions.sql` | Each client's tracked questions, change requests and approvals. Run after migration 005. |
| `supabase/migration_007_areas_and_spots.sql` | Areas each client holds, business type for spots, the 3-per-area limit, and counts for the pricing page. Run after migration 006. |
| `supabase/migration_008_area_reports.sql` | Monthly reports for extra areas: area columns on reports, area-aware save and publish, and the list of extra areas due. Run after migration 007. |
| `supabase/migration_009_task_steps.sql` | Numbered steps for each to-do, visible to admins on every item and to clients on their own items only. Run after migration 008. |
| `supabase/migration_010_wide_areas.sql` | Province-wide and Canada-wide areas, counted in every town they cover. Run after migration 009. |
| `supabase/seed_demo.sql` | A fictional demo client with 6 months of reports. Optional, for testing. |
| `src/` | The portal app. |
| `src/lib/api.demo.js` | Fake data for `npm run demo` previews. Never part of the real build. |

## How the rules work

- **Track:** every item is assigned to the client.
- **Fix & Track / Grow:** an item goes to Kestrel when its type lists that
  package in `task_types.included_in`; otherwise it goes to the client.
- **Package change:** open items are reassigned automatically and the reason
  is logged. Items Dave assigned by hand keep their owner. Done items never move.
- **Clients** can start or finish items assigned to them and add notes to any
  of their items. They can't change Kestrel's items, other clients' data, or
  their own role.
- **Every change** (added, status, reassignment, due date, edits, notes) is
  written to `task_log` with who did it, when, and any note. Changes made by
  n8n show as "Kestrel (automatic)".

The rules were tested against Postgres with 28 checks (assignment, package
changes, logging, and that clients can only see and change what they should).

## Setup

### 1. Supabase

1. Create a new project. Choose a Canadian region if one is offered.
2. In **SQL Editor**, run `supabase/schema.sql`, then
   `supabase/seed_task_types.sql`, then (optional) `supabase/seed_demo.sql`.
3. **Authentication → Sign In / Providers:** turn **off** "Allow new users to
   sign up". Clients only get logins you create.
4. **Authentication → URL Configuration:**
   - Site URL: `https://app.askkestrel.ca/update-password`
     (invite emails land here so new clients choose their password)
   - Redirect URLs: add `https://app.askkestrel.ca/**` and, for local testing,
     `http://localhost:5173/**`
5. **Authentication → Emails → SMTP:** use your own SMTP (the same
   info@askkestrel.ca account n8n uses). Supabase's built-in sender is only
   meant for testing and is heavily rate-limited.
6. Make yourself the admin: **Authentication → Users → Invite user** with your
   email, accept the invite and set a password, then run in the SQL editor:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Dave Raney'
   where email = 'your@email';
   ```

### 2. Cloudflare Pages

1. Put this folder in a GitHub repo and create a Pages project from it, or
   upload the `dist` folder after `npm run build`.
2. Build command `npm run build`, output folder `dist`.
3. Environment variables (Supabase → Project Settings → API):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (the anon key, **never** the service_role key)
4. **Custom domains:** add `app.askkestrel.ca`.

### 3. Adding a client

1. In the portal: **Clients → Add client** (later, n8n does this from Stripe).
2. In Supabase: **Authentication → Users → Invite user** with their email.
3. Back in the portal, open the client and **Link a login**. A business can
   have more than one login (for example an agent and their assistant).

The client gets an email, sets a password, and sees their dashboard.

## For the n8n workflows (Phase 2)

n8n connects with the **service_role** key (keep it only in n8n credentials).
It bypasses the security rules, so it can write for any client.

- **Monthly report run:** insert into `reports` and `answers`, then upsert into
  `tasks` with a stable `dedupe_key` per recommendation (for example
  `gbp-categories`). A key that already exists is skipped, so the same advice
  doesn't pile up month after month. Leave `owner` empty; the rules fill it in.
- **Stripe events:** update `clients.package` and `clients.subscription_status`
  (match on `stripe_customer_id`). Changing the package reassigns open items
  automatically.
- **Cancellations:** 30 days after `subscription_status` becomes `canceled`,
  delete the client row (reports, answers, items and log go with it) and
  their logins in Supabase Auth, after the re-subscribe reminder email.

## Plan sign-ups

The sign-up pop-up on askkestrel.ca posts to the n8n workflow **Kestrel – Plan
Sign-ups**. Each sign-up is saved to the `signups` table, the person gets a
confirmation email, and Dave gets a Telegram message with **Create client** /
**Not now** buttons. Create client makes a client on the right plan with status
`pending_payment` and their contact details. The same button is on the admin
**Sign-ups** page; using both never creates a duplicate.

## Monthly reports

n8n workflow **Kestrel – Monthly Client Reports** runs daily. Active clients get a
report on the day of the month they started (29th-31st run on the 28th; a missed
day is caught up). It runs the AI Check Engine, has Claude write that month's
to-dos tagged by item type, and saves a **draft** report. **Kestrel – Client Report
Approval** then asks Dave on Telegram: Send to client publishes it and emails the
client's logins; Keep as draft leaves it hidden (publish later from the report
page). Mark a client **Active** on their client page once they've paid; that sets
their start date.

## Tracked questions

Each client's monthly check asks their own three customer questions instead of
the standard ones.

- **Suggested:** n8n workflow **Kestrel – Client Questions Setup** runs every
  15 minutes. For each active client with no questions it uses the questions
  from their free check (matched by email or website), otherwise drafts three
  from their website (same fairness rules as the free check), otherwise uses the
  standard questions. Dave gets a Telegram message.
- **Confirmed:** the client sees "Confirm your questions" at the top of their
  portal. They can confirm, or suggest a change to any question first.
- **Changes:** a client can request a change any time. The portal recommends
  keeping questions the same, since a changed question starts its tracking
  fresh. **Kestrel – Question Change Requests** (every 5 minutes) hands each
  request to **Kestrel – Question Change Approval**, which asks Dave on
  Telegram, saves the decision and emails the client. Dave can also approve,
  decline or edit questions on the client's admin page.
- **Monthly reports:** **Kestrel – Monthly Client Reports** passes the client's
  three questions to the AI Check Engine. Old questions are kept with their end
  date in `client_questions`, and every request in `question_requests`.

Preview the two states in demo mode: `npm run demo` (waiting to confirm) and
`http://localhost:5173/?q=confirmed` (confirmed, with a pending request).

## Try it without Supabase

```
npm install
npm run demo          # client view
npm run demo:admin    # admin view
```

## Not in this phase

How-to guide content, upgrade prompts, comments, notifications, Stripe billing
button, business details page, approvals, competitor view, PDF downloads
and "view as client" follow in Phases 2 to 4 of
the build plan. The PDF link and AI answers already display when n8n fills them in.
