# User-facing error handling

The existing i18next language system is retained, as requested. No Google translation service or billing dependency was introduced.

`src/services/userMessages.js` maps known error codes, HTTP statuses, and explicitly recognized validation errors to controlled application copy. Unknown backend text is never returned. Fallback arguments must be static application messages, never text from a response. New form catches should use `toUserMessage(error, "Action-specific recovery guidance.")`.

Forms and data observers now use this boundary. Cafe lookup failures show a distinct unavailable screen with retry; missing cafes show link/QR guidance and a home link. Inventory errors no longer instruct users to create database tables. Login preserves error codes until presentation so outages are not incorrectly described as bad passwords. Notification controls allow retry when permission was granted but subscription setup failed.

This change controls rendered application messages; it does not remove technical details from browser network responses or replace backend authorization. No database migration is required.

Verification on September 22, 2026:

- `npm test -- --maxWorkers=3`: 124 tests passed across 18 files.
- `npm run lint` and `npm run build`: passed.
- `node scripts/audit-user-errors.mjs`: six local browser scenarios passed with synthetic backend failures and no runtime exceptions. Covers missing cafe, unavailable lookup, retry, login outage, invalid credentials, and pricing load failure, at a mobile viewport. Requests are intercepted; no real account or operational records are created.

The Node test runner emits its existing experimental Web Storage warning; it did not cause test failures.
