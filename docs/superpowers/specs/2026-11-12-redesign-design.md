# DigiMenu redesign — design spec

Date: 2026-11-12. Status: design language approved by the owner; this spec awaits review.

## Goal

Every screen, for every role, looks like one product. The visual layer is rebuilt from a blank page. Only the colour palette carries over.

## Scope

- **In:** every surface — staff pages, superadmin pages, kitchen, cashier counter, customer QR menu / checkout / order tracking, login and reset, public marketing and pricing pages.
- **Out:** features, routes, data, permissions, copy meaning. Behaviour stays exactly as it is ("look only", owner decision). Tests that assert behaviour must keep passing unchanged; tests that assert class names may be updated.

## Source of truth

`docs/design-language.html` (published copy: https://claude.ai/artifact/TW9nyr5ykWdiaN91Z1FUxq). It defines principles, colour rules, type, spacing, the shared parts and four reference screens. Where this spec and that page disagree, the page wins.

References it was built from: Tave coffee shop POS and Cafe Burito order management (owner-supplied Dribbble shots), Dribbble kitchen-display and QR-ordering work, WCAG 2.2 contrast / use-of-colour / target-size criteria.

## Design decisions

1. **Colour.** Palette values in `src/theme.css` are unchanged, light and dark. Usage rule: neutral ground and surfaces; green only for the single main action on a screen/panel and for "you are here"; status colours only on status.
2. **Status.** Five states everywhere: in line (neutral), preparing (warning), ready (green), late (danger), paid (info). Always a pill with a dot and a word — never colour alone. Kitchen ticket headers use the same tint as a full-width band with a timer.
3. **Type.** Bricolage Grotesque (600/700) for page titles, table numbers and headline figures only. Figtree (400/500/600/700) for everything else. Noto Sans Ethiopic fallback for Amharic. Sizes: 12, 13, 14, 16, 20, 28. Tabular digits for prices and counts. This replaces Plus Jakarta Sans.
4. **Space and shape.** Spacing 4/8/12/16/24/32. Radius 8 (controls), 12 (cards), 16 (dialogs), full (pills, chips). Control height 36 with a mouse, 44 on touch (phones, counter, kitchen). No shadows except floating layers.
5. **Page frame.** One frame for every signed-in role: grouped left navigation (188px) | page header (title, one line of context, one main action) | optional toolbar (view switch left, filters/search right) | content | optional right detail panel (264px). On phones the navigation is a bottom tab bar. Content is one of three shapes: card grid, table, form.
6. **Shared parts (12).** Button, Chip, Segmented switch, Field, Status pill, Card, Navigation, Page header, Stat card, Data table, Product card, Order panel / Ticket, Dialog, Empty state. (Order panel and Ticket share line-item markup; Dialog and Empty state are counted with Card.) Pages use only these; a missing part is added to the kit first.
7. **Uniformity rules.** No one-off colours, sizes or spacing in a page (no inline styles for visual values, no hex outside `theme.css`). Short labels never wrap; long text is ellipsised. Every list has loading, empty and error states.

## Architecture

- `src/theme.css` — tokens only: existing colour tokens plus the type, space, radius and control-height tokens above.
- `src/ui/ui.css` — one stylesheet for the shared parts, class prefix `ui-` (e.g. `ui-btn`, `ui-card`, `ui-pill`). Plain CSS, matching how the project is styled today; no new dependency.
- `src/ui/*.jsx` — thin React components only where markup repeats with structure (PageHeader, StatCard, DataTable, StatusPill, Dialog, EmptyState). Buttons, chips, fields and cards are classes on native elements.
- `src/pages/RoleLayout.jsx` — the page frame; already the single layout for every role.
- Per-area CSS files hold layout that is truly specific to one screen (e.g. the kitchen ticket grid) and nothing that restyles a shared part.
- Deleted by the end: `src/App.css` (9,345 lines), `superadmin.css`, `staff.css`, `staff-shell.css`, `forms.css`, `menu-editor.css`, and the redesign-superseded parts of `customer.css`, `customer-menu.css`, `kitchen.css`, `login.css`, `portfolio.css`.

## Migration order

Each area moves completely, is checked in the browser in light and dark at desktop and phone width, and has its old CSS deleted before the next starts.

1. Foundation: tokens, fonts, `ui.css`, the page frame.
2. Staff: dashboard, orders, menu, tables, users, inventory, audit logs, settings.
3. Counter and kitchen: cashier POS, kitchen tickets, history, kitchen settings.
4. Superadmin: dashboard, cafés, requests/subscriptions, packages, announcements, profile.
5. Customer: menu, item sheet, cart, checkout, order tracking, my orders.
6. Entry and public: login, reset password, access denied, marketing, pricing.
7. Removal: delete `App.css` and any leftover legacy rules; final sweep.

## Verification

- `npm test` (158 tests) and `npm run build` pass after every area.
- Browser check per page through `npm run dev:local` (auto sign-in with the seeded test accounts, `?devAs=<role>`).
- Uniformity audit script (added in the foundation step) reports: inline `style={{` count, hex colours outside `theme.css`, distinct `font-size` and `border-radius` values. Targets at the end: 0 hex outside the theme, font sizes ≤ 6, radii ≤ 4, inline styles only for dynamic values (e.g. a bar's width).
- Contrast: every text/background token pair used by a part is ≥ 4.5:1 in both themes (checked by the audit script).

## Risks

- **Legacy CSS bleed.** `App.css` styles bare elements (`main`, `button`, `svg`). Until it is deleted, new parts can be affected. Mitigation: `ui-` classes set every property they depend on; `App.css` is deleted last, after a search confirms no remaining class it defines is used.
- **Customer pages are the public face.** They are migrated after the staff areas, when the kit has been proven.
- **Photos.** Product cards assume a photo; items without one show a neutral placeholder well.
- **Kitchen layout change.** The kitchen keeps the shared sidebar frame (done earlier); the ticket grid must stay readable at arm's length — table number 28px, items 14px minimum.
