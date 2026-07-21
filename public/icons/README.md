# Fielding-event icons

Drop icon files here and the commentary badges pick them up automatically —
no code change. Expected filenames:

| File | Used for |
|------|----------|
| `dropped-catch.svg` | `DROPPED CATCH!` commentary entries |
| `run-out-missed.svg` | `RUN OUT MISSED!` commentary entries |
| `misfield.svg` | `MISFIELD!` commentary entries |

If a file is missing, `src/components/icons/fielding.tsx` renders a built-in
placeholder SVG instead, so the badge is never empty.

## Sizing and colour

Icons render at 12–13px inside the badge. Prefer a simple, high-contrast glyph
with a viewBox tight to the artwork; detailed illustrations turn to mush at
that size.

Files here are painted through a CSS mask, so **the artwork's own colours are
ignored and it takes the badge colour** (gold). A plain black glyph is the
ideal input. Only the shape matters — transparency defines it.

If you need a multi-colour icon shown exactly as authored, pass `tint={false}`
where the icon is used (see `src/components/icons/fielding.tsx`).

## Licensing

These are yours to choose. If you use a third-party set (Flaticon, Noun
Project, Icons8, …), download through your own account and follow that plan's
attribution terms — most free tiers require a visible credit somewhere in the
app. Nothing in this repo ships third-party icon files.
