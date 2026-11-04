# Portable spec: "Sign in with Google" (no auth vendor)

> **To the AI reading this:** recreate the Google sign-in described below in the project you're working in.
> It is a complete, tested implementation (taken from Seri Cloud). If the target project uses the same stack
> (Node + Express + Postgres + a browser SPA), copy the code as-is. If not, port it **keeping every rule in
> [§2 Non-negotiable rules](#2-non-negotiable-rules)**: those are the security properties, the code is just one way to get them.
> Ask the human for the Google client ID/secret; never invent them or commit them.

**What you get:** OpenID Connect authorization-code flow + PKCE against Google, server-side sessions in Postgres
(only the token hash is stored), an httpOnly cookie, a `requireUser` middleware, `/me`, logout, and an audit log of every
signup / login / failed login / logout. Zero auth libraries: only `fetch`, `node:crypto`, `express`, `pg`, `zod`.

---

## 1. How it works

```
Browser                         Your API                                   Google
  │  click <a href="/api/auth/google">  (real navigation, not fetch)
  │ ─────────────────────────────▶ make state, PKCE verifier, nonce
  │                                 store all 3 in a 10-min httpOnly cookie
  │ ◀──── 302 to accounts.google.com?client_id&redirect_uri&state&nonce&code_challenge
  │ ──────────────────────────────────────────────────────────────────────▶ user picks account
  │ ◀──────────────────────────────────────── 302 /api/auth/google/callback?code&state
  │ ─────────────────────────────▶ check state == cookie state
  │                                 POST code + secret + verifier ─────────▶ token endpoint
  │                                 ◀──────────────────────────────────────── id_token (JWT)
  │                                 check iss, aud, exp, nonce, email_verified
  │                                 upsert user by `sub`, create session, audit rows (1 transaction)
  │ ◀──── 302 APP_URL/  + Set-Cookie: sid=<random token>   (DB stores sha256(token) only)
  │  GET /api/auth/me  (cookie sent automatically) → { user }
```

The browser and API must be **same-origin** (the SPA dev server / CDN proxies `/api/*` to the API). That's what lets a
plain `SameSite=Lax` cookie work with no CORS setup.

## 2. Non-negotiable rules

1. **`state`** (random, 32 bytes) checked on callback → CSRF protection.
2. **PKCE S256**: send `code_challenge = base64url(sha256(verifier))`, send `code_verifier` on exchange.
3. **`nonce`** sent to Google and must equal the `nonce` claim in the ID token → replay protection.
4. state/verifier/nonce live in an **httpOnly cookie scoped to `/api/auth/google`, max 10 min**, cleared on callback.
5. Code → token exchange happens **server to server** with the client secret. The secret never reaches the browser.
6. ID token claims checked: `iss ∈ {accounts.google.com, https://accounts.google.com}`, `aud == CLIENT_ID`, `exp` in future,
   `nonce` matches, `email_verified == true`. (Signature check is skipped *only because* the token came directly from
   Google's token endpoint over TLS, which OIDC Core §3.1.3.7 allows. If you ever accept an ID token from the browser,
   you **must** verify its signature against Google's JWKS.)
7. Users are keyed on **`sub`** (Google's stable id), never on email.
8. Session token = 32 random bytes; DB stores **only `sha256(token)`**. Cookie: `httpOnly`, `SameSite=Lax`, `Path=/`,
   `Secure` when on HTTPS, `Max-Age` = session TTL.
9. User upsert + session + audit rows in **one transaction**. Cookie set only after commit.
10. Every failure redirects to `APP_URL/login?error=<cancelled|state|exchange|token>` and writes a `login_failed` audit row.
11. Scopes are only `openid email profile` (no Google verification review needed).
12. `trust proxy` set to the number of proxy hops so the logged IP is the real client.

## 3. Google Cloud Console setup (human does this, ~5 min)

1. https://console.cloud.google.com → project picker → **New project** → create and select it.
2. **APIs & Services → OAuth consent screen** (opens *Google Auth Platform*) → **Get started**:
   app name, support email, **Audience: External**, contact email → Create.
3. **Audience → Test users → Add users**: every Gmail that should be able to sign in. In *Testing* mode only these
   accounts can sign in (max 100). Publish the app later to open it to everyone.
4. **Clients → Create client** → *Web application*:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173/api/auth/google/callback`
5. Copy the **Client ID** and **Client secret** immediately (the secret may not be shown again).
6. For production, **add** `https://<your-domain>/api/auth/google/callback` (and the origin) to the same client. Keep localhost.

Changes can take ~5 minutes to apply. The redirect URI must match `APP_URL + /api/auth/google/callback` **exactly**
(scheme, host — `localhost` ≠ `127.0.0.1` — port, no trailing slash).

## 4. Environment

```dotenv
DATABASE_URL=postgres://app:app@localhost:5432/app
PORT=4000
# Public origin the browser uses (the SPA origin that proxies /api). Builds the redirect URI.
APP_URL=http://localhost:5173
# true on HTTPS (production)
COOKIE_SECURE=false
SESSION_TTL_DAYS=7
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`.env` must be gitignored. In production set these as real environment variables.

## 5. Database schema

Run once (put it in your migration system):

```sql
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,          -- Google's stable account id
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                 -- sha256 of the cookie value; the raw token is never stored
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip         INET,
  user_agent TEXT
);
CREATE INDEX sessions_user_id ON sessions (user_id);

-- Audit trail. Insert-only. user_id becomes NULL if the user is deleted so history survives.
CREATE TABLE auth_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event      TEXT NOT NULL CHECK (event IN ('signup', 'login', 'login_failed', 'logout')),
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT,
  reason     TEXT,                             -- login_failed only: cancelled | state | exchange | token
  ip         INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_created_at ON auth_events (created_at DESC);
CREATE INDEX auth_events_user ON auth_events (user_id, created_at DESC);
```

## 6. Backend (Node 24 + Express 5 + pg + zod, ESM TypeScript)

Dependencies: `express pg zod` (+ dev: `typescript @types/express @types/node @types/pg`). Node 24 runs `.ts` directly
(`node --env-file-if-exists=.env src/index.ts`); on older Node use `tsx`. If the project is plain JS, drop the types.

### `src/env.ts`

```ts
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.url(),
  APP_URL: z.url(),
  COOKIE_SECURE: z.stringbool().default(false),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment (see .env.example):\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
```

### `src/db.ts`

```ts
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
```

### `src/auth.ts` — sessions, cookies, audit, `requireUser`

```ts
import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type pg from 'pg';
import { pool } from './db.ts';
import { env } from './env.ts';

export const SESSION_COOKIE = 'sid';

// A pool or a client inside a transaction.
type Db = Pick<pg.Pool, 'query'>;

export const randomToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

export function readCookie(req: Request, name: string) {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
}

export const cookieOptions = (maxAgeMs: number, path = '/') =>
  ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path, maxAge: maxAgeMs }) as const;

const sessionTtlMs = () => env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const client = (req: Request) => [req.ip ?? null, req.get('user-agent')?.slice(0, 500) ?? null];

export type AuthEvent = 'signup' | 'login' | 'login_failed' | 'logout';

export async function logAuthEvent(
  db: Db,
  req: Request,
  event: AuthEvent,
  details: { userId?: string; email?: string; reason?: string } = {},
) {
  await db.query(
    'INSERT INTO auth_events (event, user_id, email, reason, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
    [event, details.userId ?? null, details.email ?? null, details.reason ?? null, ...client(req)],
  );
}

// Returns the raw token; only its hash is stored. Set the cookie after the transaction commits.
export async function createSession(db: Db, req: Request, userId: string) {
  const token = randomToken();
  await db.query('DELETE FROM sessions WHERE expires_at < now()'); // cheap housekeeping
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + $3 * interval '1 millisecond', $4, $5)`,
    [sha256(token), userId, sessionTtlMs(), ...client(req)],
  );
  return token;
}

export const setSessionCookie = (res: Response, token: string) =>
  res.cookie(SESSION_COOKIE, token, cookieOptions(sessionTtlMs()));

export async function endSession(req: Request, res: Response) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const { rows } = await pool.query<{ user_id: string; email: string }>(
      `DELETE FROM sessions s USING users u
        WHERE s.token_hash = $1 AND u.id = s.user_id
        RETURNING s.user_id, u.email`,
      [sha256(token)],
    );
    if (rows[0]) await logAuthEvent(pool, req, 'logout', { userId: rows[0].user_id, email: rows[0].email });
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export type User = { id: string; email: string; displayName: string; avatarUrl: string | null };

// Puts the signed-in user on res.locals.user, or answers 401.
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const { rows } = await pool.query<User>(
    `SELECT u.id, u.email, u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!rows[0]) return res.status(401).json({ error: 'Session expired' });

  res.locals.user = rows[0];
  next();
}
```

### `src/routes/auth.ts` — the Google flow

```ts
// Google sign-in, built directly on OpenID Connect (authorization code flow + PKCE). No auth vendor.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db.ts';
import { env } from '../env.ts';
import {
  cookieOptions, createSession, endSession, logAuthEvent, randomToken, readCookie, requireUser, setSessionCookie, sha256,
} from '../auth.ts';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const FLOW_COOKIE = 'google_flow';
const FLOW_PATH = '/api/auth/google';
const redirectUri = `${env.APP_URL}/api/auth/google/callback`;

type FailReason = 'cancelled' | 'state' | 'exchange' | 'token';

// Every failed sign-in is recorded, then the browser goes back to the login page with a reason.
async function fail(req: Request, res: Response, reason: FailReason, email?: string) {
  await logAuthEvent(pool, req, 'login_failed', { reason, email });
  res.redirect(`${env.APP_URL}/login?error=${reason}`);
}

type IdTokenClaims = {
  iss: string; aud: string; exp: number; nonce?: string;
  sub: string; email: string; email_verified: boolean; name?: string; picture?: string;
};

export const authRouter = Router();

// 1. Send the browser to Google with a fresh state (CSRF), PKCE verifier and nonce (replay).
authRouter.get('/google', (_req, res) => {
  const state = randomToken();
  const verifier = randomToken();
  const nonce = randomToken();
  res.cookie(FLOW_COOKIE, `${state}.${verifier}.${nonce}`, cookieOptions(10 * 60 * 1000, FLOW_PATH));

  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: sha256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  res.redirect(url.href);
});

// 2. Google sends the browser back here with a one-time code.
authRouter.get('/google/callback', async (req, res) => {
  const [state, verifier, nonce] = readCookie(req, FLOW_COOKIE)?.split('.') ?? [];
  res.clearCookie(FLOW_COOKIE, { path: FLOW_PATH });

  const { code, state: returnedState, error } = req.query;
  if (error) return fail(req, res, 'cancelled');
  if (typeof code !== 'string' || !state || returnedState !== state) return fail(req, res, 'state');

  // 3. Exchange the code for tokens, server to server.
  let idToken: string;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) throw new Error(`${tokenRes.status} ${await tokenRes.text()}`);
    idToken = ((await tokenRes.json()) as { id_token: string }).id_token;
  } catch (err) {
    console.error('google token exchange failed:', err);
    return fail(req, res, 'exchange');
  }

  // 4. Check the ID token's claims. The token came straight from Google's token endpoint over TLS,
  //    so per OIDC Core §3.1.3.7 the TLS check stands in for verifying its signature.
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as IdTokenClaims;
  const valid =
    GOOGLE_ISSUERS.includes(claims.iss) &&
    claims.aud === env.GOOGLE_CLIENT_ID &&
    claims.exp * 1000 > Date.now() &&
    claims.nonce === nonce &&
    claims.email_verified;
  if (!valid) return fail(req, res, 'token', claims.email);

  // 5. Find or create the user (keyed on Google's stable `sub`), start a session and record it,
  //    all in one transaction: a sign-in is never saved without its audit row, or the reverse.
  const db = await pool.connect();
  let token: string;
  try {
    await db.query('BEGIN');
    const { rows } = await db.query<{ id: string; inserted: boolean }>(
      `INSERT INTO users (google_sub, email, display_name, avatar_url, last_login_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (google_sub) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
             avatar_url = EXCLUDED.avatar_url, last_login_at = now()
       RETURNING id, (xmax = 0) AS inserted`, // xmax = 0 only for a freshly inserted row
      [claims.sub, claims.email, claims.name ?? claims.email.split('@')[0], claims.picture ?? null],
    );
    const { id: userId, inserted } = rows[0];
    token = await createSession(db, req, userId);
    if (inserted) await logAuthEvent(db, req, 'signup', { userId, email: claims.email });
    await logAuthEvent(db, req, 'login', { userId, email: claims.email });
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }

  setSessionCookie(res, token);
  res.redirect(`${env.APP_URL}/`);
});

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

authRouter.get('/me', requireUser, (_req, res) => {
  res.json({ user: res.locals.user });
});
```

### Wire it up in `src/index.ts`

```ts
import express from 'express';
import { env } from './env.ts';
import { authRouter } from './routes/auth.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // one proxy hop (Vite dev proxy / CDN), so req.ip is the real client
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', authRouter);
// Protect any other route with: app.get('/api/thing', requireUser, handler)  → res.locals.user
app.listen(env.PORT, () => console.log(`api listening on :${env.PORT}`));
```

Express 5 forwards rejected async handlers to the error middleware, so no try/catch wrappers are needed. On Express 4,
wrap async handlers or add `express-async-errors`.

## 7. Frontend contract (any framework)

| Need | Do this |
|---|---|
| Same origin | Proxy `/api` → API. Vite: `server: { proxy: { '/api': { target: 'http://localhost:4000', xfwd: true } } }`. Production: CDN/reverse proxy routes `/api/*` to the API. |
| Sign-in button | A plain link `<a href="/api/auth/google">Continue with Google</a>`. **Not** `fetch` — it must be a full navigation. |
| Who am I | `fetch('/api/auth/me', { credentials: 'include' })` → `200 { user: { id, email, displayName, avatarUrl } }` or `401` = signed out. |
| Sign out | `fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })` → `204`, then clear cached user and go to `/login`. |
| Route guard | Before protected pages load, call `/me`; on `null`/401 redirect to `/login`. On `/login`, if signed in redirect to `/`. |
| Errors | `/login?error=` → `cancelled`: "Sign-in was cancelled." · `state`: "That sign-in link expired. Please try again." · `exchange` / `token` / anything else: "Google sign-in failed. Please try again." |
| Avatar | `<img src={avatarUrl} referrerPolicy="no-referrer">` (Google's image host can refuse requests with a referrer). |

React + TanStack Query example:

```ts
export const meQuery = queryOptions({
  queryKey: ['me'],
  staleTime: 5 * 60 * 1000,
  queryFn: async () => {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(res.statusText);
    return (await res.json()).user as { id: string; email: string; displayName: string; avatarUrl: string | null };
  },
});
```

## 8. Porting to a different stack

Keep the routes, cookie names/paths, schema and §2 rules; swap only the plumbing:

| Piece here | Equivalent elsewhere |
|---|---|
| `node:crypto` randomBytes / sha256 | Python `secrets.token_urlsafe(32)` + `hashlib.sha256` → base64url without `=` padding; Go `crypto/rand` + `crypto/sha256` |
| Express router | FastAPI/Flask routes, Next.js route handlers (`app/api/auth/google/route.ts`), Hono, etc. |
| `pg` + raw SQL | Any Postgres client. Other DBs: replace `GENERATED ... IDENTITY`, `INET`, `TIMESTAMPTZ` and the `xmax = 0` trick (instead: try SELECT by `google_sub` first inside the transaction) |
| zod env | Any startup check that fails fast when vars are missing |
| No same-origin proxy possible | Then you need CORS with `credentials: true` + exact origin, and `SameSite=None; Secure` cookies. Prefer adding a proxy. |

PKCE note: `code_challenge` is base64url (no padding) of the SHA-256 **bytes** of the verifier string. The verifier here
is 43 chars of base64url, which satisfies RFC 7636's 43–128 char rule.

## 9. Verify it works

1. API starts; with Google vars empty it exits listing the missing vars.
2. Click *Continue with Google* → account picker → land on `/` signed in; `GET /api/auth/me` returns the user.
3. DB: one `users` row, one `sessions` row whose `token_hash` ≠ the `sid` cookie value, `auth_events` has `signup` + `login`.
4. Sign in again → no new user, new `login` event, no `signup`.
5. Cancel on Google's screen → `/login?error=cancelled` + `login_failed` row.
6. Hit `/api/auth/google/callback?code=x&state=wrong` → `/login?error=state`.
7. Sign out → `204`, session row gone, `logout` event with email, `/me` → 401.
8. Second browser signs in → two sessions; logging out one leaves the other working.

## 10. Troubleshooting

| Symptom | Cause |
|---|---|
| `Error 400: redirect_uri_mismatch` | Console redirect URI ≠ `APP_URL/api/auth/google/callback` exactly (http vs https, localhost vs 127.0.0.1, port, trailing slash) |
| "Access blocked: app has not completed verification" | Account isn't in Test users (app is in Testing mode) |
| `?error=state` every time | Flow cookie not coming back: different host between start and callback, or `COOKIE_SECURE=true` on plain http |
| `?error=exchange` | Wrong client secret or redirect URI mismatch; the API log prints Google's reason |
| Signed in but `/me` is 401 | Cookie blocked: API not same-origin, `Secure` cookie over http, or fetch without `credentials: 'include'` |
| Phone on LAN can't sign in | Google only allows plain-http redirect URIs for `localhost`; test phones against an HTTPS deployment |

## References

- OAuth 2.0, RFC 6749 — https://datatracker.ietf.org/doc/html/rfc6749
- PKCE, RFC 7636 — https://datatracker.ietf.org/doc/html/rfc7636
- Cookies, RFC 6265 — https://datatracker.ietf.org/doc/html/rfc6265
- OpenID Connect Core 1.0 (§3.1.3.7 ID token validation) — https://openid.net/specs/openid-connect-core-1_0.html
- Google, OpenID Connect — https://developers.google.com/identity/openid-connect/openid-connect
- Google, OAuth 2.0 for Web Server Applications — https://developers.google.com/identity/protocols/oauth2/web-server
