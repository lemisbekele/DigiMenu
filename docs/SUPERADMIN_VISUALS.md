# Superadmin visual refinement

## Changes

- Dashboard: six-month request chart, cafe-status distribution, readable numeric labels, and safe loading/error states. Pending lists now contain only pending requests; pending totals are no longer described as today's submissions.
- Cafe management: access-status distribution alongside existing management operations.
- Access & subscriptions: one workspace for pending approvals and subscription history. Approved status is now included in the history filters. Pending accounts link to the provisioning workflow instead of offering a misleading Activate action.
- Packages: adoption bars using current active/approved subscriptions and excluding expired access; assigned-cafe lists use the same rule.
- Announcements: published/high-priority summary and illustrated empty state. Removed the redundant initial fetch and handle observer errors visibly.
- Audit logs: activity distribution for the loaded entries, explicitly distinguished from all-time totals.
- Account security: visual identity summary; removed the hardcoded fallback email and implementation-specific session copy.
- Shared visuals use theme tokens, accessible text values, and responsive CSS without adding a chart dependency.

## Navigation cleanup

Six main destinations: Dashboard, Access & subscriptions, Cafes, Packages, Announcements, Audit logs. Account & security is available from the sidebar account footer.

`/superadmin/subscriptions` redirects to `/superadmin/requests?view=subscriptions`.
`/superadmin/cafe` redirects to `/superadmin/cafes`.

The standalone subscriptions page implementation has been moved into the access workspace as `SubscriptionAssignments`. Necessary approval, cafe, package, broadcast, audit, and password operations remain available. Existing server authorization is unchanged.

## Verification

- `npm run lint` and `npm run build`.
- `npm test`: 136 tests, including date-boundary aggregation and legacy-route redirects.
- `node scripts/audit-superadmin-visuals.mjs`: 106 passing browser checks using a real local superadmin login, all eight page/tab views at 360/768/1440 pixels in light/dark mode, legacy redirects, workspace navigation, and an intercepted backend failure to verify safe errors instead of misleading zero charts.
- Screenshots: `artifacts/audit/superadmin-visuals/`.

Charts summarize the records returned by the existing APIs. Server-side aggregates/pagination are a separate requirement before claiming full-history metrics at very large data volumes. This UI pass does not re-certify production tenant policies or exercise destructive cafe/package operations.
