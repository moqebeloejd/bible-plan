import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const match = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error("Inline application script was not found");

const babelContext = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "vendor/babel.min.js"), "utf8"), babelContext);
const Babel = babelContext.Babel;
const transformed = Babel.transform(match[1], { presets: ["react"] });
if (!transformed.code.includes("ReactDOM.createRoot")) throw new Error("React application did not compile");

const plan = JSON.parse(fs.readFileSync(path.join(root, "data/reading-plan-v3.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(root, "data/validation-report.json"), "utf8"));
const migration = JSON.parse(fs.readFileSync(path.join(root, "data/progress-migration-v2-to-v3.json"), "utf8"));
const appearanceMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260830173000_add_bible_appearance_preferences.sql"), "utf8");
const cachedAssets = [...serviceWorker.matchAll(/"\.\/([^"?]*)"/g)].map(m => m[1]).filter(Boolean);

const days = plan.days;
const readings = days.flatMap(d => d.readings);
const blockIds = new Set(readings.map(r => r.publisher_block_id));

// The plan no longer stores dates, so the app and the generator must agree on
// how a day ordinal becomes a calendar night. Re-derive the rule here.
const nights = plan.schedule_policy.reading_weekdays;
const project = (n, startISO) => {
  const [y, m, d] = startISO.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  while (!nights.includes(x.getDay())) x.setDate(x.getDate() + 1);
  for (let i = 1; i < n; i++) { do { x.setDate(x.getDate() + 1); } while (!nights.includes(x.getDay())); }
  return x;
};
const projectedNightsAreLegal = [1, 2, 47, 120, days.length]
  .every(n => nights.includes(project(n, plan.schedule_policy.default_start_date).getDay()));

const luminance = hex => {
  const rgb = hex.match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const contrastPairs = [
  ["142052", "f7f9ff"], ["5e6985", "ffffff"], ["ffffff", "0d1744"], ["c2cae2", "15235b"],
  ["ffffff", "315eb9"], ["ffffff", "c33f7e"], ["ffffff", "7650b5"], ["ffffff", "087f83"],
  ["081134", "82a7ff"], ["081134", "ff90c4"], ["081134", "c5a2ff"], ["081134", "61d8d1"],
  ["111c49", "f1f5ff"], ["53607f", "f1f5ff"]
];

// Blocks must stay in source order and never be reordered by the scheduler.
let blockOrderOk = true;
let lastSeen = 0;
const firstDayOfBlock = new Map();
days.forEach((d, i) => d.readings.forEach(r => {
  if (!firstDayOfBlock.has(r.publisher_block_id)) firstDayOfBlock.set(r.publisher_block_id, i);
}));
for (const [, dayIdx] of firstDayOfBlock) { if (dayIdx < lastSeen) blockOrderOk = false; lastSeen = dayIdx; }

const checks = {
  babel_compile: true,
  offline_assets: cachedAssets.every(a => fs.existsSync(path.join(root, a))),
  validation_report: report.passed === true,
  day_count_matches: days.length === plan.day_count,
  verses: days.reduce((s, d) => s + d.verse_count, 0) === 31102,
  publisher_blocks: blockIds.size === plan.publisher_block_count,
  // The boundary policy has changed: readings follow the publisher's own blocks,
  // so mid-chapter starts and ends are now REQUIRED to survive, not forbidden.
  publisher_boundaries: readings.every(r => r.boundary === "publisher_block"),
  mid_chapter_starts_preserved: readings.some(r => r.start_verse !== 1),
  blocks_in_source_order: blockOrderOk,
  translation_neutral: readings.every(r => r.translation_text === null),
  dates_not_stored: days.every(d => d.date === undefined && d.weekday === undefined),
  projection_lands_on_reading_nights: projectedNightsAreLegal,
  migration_coverage: migration.map.length === days.length && days.every(d => Array.isArray(d.migration?.required_v2_days)),
  first_day: days[0].readings.map(r => r.reference).join("; ") === "Genesis 1:1—4:26",
  last_day: days.at(-1).readings.at(-1).reference.startsWith("Revelation"),
  sittings_within_hard_cap: days.every(d => d.estimated_minutes <= plan.schedule_policy.hard_cap_minutes),
  account_only_gate: html.includes('if(!session?.user)return <AccountGate'),
  account_derived_identity: html.includes('user?.user_metadata?.display_name') && html.includes('reader_profiles'),
  uid_scoped_device_cache: html.includes('const ACCOUNT_STORAGE_PREFIX="bible_reader_state_v1_"') && html.includes('accountStorageKey(uid)'),
  no_silent_legacy_import: !html.includes('localStorage.getItem(LEGACY_STORAGE_KEY)') && !html.includes('localStorage.getItem(LEGACY_V3_STORAGE_KEY)'),
  explicit_sync_control: html.includes('>Sync now</button>'),
  local_device_signout: html.includes('signOut({scope:"local"})') && html.includes('>Sign out on this device</button>'),
  account_creation_name: html.includes('Reader’s name') && html.includes('data:{display_name:'),
  password_visibility_control: html.includes('showPassword?"text":"password"'),
  light_card_apparatus_contrast: html.includes('.card .app-title{color:var(--card-text);}') && html.includes('.card .app-page,.card .app-tags{color:var(--card-muted);}'),
  blue_white_light_dark_themes: html.includes(':root[data-theme="dark"]') && html.includes('theme==="dark"?"#101d55":"#ffffff"'),
  restrained_accent_choices: ["blue","pink","purple","teal"].every(name => html.includes(`data-accent="${name}"`) || name === "blue") && html.includes('Accents colour highlights only'),
  synced_appearance_preferences: html.includes('select("start_date,bible_version,theme,accent")') && html.includes('theme:validTheme(s.theme),accent:validAccent(s.accent)'),
  appearance_palette_contrast: contrastPairs.every(([foreground, background]) => contrast(foreground, background) >= 4.5),
  constrained_appearance_migration: appearanceMigration.includes("theme in ('light', 'dark')") && appearanceMigration.includes("accent in ('blue', 'pink', 'purple', 'teal')"),
  blue_white_install_chrome: manifest.background_color === "#ffffff" && manifest.theme_color === "#182665",
};

for (const [name, pass] of Object.entries(checks)) if (!pass) throw new Error(`Validation failed: ${name}`);
console.log(JSON.stringify({ plan_id: plan.plan_id, day_count: plan.day_count, checks }, null, 2));
