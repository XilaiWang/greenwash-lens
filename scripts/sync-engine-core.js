const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "..", "src", "engine-core.js");
const targetPath = path.join(__dirname, "..", "public", "engine-core.js");

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

console.log(`Synced ${sourcePath} -> ${targetPath}`);

