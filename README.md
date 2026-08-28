# Chronological Bible · One Year

A simple, installable reading-plan app for reading through the Bible in one
year on a chronological plan — nine epochs from Creation to the Church Age,
based on the NKJV Chronological Study Bible.

## Features
- 365-day chronological plan with complete-chapter reading boundaries
- Context-aware daily themes and short context notes
- Translation-neutral Bible references with selectable version links
- Today, Week, Month, and Journey views
- Tap to mark a day complete; progress is saved locally first
- Optional account sign-in synchronises progress, start date, and Bible version across devices
- Settable start date so a group can read in step together
- Works offline and installs to your home screen (Android, iPhone, tablet)

## How to install
1. Open the app link in your browser.
2. **Android (Chrome):** menu (⋮) → *Add to Home screen*.
3. **iPhone/iPad (Safari):** Share → *Add to Home Screen*.

The plan follows the chronological structure of the NKJV Chronological Study
Bible, but stores only canonical Bible references. It can therefore be used
with other Bible translations and with editions printed in canonical rather
than chronological order.

Progress remains available locally while offline. Signed-in readers are synced
through Supabase with Row Level Security so each account can access only its own
Bible-plan rows.

See `DATASET.md` for the portable reference schema and validation rules. Run
`npm test` to validate the app and all plan invariants.
