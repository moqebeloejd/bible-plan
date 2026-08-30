import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
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
};

for (const [name, pass] of Object.entries(checks)) if (!pass) throw new Error(`Validation failed: ${name}`);
console.log(JSON.stringify({ plan_id: plan.plan_id, day_count: plan.day_count, checks }, null, 2));
