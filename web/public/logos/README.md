# Perp-dex brand assets

One folder per perp, named by its venue slug. Inside, up to two files:

    logos/hibachi/
      logo.png          square icon -> shown on the badge (home card + perp page)
      background.png    wide hero image -> shown behind the header on /hibachi

- `logo`: square, ideally SVG; PNG at 128x128+ is fine (keep it reasonably
  small -- it's displayed at 32-40px).
- `background`: wide (about 3:1), any of jpg/png/webp; it renders in a 224px
  hero band with a scrim, so busy centers are fine but keep it readable.
- Both files are optional. A missing `logo` falls back to a colored monogram,
  a missing `background` to no hero band.
- The perp NAME is not a file here -- it's rendered as bold-uppercase text by
  `components/PerpName.tsx`, the same for every perp. (A brand wordmark image
  is intentionally not used.)
- Use the project's OFFICIAL brand asset (site / press kit / docs), never a
  redrawn approximation.

After adding files, register the folder in `web/lib/brand.ts` (one entry per
slug, only the fields that exist). Until a slug is registered there, its card
shows the monogram / no-background fallbacks even if files are present.
