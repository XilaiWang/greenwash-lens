#!/usr/bin/env node
/**
 * Write public/build-info.json from current git state.
 *
 * Runs on every `prestart` / `prebuild` / `prepackage` (see package.json).
 * The output is read by the front-end at load time to render the "你跑的
 * 是不是最新版" badge in the topbar.
 *
 * Robust to non-git environments (tarball installs, packaged Electron):
 * if any git command fails, we still write a manifest with what we know
 * (built_at + version) and mark the git fields as null. The UI handles
 * that case gracefully.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "public", "build-info.json");

function gitCmd(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    return pkg.version || null;
  } catch {
    return null;
  }
}

const sha = gitCmd("rev-parse --short HEAD");
const fullSha = gitCmd("rev-parse HEAD");
const branch = gitCmd("rev-parse --abbrev-ref HEAD");
const commitMessage = gitCmd("log -1 --pretty=%s");
const commitDate = gitCmd("log -1 --pretty=%cI"); // ISO 8601 with timezone
const dirty = gitCmd("status --porcelain") ? true : false;

const info = {
  commit_sha: sha,
  commit_full_sha: fullSha,
  commit_message: commitMessage,
  commit_date: commitDate,
  branch,
  dirty,
  built_at: new Date().toISOString(),
  version: readPackageVersion(),
  repo: "XilaiWang/greenwash-lens",
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(info, null, 2) + "\n");
console.log(`Wrote ${OUT_PATH}: ${sha || "no-git"}${dirty ? " (dirty)" : ""}`);
