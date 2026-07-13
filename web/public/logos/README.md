# Perp-dex brand assets

One folder per perp, named by its venue slug. Inside, up to two files:

    logos/hibachi/
      wordmark.png      the NAME in the perp's own brand font -> shown on the
                        home card + perp-page header (in place of logo+text)
      logo.png          square icon -> shown on the badge ONLY when there's no
                        wordmark (the flame before the text is dropped once a
                        wordmark exists)

- `wordmark`: the name rendered as an image in the perp's unique font
  (transparent PNG, or SVG). Shown at ~24px tall on the home card, ~32px on
  the perp page, width auto. Give it a color visible on the site's dark
  background (the default theme). When present, the separate logo mark is not
  shown next to it.
- `logo`: square, ideally SVG; PNG at 128x128+ is fine (displayed at 32-40px).
  Only used when there's no wordmark.
- Both files are optional: no wordmark -> logo + bold-uppercase text name; no
  logo -> colored monogram.
- Use the project's OFFICIAL brand asset (site / press kit / docs), never a
  redrawn approximation.

The perp-page **background** is not an image file -- it's a full-page CSS
gradient generated from the perp's warm brand hues mixed into a near-black,
so it reads as a DARK, warm-tinted surface (like the reference Hibachi card).
Configured as `glow: ["#top", ..., "#bottom"]` in `web/lib/brand.ts` -- warm
hex colors from the perp's palette, top first to bottom last. Not dropped in
this folder.

After adding files, register the folder in `web/lib/brand.ts` (one entry per
slug, only the fields that exist).
