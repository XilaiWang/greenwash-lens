const { execFileSync } = require("node:child_process");
const path = require("node:path");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeDir = path.dirname(path.dirname(process.execPath));

execFileSync(
  npmCommand,
  ["rebuild", "better-sqlite3", `--nodedir=${nodeDir}`],
  {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  },
);
