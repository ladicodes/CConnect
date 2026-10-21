# Connect-Ask

Connect-Ask is Covenant Connect's participation platform: **Scan → Explore → Participate → Connect.**

Members scan a QR code and can, without an account:

- ask an anonymous question
- browse the moderated Question Board and say "I have this question too"
- add context to a question, or general context about the service
- send a private prayer request
- share thanksgiving or a testimony, and choose whether it may be published

Church leaders sign in to moderate everything, run services, and drive the projector (QR code and live Q&A).

## Try it locally (no accounts needed)

Requires Node.js 22.12 or newer.

```bash
npm ci
npm run dev
```

(`npm run dev` does this automatically whenever no `DATABASE_URL` is configured; `npm run dev:local` always does.)

This starts:

- a private Postgres database in `.local/` (from `node_modules`, no Docker)
- a local stand-in for Supabase Auth
- the app at http://localhost:3000, starting empty, just like a new deployment

| Sign in at `/admin/login` | Email | Password |
|---|---|---|
| Administrator | `admin@connect-ask.local` | `local-admin-password` |
| Moderator | `moderator@connect-ask.local` | `local-moderator-password` |

Flags:

- `npm run dev:local -- --reset` wipes the local database.
- `--sample` adds example questions, prayers and testimonies, which is handy for a demo.
- `--production` serves the last `npm run build`.

The local sign-in service and these passwords exist only on your machine. Production configuration checks reject a local Supabase address.

To develop against your **development** Supabase project instead, fill in `.env.local` from `.env.example` and run `npm run dev`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Checks

```bash
npm run lint
npm run typecheck
npm test            # unit + database + API tests (starts its own throwaway Postgres)
npm run build
npm run test:e2e    # builds, then runs Playwright against a fresh local stack
```

The first time you run end-to-end tests, install the browser with `npx playwright install chromium`.

## How it is built

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4 |
| Data | Supabase Postgres, accessed from the server only, through the `postgres` driver |
| Staff sign-in | Supabase Auth (email and password, invite-only) |
| Validation | Zod on the server, plus database `CHECK` constraints |
| QR | `qrcode`, rendered as crisp SVG from `SITE_URL` |
| Tests | Vitest (unit, database, API) and Playwright with axe (end-to-end, accessibility) |

```
src/app/(home)        homepage
src/app/(site)        Question Board, question pages, prayer, testimonies, privacy
src/app/(focus)       distraction-free forms: ask, context, share a testimony
src/app/admin         staff dashboard, server actions, projector screens
src/app/api           public submission and support endpoints, health, QR, presentation
src/lib               env, database, auth, validation, rate limits, data access
supabase/migrations   the schema, security policies and functions (single source of truth)
scripts               local stack, migrations, staff management, logo processing
tests                 unit, db, api, e2e
```

### Security model

1. **The browser never talks to the database.** All tables live in the `app` schema, which is not exposed through the Supabase Data API.
2. **The server has no privileges of its own.** It connects as `connect_ask_app`. Every transaction switches to one of two roles:
   - `connect_ask_public` can only read four views of approved content and call narrow functions. These are submit, support and rate-limit. Submissions are always created as pending.
   - `connect_ask_staff` gets table access filtered by row-level security, keyed on the Supabase user that the server verified for this request. Moderators can't see prayer requests or testimonies; admins can.
3. **Publication rules are enforced in the database.**
   - Visibility and answer status are separate columns.
   - A testimony can't be `published` without `share_consent` (a `CHECK` constraint).
   - Only one service can be active (a unique index plus an advisory lock).
   - Support counts are maintained by triggers.
4. **Anonymous by design.**
   - No names, emails or phone numbers are collected.
   - "Me too" and rate limits use a random browser id in an httpOnly cookie. The database stores only HMACs of it (`ANON_ID_SECRET`).
   - Network addresses are only ever hashed for short-lived rate limits.
5. **Abuse protection without CAPTCHAs.**
   - A honeypot field catches simple bots.
   - Per-browser limits (10 submissions per 10 minutes) stop scripts.
   - A deliberately generous per-network limit (400 per 10 minutes) stops floods without blocking a congregation that shares one church Wi-Fi.
   - Moderation stops anything reaching the public unreviewed.
   - Cloudflare Turnstile is optional; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#optional-cloudflare-turnstile).
6. **Reliable submissions.**
   - Each draft carries a client-generated id, so retries are idempotent.
   - Drafts survive reloads.
   - Success is shown only after the database commits.
   - Submissions use route handlers rather than Server Actions, so a deploy mid-service doesn't break open forms.

## Brand

The official logo is `logo.png` (unchanged); an exact copy is at `public/covenant-connect-logo.png`.

The app uses `public/brand/covenant-connect-logo-transparent.png`. It was made by `npm run brand:logo`, which removes only the off-white background and the empty margin. It doesn't redraw or recolour the artwork.

The design direction is documented in [docs/design-direction.html](docs/design-direction.html).

## More documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers Supabase, admin accounts, Vercel, the production QR code, and verification after deploy.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) covers using it on a Sunday, maintenance, troubleshooting, and data retention.
