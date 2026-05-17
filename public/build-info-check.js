/**
 * Build-info bar: tells the user whether they're running the latest version.
 *
 * On page load:
 *   1. Fetch /build-info.json — local build manifest written at npm prestart.
 *   2. Try the GitHub API for the latest main commit (cached 1h in localStorage).
 *   3. Render one of four states:
 *      - "latest"   local SHA matches remote          (green dot, no link)
 *      - "outdated" local differs from remote          (amber, "查看更新" link)
 *      - "offline"  could not reach GitHub             (gray, "重试" link)
 *      - "unknown"  no build-info.json (dev/no git)    (gray, hidden after fail)
 *
 * Cache key: `gw_remote_commit_v1`. Stale-while-revalidate: returns cached
 * value if < 1h old; otherwise re-fetches in background.
 */
(function () {
  const REPO = "XilaiWang/greenwash-lens";
  const CACHE_KEY = "gw_remote_commit_v1";
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

  const bar = document.getElementById("buildInfoBar");
  const text = document.getElementById("buildInfoText");
  const link = document.getElementById("buildInfoLink");
  const dot = bar && bar.querySelector(".build-info-dot");
  if (!bar || !text || !link) return;

  function setState(status, message, linkUrl, linkLabel) {
    bar.dataset.status = status;
    bar.hidden = false;
    text.textContent = message;
    if (linkUrl) {
      link.href = linkUrl;
      link.textContent = linkLabel || "查看";
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    if (dot) dot.title = status;
  }

  function fmtDate(iso) {
    if (!iso) return "未知";
    try {
      const d = new Date(iso);
      return d.toISOString().slice(0, 10);
    } catch {
      return "未知";
    }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.cached_at > CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCache(sha, message) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        sha,
        message,
        cached_at: Date.now(),
      }));
    } catch {
      // localStorage full / disabled — silent
    }
  }

  async function fetchRemoteHead() {
    // GitHub API: 60 requests/hour unauthenticated. Cache mitigates.
    const url = `https://api.github.com/repos/${REPO}/commits/main`;
    const resp = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) throw new Error(`GitHub ${resp.status}`);
    const data = await resp.json();
    return {
      sha: String(data.sha || "").slice(0, 7),
      message: (data.commit && data.commit.message) || "",
    };
  }

  async function checkVersion() {
    let local;
    try {
      const resp = await fetch("/build-info.json", { cache: "no-cache" });
      if (!resp.ok) throw new Error("no build-info.json");
      local = await resp.json();
    } catch {
      // No build manifest — likely dev environment that hasn't run
      // `npm run generate:build-info`. Show a discreet hint.
      setState(
        "unknown",
        `Build 信息缺失 — 运行 npm run generate:build-info`,
        null,
      );
      return;
    }

    const localSha = local.commit_sha || "未知";
    const localDate = fmtDate(local.commit_date || local.built_at);
    // Use git-conventional "+" suffix for uncommitted changes; less jargon than "dirty".
    const dirty = local.dirty ? "+" : "";
    const localLabel = `Build ${localSha}${dirty} · ${localDate}`;

    // Optimistic render with cached remote
    const cached = readCache();
    if (cached) {
      renderWithRemote(local, localLabel, cached);
    } else {
      setState("unknown", `${localLabel} · 检查远程版本中…`, null);
    }

    // Always try fresh fetch in background
    try {
      const remote = await fetchRemoteHead();
      writeCache(remote.sha, remote.message);
      renderWithRemote(local, localLabel, remote);
    } catch {
      // Offline or rate-limited. If we have cache, keep showing it.
      if (!cached) {
        setState(
          "offline",
          `${localLabel} · 无法连接 GitHub 检查更新`,
          `https://github.com/${REPO}/commits/main`,
          "重试",
        );
      }
    }
  }

  function renderWithRemote(local, localLabel, remote) {
    const localFullOrShort = local.commit_sha || "";
    const remoteShort = remote.sha;
    if (remoteShort && localFullOrShort && remoteShort.startsWith(localFullOrShort.slice(0, 7))) {
      setState("latest", `${localLabel} · ✓ 最新版`);
    } else if (remoteShort) {
      const firstLine = (remote.message || "").split("\n")[0].slice(0, 80);
      setState(
        "outdated",
        `${localLabel} · ⚠ 有新版 ${remoteShort}${firstLine ? "：" + firstLine : ""}`,
        `https://github.com/${REPO}/compare/${local.commit_sha}...main`,
        "查看更新",
      );
    } else {
      setState("offline", `${localLabel} · 远程版本未知`, null);
    }
  }

  // Don't block page render; defer one tick.
  setTimeout(checkVersion, 50);

  // Re-check when window regains focus (user just came back to the app).
  let lastCheck = Date.now();
  window.addEventListener("focus", () => {
    if (Date.now() - lastCheck > 5 * 60 * 1000) {
      lastCheck = Date.now();
      checkVersion();
    }
  });
})();
