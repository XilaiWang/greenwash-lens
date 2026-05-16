# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls. Merged with Greenwash Lens project-specific rules.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. Project-Specific Rules

### Architecture

```
electron/main.js            Electron桌面入口（启动内置HTTP服务 + BrowserWindow）
server.js                   开发/生产HTTP服务入口
src/
  api-router.js             API路由（/api/analyze, /api/classify, /api/upload-pdf等）
  analysis-jobs.js          异步分析任务队列
  engine-core.js            前后端共用的绿色声明评分核心（UMD格式）
  greenwash-engine.js       后端评分引擎封装
  history-store.js          SQLite历史记录（better-sqlite3）
  text-classifier.js        关键词匹配的文本场景/行业分类器
  pdf-cleaner.js            PDF抽取文字清洗器
  pdf-extractor.js          PDF文字提取（poppler优先 → pdf-parse降级）
  http-utils.js             HTTP工具（readJson, readRawBody, sendJson, sendText）
  env-loader.js             .env文件加载器
  verification-service.js   分析结果自检服务
  services/
    analysis-service.js     分析编排（分类→评分→LLM增强→校验→保存）
    llm-service.js          多LLM适配器（OpenAI/Claude/Gemini/DeepSeek）
public/
  index.html                前端页面
  app.js                    前端主逻辑
  engine-core.js            前端评分核心（与src/engine-core.js同步）
  local-engine.js           浏览器离线模式引擎
  styles.css                样式
```

### Key Conventions

- **Server**: 原生 `http` 模块，非 Express。路由在 `api-router.js` 中用 if/else 链匹配。
- **CORS**: `applyApiCors` 在 `server.js` 中，按端口和 file:// origin 动态判断。
- **错误消息**: 后端面向中文用户，错误消息使用简体中文。
- **body 解析**: JSON body 用 `readJson`（200KB 限制），二进制body 用 `readRawBody`（20MB 限制）。
- **LLM 调用**: 统一经过 `llm-service.js` 的 `callProvider`，所有 provider 返回纯文本。
- **分类来源**: `source: "keyword" | "llm" | "manual"`，前端据此显示标签。
- **分类值校验**: `VALID_CONTEXT_TYPES` 和 `VALID_SECTORS` 来自 `text-classifier.js`，新增分类需同时更新 `local-engine.js` 和 `index.html` 下拉选项。
- **engine-core.js 同步**: 修改 `src/engine-core.js` 后需运行 `node scripts/sync-engine-core.js` 同步到 `public/`。
- **历史记录**: SQLite 存储，`GREENWASH_USER_DATA_DIR` 环境变量控制路径，桌面模式下自动设为 `app.getPath('userData')`。
- **桌面打包**: `npm run package` 生成 `.dmg`，ASAR 打包时 `better-sqlite3` 需 unpack。

### Change Approval and Runtime Sync

- **功能删改必须先确认**: 删除、隐藏、禁用、替换或实质改变任何用户可见功能、交互流程、API 行为、数据结构或配置含义前，必须先说明影响范围并获得用户明确确认。仅在用户已明确要求该删改时可以执行；发现疑似无用功能或死代码时，先报告，不要擅自删除。
- **代码改动后必须同步到可运行软件**: 只要修改了任何代码、样式、配置或前端资源，就必须在回复前尝试让正在运行的软件加载到最新版本。按实际情况执行必要同步、检查、重启或刷新：例如修改 `src/engine-core.js` 后运行 `node scripts/sync-engine-core.js`；修改前端后刷新本地页面或重启开发服务；修改桌面端或打包资源后重启 Electron/已部署应用。若因权限、系统限制或环境问题无法自动重载，必须明确说明已完成哪些同步动作、哪里被阻止，以及用户应打开哪个地址或应用进行测试。

### Modifying the Packaged App

桌面应用安装在 `/Applications/Greenwash Lens.app/`。直接修改步骤：
1. 用 `npx @electron/asar extract` 解包 `app.asar`
2. 修改文件
3. 用 `npx @electron/asar pack` 重新打包（`--unpack-dir "node_modules/better-sqlite3"`）
4. 替换原 `app.asar`（建议先备份为 `app.asar.backup`）

### Adding npm Dependencies to the Packaged App

在解包后的目录中 `npm install`，然后重新打包。纯 JS 包会打入 ASAR，原生包需放 `app.asar.unpacked`。

### Verification

- `npm run check` — 语法检查（所有 server/src/public 文件）
- `npm test` — 运行测试
- `npm start` — 启动开发服务器（`http://127.0.0.1:5173`）
- 修改已部署应用后：确认进程启动 → 检查端口 → 测试 API 端点

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
