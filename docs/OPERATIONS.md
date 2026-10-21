# Running Connect-Ask

## On a Sunday

1. **Before the service:** go to Admin → Services → New service, then choose **Make it live now**. New questions and context are grouped under the live service, and the Question Board shows it first.
2. **On the projector computer:** open `/admin/present`, sign in if asked, and press **Full screen**. It shows the QR code until you choose otherwise.
3. **During the service:** review new items in Admin → Questions. Pages refresh by themselves every 20 seconds. Shortcuts: `J`/`K` to move, `A` approve, `P` keep private, `H` hide, `D` answered.
4. **For Q&A:** open Admin → **Live Q&A** on a laptop or phone. Press **Show** on a question to put it on the projector; it updates within a few seconds. **Show QR** brings the join screen back, and **Clear screen** shows only the logo.
5. **Afterwards:** mark questions **Answered** and close the service (Services → Close service).

Prayer requests and testimonies work whether or not a service is live.

## What each status means

| Questions | Meaning |
|---|---|
| Needs review | New. Not public. |
| On the board | Public on the Question Board. |
| Private | Leaders only. Can still be marked answered. |
| Hidden | Removed from the board. Its link no longer works. |
| Archived | Out of every list and the board, until restored. |

Answer status (Open, Being addressed, Answered) is separate from visibility, and changing one never changes the other.

**Context** appears publicly only when it's approved *and* linked to a question that's on the board. Independent context is only ever seen by leaders.

**Testimonies** are published only when the member chose "Leaders may share it publicly" *and* an admin presses Publish. The database refuses anything else.

## Maintenance

- **Dependencies:** run `npm outdated` monthly and update in a branch. Run `npm run lint && npm run typecheck && npm test && npm run test:e2e` before deploying.
- **Database changes:** add a new file to `supabase/migrations/` with a later timestamp; never edit one that has already run. Apply it to development with `npm run db:migrate`, test, then production.
- **Backups:** Supabase takes daily backups on paid plans. On the free plan, export regularly (Database → Backups, or `pg_dump` with `DATABASE_ADMIN_URL`).
- **Rotating secrets:**
  - To change the app's database password, run `alter role connect_ask_app ... password` again and update `DATABASE_URL` in Vercel.
  - Changing `ANON_ID_SECRET` resets every member's "Me too" memory and rate limits. Counts are kept.

## Data retention (decide as a church)

Connect-Ask keeps submissions until a leader deletes them. The church should agree how long to keep sensitive items, especially prayer requests, and periodically use **Delete** or run, for example:

```sql
-- Permanently delete prayer requests archived more than 6 months ago.
delete from app.prayer_requests where archived_at < now() - interval '6 months';
```

Rate-limit counters (hashed) are cleared automatically and are usually gone within a day.

## Troubleshooting

| Symptom | Check |
|---|---|
| Forms say they can't send right now | `/api/health`, then the Configuration panel on the admin Overview. Vercel logs show codes such as `SUBMIT_CONFIG_MISSING` or `SUBMIT_FAILED` (never message text). |
| "Sign-in is temporarily unavailable" | `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, and that the Supabase project isn't paused. |
| "This account doesn't have access" | Add the person with `npm run staff -- add …`. |
| QR page shows a configuration error | `SITE_URL` must be the HTTPS production address with no path. |
| Many people on church Wi-Fi get "several messages in a short time" | Shouldn't happen (the per-network limit is 400 per 10 minutes). If it does, raise `LIMITS.submit.network` in `src/lib/rate-limit.ts`. |
| Projector stopped updating | It shows "Reconnecting…" or "Signed out" in the corner. Reload the page or sign in again on that computer. |
