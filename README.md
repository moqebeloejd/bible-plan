# NKJV Chronological Bible Plan

An installable family reading-plan app following the publisher’s Scripture
blocks and chronology in the NKJV Chronological Study Bible.

## Features
- 244 manageable sittings containing all 787 publisher-defined Scripture blocks
- Publisher boundaries preserved, including intentional mid-chapter divisions
- Context-aware daily themes and short context notes
- Translation-neutral Bible references with selectable version links
- Today, Week, Month, and Journey views
- Account-only access so every family member has independent progress
- Account creation captures the reader’s display name
- Per-account offline cache plus explicit and automatic cloud synchronisation
- Church blue-and-white light and dark modes with optional blue, pink, purple, or teal accents
- Sync now and device-only sign-out controls
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

Each account’s progress remains available locally while offline and synchronises
through Supabase when the connection returns. Row Level Security restricts each
reader to their own Bible-plan rows. Older shared-device records remain untouched
and are never silently assigned to a newly signed-in family member.

See `DATASET.md` for the portable reference schema and validation rules. Run
`npm test` to validate the app and all plan invariants.
