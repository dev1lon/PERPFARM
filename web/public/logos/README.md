# Perp-dex logos

Drop official logo files here, named by venue slug:

    hibachi.svg      (or hibachi.png)
    pacifica.svg
    extended.png
    ...

- Square aspect ratio, ideally SVG; PNG at 128x128+ is fine too.
- Use the project's OFFICIAL brand asset (from their site/press kit/docs),
  never a redrawn approximation.
- After adding a file, register it in `web/components/PerpDexLogo.tsx`
  (`LOGO_FILES` map) -- one line: `slug: "slug.svg"`. Until a slug is
  registered there, its card shows the colored-monogram placeholder.
