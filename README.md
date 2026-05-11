# Greenwash Lens

Greenwash Lens 是一个支持中英文文本的 greenwashing 风险检测应用。现在它既可以作为开发用的本地 Web 服务运行，也可以打包成桌面应用：Windows 安装包（`.exe`）和 macOS 磁盘镜像（`.dmg`）。

当前版本：`0.8.0`

## 这次升级后的形态

- 桌面壳：Electron 原生窗口，双击即可打开，不需要手动开浏览器
- 后端服务：内置 Express 风格 HTTP 服务，Electron 启动时自动绑定随机空闲端口
- 历史记录：SQLite，本地长期保存，默认保留 2 年
- 规则引擎：前后端共用一套 `src/engine-core.js`
- 外部模型：支持 `openai`、`claude`、`gemini`、`deepseek`

## 开发运行

先安装依赖，然后启动开发服务：

```bash
npm install
npm start
```

注意：项目路径中不要包含空格（如 `New project`），否则 native module 编译可能报错。建议使用 `greenwash-lens` 这样的目录名。

默认地址：

```text
http://127.0.0.1:5173
```

如果你想直接启动桌面窗口：

```bash
npm run desktop:start
```

## 打包桌面应用

生成打包目录（不产出安装包）：

```bash
npm run build
```

生成可分发安装包：

```bash
npm run package
```

输出目录：

```text
dist/
```

目标产物：

- Windows：NSIS 安装包（`.exe`）
- macOS：磁盘镜像（`.dmg`）

## 历史记录存储

开发模式下，如果没有 Electron，SQLite 默认放在项目目录：

```text
data/history.sqlite
```

桌面应用模式下，SQLite 会自动放到系统用户数据目录：

- macOS：`~/Library/Application Support/Greenwash Lens`
- Windows：`%APPDATA%\\Greenwash Lens`

首次启动时会自动尝试迁移旧版 `history.json` 数据。

## 项目结构

```text
electron/main.js                 桌面应用入口
public/                          前端界面与离线资源
src/api-router.js                API 路由
src/analysis-jobs.js             异步分析任务与 stalled 状态
src/engine-core.js               前后端共用评分核心
src/greenwash-engine.js          后端评分引擎封装
src/history-store.js             SQLite 历史存储
src/text-classifier.js           中英文语言/场景/行业识别
src/services/analysis-service.js 分析编排服务
src/services/llm-service.js      外部模型适配器
server.js                        开发服务入口
scripts/generate-icon-png.js     PNG/ICO/ICNS 图标生成
test/engine.test.js              核心规则测试
```

## API 概览

- `GET /api/health`
- `GET /api/v1/health`
- `POST /api/analyze`
- `POST /api/v1/analyze`
- `POST /api/v1/classify`
- `POST /api/v1/llm/test`
- `POST /api/v1/analyze-jobs`
- `GET /api/v1/analyze-jobs/:id`
- `GET /api/history`
- `DELETE /api/history`

详细字段见：

- [API 文档](/Users/xilaiwang/Documents/New%20project/docs/API.md)
- [部署文档](/Users/xilaiwang/Documents/New%20project/docs/DEPLOYMENT.md)

## 外部模型配置

复制 `.env.example` 为 `.env`，再按需要填写：

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
```

支持的 provider：

- `openai`
- `claude`
- `gemini`
- `deepseek`

如果没有配置外部模型，系统会继续使用本地规则引擎完成分析。

## 桌面应用如何配置 API key

桌面模式不会读取 `app.asar` 里的 `.env`。首次启动 Electron 应用时，程序会在系统用户数据目录自动生成一个 `.env` 模板，之后请直接编辑那个文件：

- macOS：`~/Library/Application Support/Greenwash Lens/.env`
- Windows：`%APPDATA%\\Greenwash Lens\\.env`

修改 `LLM_PROVIDER`、对应的 API key 和模型名后，重启桌面应用即可生效。
