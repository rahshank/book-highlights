# Backlog

Items to revisit as the app matures.

## Cost / Performance
- [ ] **OCR model order**: Currently tries Sonnet then Haiku (double cost when Sonnet returns empty). Consider flipping to Haiku-first or Haiku-only once we have enough data on quality vs cost tradeoff.
- [ ] **Track OCR costs**: Log token usage per scan so we can see actual spend.

## OCR Quality
- [ ] **Short underlines**: Improved prompt to catch short passages — monitor whether this holds up across different books/handwriting styles.
- [ ] **Partial sentence completion**: Prompt now asks for full sentences when underline is partial — verify this doesn't over-include surrounding text.

## UI / UX
- [ ] **Timestamp format**: Currently shows date only (e.g. "Feb 16, 2026"). Consider adding time or relative format ("2 hours ago") if useful.
