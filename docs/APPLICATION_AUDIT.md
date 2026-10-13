# Application audit — updated 2026-09-21

## Architecture inspected before changes

- Vite/React SPA; React Router declares all pages in `src/App.jsx`. Auth, plan, RBAC, language and theme providers are global; cafe customer routes mount table and cart providers.
- Supabase Auth provides sessions. `user_roles` is the authoritative assignment (admin, manager, cashier, barista, superadmin). There is no separate generic staff role.
- PostgREST/RLS serves database CRUD; privileged SQL RPCs implement orders and user administration. Edge Functions provision owners and delete cafes. Realtime observers refresh lists. No independent application server exists.
- Cafe membership uses `cafes.id` plus `cafes.slug`; operational tables use `cafe_slug`. Categories/options are embedded in menu items; purchased items are JSON order snapshots; payments are fields on orders. Inventory is a separate table. Dedicated customer, scheduling, attendance, vendor and chat workflows are not implemented.
- Platform pages: dashboard, requests, cafes, packages, subscriptions, audit logs, announcements, profile. Cafe pages: public menu/checkout/order tracking/history/login; staff dashboard/orders/menu/tables/users/settings/audit; cashier POS; kitchen queue/history/inventory/settings.
- Menu/financial settings and tables use direct RLS-protected writes. Staff order mutations and user creation/roles/disable/delete use RPCs. Public ordering/tracking use security-definer RPCs.
- Existing working tree contains extensive pre-existing changes. Those changes are preserved. The configured backend is local Docker Supabase (`127.0.0.1:54321`), not the connected hosted project. Hosted schema differs significantly and was inspected read-only.

## Baseline evidence

- 95 tests across 15 files passed; build passed; lint reported 13 warnings.
- 25 local migrations applied. Prior audit documentation describes historical defects, some already fixed.
- Critical effective-schema findings: package-only write policies; disabled memberships returned by authorization helpers; direct order writes bypass RPC validation; order tracking/mutation accepts UUID alone; no cafe foreign keys; kitchen can query financial order columns; public cafe/payment readers not wired to existing safe RPCs; storage bucket/policies absent locally.
- Functional findings: selected checkout payment method unused; order extras not priced by current SQL; repeated discounts subtract repeatedly; no row lock on order transitions; manager settings expose admin actions; cashier navigation points at denied routes; manager cannot open inventory; customer history and notifications share browser-global storage; duplicate auth/profile loads can race.
- Operational gaps: background push function missing from repository; inventory UI read-only; error paths in subscription observers and table forms can reject without handling; no complete two-tenant adversarial regression suite.

## Verification and deployment

Implementation and verification were performed against local Docker Supabase. The hosted project has not been migrated or deployed. The tested fixes substantially improve the application, but production release still requires the staging and operational checks below.

## Authorization and tenant security changes

- Replaced accumulated permissive policies with role, active membership, cafe and package checks. Authorization reads database assignments and validates live Auth sessions; editable user metadata and client-selected roles/cafes do not establish authority. Disabled accounts, suspended cafes and logged-out tokens fail backend checks.
- Scoped cafe-owned records, notifications, audit events and file paths. Added and validated 13 relationship/value constraints plus supporting indexes. Staff membership binds both cafe ID and slug. Platform administration stays separate from cafe operations.
- Removed direct order write/delete privileges. RPCs validate tenant relationships, catalog items, tables, quantities and legal transitions. Row locks serialize changes; server-side catalog pricing includes extras, discounts and tax. Settled transactions cannot be edited or rejected through ordinary order actions.
- Replaced UUID-only customer access with random, hashed capabilities bound to the cafe/order. Tokens support retry-safe order submission and private proof uploads. Changing an order ID, cafe slug or browser tenant state does not authorize another order.
- Kitchen reads use explicit projections without revenue, prices, payment administration or inventory costs. Raw financial rows remain unavailable to baristas.
- Restricted profile edits so users cannot change their role or cafe. Staff creation, role changes, disabling and deletion validate the caller and membership. Fixed Auth-account token fields that prevented newly created staff from logging in.
- Owner provisioning is transactional and rejects existing-account takeover. Cafe deletion requires a live platform role and uses trusted storage prefixes. Storage failures are reported as pending cleanup instead of silently claiming complete deletion.
- Added an authenticated push function with server-derived event content and an endpoint allowlist. Added backend order audit/notification events and a client audit RPC that derives actor and tenant rather than accepting them from the URL.
- Menu images use cafe-prefixed paths; payment proofs use private storage with short-lived signed URLs. No privileged key is configured for browser use.

## Final role and route map

Package entitlements further restrict cafe features. Equivalent existing roles were retained; no duplicate owner or generic staff role was introduced.

| Role | Landing page | Permitted experience |
| --- | --- | --- |
| Admin / Owner (`admin`) | `/:cafe/dashboard` | Cafe reports, orders/payments, menu, inventory, tables, users, audit and settings |
| Store Manager (`manager`) | `/:cafe/dashboard` | Operational reports, orders/payments, menu/pricing/availability, inventory, tables and audit; no user/RBAC or core settings administration |
| Cashier / Front-of-House (`cashier`) | `/:cafe/pos` | Payment queue, order actions and read-only tables; no catalog, role or settings changes |
| Barista / Kitchen (`barista`) | `/:cafe/kds` | Kitchen workflow, history, cost-free read-only inventory and device settings; no financial administration |
| Platform administrator (`superadmin`) | `/superadmin/dashboard` | Requests, cafes, packages, subscriptions, platform audit, announcements and profile; no automatic cafe operational access |

- Public routes: `/`, `/portfolio`, `/pricing`, `/login`, `/reset-password`, `/404`, and `/:cafe` with `menu`, `checkout`, `order/:orderId`, `my-orders`, `login` and `admin/login` children. Public page access does not imply unrestricted order access.
- Staff routes: `dashboard`, `orders`, `pos`, `kds`, `kds/settings`, `history`, `inventory`, `tables`, `users`, `audit-logs`, `settings`, `admin/menu` and the protected `admin` entry under `/:cafe`.
- Platform routes: `/superadmin/{dashboard,requests,cafes,packages,subscriptions,audit-logs,announcements,profile}`; the existing singular `cafe` compatibility path remains supported.
- Legacy cafe `manager`, `cashier` and `barista` paths redirect to the protected destination. Legacy platform login/admin entry points use the unified login. Tenant-free operational links redirect to pricing. Unknown routes show a controlled not-found state.
- Login destinations, navigation, shared components, route guards, RPCs and RLS now agree on these permissions. Tenant-specific login rejects mismatched cafe membership. The platform audit screen no longer queries cafe financial orders.

## Functional, UI and maintenance changes

- Fixed authentication callback deadlocks/races, stale profile responses and auth-bound caches. Added password recovery routing, consistent role redirects and logout cleanup.
- Corrected checkout payment selection, extras pricing, server-authoritative confirmation totals and kitchen notes. Persisted carts per cafe, guarded duplicate submissions and isolated customer order history/capabilities.
- Implemented inventory CRUD for authorized managers/owners. Corrected cashier payment success/error feedback, kitchen action errors, private receipt upload/display and failed announcement handling.
- Unified font/theme tokens, shared control styling, navigation and error/loading states. Repaired mobile staff navigation, viewport-constrained dialogs, platform light-theme colors, secondary-button contrast and mobile cashier filter spacing. Screenshots cover 360, 390, 768, 1024 and 1440 pixel widths across light/dark variants.
- Shared order observers, awaited asynchronous refresh callbacks, added cancellation guards and avoided hidden-tab polling. Active queries filter at the database; history queries paginate beyond the 1,000-row API limit and refresh less frequently.
- Lazy-loaded image compression and split vendor/Supabase bundles. The largest JavaScript chunk is approximately 318 KB before gzip; compression is a separate approximately 52 KB lazy chunk. This is bundle improvement, not a concurrency benchmark.
- Removed the unused duplicate platform login and duplicate platform dashboard branch, consolidated payment-popup logic, separated context exports and removed unused imports/props/helpers. Historical standalone SQL remains for reference only; migration files are authoritative. Temporary SQL used in this audit was archived outside the deployable source path. Pre-existing working-tree changes were preserved.
- Neutralized spreadsheet formula prefixes in CSV exports. Fixed development watcher failures caused by generated audit artifacts.

## Verification evidence

| Check | Result and scope |
| --- | --- |
| Unit/component tests | 96 passing tests across 15 files |
| Production build and lint | Passed; lint has no warnings |
| Adversarial API and workflow suite | 153 passing assertions with two isolated temporary cafes, all five roles, real Auth/PostgREST/Storage/Edge calls and browser workflow checks |
| Browser page/viewport matrix | 105 dark and 70 light combinations passed, plus 17 targeted light/dark checks after the last CSS fixes |
| Schema replay | All 26 migrations replayed successfully in a disposable shadow database; final `public,cafe_private,storage` diff is empty |
| Database checks | SQL lint returned no errors; advisors returned no warnings/errors; all 13 new constraints validated locally |

The API suite exercises unauthorized cross-cafe reads/writes/deletes/relationships, client role edits, UUID-only customer access, private files, financial redaction, create/read/update/delete for major resources, staff onboarding and role changes, provisioning/deletion, disabled and suspended membership, session refresh and revoked-token rejection. The browser workflow covers a mobile customer cart/reload/checkout with extras and notes, kitchen preparation, cashier settlement, customer tracking, manager reporting and owner inventory. Direct cross-cafe and unauthorized role URLs were also tested.

The final backend-only rerun passed all 145 API assertions after Docker restarted. Database lint at warning level also reports a JSONB initialization cast, the intentionally unused client preparation-time parameter, and two unused local variables in order functions. These are nonfatal SQL cleanup items; the relevant runtime workflows pass. JavaScript lint is warning-free.

Reproducible scripts are `scripts/audit-api.mjs`, `scripts/audit-workflow.mjs` and `scripts/audit-browser.mjs`. The API script refuses nonlocal backend URLs and removes its temporary tenant fixtures. Set `AUDIT_E2E=1` for the combined workflow. Browser snapshots/results are stored in ignored `artifacts/audit/`; fixture credentials and screenshots must not be published as production data. See README for commands.

## Remaining release requirements and limitations

1. Reconcile the materially different hosted schema and migration history in a staging clone; back up and verify target data before deployment. No hosted production change was made in this audit.
2. Verify real SMTP password-recovery delivery, expiry handling and onboarding against the target Auth version. The SQL-based Auth provisioning model needs compatibility testing during Supabase upgrades.
3. Configure server-only VAPID credentials and test real push delivery on supported devices. Push authorization rejection paths were tested; real delivery was not.
4. Plan the cutover for old UUID-only customer links and migrate any historical public receipt files to private storage. The local database had no old public receipts.
5. Reconcile the existing nine `enterprise-cafe` rows for table number 1. These records were preserved; a guard now prevents new duplicates.
6. Run realistic load/concurrency tests. Large full-history reports still load records into the browser, and auto-ready still depends on an open staff application. No claim of production-scale throughput is made.
7. Monitor and retry any object-storage cleanup reported after cafe deletion; database and storage deletion cannot be one transaction.
8. Scheduling/attendance, dedicated customer CRM and external payment/refund processing do not exist in the application. Cash and bank-proof settlement are manual workflows. They were not replaced with invented implementations.

The detailed rollout and compatibility requirements are in `DEPLOYMENT.md`. Automated route/viewport checks and selected screenshot inspection are not a guarantee of every real-device interaction or every production dataset.

## Commercial platform refinement — September 21

This continuation reviewed the public website, package definitions and enforcement, subscription lifecycle, regional settings, and every existing role's routes. The architecture and role map above remain applicable. Changes were applied to local Docker Supabase only.

### Public product experience

- Rebuilt the landing page, navigation, pricing comparison, request form and footer with the existing emerald theme, shared typography, responsive spacing and accessible controls. Product previews now show the real customer, kitchen, cashier and management interfaces using temporary demonstration data.
- Added a skip link, semantic headings, mobile navigation state and native modal dialogs with Escape handling, focus containment and focus restoration. Public routes and actions have explicit loading, error and empty states.
- Removed simulated contact success, unsupported annual discounts, arbitrary tenant links, invented delivery/activation promises and unverified platform health claims. Package requests report success only after a pending request exists in the database.
- Published prices are **USD 29, USD 79 and USD 199 per month**, as confirmed by the product owner. Cafe sales currency is configured independently. These are published package prices; recurring billing collection is not implemented.
- Pricing uses the active database catalog and explicitly assigned features. Corrected the original misleading package descriptions without overwriting custom descriptions or changing feature assignments. Removed unused placeholder plan definitions and obsolete public SVG/inline styling.

### Entitlements, integrity and regional behavior

- Closed package bypasses in order reads, order updates and public menu reads. RPCs and raw-row policies enforce the required feature for each role. Kitchen active queue and history are separate entitlements; kitchen financial redaction remains enforced.
- Expired subscriptions, inactive packages and inactive/unknown features no longer grant frontend access. Cached feature data expires; visible workspaces refresh subscription state and clean up listeners. Backend checks remain authoritative between frontend refreshes.
- Fixed subscription observer errors and assignment selection so an old pending/expired row does not displace the cafe's active subscription. Added database uniqueness for active/approved subscriptions and validation for package limits.
- Added a database menu-item limit guard that locks the cafe row. Two simultaneous inserts competing for the last slot admit exactly one. Staff limits, other-cafe isolation and unauthorized regional changes were also exercised against the backend.
- Added cafe currency/time-zone configuration, owner-only authorized updates and immutable order currency snapshots. Currency changes are blocked after the first order; cafe-row locking serializes currency changes and order creation. Existing cafes default to ETB and Africa/Addis_Ababa, matching the previous implementation.
- Money, operational dates, report boundaries and CSV metadata use regional settings. Day boundaries account for time zones and daylight-saving transitions, including 23- and 25-hour days. The current accounting engine retains two decimal places and has no FX conversion.
- Public copy is wired through existing i18next. Added Amharic and Afaan Oromo navigation, hero and form translations; untranslated copy falls back to English. Language changes set document language/direction. Full native-language editorial coverage remains incomplete.

### Performance and verification

- Popular-item aggregation now scans a bounded 30-day interval and caps returned items at 100. Existing order-history pagination and shared observers remain in place.
- Public CSS decreased from approximately 14.67 KB to 10.59 KB, shared marketing JavaScript from 22.87 KB to 10.68 KB, and landing-page JavaScript from 11.61 KB to 7.34 KB before gzip. These are build sizes, not load-test results.
- The latest combined API/browser workflow suite passed **179 assertions** across two temporary cafes, including every role, unauthorized operations, package/expiry restrictions, menu/staff limits, concurrent menu insertion, regional ownership, session revocation and the customer-to-settlement workflow.
- The continuation's authenticated/public route matrix passed **105 dark-theme and 35 light-theme page/viewport combinations** across mobile, tablet and desktop coverage. This supplements the earlier audit matrix; it does not replace real-device testing.
- Final unit/component verification passed **101 tests across 16 files**; lint completed with no warnings and the production build passed. The USD pricing rerun passed **21 public-site interaction/layout assertions**, including database-backed requests and failed-submission behavior. No public-site runtime exceptions were observed. Node 26 emits an experimental localStorage warning in the test runner; this is separate from browser runtime checks.
- All **28 migrations** replayed successfully in a disposable shadow database. The final `public,cafe_private,storage` schema diff is empty; local database lint has no errors and advisors report no warnings/errors.
- Reproducible public-site interaction tests are in `scripts/audit-marketing.mjs`; detailed final unit, browser, build and database outputs are in ignored `artifacts/audit/`. Temporary SQL drafts are archived there; only versioned migrations are deployable.

### Additional release decisions and limits

The hosted schema reconciliation and operational requirements above still apply. Before rollout, review the existing commercial package composition: Starter currently includes digital menu/ordering without staff access, while Professional includes operational features without guest digital-menu/ordering features. This audit preserves those explicit assignments and does not silently grant inherited features; commercial owners must decide whether those combinations are intended.

Validate existing tenant currencies and time zones before applying defaults, resolve any overlapping active subscriptions before the unique index is created, and review regional rounding/minor-unit requirements before entering additional markets. Add production abuse protection for anonymous subscription requests. Complete native-language copy, real-device accessibility checks, SMTP/push delivery checks and realistic high-volume/load testing. Large reports still aggregate browser-loaded history, and auto-ready still requires an open staff application. No external payment processor, recurring charge collection, refunds, scheduling or attendance system was invented or claimed complete.
