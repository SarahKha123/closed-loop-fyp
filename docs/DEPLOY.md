# Deploying: AWS with Terraform

```
browser ──HTTPS──► CloudFront ─┬─ /api/*  ─► ECS Express Mode: one Fargate task (FastAPI, models, replay) ─► RDS Postgres
                               │             (load balancer + HTTPS made by Express Mode)       │
                               │                                                                └─► smtp.gmail.com:587 (email)
                               └─ the rest ─► private S3 bucket (the built dashboard)
```

Everything is in one Terraform root module, [`infra/main.tf`](../infra/main.tf), in `ap-southeast-1`
(Singapore). Plain settings are in [`infra/app.auto.tfvars`](../infra/app.auto.tfvars). No secret value
is in either file or in Terraform state. Locally nothing changes: without `DATABASE_URL` the backend uses
`config/closed_loop.db` (SQLite).

| Workflow | Runs | Does |
|---|---|---|
| **Closed Loop checks** (`checks.yml`) | every push to main and every pull request | backend tests on SQLite *and* Postgres, frontend lint/types/build/bundle size, secret scan |
| **Infra (Terraform)** (`infra.yml`) | pull requests touching `infra/` (plan); by hand on main (plan + apply) | changes the AWS setup |
| **Deploy backend (AWS)** (`deploy-backend.yml`) | by hand only | needs green checks for the commit; builds the image, pushes it to ECR, moves the service onto it and waits until `/api/health` reports the commit |
| **Deploy frontend (AWS)** (`deploy-frontend.yml`) | by hand only | needs green checks for the commit; builds the dashboard, uploads it to S3, refreshes CloudFront |

GitHub reaches AWS through OIDC: no AWS keys are stored in GitHub. Each IAM role trusts one kind of job
(pull request → read-only plan; environment `infra` → apply; environment `production` → deploy), and the
workflows also refuse to run unless the repository owner started them on main.

## Why it's set up this way

| Piece | Why |
|---|---|
| CloudFront | One address for the dashboard and the API, so the sign-in cookie is first-party, Google's redirect just works, and there's no CORS. A CloudFront Function serves `index.html` for deep links (`/work-orders`), on the S3 side only, so the API's real 404s stay 404s. `/api/*` isn't cached or compressed, so the SSE stream passes straight through. |
| ECS Express Mode, **one task** | Express Mode makes the load balancer, certificate and security groups itself. The replay, the event bus, the SSE stream and the monitor live inside the process, so two tasks would replay twice and open every work order twice. Fixed at min = max = 1. |
| Migrations at start | The container runs `python -m app.services.migrate` before uvicorn (`backend/Dockerfile`). One task, so they never race; a failing migration stops the new task and ECS keeps the old one. Replaces the old Database (Supabase) workflow: RDS is private, so GitHub can't reach it. |
| `X-Origin-Verify` | The Express Mode address is public. CloudFront adds a random header and the API refuses `/api` without it (`OriginVerify` in `app/main.py`), so nobody can go around CloudFront. `/api/health` stays open for the load balancer. |
| RDS | No public address; only reachable from inside the VPC, over TLS, with the certificate checked against Amazon's CA (baked into the image). 7-day backups with point-in-time restore, deletion protection, a final snapshot, encrypted storage that grows to at most 50 GB. |
| `closed-loop/db` | The database password: generated during the apply and written to RDS and this secret through **write-only** arguments, so it never appears in state or a plan. ECS gives it to the task as `PGPASSWORD`. |
| `closed-loop/api` | The secret values you set with the CLI (below). Every key in `secret_keys` must exist in it, or the task won't start. |
| Email | Gmail SMTP with an App Password, as locally. Brevo was only needed because Render's free plan blocks SMTP; AWS only throttles port 25, and Gmail uses 587. About 500 emails a day. |

---

## First time, in this order

You need: an AWS account, the AWS CLI signed in as an admin on this machine (`aws sts get-caller-identity`
works), Terraform ≥ 1.11, Docker, and the GitHub CLI (`gh`).

### 1. The state bucket

```bash
scripts/bootstrap-state.sh
cd infra
terraform init -backend-config="bucket=closed-loop-tfstate-$(aws sts get-caller-identity --query Account --output text)"
```

### 2. The image registry and the secret, first

The service needs an image and its secret values to exist before it can start:

```bash
terraform apply -target=aws_ecr_repository.api -target=aws_secretsmanager_secret.api
```

### 3. Set the secret values

Every key in `secret_keys` (`infra/app.auto.tfvars`). Write them to a file outside the repo, send it, delete it:

```bash
cat > /tmp/closed-loop-api.json <<'JSON'
{
  "KEY_ENCRYPTION_SECRET": "<openssl rand -base64 48>",
  "ADMIN_EMAILS": "you@gmail.com",
  "GOOGLE_CLIENT_SECRET": "<same as your local .env>",
  "SMTP_USER": "<the Gmail address emails come from>",
  "SMTP_APP_PASSWORD": "<its App Password, no spaces>"
}
JSON
aws secretsmanager put-secret-value --secret-id closed-loop/api --secret-string file:///tmp/closed-loop-api.json
rm /tmp/closed-loop-api.json
```

**Never change `KEY_ENCRYPTION_SECRET` once set**: it encrypts the API keys people save, and a new one makes
every saved key unreadable. `GOOGLE_CLIENT_ID` is not secret; it's in `app.auto.tfvars`.

### 4. Push the first image (tagged `initial`)

From the repo root:

```bash
registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin "$registry"
docker build -f backend/Dockerfile --build-arg GIT_SHA=initial -t "$registry/closed-loop-api:initial" .
docker push "$registry/closed-loop-api:initial"
```

The build trains the models (about 2 minutes).

### 5. Everything else

```bash
cd infra
terraform apply   # RDS and CloudFront take 10–20 minutes
```

Then put the `app_url` output (`https://dxxxx.cloudfront.net`) into `app_url` in `infra/app.auto.tfvars`
and `terraform apply` once more: the API needs its own address for Google's redirect and the links in emails.
Open `<app_url>/api/health`: `{"status":"ok","version":"initial"}`.

### 6. GitHub

1. **Settings → Environments**: create `production` and `infra`. For both: **Deployment branches and tags** →
   *Selected branches* → `main`. Optional: **Required reviewers** → yourself.
2. Run the commands from `terraform output -raw github_variables` (they set `AWS_ACCOUNT_ID`,
   `ECS_SERVICE_ARN`, `CLOUDFRONT_DISTRIBUTION_ID` as repository variables).
3. Optional: `gh variable set ALERT_EMAIL --body you@gmail.com`, then run **Infra (Terraform)**: a $100/month
   budget alert and a "no running task" alarm. AWS emails a confirmation link first.

### 7. Google sign-in for the live address

[Google Cloud console](https://console.cloud.google.com/auth/clients) → your OAuth client:

- **Authorized JavaScript origins** → add `https://dxxxx.cloudfront.net`
- **Authorized redirect URIs** → add `https://dxxxx.cloudfront.net/api/auth/google/callback`

### 8. Deploy

Commit (with the new `app_url`) and push to main; wait for Closed Loop checks. Then **Actions → Deploy backend
(AWS) → Run workflow**, and **Deploy frontend (AWS) → Run workflow**. Open the CloudFront address and
**Continue with Google** with the email in `ADMIN_EMAILS`.

### Moving off Render, Vercel and Supabase

RDS starts empty. If Supabase holds data you need (the study log, work-order outcomes), export it first with
the dashboard's CSV exports. Once AWS works: delete the Render service, the Vercel project and the Supabase
project, and remove the old `production` secrets (`DATABASE_URL`, `RENDER_DEPLOY_HOOK_URL`, `VERCEL_*`).

---

## Every day after

| Task | How |
|---|---|
| Ship code | Push to main (checks run), then **Deploy backend** and/or **Deploy frontend** |
| Change the database | Add the migration files (below), push, **Deploy backend**: the new task applies them as it starts |
| Change infrastructure | Pull request touching `infra/` (the plan is in the run summary), merge, then **Infra (Terraform) → Run workflow** |
| Change a plain setting | Edit `infra/app.auto.tfvars`, then apply as above |
| Change a secret value | Secrets Manager → `closed-loop/api` → Edit (or `put-secret-value` as in step 3), then **Deploy backend** (secrets are read at start) |
| New database password | Raise `db_password_version`, apply, then **Deploy backend** |
| Roll back the backend | Re-run **Deploy backend** on an older commit (ECR keeps the last 10 images) |
| Logs | CloudWatch → Log groups → `/ecs/closed-loop-api` (14 days) |
| Restore the database | RDS → `closed-loop` → Actions → Restore to point in time (makes a new instance) |
| Tear down | Set `deletion_protection = false` and apply, then `terraform destroy`. RDS leaves a final snapshot `closed-loop-final` |

Runtime settings changed on the Settings page are written to `config/settings.json` inside the container,
so a deploy or restart puts them back to the committed file. Commit the values you want to keep.

### Changing the database

Write the change twice, because SQLite and Postgres SQL differ:

- `backend/app/migrations/sqlite/NNNN_<name>.sql` (next number after the highest there; ends with
  `PRAGMA user_version = NNNN;` inside `BEGIN … COMMIT`), and raise `SCHEMA_VERSION` in `services/db.py`;
- `backend/app/migrations/postgres/NNNN_<name>.sql` (next number in *that* folder; no BEGIN/COMMIT,
  the runner wraps each file in a transaction).

**Never edit a migration that has run**: its checksum won't match, the new task refuses to start and the
deploy fails (the old task keeps serving). Add a new file instead. To try one on your own Postgres first:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:17
cd backend
DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres .venv/bin/python -m app.services.migrate
TEST_DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres .venv/bin/python -m pytest -q
```

`TEST_DATABASE_URL` empties the database it points at before every test.

---

## Cost

The full month-by-item calculation is in the [README → Deploying → Cost](../README.md#cost): about **$81 a month**.
