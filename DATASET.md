# Reading Plan Dataset v2

`data/reading-plan-v2.json` is the app's authoritative runtime schedule. Its
chronology is derived from the supplied *NKJV Chronological Study Bible* (2008),
but it contains no NKJV text. Each reading stores canonical book/chapter fields,
an OSIS identifier, and a display reference.

## Portability

The plan is independent of a Bible edition's printed order. A text provider or
link adapter receives a reference such as `Gen.1-Gen.3`; the selected Bible
version supplies the text. Changing versions must never change `plan_id`,
`day_id`, chronological order, or completion records.

The current versification target is the Protestant 66-book canon. Editions with
different versification or additional books need an explicit mapping layer; do
not silently renumber the base dataset.

## Runtime files

- `reading-plan-v2.json` — 365 daily groups and compact reading segments.
- `chapters-v2.json` — chapter-level chronology, themes, verse counts, and source
  placement metadata.
- `progress-migration-v1-to-v2.json` — conservative map from the old page-based
  schedule. A new day is complete only when all contributing old days were
  complete.
- `validation-report.json` — machine checks and load statistics.

Stable identifiers use:

```text
Plan: nkjv-chronological-whole-chapter-365-v2
Day:  CRP2-D001 … CRP2-D365
Read: CRP2-D001-R01 …
```

## Invariants

- exactly 365 days;
- all 1,189 chapters occur exactly once;
- all 31,102 verses are represented;
- every reading starts at verse 1 and ends at a chapter's final verse;
- no Scripture translation text is embedded;
- Day 1 is Genesis 1–3 and Day 365 is Revelation 19–22.

Run `npm test` to compile the app's JSX and re-check these invariants.
