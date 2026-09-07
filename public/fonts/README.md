# Brand fonts

The five families the compositor can render, in Regular (400) and Bold (700).

These files are the **export** side of the contract. The browser canvas loads
the same families from Google Fonts (`lib/composition/fonts.ts`); FFmpeg's
`drawtext` can only use a file, and has **no weight parameter** — the weight it
renders is whatever the `.ttf` contains. So every weight the UI offers needs its
own file here, or the preview shows bold and the export ships regular.

`lib/composition/export.ts`'s `FONT_FILES` maps family+weight to these
filenames. Adding a weight or a family means adding the file AND the entry;
`BRAND_FONTS` (`lib/composition/layers.ts`) is what the UI is allowed to offer.

## Where the Bold files came from

Google Fonts now ships these families as VARIABLE fonts only — there are no
static Bold builds in `google/fonts` to download. Each Bold here was instanced
from the upstream variable font with `fontTools.varLib.instancer`, pinning
`wght=700` and every remaining axis at its default (`opsz` for Inter, `wdth=100`
for Roboto). Pinning the leftover axes matters: leave one live and the file is
still variable, and a renderer that can't set axes silently falls back to the
default instance.

`OS/2.fsSelection` BOLD is set and REGULAR cleared, `head.macStyle` bit 0 set,
`usWeightClass` 700 — the two tables have to agree or a face renders bold in one
application and not another.

Verified per file: `usWeightClass == 700`, no `fvar` table, and outlines
measurably heavier than the Regular (ink width of `H` is wider in all five).

## Licences

- Inter, Montserrat, Lora, Playfair Display — SIL Open Font License 1.1
- Roboto — Apache License 2.0

Both permit embedding and redistribution. The Regular files predate this note
and come from the same upstream families.
