# Production Readiness Audit — DigiMenu (siawa Technologies)

**Date:** 2026-08-10
**Scope:** Full-stack review (React/Vite SPA + Supabase backend), code-level audit of `src/`, live Supabase project `moznzrdhfwoliwptpfxk`, production build (`dist/`), deployment configs.
**Verification performed:** `npm run lint` (passes, 17 warnings), `npm test` (32/32 pass), `npm run build` (passes), SPA smoke test (deep links serve 200), JWT payload decoding of production bundle, Supabase security advisors + table/function inspection.

---

## Verdict: **NO-GO for production launch**

Critical security vulnerabilities allow complete compromise of the Supabase project and payment data. The app must not be deployed until the Critical and High items below are remediated.

---

## CRITICAL FINDINGS

### C1. Supabase service_role key is shipped to the browser — total compromise
- `src/services/supabase.js:5` imports `import.meta.env.VITE_SUPABASE_SERVICE_KEY`; Vite inlines **all** `VITE_*` variables into the client bundle.
- Confirmed in the built artifact: `dist/assets/index-*.js` and `dist/assets/supabase-*.js` contain a JWT with `role: service_role` for project `moznzrdhfwoliwptpfxk`.
- `dataService.js` performs **every** database operation through this admin client: `supabaseAdmin.from("orders").insert/update/delete`, `auth.admin.createUser/deleteUser/listUsers` (dataService.js:367, 703, 716), storage uploads with the raw key in the `Authorization` header (dataService.js:16), and realtime channels.
- Impact: any visitor to the site can extract the key from the bundle and:
  - Read/write/delete **all** tables — orders, menus, settings, audit logs, payment options (incl. bank account numbers), push subscriptions.
  - Promote any account to `admin` (via `syncRoleToSupabase`, roleService.js:200) or disable accounts.
  - Create/delete/list staff users (`auth.admin`), upload arbitrary files to storage.
  - Delete audit logs to cover tracks.
- RLS is correctly enabled on all 8 tables, but is **completely bypassed** by the service key. The security model does not exist in practice.
- Note: the app *requires* this key to function — most customer-facing reads (orders, payment options, settings) would fail RLS with the anon key. The architecture itself must change (see Fix C1).

### C2. No server-side payment verification — anyone can mark orders paid
- `OrderPage.jsx` (customer-facing, unauthenticated) calls `updateOrder(orderId, {...})` (dataService.js:627), a generic update that accepts **arbitrary columns** with no role or scope check.
- Any customer who knows an order ID (in their URL; also enumerable via the public orders realtime feed) can run:
  `updateOrder("<id>", { paymentStatus: "paid", paidAt: ... })` and receive "payment received" confirmation without paying.
- Order totals are computed and submitted by the client and trusted as-is (`sanitizeOrder` validates *format* only — dataService.js:161 — never recomputes totals from item prices × quantity). A customer can submit `totalAmount: 0` or tampered item prices.
- Payment "verification" is entirely a UI convention (staff clicks approve on the cashier dashboard, AdminOrders.jsx:177 / CashierDashboard.jsx:169). Nothing prevents the customer from setting their own status.

### C3. Public disclosure of all order data and payment details
- Customer-facing `MenuPage.jsx` calls `fetchPopularItems()` (dataService.js:526) which downloads the **entire orders table** (all tables' orders, items, amounts) to compute popularity.
- `observeOrders`/`observeTable` return all rows to any page; every customer browser holds a realtime subscription receiving every order change in the venue.
- Order status pages are public by URL (no auth), including items, quantities, and payment status of other tables.
- Payment options (bank account number + holder + instructions) are readable by any visitor (`observePaymentOptions` on the public checkout page).

---

## HIGH FINDINGS

### H1. `send-push` edge function is an unauthenticated push relay
- Deployed with `verify_jwt: false`; accepts any POST `{ subscription, payload }` and sends a web-push notification to any endpoint using the project's VAPID credentials.
- Anyone can spam arbitrary endpoints, or push fake "order ready / payment received" notifications to customers (payload fields are caller-controlled).
- Fix: require the caller to authenticate (service-role JWT in an `Authorization` header checked in the function, or move sending into a secure context), validate that `subscription.endpoint` exists in `push_subscriptions`, and cap payload size.

### H2. Client-side role management = privilege escalation
- `syncRoleToSupabase` (roleService.js:199), `setUserDisabled` (roleService.js:209), `deleteAuthUser`, `createAuthUser` all run with `supabaseAdmin` from the browser. A consequence of C1, but worth calling out: any visitor can become an administrator in one HTTP call.

### H3. Runtime crash in the payment-proof flow (core customer path)
- `OrderPage.jsx:358` and `:373` render `<OptimizedImage>` but the component is **not imported** (lint: `react(jsx-no-undef)`).
- Whenever a customer has a pending or rejected payment proof, rendering throws `ReferenceError: OptimizedImage is not defined`, the `ErrorBoundary` replaces the whole page with "Something went wrong. Please refresh." — blocking the exact flow customers use to complete payment.
- Unit tests don't cover this path (no component tests for OrderPage).

### H4. RLS policies too permissive for staff
- `orders_update_staff` allows **any authenticated user** to update **any** order (migration:172) — no owner, role, or field-level restriction.
- `user_roles_read_all_authenticated` exposes every staff member's role to any authenticated user.
- `get_user_role()` is `SECURITY DEFINER` and executable by `anon`/`authenticated` via `/rest/v1/rpc` (Supabase advisor). `rls_auto_enable()` (leftover helper) is also anon-executable — revoke EXECUTE.
- Leaked-password protection is disabled in Auth settings (advisor WARN).

### H5. Documentation is dangerously stale
- `README.md` still instructs Firebase setup (`copy .env.example .env`, `npm run seed`, Firestore rules, Firebase Hosting).
- `npm run seed` does not exist in `package.json`; no seed script is provided.
- `DEPLOYMENT.md` omits `VITE_SUPABASE_SERVICE_KEY` from its env list even though the app hard-requires it today (and should not tomorrow).
- `AGENTS.md` correctly requires Supabase-only — code complies; docs do not.

---

## MEDIUM FINDINGS

| # | Finding | Location |
|---|---------|----------|
| M1 | No production error monitoring: `monitoring.js` only writes to `sessionStorage`; there is no Sentry/APM/error-reporting, no backend error alerting. Crashes are invisible. | src/services/monitoring.js |
| M2 | Cart is not persisted — page refresh loses the entire order; also `addItem` silently ignores a duplicate `itemId`, so an item with different customizations cannot be added twice (button gives no feedback). | src/context/CartContext.jsx:23-28 |
| M3 | Vendor chunk 571 KB raw / 173 KB gzip; `browser-image-compression` and react-router pull weight into the critical path; consider splitting vendor and deferring compression lib. | vite.config.js manualChunks |
| M4 | `VITE_VAPID_PRIVATE_KEY` sits in `.env` (not currently bundled — verified — but naming it `VITE_*` risks accidental exposure; move it to edge-function env vars only). | .env |
| M5 | Cart quantity has no upper bound in UI; checkout then fails with "Quantity is invalid" (max 100) — confusing error path. | CartDrawer.jsx:86 vs dataService.js:148 |
| M6 | No CSRF tokens, no CORS review, no rate limiting on order creation/proof upload (any script can flood orders). | — |
| M7 | `writeAuditLog` accepts a client-supplied actor (`session.email` or `"system"`) and is callable by anyone via service key — audit trail integrity is weak. | dataService.js:211 |
| M8 | localStorage cache `cafe-user-roles` is client-tamperable; frontend role checks are cosmetic given C1. | roleService.js:187 |

---

## LOW FINDINGS / HOUSEKEEPING

- 17 lint warnings (unused imports/vars; `PaymentConfirmedPopup` useEffect missing dep; `CartContext` unused import).
- `console.error` in `TableQrCard.jsx:234` is acceptable, but there is a code comment convention in many files (fine) — no `console.log`/`debugger` in source or bundle.
- Test suite takes ~80 s and has no e2e coverage of the ordering/payment journey; only 32 unit/component tests.
- `CalorieBadge.jsx:5` unused `icon` var; `BrandLogo.jsx:6` unused `showSubtitle`; `RoleLayout.jsx:5` unused import.
- No image CSP/`Referrer-Policy`/security headers configured in `netlify.toml` / `vercel.json` (both are bare SPA rewrites only).
- `manifest.json` start_url `/` fine; `apple-touch-icon` and `logo.png` identical 75 KB files (dedupe minor).

---

## WHAT IS WORKING WELL

- Build, lint, and all 32 tests pass; SPA deep-link routing verified (200 on `/menu?table=3`, `/order/:id`).
- Client-side sanitization is thorough: `cleanText` truncation, `assertFiniteNumber/WholeNumber` bounds, payment-option field limits, URL protocol whitelist in `ImageUploader` (http/https only).
- Client-side image pipeline is genuinely good: 5 MB validation, WebP re-encode, SHA-256 upload dedup, responsive variants (`_thumb/_sm`), lazy loading + `srcSet` + priority preloading in `OptimizedImage`.
- Tax logic is correct and centralized: `calculateTotals` (subtotal → discount clamp → taxable → tax → total) with `roundMoney`; used consistently by checkout, cart drawer, and order page.
- RLS enabled on all 8 tables in the live project (would be effective once the service key is removed).
- Route-level guards (`ProtectedRoute`/`RoleRoute`/`PermissionGuard`), 404 page, error boundary, bilingual Amharic/Oromo/English i18n, cash default payment method, audit-log writes on key actions.

---

## PRIORITIZED FIX LIST

### Must fix before launch (Critical)
1. **Remove the service key from the client.** (C1, C2, H2)
   - Delete `VITE_SUPABASE_SERVICE_KEY` from `.env` and `.env.example`.
   - Rewrite `dataService.js` to use the anon `supabase` client only.
   - Move every privileged operation to Supabase Edge Functions (or Postgres RPC with `SECURITY DEFINER` + strict role checks) that verify the caller's JWT/role server-side: order update, payment approval, user management, settings, audit-log read, popularity calc.
   - **Rotate the service key immediately** — it is already public in `dist/` (if any prior build was deployed) and in `.env` history.
2. **Server-side order/payment integrity.** (C2)
   - Order creation: recompute subtotal/tax/total in the edge function from the server-side menu prices; reject mismatches.
   - Restrict order updates to whitelisted fields (`paymentMethod`, `paymentProofUrl`) for the public path and to staff-only status transitions (received→…→paid) for staff; never allow a public caller to set `paymentStatus: paid`.
   - Replace the client-updatable orders table access with a purpose-built RPC/edge function; scope order reads to the caller's own order or staff roles.
3. **Fix the `OptimizedImage` import crash** in `OrderPage.jsx` (H3) — add the import; add a test for the pending-proof render.
4. **Secure `send-push`** (H1): require `Authorization: Bearer <service key>` (server-side only) and verify the subscription exists in `push_subscriptions`; keep `verify_jwt` off only if the function itself checks auth.

### Should fix before launch (High)
5. Tighten RLS: order update → staff only + staff role in `user_roles`; revoke `EXECUTE` on `get_user_role`/`rls_auto_enable` for `anon` (keep `authenticated`); enable leaked-password protection; scope `push_subscriptions` reads to owner.
6. Add error monitoring (Sentry or Supabase-edge-logging + client reporter) replacing sessionStorage-only logging (M1).
7. Persist the cart (sessionStorage) and allow duplicate customizations (M2).
8. Rate-limit order creation and proof uploads (per-table/IP) (M6).
9. Update README/DEPLOYMENT.md to Supabase reality; add a real `seed` script or remove the reference (H5).

### Nice to have
10. Split vendor chunk (M3); add security headers (CSP, X-Frame-Options) to `vercel.json`/`netlify.toml`.
11. Cap cart quantity in UI to 100 (M5); remove `cafe-user-roles` localStorage (M8); fix 17 lint warnings; add e2e tests (Playwright) for browse→cart→checkout→pay→confirm and payment-review flows.

### Estimated effort
- C1+C2 re-architecture (edge functions + RLS): **2–4 days** for one developer, including key rotation and data-layer rewrite.
- H1, H3, H5, M1–M2, M6: **1–2 days**.
- Remaining housekeeping: **half day**.

---

## GO / NO-GO

| Criterion | Status |
|---|---|
| Build / lint / unit tests | PASS |
| SPA routing & serving | PASS |
| Secrets exposed to client | **FAIL (Critical)** |
| Server-enforced authorization | **FAIL (Critical)** |
| Payment integrity | **FAIL (Critical)** |
| Data confidentiality | **FAIL (Critical)** |
| Error monitoring | FAIL (Medium) |
| Documentation accuracy | FAIL (Medium) |
| Performance | Acceptable (Medium item) |

**Recommendation: NO-GO.** Do not deploy or publicize this build. Remediate Critical items 1–4, rotate the service key, redeploy, and re-run this audit (including a live penetration check of the anon-key surface) before launch.

---

## REMEDIATION STATUS (Phase 1 — hardened, re-verify before launch)

### Done
- **C1 — service key removed from client.** `src/services/supabase.js` only exports the anon `supabase` client; `VITE_SUPABASE_SERVICE_KEY` deleted from `.env`/`.env.example`; `src` has zero `supabaseAdmin` references. Verified: new `dist/` bundle contains no JWT with a `role` claim and no `service_role`/key material.
- **C2 — server-side order/payment integrity.** `create_customer_order` (SECURITY DEFINER) recomputes price/tax/total from menu rows and validates customizations; `update_customer_order` (anon) whitelists `paymentMethod`/`paymentProofUrl` only; `update_staff_order` (staff roles) whitelists fields, cashier+ for payment fields, server-side discount clamp; direct anon INSERT/UPDATE on `orders` now hard-fails (42501).
- **C3 — data exposure.** Anon `SELECT` on `orders` is limited to 22 non-sensitive columns (`customer_name` etc. revoked); popularity is an aggregated `get_popular_items` RPC; payment data exposure to staff only.
- **H1 — send-push secured.** Function v2 deployed with `verify_jwt: true`, verifies a staff JWT, fetches subscriptions via staff-only `get_order_push_subscriptions`, returns 401/403 for anonymous calls (verified live).
- **H2 — user management via admin-only RPCs.** `set_user_role`, `set_user_disabled`, `create_staff_user`, `delete_staff_user` (all check `get_user_role() = 'admin'`); `user_roles` table-level UPDATE grant limited to `language, display_name, updated_at`, closing the self-escalation vector.
- **H3 — `OptimizedImage` import added** to `OrderPage.jsx` (pending/rejected proof render no longer crashes).
- **H4 — RLS hardened.** Anon-revocable helpers restricted; storage policies (`cafe-assets`: anon → `paymentProofs/*` only, staff → `menuImages/*`); `orders_update_staff` is authenticated-only; `rls_auto_enable` no longer anon-executable.
- **H5 — docs.** README/DEPLOYMENT.md rewritten for Supabase; Firebase instructions and nonexistent `npm run seed` removed.
- **Fix wave verified:** lint (0 errors, only pre-existing warnings), all 32 tests pass, production build passes, anon-key live checks pass (order create/price recompute, payment proof upload, denied staff RPC, denied menu upload, denied direct order writes).

### Remaining (accepted / follow-up)
- **Rotate the service key and VAPID private key in Supabase dashboard** — both have been exposed in `.env` history and prior `dist/` builds. Also enable leaked-password protection (auth advisory WARN).
- Customer can still clear `paymentMethod`/proof on their own order (UUID-as-capability) — accepted residual.
- `update_staff_order`/`send-push` WARNs from the DB linter are intentional (role checks inside the functions).
- M1 error monitoring, M2 cart persistence, M3 vendor chunk, M6 rate limiting, M8 localStorage role cache, e2e tests: still open.

