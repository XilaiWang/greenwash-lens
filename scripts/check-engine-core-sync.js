const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const checkTasks = [
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

function stripAutoGenHeader(content) {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("//")) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n");
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

let allOk = true;

for (const task of checkTasks) {
  const sourceBody = fs.readFileSync(task.src, "utf-8");
  const sourceHash = sha256(sourceBody);

  const targetRaw = fs.readFileSync(task.dest, "utf-8");
  const targetBody = stripAutoGenHeader(targetRaw);
  const targetHash = sha256(targetBody);

  if (sourceHash !== targetHash) {
    console.error(`[${task.label}] MISMATCH — ${task.dest} differs from ${task.src}.`);
    allOk = false;
  }
}

if (!allOk) {
  console.error("Run: npm run sync:all");
  process.exit(1);
}

console.log("[check:sync] OK");
