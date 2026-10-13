# Deployment

## Backend rollout

The authoritative schema is `supabase/migrations/`. Historical standalone SQL files are retained for reference and must not be rerun: they contain superseded grants, policies and RPC contracts.

The September 16 audit was implemented and tested on local Docker Supabase. The connected hosted project was inspected read-only and differs materially from this application's local schema. Do not push the migration history blindly to that project. Reconcile its schema and migration history in an isolated staging clone, back up data, and test the complete versioned migration chain before rollout.

The refinement migration replaces accumulated permissive policies, validates cafe membership and sessions, introduces capability-protected customer orders and private receipts, and adds atomic owner provisioning. Deploy the matching frontend and all three Edge Functions together:

- `provision-cafe-owner`: validates the caller; the database provisions the account, cafe and subscription in one transaction.
- `delete-cafe`: validates the platform caller, deletes tenant records transactionally, and removes files only from trusted cafe prefixes. Database and object storage cannot share a transaction; a file cleanup failure is reported explicitly.
- `send-push`: validates role and order ownership and uses server-generated messages. Configure server-only `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a contact mailto URL). The browser receives only the public VAPID key.

Inspect the installed CLI's `--help` for deployment commands. Auth passwords and service-role/VAPID private keys must never appear in `VITE_*`, source code, build output or logs.

## Data compatibility

- Existing UUID-only tracking links deliberately stop authorizing customer access. Complete existing customer orders before cutover or provide securely verified replacement capabilities. Do not restore UUID-only access.
- Move any historical receipt objects out of the public `cafe-assets` bucket into private `payment-proofs`, update their order paths, then remove the public copies. New uploads already use private storage and short-lived signed URLs. The local test database had no historical public receipts.
- Reconcile duplicate physical table numbers before generating new QR codes for affected cafes. The local `enterprise-cafe` has nine rows labeled table 1; these were preserved. The new trigger prevents additional duplicates.
- Review any constraint-validation warnings in staging. All 13 new relationship/value constraints validated successfully on the local database.
- Do not seed production with development accounts. Owner/staff provisioning currently follows the repository's SQL Auth-account model; test it against the target Supabase Auth version before upgrades.

## Frontend and production settings

Set the frontend Supabase URL and publishable key, then run `npm ci`, `npm test`, `npm run lint`, and `npm run build`. Publish `dist/` using the existing Vercel, Netlify, or Docker configuration and retain the SPA fallback for direct URLs. Set the production Auth site URL, exact allowed reset-password redirect URLs, SMTP credentials, and HTTPS domain. Test real reset email delivery and invalid/expired links.

Before production release, rerun the adversarial two-cafe API tests against a disposable staging setup, verify staff onboarding and password resets, test push delivery on real supported devices, inspect console/network failures, and perform realistic data-volume/concurrency testing. Browser receipts and cash approvals are manual payment workflows; no external payment processor or refund workflow is implemented.

History/report queries paginate so they do not silently truncate at 1,000 orders. Active workspaces filter at the database; full history/report polling is slower and shared. Very large reporting ranges still load records into the browser and should be load-tested before high-volume rollout. Auto-ready currently depends on an open staff application; a server scheduler is not part of this implementation.

## September 21 commercial refinement rollout

Deploy the frontend together with `20260921080935_commercial_platform_refinement.sql` and `20260921081510_enforce_menu_usage_limit.sql`, following the staging reconciliation above. The complete 28-migration chain replays locally with an empty schema diff. These migrations add regional settings/order snapshots, enforce package restrictions on reads and mutations, validate package limits, serialize menu-limit checks, and prevent overlapping active/approved subscriptions.

Before applying them to existing data:

- Find and resolve multiple active/approved subscription rows for a cafe. The new unique index intentionally rejects ambiguous assignments rather than silently choosing a winner.
- Verify each cafe's actual sales currency and time zone. Defaults are ETB and Africa/Addis_Ababa, matching historical application behavior; existing order currency snapshots use ETB. Reconcile different historical currencies explicitly before rollout. Currency changes are blocked once a cafe has orders; there is no automatic catalog conversion or FX engine.
- Review package feature composition and positive integer menu/staff limits. Features are explicit, with no tier inheritance. Existing Starter lacks staff access; existing Professional lacks guest menu/ordering. Preserve tenant entitlements unless an approved commercial change is intended.
- Published subscription prices are USD 29/79/199 per month. The migration changes only matching original price strings and misleading default descriptions, preserving custom values. Subscription requests require platform approval; the app does not collect recurring charges automatically.
- Configure abuse protection for the public subscription-request endpoint, complete translated copy and validate regional rounding requirements. The monetary engine currently uses two decimal places.

Rerun `node scripts/audit-marketing.mjs` with the local app served on port 3010 (or set `AUDIT_APP_URL`) to verify actual package display, request failure/success behavior, mobile navigation, dialog keyboard behavior, language switching and responsive pricing. The script creates and removes one uniquely identified local request. Never seed or run destructive fixture suites against production.
