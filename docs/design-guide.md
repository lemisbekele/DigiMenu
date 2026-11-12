# DigiMenu design guide

The design language lives in [design-language.html](design-language.html): principles, colour rules, type, spacing, the shared parts and reference screens. The spec is [superpowers/specs/2026-11-12-redesign-design.md](superpowers/specs/2026-11-12-redesign-design.md).

## Rules every screen follows

- Colour values live only in `src/theme.css`. No hex anywhere else.
- Green (`--brand`) only on the one main action per screen or panel, and on the active navigation link. Status colours only on status.
- Status is always a `StatusPill` (dot + word): waiting, preparing, ready, late, paid.
- Type sizes: `--text-xs` 12, `--text-sm` 13, `--text-md` 14, `--text-lg` 16, `--text-xl` 20, `--text-2xl` 28. `--font-display` only on page titles, table numbers and headline figures.
- Spacing: `--space-1` to `--space-6` (4, 8, 12, 16, 24, 32). Corners: `--radius-sm` 8, `--radius-md` 12, `--radius-lg` 16, `--radius-pill`.
- Controls are `--control-h` tall: 36px with a mouse, 44px on touch (`.ui-touch`).
- Build screens from the shared parts in `src/ui/`. If a part is missing, add it there first.
- No inline `style={{}}` for static visual values. Short labels never wrap; long text is ellipsised.
- Every list has a loading, an empty and an error state that says what to do next.
- Check uniformity with `node scripts/uiAudit.mjs` (`--strict` for the end targets).
