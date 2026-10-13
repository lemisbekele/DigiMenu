# DigiMenu

Multi-tenant cafe management with React/Vite and Supabase Auth, Postgres/RLS, Storage, Realtime and Edge Functions.

## Local development

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and configure the local Supabase URL and publishable key.
3. Start Docker and run `npx supabase start`. Apply the versioned migrations using the Supabase CLI. Do not run the historical standalone SQL bootstrap files.
4. Run `npx supabase functions serve` and `npm run dev` in separate terminals.
5. Open `/login` for staff, or `/<cafe-slug>/menu?table=1` for a registered cafe/table.

Use `supabase/migrations/` as the database source of truth. `supabase/seed.sql` contains local development accounts only; never apply that seed to production. Database resets erase local data and are not required for normal development.

## Roles and routes

| Role | Home | Main capabilities |
| --- | --- | --- |
| Admin / owner | `/<cafe>/dashboard` | Cafe configuration, staff, catalog, operations, financial reports |
| Manager | `/<cafe>/dashboard` | Catalog, inventory, tables, orders, operational reports |
| Cashier | `/<cafe>/pos` | Orders, payments, discounts, table viewing |
| Barista / kitchen | `/<cafe>/kds` | Preparation queue, history, stock viewing, device preferences |
| Superadmin | `/superadmin/dashboard` | Platform cafes, subscriptions, packages, announcements, platform audit |

Package entitlements further restrict routes and operations. No generic Staff role exists; do not add aliases that bypass the canonical roles.

Public cafe routes are `menu`, `checkout`, `order/:orderId`, and `my-orders`. Customer order access requires a separate random capability stored per cafe in that browser. An order UUID alone does not grant access. Cafe staff cannot change tenants by editing the URL.

## Verification

```sh
npm test
npm run lint
npm run build
npx supabase db lint --local --schema public,cafe_private --level error
npx supabase db advisors --local --type all --level warn
node scripts/audit-api.mjs
node scripts/audit-browser.mjs
node scripts/audit-marketing.mjs
node scripts/audit-forms.mjs
```

The API suite refuses hosted URLs, creates isolated fixtures, and cleans them up. It requires the local `supabase_db_Cafe` Docker container and served Edge Functions. Set `AUDIT_E2E=1` to include the customer → kitchen → cashier → reporting browser workflow. The browser audit uses the local development seed, Chrome/Edge, and `http://localhost:3010`; override `AUDIT_APP_URL` if needed. `AUDIT_WIDTHS`, `AUDIT_THEME`, `AUDIT_VARIANT`, and `AUDIT_RESUME` configure repeatable viewport runs. Local evidence is written under ignored `artifacts/audit/`.

See [the application audit](docs/APPLICATION_AUDIT.md), [cloud deployment notes](DEPLOYMENT.md), and [self-hosted Docker deployment](DOCKER_DEPLOYMENT.md).

## Self-Hosted Docker deployment

To run the entire platform (DigiMenu frontend + full Supabase backend: Postgres, Auth, Realtime, Storage, Studio, and automated migrations) locally or on a private VPS with a single command:

```sh
npm run docker:up
# Or: docker compose up -d
```

See [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) for full architecture details, environment configuration, and production SSL reverse proxy setups.

## Packages and regional settings

The public website reads active packages and enabled features from Supabase. Subscription prices are published in USD; package requests enter the real platform approval workflow. Features are explicitly assigned without automatic tier inheritance and are enforced by route guards, RPCs and database policies. Menu/staff limits are enforced server-side.

Cafe sales currency and time zone are separate from subscription pricing. Owners with the settings entitlement can configure them in cafe settings. Existing cafes default to ETB and Africa/Addis_Ababa; currency becomes fixed after the first order. Reports use cafe-local day boundaries, including daylight-saving changes. Review the deployment notes before introducing other currencies or migrating historical data.
