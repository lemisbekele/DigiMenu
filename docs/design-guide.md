# DigiMenu design guide

Short rules every screen follows. Values live in `src/theme.css`.

## Direction
- **Customers (QR menu):** photos first, one "Add" per item, a sticky order bar. Inspired by me&u / Sunday.
- **Kitchen:** large tickets, big table numbers, wait time in color, one Done button. Inspired by Square / Toast kitchen displays.
- **Owners and staff:** plain words, calm cards, one main action per card. Inspired by Shopify admin.

## Rules
1. **One accent.** `--brand` marks the main action on a screen and nothing else. Status colors (`--warning`, `--danger`, `--success`) only for status.
2. **One main action per screen or card.** Secondary actions are quiet (ghost buttons or icons).
3. **Spacing:** only `--space-1` to `--space-6` (4, 8, 12, 16, 24, 32 px).
4. **Text:** only `--text-sm`, `--text-md`, `--text-lg`, `--text-xl`; weights `--weight-regular` and `--weight-bold`.
5. **Corners:** `--radius-sm` (controls), `--radius-md` (cards), `--radius-lg` (dialogs).
6. **Touch:** every button or control is at least `--tap` (44 px) tall on touch screens.
7. **Words:** plain verbs. "Done", "Take payment", "In line" — no jargon like "KDS".
8. **States:** every list has a loading, empty and error state that explains what to do.
9. **Font:** the system font (`--font-sans`). It costs no download and shows Amharic (Ge'ez) correctly.
10. **Colors:** only theme names (`var(--…)`), never hex values in screens, so light and dark both work.
