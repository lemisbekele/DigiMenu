# Login identity isolation

Verified locally on September 22, 2026.

## Findings

The seeded platform and cafe-admin accounts have distinct Auth IDs and correctly linked role rows. The platform account has no cafe membership. No credential-to-account substitution was reproduced.

Two application behaviors caused ambiguity: login routes automatically continued an existing browser session, and the early Auth `SIGNED_IN` event could publish a role before the requested cafe was validated. A public tenant guard also remounted the login form during that transition, losing its pending/error state. The pre-fix browser reproduction submitted superadmin credentials on `/lemi-coffee/login` and unexpectedly landed on `/login` without the rejection message.

## Changes

- Keep credentials sign-in pending until Auth `getUser`, submitted email, returned user ID, profile ID, role and cafe validation agree. Recheck the current session before publishing the result.
- Ignore early session events during credentials validation; discard superseded deferred auth notifications and stale profile reads.
- Clear app identity when starting or rejecting a credentials attempt. Rejected attempts sign out the local browser session, rather than revoking independent device sessions globally.
- Keep public cafe lookup independent of staff identity so the login component remains mounted.
- Replace automatic continuation on the login page with the current account email, its workspace, an explicit dashboard link and a sign-out action for switching accounts.
- Give platform/cafe mismatch errors actionable messages. The platform account signs in at `/login`; cafe credentials must match the requested cafe.
- Restrict return URLs to the authenticated cafe path segment; never infer a missing account cafe from the requested URL.

## Verification

- 132 automated tests passed across 19 files, including delayed tenant validation, stale role responses, returned identity/email mismatches, wrong-cafe credentials, failed credentials with a previous account, and a shared-session change during login.
- 171 real Auth/API/RLS assertions passed across two isolated cafe fixtures, including cross-tenant CRUD, forbidden role changes, and platform accounts being unable to edit cafe catalogs or financial transactions.
- Real browser checks verified each of the five seeded roles against Auth and its own profile, including reload persistence (10 checks).
- Two-tab browser checks passed (9 checks): explicit remembered identity, mobile layout, sign-out propagation, invalid credentials, wrong-portal rejection, platform login, shared identity updates, and direct cafe-dashboard URL access.
- Lint and production build passed. No database migration or account-role changes were required.

These results apply to the local development environment. The seeded accounts intentionally share a documented demonstration password; their identities and authorization remain distinct. No account passwords were changed.
