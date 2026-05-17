const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_ROOT = path.join(__dirname, "..");
const DEFAULT_DATA_DIR = path.join(WORKSPACE_ROOT, "data");
const DB_FILE_NAME = "history.sqlite";
const LEGACY_JSON_NAME = "history.json";
const RETENTION_MS = 1000 * 60 * 60 * 24 * 365 * 2;

let database = null;

function getStorageDirectory() {
  return process.env.GREENWASH_USER_DATA_DIR || DEFAULT_DATA_DIR;
}

function getDatabaseFilePath() {
  return path.join(getStorageDirectory(), DB_FILE_NAME);
}

function getLegacyJsonCandidates() {
  const candidates = [
    path.join(getStorageDirectory(), LEGACY_JSON_NAME),
    path.join(DEFAULT_DATA_DIR, LEGACY_JSON_NAME),
  ];

  return [...new Set(candidates)];
}

function getStorageInfo() {
  return {
    type: "sqlite",
    directory: getStorageDirectory(),
    file: getDatabaseFilePath(),
  };
}

async function readHistory(limit = 30) {
  const db = getDatabase();
  purgeExpiredHistory(db);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 1000));
  const rows = db
    .prepare(
      `
        SELECT id, created_at, request_text, context_type, sector, result_json, llm_json,
               verification_json, classification_json, meta_json
        FROM history
        ORDER BY datetime(created_at) DESC, rowid DESC
        LIMIT ?
      `,
    )
    .all(safeLimit);

  return rows.map(deserializeRow);
}

async function addHistoryItem(item) {
  const db = getDatabase();
  purgeExpiredHistory(db);
  db.prepare(
    `
      INSERT OR REPLACE INTO history (
        id,
        created_at,
        request_text,
        context_type,
        sector,
        result_json,
        llm_json,
        verification_json,
        classification_json,
        meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    item.id,
    item.createdAt,
    item.request.text,
    item.request.contextType,
    item.request.sector,
    stringify(item.result),
    stringify(item.llm),
    stringify(item.verification),
    stringify(item.classification),
    stringify(item.meta),
  );

  return item;
}

async function clearHistory() {
  const db = getDatabase();
  db.prepare("DELETE FROM history").run();
}

async function deleteHistoryItem(id) {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM history WHERE id = ?").run(id);
  return result.changes > 0;
}

function createHistoryItem({
  text,
  contextType,
  sector,
  result,
  llm,
  meta,
  verification,
  classification,
}) {
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    request: {
      text,
      contextType,
      sector,
    },
    result,
    llm,
    verification,
    classification,
    meta,
  };
}

function getDatabase() {
  if (database) {
    return database;
  }

  fs.mkdirSync(getStorageDirectory(), { recursive: true });

  const BetterSqlite3 = loadBetterSqlite3();
  database = new BetterSqlite3(getDatabaseFilePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(
    `
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        request_text TEXT NOT NULL,
        context_type TEXT,
        sector TEXT,
        result_json TEXT NOT NULL,
        llm_json TEXT,
        verification_json TEXT,
        classification_json TEXT,
        meta_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_history_created_at ON history (created_at DESC);
    `,
  );

  migrateLegacyJson(database);
  purgeExpiredHistory(database);
  return database;
}

function loadBetterSqlite3() {
  try {
    return require("better-sqlite3");
  } catch (error) {
    error.message =
      "better-sqlite3 is required for history storage. Run npm install before starting the app.\n" +
      error.message;
    throw error;
  }
}

function migrateLegacyJson(db) {
  const inserted = db.prepare(
    `
      INSERT OR REPLACE INTO history (
        id,
        created_at,
        request_text,
        context_type,
        sector,
        result_json,
        llm_json,
        verification_json,
        classification_json,
        meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  for (const legacyFile of getLegacyJsonCandidates()) {
    if (!fs.existsSync(legacyFile)) {
      continue;
    }

    try {
      const content = fs.readFileSync(legacyFile, "utf-8");
      const items = JSON.parse(content);

      if (Array.isArray(items)) {
        const insertMany = db.transaction((records) => {
          for (const item of records) {
            const normalized = normalizeLegacyItem(item);
            inserted.run(
              normalized.id,
              normalized.createdAt,
              normalized.request.text,
              normalized.request.contextType,
              normalized.request.sector,
              stringify(normalized.result),
              stringify(normalized.llm),
              stringify(normalized.verification),
              stringify(normalized.classification),
              stringify(normalized.meta),
            );
          }
        });

        insertMany(items);
      }

      fs.unlinkSync(legacyFile);
    } catch (error) {
      console.warn(`Failed to migrate legacy history file at ${legacyFile}: ${error.message}`);
    }
  }
}

function purgeExpiredHistory(db) {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  db.prepare("DELETE FROM history WHERE datetime(created_at) < datetime(?)").run(cutoff);
}

function normalizeLegacyItem(item) {
  return {
    id: item.id || createId(),
    createdAt: item.createdAt || new Date().toISOString(),
    request: {
      text: item.request?.text || "",
      contextType: item.request?.contextType || item.classification?.context?.selected || "auto",
      sector: item.request?.sector || item.classification?.sector?.selected || "auto",
    },
    result: item.result || {},
    llm: item.llm || null,
    verification: item.verification || null,
    classification: item.classification || null,
    meta: item.meta || null,
  };
}

function deserializeRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    request: {
      text: row.request_text,
      contextType: row.context_type,
      sector: row.sector,
    },
    result: parseJson(row.result_json),
    llm: parseJson(row.llm_json),
    verification: parseJson(row.verification_json),
    classification: parseJson(row.classification_json),
    meta: parseJson(row.meta_json),
  };
}

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringify(value) {
  return JSON.stringify(value ?? null);
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  addHistoryItem,
  clearHistory,
  createHistoryItem,
  deleteHistoryItem,
  getStorageInfo,
  readHistory,
};
