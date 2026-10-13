# Login, menu editor and DigiMenu branding

September 22, 2026

- The login page uses a centered responsive card, shared DigiMenu logo, consistent fields, a password visibility button, email validation before password-reset requests, and a clear sign-in action. Existing account identification and tenant/role validation remain in place.
- The shared logo now displays DigiMenu instead of the former company logo. Marketing navigation/footer, authenticated layouts, focused POS/kitchen navigation, customer pages, QR printouts, password reset, and missing-cafe screens use the same mark. Favicon, installable-app icons and the app manifest were updated. The marketing footer retains company attribution.
- The menu editor uses the existing native dialog component for focus containment, Escape handling and focus restoration. Item details and photo/availability occupy separate desktop columns; customization and optional translations follow. The body scrolls while save/cancel actions stay visible. Currency and unit labels remain readable in narrow fields.
- All existing menu fields and manager-specific prep-time behavior are preserved. New-item creation clears old pending image state, zero-priced items retain their price on edit, and a failed save keeps the entered data visible.

Verification: 132 automated tests passed; production build and lint passed. `scripts/audit-login-menu-design.mjs` passed 42 browser checks covering 360/768/1440px layouts in light/dark themes, password visibility, native dialog behavior, focus restoration, optional translations and rejected saves. Screenshots are stored under `artifacts/audit/login-menu-design` and were visually reviewed. The browser test intercepts its synthetic menu save; it creates no menu records.

No database migration is needed. The app logo is a lightweight vector based on the existing coffee/DigiMenu identity, with PNG versions rendered for installable-app icons.
