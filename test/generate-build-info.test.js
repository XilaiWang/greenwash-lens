const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "public", "build-info.json");
const SCRIPT_PATH = path.join(ROOT, "scripts", "generate-build-info.js");

test("generate-build-info writes a valid manifest to public/", () => {
  // Snapshot prior contents (if any) so we can restore.
  const hadBefore = fs.existsSync(OUT_PATH);
  const before = hadBefore ? fs.readFileSync(OUT_PATH, "utf-8") : null;

  try {
    execSync(`node "${SCRIPT_PATH}"`, { cwd: ROOT, stdio: "pipe" });
    const json = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));

    // Required keys, even when git is missing
    for (const key of ["commit_sha", "commit_full_sha", "commit_message",
                       "commit_date", "branch", "dirty", "built_at",
                       "version", "repo"]) {
      assert.ok(key in json, `manifest missing key '${key}'`);
    }
    assert.equal(json.repo, "XilaiWang/greenwash-lens");
    assert.equal(typeof json.built_at, "string");
    // built_at should be parseable as ISO date
    assert.ok(!Number.isNaN(Date.parse(json.built_at)));
    // dirty must be boolean
    assert.equal(typeof json.dirty, "boolean");
  } finally {
    if (before !== null) fs.writeFileSync(OUT_PATH, before);
  }
});

test("generate-build-info captures current git SHA (when in a git repo)", () => {
  let expectedSha;
  try {
    expectedSha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return; // Not a git repo, skip
  }

  execSync(`node "${SCRIPT_PATH}"`, { cwd: ROOT, stdio: "pipe" });
  const json = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
  assert.equal(json.commit_sha, expectedSha);
});

test("generate-build-info handles non-git environment gracefully", () => {
  // Run the script from a non-git temp dir to simulate tarball install.
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "buildinfo-nogit-"));
  fs.mkdirSync(path.join(tmpDir, "public"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "test", version: "1.2.3" }));
  fs.copyFileSync(SCRIPT_PATH, path.join(tmpDir, "scripts", "generate-build-info.js"));

  try {
    execSync("node scripts/generate-build-info.js", { cwd: tmpDir, stdio: "pipe" });
    const json = JSON.parse(fs.readFileSync(path.join(tmpDir, "public", "build-info.json"), "utf-8"));
    assert.equal(json.commit_sha, null, "no git → sha should be null");
    assert.equal(json.branch, null);
    assert.equal(json.dirty, false);
    assert.equal(json.version, "1.2.3");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
