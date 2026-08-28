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

const plan = JSON.parse(fs.readFileSync(path.join(root, "data/reading-plan-v2.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(root, "data/validation-report.json"), "utf8"));
const chapterData = JSON.parse(fs.readFileSync(path.join(root, "data/chapters-v2.json"), "utf8"));
const migration = JSON.parse(fs.readFileSync(path.join(root, "data/progress-migration-v1-to-v2.json"), "utf8"));
const chapters = plan.days.flatMap(day => day.readings.flatMap(reading => reading.chapter_ids));
const chapterById = new Map(chapterData.chapters.map(chapter => [chapter.chapter_id, chapter]));
const cachedAssets = [...serviceWorker.matchAll(/"\.\/([^"?]*)"/g)].map(match => match[1]).filter(Boolean);
const checks = {
  babel_compile: true,
  offline_assets: cachedAssets.every(asset => fs.existsSync(path.join(root, asset))),
  validation_report: report.passed === true,
  days: plan.days.length === 365,
  chapters: chapters.length === 1189,
  unique_chapters: new Set(chapters).size === 1189,
  verses: plan.days.reduce((sum, day) => sum + day.verse_count, 0) === 31102,
  complete_boundaries: plan.days.every(day => day.readings.every(reading => reading.boundary === "complete_chapters" && reading.start_verse === 1 && reading.end_verse === chapterById.get(reading.chapter_ids.at(-1))?.verses)),
  translation_neutral: plan.days.every(day => day.readings.every(reading => reading.translation_text === null)),
  migration_coverage: Object.keys(migration.old_day_to_new_days).length === 365 && Object.values(migration.old_day_to_new_days).every(days => days.length > 0),
  first_day: plan.days[0].readings.map(r => r.reference).join("; ") === "Genesis 1-3",
  last_day: plan.days[364].readings.map(r => r.reference).join("; ") === "Revelation 19-22"
};

for (const [name, pass] of Object.entries(checks)) if (!pass) throw new Error(`Validation failed: ${name}`);
console.log(JSON.stringify({ plan_id: plan.plan_id, checks }, null, 2));
