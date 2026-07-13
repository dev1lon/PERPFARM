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
vertical gradient through the perp's brand palette (matching the brand's
ready-made gradient swatch), configured as `glow: ["#top", ..., "#bottom"]`
in `web/lib/brand.ts` -- exact hex colors, top color first to bottom last.
Not dropped in this folder.

After adding files, register the folder in `web/lib/brand.ts` (one entry per
slug, only the fields that exist).
