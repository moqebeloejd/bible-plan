# Handover — installing the re-cut reading plan

**For whoever owns the app.** A new reading-plan dataset is ready and validated, but it **cannot be
merged as it stands** without corrupting existing progress. This document says what is ready, what
the blocker is, and what has to be decided.

Branch: **`plan-v3-recut`** (branched from `main` at `b41def8`).
Nothing is pushed. `main` is untouched.

---

## 1. What is on the branch

Three files, all data or checks — **no application code was changed**:

| File | Change |
| --- | --- |
| `data/reading-plan-v3.json` | 244 → **631** nights, re-cut against publisher section headings and re-costed at measured household reading rates |
| `data/progress-migration-v2-to-v3.json` | regenerated for 631 nights |
| `scripts/validate-app.mjs` | two assertions replaced (see §5) |

`node scripts/validate-app.mjs` → **47/47 pass** on the branch.

---

## 2. THE BLOCKER — day_id collision

`plan_id` is unchanged (`nkjv-chronological-publisher-blocks-v3`) but every `day_id` now means a
different passage:

```
CRP3-D045   was  Deuteronomy 34:1-12 | Psalms 90:1-17 | Joshua 1:1—5:15
            now  Exodus 20:22—21:36

CRP3-D118   was  2 Kings 21 | Zephaniah
            now  Joshua 11:16—14:5

CRP3-D244   was  Revelation 22:21          (the final night)
            now  1 Kings 18:41—19:21
```

Progress lives in `bible_reader_progress`, keyed `(user_id, plan_id, day_id)`. Same plan id, same day
ids, **different readings** — so every completed night would silently re-point at the wrong passage.
Nothing errors. It is just wrong.

### Recommended fix

**Bump the plan id** — e.g. `nkjv-chronological-publisher-blocks-v4` — in:

- `data/reading-plan-v3.json` → `plan_id` (and consider renaming the file to `-v4`)
- `cloud-config.js` → `planId`
- the day-id prefix, currently derived by `dayIdPrefix()` from `PLAN.days[0].day_id`, so changing
  the ids in the dataset to `CRP4-Dnnn` is enough — no code change needed
- `pilot/build-dataset-v3.mjs` if the dataset is ever regenerated (it hard-codes `CRP3-D`)

Old rows are then orphaned but preserved, and the new plan starts clean. **This is the safe shape.**

---

## 3. THE SECOND ISSUE — the migration path no longer exists

The dataset still carries a per-day migration rule:

```json
"migration": { "required_v2_days": [69, 70, 126] }
```

But since `ac9a350`…`b41def8` the app no longer reads it:

```
grep -c required_v2_days index.html   ->  0
grep -c migration        index.html   ->  0
```

`LEGACY_STORAGE_KEY` and `LEGACY_V3_STORAGE_KEY` are declared but never read, and the validator
asserts `no_silent_legacy_import`. That looks deliberate — the account rework moved progress to
Supabase and removed silent local imports — so **this brief does not assume you want it back.**

The consequence is simply that carry-over is now a decision, not automatic.

### The household's actual position

They have read to **`Joshua 14:5`**, which is a clean boundary — the end of publisher block
`Joshua 6:1—14:5`.

```
118 of 631 nights complete   (18.7%)
6,210 verses  ·  ~42 hours read
resume at night 119  —  Joshua 14:6—16:4
```

So under the new plan, nights **1 … 118 inclusive** are complete. That is a contiguous run, which
makes seeding simple whichever route is chosen:

- **a one-time SQL/API write** of 118 rows into `bible_reader_progress` for the new plan id, or
- **a small "I've read up to here" control** in the app (arguably useful permanently), or
- re-adding a migration path, or
- tapping through 118 nights by hand (works, but tedious).

`pilot/out/progress-seed.json` holds the exact list of completed `day_id`s and the resume point.

---

## 4. What must not be broken

The re-cut rests on rules agreed with the household. Anything that regenerates the dataset must
preserve them, and `scripts/validate-app.mjs` already guards most:

- **`publisher_boundaries`** — every reading is `boundary: "publisher_block"`.
- **`mid_chapter_starts_preserved`** — 289 blocks start mid-chapter and must stay that way. The old
  whole-chapter rule is retired by an explicit household decision.
- **`blocks_in_source_order`** — the publisher's chronology, never canonical order.
- **`dates_not_stored`** — the plan is an ordered list; the calendar is a projection. Day N falls on
  the Nth reading night on or after the start date, reading nights being
  `schedule_policy.reading_weekdays = [0,1,2,3,4]` (Sun–Thu). `index.html` mirrors
  `pilot/lib/project-dates.mjs` and the two must stay identical.
- **`projection_lands_on_reading_nights`** — no reading ever falls on Friday or Saturday night.
  Those are reserved for intercession and family study; the Sabbath runs Friday night to Saturday
  night.
- **`sittings_within_hard_cap`** — no night over 60 minutes. Currently the maximum is 54.8.

---

## 5. The two validator assertions I changed

They previously pinned one exact cut, so they failed on every re-tune:

```js
// before
first_day: days[0].readings.map(r => r.reference).join("; ") === "Genesis 1:1—4:26",
last_day:  days.at(-1).readings.at(-1).reference.startsWith("Revelation"),

// after — assert the invariant, not one particular cut
opens_at_genesis_1_1:      days[0].readings[0].book === "Genesis" && …start_chapter === 1 && …start_verse === 1,
closes_at_revelation_22_21: days.at(-1).readings.at(-1).book === "Revelation" && …end_chapter === 22 && …end_verse === 21,
```

The plan now opens `Genesis 1:1—2:7` and closes `Revelation 21:22—22:21`.

---

## 6. What changed in the plan, and why

Brief context so the numbers are not surprising. Full detail in
`…\Faith\Study\Bible\BIBLE_PLAN_RESUME_CHECKPOINT.md`.

**Cut points.** A reading may end only at a book start, a book change, a context-group end, a
publisher block start, or a **section heading**. A chapter break is *not* a cut point. The old plan
stopped at places like `Judges 6:24` — mid-narrative, between Gideon's call and what he did about
it. All 2,989 section headings across the 66 books are now extracted and used.

**Pace.** Measured against the household rather than assumed:

```
Scripture  92 wpm   read aloud
Notes      73 wpm   SLOWER, because they are discussed rather than skimmed
Target     21 min   the Bible portion of the evening, which also carries other study
```

The previous 150/200 wpm was roughly twice too fast — a night claiming 30 minutes was really taking
an hour.

**Result:** 631 nights, ~29 months, median 20.9 min, max 54.8, none over 60. Verses per night 46
median, 62 on a light-notes night — down from 129.

**No per-passage exceptions.** An override mechanism was built and deliberately removed: where nights
ran long, 23 of 26 proved avoidable by re-weighting. Fix the rules, never the individual night.

---

## 7. Suggested order of work

1. Decide the plan id (§2). Recommend `…-v4` and `CRP4-Dnnn`.
2. Regenerate or rewrite the dataset with the new id, or rewrite ids in place on the branch.
3. Decide the seeding route for the 118 completed nights (§3).
4. `node scripts/validate-app.mjs` — expect 47/47.
5. Preview locally against a signed-in account and confirm the carried count is **118** and the
   current night is **119 — Joshua 14:6—16:4**.
6. Merge and push only after that count is confirmed. If it comes back as anything else, stop.

---

## 8. Where the generator lives

`C:\Users\elias\OneDrive\02_Personal\Faith\Study\Bible\pilot`

```
node build-plan.mjs           # sittings      -> out/plan.json
node build-dataset-v3.mjs     # app dataset   -> out/reading-plan-v3.json
node build-migration.mjs      # carry-over    -> out/progress-migration-v2-to-v3.json
node validate-plan.mjs        # 8 plan checks
```

Every rule is a flag — `--target`, `--scripture-wpm`, `--apparatus-wpm`, `--over-weight`,
`--wholeness`, `--name-bonus`, `--note-penalty`. None needs a code change.

---

## 9. Open questions for the household

- Two nights exceed 45 minutes, both note-driven rather than Scripture-driven: `John 1:1-18` at
  54.8 min for 18 verses, and `Daniel 7:1-8` at 50.2 min for 8. If those read wrong in practice, the
  73 wpm note rate is still too slow.
- Judges night 1 is 26 verses but 38 minutes, because the *From Tribes to a Nation* epoch essay
  (printed 257–258) rides on it. Pages carrying no verse are attached to the night that follows, so
  nothing arrives uncounted — but it makes that night unusually note-heavy.
