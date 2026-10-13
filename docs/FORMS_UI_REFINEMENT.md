# Forms and workspace controls — September 22, 2026

## Changes

- Cafe workspace controls now share one inline toolbar. Language, theme and notification buttons no longer use competing fixed/flow positions. The notification panel fits small screens, closes with Escape or an outside click, restores keyboard focus on Escape/close, and labels icon-only actions.
- Shared form styling covers cafe, platform, public and password screens: responsive columns, readable labels, consistent inputs, wrapping action rows, viewport-limited dialogs and 16px mobile input text. Form headings and controls support both themes.
- Table creation and QR-copy editors have persistent labels, length limits and positive whole-number validation for table numbers.
- Staff onboarding requires name, email, temporary password and role, explains first-login password changes, and shows validation errors within the form. Inventory identifies stock units, quantity, low-stock thresholds and cost currency, with clear optional fields.
- Payment settings explain bank/mobile-wallet account details and do not require account numbers/holders for cash methods. Existing custom payment types remain supported.
- Public package requests now collect the contact person's name and optional city/country, alongside cafe name, owner email, optional phone and requirements. Contact/location are stored as labeled lines in the existing request notes and appear in platform review. They are not new database columns. The selected package and published price remain visible during entry.
- Package create/edit/assignment, cafe owner-email/package changes and request approval now use actual forms so browser validation and Enter-to-submit work. Package grids stack on phones; limits require positive whole numbers; pricing terms, descriptions and feature selection are explicit. Package errors are shown inside the editor.
- Menu editors retain name, description, category, price/currency, calories, photo, ingredients, customizations, translations, availability and the existing role-specific preparation setting. Fixed an input-format mismatch: ingredients now accept line breaks as the form instructs, as well as commas. Removed the unsupported negative-price example.
- Permanent-password setup uses the shared palette, labeled fields, autocomplete and a viewport-constrained panel. Password-policy/backend semantics were preserved.

## Verification

- `scripts/audit-forms.mjs`: 148 assertions passed, covering non-overlapping controls for all four cafe roles, notification bounds and focus handling, and 12 form/editor configurations at 360, 768 and 1440px in light/dark themes. Tests open forms and inspect validation without submitting operational changes.
- `scripts/audit-marketing.mjs`: 22 assertions passed, including failed and successful public requests against local Supabase and saved contact/location notes. Its unique temporary request is removed afterward.
- 101 existing unit/component tests passed; production build and lint passed. Evidence and screenshots are in ignored `artifacts/audit/forms*`.

No schema migration, hosted deployment or new business workflow was introduced. Backend RBAC and tenant policies remain authoritative. Required/optional fields reflect the existing workflows; dedicated CRM, tax registration, external payment processing and scheduling are outside these forms' current scope. New translation keys have English fallbacks pending editorial translation.
