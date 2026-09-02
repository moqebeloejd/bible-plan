import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloudConfig = fs.readFileSync(path.join(root, "cloud-config.js"), "utf8");
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
const digest = source => crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
const canonicalIcons = [
  {sourceName:"icon.svg", extension:"svg", sizes:"any", normalize:true},
  {sourceName:"icon-180.png", extension:"png", sizes:"180x180"},
  {sourceName:"icon-192.png", extension:"png", sizes:"192x192"},
  {sourceName:"icon-512.png", extension:"png", sizes:"512x512"}
].map(icon => {
  const raw = fs.readFileSync(path.join(root, icon.sourceName));
  const source = icon.normalize ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
  const basename = path.basename(icon.sourceName, `.${icon.extension}`);
  return {...icon,source,assetName:`${basename}.${digest(source)}.${icon.extension}`};
});
const iconBySource = new Map(canonicalIcons.map(icon => [icon.sourceName,icon]));
const canonicalIcon = iconBySource.get("icon.svg").source;
const revisionedIconName = iconBySource.get("icon.svg").assetName;
const iconBundleRevision = digest(Buffer.concat(canonicalIcons.flatMap(icon => [Buffer.from(icon.sourceName),icon.source])));
const revisionedIconsMatch = canonicalIcons.every(icon => {
  const revisionedPath = path.join(root, icon.assetName);
  if(!fs.existsSync(revisionedPath))return false;
  const raw = fs.readFileSync(revisionedPath);
  const source = icon.normalize ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
  return source.equals(icon.source);
});
const pngDimensionsMatch = canonicalIcons.filter(icon => icon.extension === "png").every(icon => {
  const [expectedWidth,expectedHeight] = icon.sizes.split("x").map(Number);
  return icon.source.readUInt32BE(16) === expectedWidth && icon.source.readUInt32BE(20) === expectedHeight;
});

const days = plan.days;
const readings = days.flatMap(d => d.readings);
const blockIds = new Set(readings.map(r => r.publisher_block_id));
const dayIds = days.map(d => d.day_id);
const segmentIds = readings.map(r => r.segment_id);
const editorialReadings = days.flatMap(d => d.editorial_readings || []);
const expectedDayIds = days.map((_, i) => `CRP4-D${String(i + 1).padStart(3, "0")}`);

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
const day128 = project(128, plan.schedule_policy.default_start_date);
const projectedWeekdays = days.map((_, i) => project(i + 1, plan.schedule_policy.default_start_date).getDay());
const weeksUseSundayThroughThursday = projectedWeekdays.every(day => day >= 0 && day <= 4)
  && html.includes("const weekStart=addDays(firstWeekStart(startDate),weekIdx*7),weekEnd=addDays(weekStart,4)");

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
  validation_report: report.passed === true && report.plan_id === plan.plan_id && report.day_count === plan.day_count,
  plan_identity_consistent: cloudConfig.includes(`planId: "${plan.plan_id}"`) && migration.to?.plan_id === plan.plan_id,
  day_ids_are_v4_sequence: dayIds.every((id, i) => id === expectedDayIds[i]) && new Set(dayIds).size === dayIds.length,
  segment_ids_match_days: readings.every(r => r.segment_id.startsWith(`${r.segment_id.slice(0, 9)}-R`) && dayIds.includes(r.segment_id.slice(0, 9))) && new Set(segmentIds).size === segmentIds.length,
  day_count_matches: days.length === plan.day_count,
  verses: days.reduce((s, d) => s + d.verse_count, 0) === 31102,
  publisher_blocks: blockIds.size === plan.publisher_block_count,
  epoch_essays_are_explicit: editorialReadings.filter(x => x.kind === "epoch-essay").length === 9,
  editorial_readings_are_unique: new Set(editorialReadings.map(x => `${x.kind}|${x.printedPage}|${x.title}`)).size === editorialReadings.length,
  required_material_is_labelled: html.includes("Read · Epoch essay") && html.includes("Read · Section introduction") && html.includes("Read · Note") && html.includes("Review · {v.kind.replace"),
  note_topics_are_explained: html.includes("<strong>Topics covered:</strong>"),
  external_bible_links_are_removed: !html.includes("biblegateway.com") && !html.includes("Bible version for links") && !html.includes('className="read-link"'),
  day_panel_uses_three_type_sizes: html.includes("--card-title-size:") && html.includes("--card-primary-size:") && html.includes("--card-meta-size:"),
  // The boundary policy has changed: readings follow the publisher's own blocks,
  // so mid-chapter starts and ends are now REQUIRED to survive, not forbidden.
  publisher_boundaries: readings.every(r => r.boundary === "publisher_block"),
  mid_chapter_starts_preserved: readings.some(r => r.start_verse !== 1),
  blocks_in_source_order: blockOrderOk,
  translation_neutral: readings.every(r => r.translation_text === null),
  dates_not_stored: days.every(d => d.date === undefined && d.weekday === undefined),
  projection_lands_on_reading_nights: projectedNightsAreLegal,
  day_128_is_2026_09_02: day128.getFullYear() === 2026 && day128.getMonth() === 8 && day128.getDate() === 2,
  week_views_span_sunday_through_thursday: weeksUseSundayThroughThursday,
  default_progress_through_day_128: html.includes('const DEFAULT_COMPLETED_THROUGH=128;') && html.includes('defaultSeedVersion:DEFAULT_SEED_VERSION'),
  existing_cloud_choices_win_on_new_device: html.includes('cloudFirstUserRef.current===uid') && html.includes('if((existingRows||[]).length||existingSettings)'),
  migration_coverage: migration.map.length === days.length && days.every(d => Array.isArray(d.migration?.required_v2_days)),
  // Assert the invariant, not one particular cut: the plan must open on the first
  // verse of Genesis and close on the last of Revelation however the nights fall.
  opens_at_genesis_1_1: days[0].readings[0].book === "Genesis" && days[0].readings[0].start_chapter === 1 && days[0].readings[0].start_verse === 1,
  closes_at_revelation_22_21: days.at(-1).readings.at(-1).book === "Revelation" && days.at(-1).readings.at(-1).end_chapter === 22 && days.at(-1).readings.at(-1).end_verse === 21,
  sittings_within_hard_cap: days.every(d => d.estimated_minutes <= plan.schedule_policy.hard_cap_minutes),
  account_only_gate: html.includes('if(!session?.user)return <AccountGate'),
  account_derived_identity: html.includes('user?.user_metadata?.display_name') && html.includes('reader_profiles'),
  uid_scoped_device_cache: html.includes('const ACCOUNT_STORAGE_PREFIX="bible_reader_state_v1_"') && html.includes('accountStorageKey(uid)'),
  no_silent_legacy_import: !html.includes('localStorage.getItem(LEGACY_STORAGE_KEY)') && !html.includes('localStorage.getItem(LEGACY_V3_STORAGE_KEY)'),
  explicit_sync_control: html.includes('>Sync now</button>'),
  local_device_signout: html.includes('signOut({scope:"local"})') && html.includes('>Sign out on this device</button>'),
  account_creation_name: html.includes('Reader’s name') && html.includes('data:{display_name:'),
  password_visibility_control: html.includes('showPassword?"text":"password"'),
  non_enumerating_password_recovery: html.includes('auth.resetPasswordForEmail') && html.includes('If an account exists for that email, a password-reset link has been sent.'),
  verified_recovery_session_gate: html.includes('event==="PASSWORD_RECOVERY"') && html.includes('recoveryStatus==="verified"') && html.includes('auth.updateUser({password:'),
  early_recovery_event_buffer: html.includes('let EARLY_RECOVERY_SESSION=null;') && html.includes('EARLY_AUTH_SUBSCRIPTION') && html.indexOf('let EARLY_RECOVERY_SESSION=null;') < html.indexOf('function App(){'),
  recovery_cold_start_guard: html.includes('recoveryRequestedAtLoad') && html.includes('recoveryStatus==="checking"') && html.indexOf('recoveryStatus==="verified"') < html.indexOf('if(!session?.user)return <AccountGate'),
  recovery_url_cleanup: html.includes('url.searchParams.set(RECOVERY_QUERY_KEY,RECOVERY_QUERY_VALUE)') && html.includes('clearPasswordRecoveryRedirect()'),
  shared_account_password_copy: html.includes('same sign-in used by Mmuso wa Modimo') && html.includes('password change applies to both apps'),
  shared_account_password_policy: html.includes('const minimumPasswordLength=mode==="signup"?8:6;') && html.includes('const matches=password.length>=8&&password===confirmation;'),
  light_card_apparatus_contrast: html.includes('.card .app-title{color:var(--card-text);}') && html.includes('.card .app-cite,.card .app-page,.card .app-tags,.card .app-kind{color:var(--card-muted);}'),
  blue_white_light_dark_themes: html.includes(':root[data-theme="dark"]') && html.includes('theme==="dark"?"#101d55":"#ffffff"'),
  restrained_accent_choices: ["blue","pink","purple","teal"].every(name => html.includes(`data-accent="${name}"`) || name === "blue") && html.includes('Accents colour highlights only'),
  synced_appearance_preferences: html.includes('select("start_date,bible_version,theme,accent")') && html.includes('theme:validTheme(s.theme),accent:validAccent(s.accent)'),
  appearance_palette_contrast: contrastPairs.every(([foreground, background]) => contrast(foreground, background) >= 4.5),
  constrained_appearance_migration: appearanceMigration.includes("theme in ('light', 'dark')") && appearanceMigration.includes("accent in ('blue', 'pink', 'purple', 'teal')"),
  blue_white_install_chrome: manifest.background_color === "#ffffff" && manifest.theme_color === "#182665",
  stable_manifest_identity: manifest.id === "./" && manifest.start_url === "." && manifest.scope === ".",
  content_revisioned_icon: revisionedIconsMatch && canonicalIcons.every(icon => serviceWorker.includes(`./${icon.assetName}`)) && html.includes(revisionedIconName) && serviceWorker.includes(`const ICON_REVISION = "${iconBundleRevision}";`),
  raster_install_icons: pngDimensionsMatch && ["icon-192.png","icon-512.png"].every(sourceName => manifest.icons?.some(icon => icon.src === iconBySource.get(sourceName).assetName && icon.sizes === iconBySource.get(sourceName).sizes && icon.type === "image/png")) && html.includes(`rel="apple-touch-icon" href="${iconBySource.get("icon-180.png").assetName}"`),
  manifest_refreshes_network_first: serviceWorker.includes('pathname.endsWith("/manifest.json")') && serviceWorker.includes('fetch(e.request, {cache:"no-store"})'),
  manifest_http_errors_fall_back_offline: serviceWorker.includes('if(!res.ok)throw new Error') && serviceWorker.includes('await cache.put(e.request,res.clone())'),
  plan_and_cloud_config_refresh_network_first: serviceWorker.includes('["/cloud-config.js", "/data/reading-plan-v3.json"]') && serviceWorker.includes('Fresh content request failed'),
  service_worker_update_bypasses_http_cache: html.includes('register("sw.js",{updateViaCache:"none"})') && html.includes('registration.update()'),
  service_worker_cache_cleanup_is_scoped: serviceWorker.includes('k.startsWith("bible-year-") && k !== CACHE'),
  modern_supporting_palette: ["--sky:#dceaff", "--periwinkle:#e5e3ff", "--blush:#ffe9f2", "backdrop-filter:blur(18px)"].every(token => html.includes(token)),
  updated_blue_white_icon: canonicalIcon.includes("#315EB9") && canonicalIcon.includes("#FFFFFF") && html.includes(`<img className="brand-mark" src="${revisionedIconName}"`),
};

for (const [name, pass] of Object.entries(checks)) if (!pass) throw new Error(`Validation failed: ${name}`);
console.log(JSON.stringify({ plan_id: plan.plan_id, day_count: plan.day_count, checks }, null, 2));
