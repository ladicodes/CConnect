# Deploying Connect-Ask

This guide sets up a **new** Supabase project and a **new** Vercel project. It doesn't touch the existing Connect-Ask deployment or its database. Keep the old app running until this one passes the verification at the end.

Do everything twice: once for **development** (to test), then for **production**.

## 1. Supabase project

1. Create a project at https://supabase.com. Use a separate project for development and production.
2. **Authentication → Sign In / Providers → Email:** keep email/password on and turn **"Allow new users to sign up" off**. Turn anonymous sign-ins off.
3. **Authentication → URL Configuration:** set the Site URL to your site address (e.g. `https://ask.example.org`).
4. Copy, without sharing them anywhere public:
   - **Project URL**: Project Settings → API.
   - **Publishable key** (`sb_publishable_…`), or the legacy anon key.
   - **Database connection strings**: Project Settings → Database → Connect.

## 2. Create the database schema

On your own computer, put the `postgres` connection string into `.env.local` as `DATABASE_ADMIN_URL`. Use the "Session pooler" or "Direct" string, with your database password. Then run:

```bash
npm run db:migrate
```

Alternatively, paste `supabase/migrations/20261020000001_connect_ask_schema.sql` into the SQL editor and run it.

## 3. Give the app its own database login

The app never uses the `postgres` password. In the Supabase SQL editor, run this, using a long random password (for example from `openssl rand -base64 32`):

```sql
alter role connect_ask_app with login password 'REPLACE-WITH-A-LONG-RANDOM-PASSWORD';
```

Build `DATABASE_URL` from the **Transaction pooler** connection string (port 6543), replacing the user and password:

```
postgresql://connect_ask_app.<project-ref>:<that-password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

## 4. Add church leaders (no public sign-up)

1. In Supabase, go to **Authentication → Users → Add user → Create new user** (or **Invite user**). Use the leader's email and a strong password, then share the password with them privately.
2. On your computer, with `DATABASE_ADMIN_URL` set, run:

```bash
npm run staff -- add pastor@example.org admin "Pastor's office"
npm run staff -- add media@example.org moderator "Media team"
npm run staff -- list
npm run staff -- role media@example.org admin
npm run staff -- remove someone@example.org
```

- **Admins** see everything, including private prayer requests and testimonies.
- **Moderators** handle questions, context, services, the QR code and Live Q&A, but never see prayer requests or testimonies.

Removing someone takes effect on their next page load.

## 5. Vercel

1. Push this project to a new GitHub repository and import it in Vercel (Framework: Next.js).
2. Add these environment variables, setting **Production** and **Preview** separately:

| Variable | Secret? | Value |
|---|---|---|
| `DATABASE_URL` | Yes | The `connect_ask_app` transaction-pooler URL from step 3 |
| `SUPABASE_URL` | No | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | No | The publishable (or anon) key |
| `ANON_ID_SECRET` | Yes | 32+ random characters (`openssl rand -base64 48`). Keep it stable. |
| `SITE_URL` | No | The permanent HTTPS address, e.g. `https://ask.example.org` (no trailing path) |
| `APP_TIMEZONE` | No | e.g. `Africa/Lagos` (IANA name; defaults to UTC) |

Never add `DATABASE_ADMIN_URL` to Vercel. No variable uses the `NEXT_PUBLIC_` prefix, so nothing here reaches the browser.

3. Deploy. If anything is missing or wrong, signed-in staff see a **"Configuration needs attention"** panel on the admin Overview that names the variable without showing its value. `https://<site>/api/health` returns `ok: true` when everything is reachable.

### Custom domain and the permanent QR code

- Add your domain in Vercel → Settings → Domains, and set `SITE_URL` to exactly that address.
- The QR code always encodes `SITE_URL`, never the address you happen to be browsing.
- In production the app refuses to show a QR code for `http://`, localhost, or private network addresses.
- Use the final domain before printing the QR code. Once it's in service slides it shouldn't change. A custom domain keeps it stable even if hosting changes.
- On `/admin/qr`, use **PNG** or **SVG** to download the same code for slides.

## Optional: Cloudflare Turnstile

Not needed by default: rate limits, the honeypot and moderation already protect the site. Only turn Turnstile on if real abuse appears.

1. In Cloudflare, go to Turnstile → Add widget, choose "Managed", and add your **exact** production hostname (and any other hostname members use).
2. Set **both** `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel Production, then redeploy.
3. Test a real submission from a phone. If it fails, the server log shows a code such as `TURNSTILE_HOSTNAME_MISMATCH` or `TURNSTILE_REJECTED`.
4. To turn it off, remove both variables and redeploy.

Cloudflare's test keys (`1x0000…`) are rejected in production.

## 6. Verify the production deployment

A successful build doesn't prove the app works. After every deploy that changes configuration:

1. Open `https://<site>/api/health` and confirm it shows `"ok": true`.
2. On a phone, scan the QR code from `/admin/qr`. It should open the homepage at the right address.
3. From that phone, submit a question, some context, a prayer request and a testimony (choose "may be shared").
4. Sign in at `/admin/login` and confirm all four appear in Questions, Context, Prayer requests and Testimonies.
5. Approve the question. It should appear on `/questions` on the phone. Tap **Me too**, reload, and check it's still selected.
6. Hide the question. Its link should now say it isn't on the board.
7. Publish the testimony. It should appear on `/testimonies`.
8. Open `/admin/present` on the projector computer, press **Full screen**, then use **Live Q&A** to show a question and then the QR code.
9. Delete the test items.

Only switch the church over (new QR code in slides, links updated) once all of this passes.
