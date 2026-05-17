const fs = require("node:fs");
const path = require("node:path");

const AUTO_GEN_HEADER = [
  "// AUTO-GENERATED — do NOT edit directly.",
  "// Run `npm run sync:all` to regenerate.",
  "",
  "",
].join("\n");

const syncTasks = [
  {
    label: "engine-core",
    src: path.join(__dirname, "..", "src", "engine-core.js"),
    dest: path.join(__dirname, "..", "public", "engine-core.js"),
  },
  {
    label: "classification-constants",
    src: path.join(__dirname, "..", "src", "shared", "classification-constants.js"),
    dest: path.join(__dirname, "..", "public", "shared", "classification-constants.js"),
  },
];

for (const task of syncTasks) {
  fs.mkdirSync(path.dirname(task.dest), { recursive: true });
  const sourceContent = fs.readFileSync(task.src, "utf-8");
  fs.writeFileSync(task.dest, AUTO_GEN_HEADER + sourceContent, "utf-8");
  console.log(`Synced ${task.src} -> ${task.dest}`);
}
