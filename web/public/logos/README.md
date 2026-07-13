# Perp-dex brand assets

One folder per perp, named by its venue slug. Inside, up to three files:

    logos/hibachi/
      logo.svg          square icon -> shown on the badge (home card + perp page)
      wordmark.svg      the name rendered as an image -> replaces the plain-text
                        name on the home card
      background.png    wide hero image -> shown behind the header on /hibachi

- `logo`: square, ideally SVG; PNG at 128x128+ is fine.
- `wordmark`: transparent background, roughly 4:1-6:1 wide; it's shown at 20px
  tall, width auto (capped at 160px).
- `background`: wide (about 3:1), any of jpg/png/webp; it renders in a 224px
  hero band with a scrim, so busy centers are fine but keep it readable.
- Every file is optional. A missing `logo` falls back to a colored monogram,
  a missing `wordmark` to the plain-text name, a missing `background` to no
  hero band.
- Use the project's OFFICIAL brand asset (site / press kit / docs), never a
  redrawn approximation.

After adding files, register the folder in `web/lib/brand.ts` (one entry per
slug, only the fields that exist). Until a slug is registered there, its card
shows the text/monogram fallbacks even if files are present.
