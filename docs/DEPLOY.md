# Deploying: Supabase, Render and Vercel

```
browser ──► Vercel  (frontend/: the built dashboard)
              │  /api/* is forwarded (frontend/vercel.json), so the browser sees one site:
              ▼  the sign-in cookie and Google's redirect just work, no CORS
            Render  (backend/: FastAPI, the models, the replay)
              │
              ▼
            Supabase (Postgres: accounts, predictions, work orders, insights, …)
```

The frontend and backend deploy separately, each with its own workflow, and only when you start it.
Locally nothing changes: without `DATABASE_URL` the backend uses `config/closed_loop.db` (SQLite).

| Workflow | Runs | Does |
|---|---|---|
| **Closed Loop checks** (`checks.yml`) | every push to main and every pull request | backend tests on SQLite *and* Postgres, frontend lint/types/build/bundle size, secret scan |
| **Database (Supabase)** (`database.yml`) | a push to main that adds or edits a file in `backend/app/migrations/postgres/`; or by hand (check / migrate) | checks Supabase, applies pending migrations; fails if an applied migration was edited |
| **Deploy backend (Render)** (`deploy-backend.yml`) | by hand only | needs green checks for the commit and an up-to-date database, then calls Render's deploy hook |
| **Deploy frontend (Vercel)** (`deploy-frontend.yml`) | by hand only | needs green checks for the commit, then builds and deploys to Vercel |

Only the repository owner can run the database and deploy workflows, and only on main. Their secrets
live in a GitHub Environment called `production` that only main may use.

---

## First time, in this order

### 1. Supabase: the database

1. [supabase.com](https://supabase.com) → **New project**. Pick the region closest to you (and use the
   same one for Render, e.g. Singapore). Save the database password it shows.
2. Project → **Connect** (top bar) → **Connection string** → **URI**, method **Session pooler**.
   Not "Direct connection": that one is IPv6-only, and neither Render nor GitHub Actions has IPv6.
   It looks like
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Put your password in place of `[YOUR-PASSWORD]` and add `?sslmode=require` at the end.
   This is your **`DATABASE_URL`**. It's a secret.

The tables are made by the Database workflow (step 3), not by hand. They have row-level security on
with no policies, so Supabase's public Data API can't read them; only the backend's connection can.

### 2. GitHub: the `production` environment

Repository → **Settings** → **Environments** → **New environment** → `production`.

- **Deployment branches and tags** → *Selected branches and tags* → add `main`.
- Optional: **Required reviewers** → yourself, so every deploy waits for your click.
- **Environment secrets** (add the rest as you get them in steps 4–5):

| Secret | From |
|---|---|
| `DATABASE_URL` | step 1 |
| `RENDER_DEPLOY_HOOK_URL` | step 4 |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | step 5 |

### 3. Create the tables

Push this repository to main (Closed Loop checks runs; wait for it to pass). Then **Actions** →
**Database (Supabase)** → **Run workflow** → action **migrate**. The log ends with
`Applied 0001_baseline.sql.` Supabase → **Table Editor** now lists the `tbl_*` tables.

### 4. Render: the backend

1. [render.com](https://render.com) → **New** → **Blueprint** → connect this repository. Render reads
   `render.yaml` and proposes a web service called `closed-loop-api`.
2. It asks for the values marked `sync: false`:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Supabase URI from step 1 |
| `APP_URL` | your Vercel address from step 5, e.g. `https://closed-loop.vercel.app` (you can fill it in after step 5) |
| `ADMIN_EMAILS` | your Google email: you'll be the admin the first time you sign in with Google |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same as your local `.env` |
| `SMTP_USER`, `SMTP_APP_PASSWORD` | same as your local `.env` |

   `KEY_ENCRYPTION_SECRET` is generated for you. **Never change or delete it**: it encrypts the API
   keys people save, and a new one makes every saved key unreadable. `COOKIE_SECURE=1` is set too.
3. The first build trains the models (about 2 minutes). When it's live, open
   `https://closed-loop-api.onrender.com/api/health`: `{"status":"ok"}`.
4. Service → **Settings**:
   - **Auto-Deploy**: check it says **Off** (the workflow deploys, not every push).
   - **Deploy Hook**: copy the URL into the GitHub secret `RENDER_DEPLOY_HOOK_URL`.
   - If the service's address isn't `closed-loop-api.onrender.com` (the name was taken), put the real
     address in `frontend/vercel.json` → the `/api/:path*` rewrite, and commit.

Free plan, worth knowing: the service sleeps after 15 minutes without requests (the next visit takes
about a minute to wake it, and a running replay stops), and it has 512 MB of memory. After a replay,
look at **Metrics → Memory**; if it runs close, the Starter plan doubles it.

### 5. Vercel: the frontend

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import this repository.
   **Root Directory**: `frontend`. The rest comes from `frontend/vercel.json`. Deploy once.
   The address it gives you (e.g. `https://closed-loop.vercel.app`) is your `APP_URL`: set it on Render
   (step 4) if you haven't.
2. The three secrets for GitHub:
   - `VERCEL_TOKEN`: avatar → **Account Settings** → **Tokens** → create one (scope: your account).
   - `VERCEL_PROJECT_ID`: the project → **Settings** → **General** → *Project ID*.
   - `VERCEL_ORG_ID`: **Account Settings** → **General** → *Vercel ID* (or, for a team, the team's
     **Settings** → *Team ID*).

`vercel.json` turns off Vercel's own deploy-on-push, so only the workflow deploys.

### 6. Google sign-in for the live address

[Google Cloud console](https://console.cloud.google.com/auth/clients) → your OAuth client:

- **Authorized JavaScript origins** → add `https://<your-app>.vercel.app`
- **Authorized redirect URIs** → add `https://<your-app>.vercel.app/api/auth/google/callback`

Keep the localhost entries for local runs. Once deployed, **Admin → Google sign-in** shows the exact
redirect URI to copy.

### 7. Deploy

**Actions** → **Deploy backend (Render)** → **Run workflow**, then **Deploy frontend (Vercel)** →
**Run workflow**. Open your Vercel address and **Continue with Google** with the email in `ADMIN_EMAILS`.

---

## Every day after

1. Push to main (or merge a pull request). Closed Loop checks runs.
2. Deploy what changed: **Deploy backend** and/or **Deploy frontend**. Each one refuses a commit whose
   checks didn't pass.

### Changing the database

Write the change twice, because SQLite and Postgres SQL differ:

- `backend/app/migrations/sqlite/NNNN_<name>.sql` (next number after the highest there; ends with
  `PRAGMA user_version = NNNN;` inside `BEGIN … COMMIT`), and raise `SCHEMA_VERSION` in `services/db.py`;
- `backend/app/migrations/postgres/NNNN_<name>.sql` (next number in *that* folder; no BEGIN/COMMIT,
  the runner wraps each file in a transaction).

Pushing the Postgres file to main applies it to Supabase automatically (Database workflow), then
deploy the backend. **Never edit a migration that has run**: the checksum won't match and both the
Database workflow and the backend deploy stop. Add a new file that makes the change instead.

To try a migration on your own Postgres first:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:17
cd backend
DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres .venv/bin/python -m app.services.migrate
TEST_DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres .venv/bin/python -m pytest -q
```

`TEST_DATABASE_URL` empties the database it points at before every test: never point it at Supabase.

### Data on Supabase

Accounts, sessions, work orders, outcomes, the study log and the replay's predictions all live there.
A replay **reset** empties the replay tables (readings, predictions, work orders, insights) as it does
locally; accounts, outcomes and the study log stay. Supabase → **Database** → **Backups** has the
daily backups (on the free plan, export what matters with the dashboard's CSV exports).
