// In-memory LRU cache for LLM enrichAnalysis results.
// TTL = 300_000 ms (5 min), max 20 entries, LRU eviction via Map insertion order.
// Not persisted — Electron restart clears it. Provider/model in the key busts on switch.
const crypto = require("node:crypto");

const TTL_MS = 300_000;
const MAX_ENTRIES = 20;

const store = new Map();

function makeKey({ text, contextType, sector, provider, model }) {
  const raw = [text, contextType || "", sector || "", provider || "", model || ""].join("\x1f");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

function set(key, value) {
  if (store.has(key)) store.delete(key);
  store.set(key, { value, at: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

function size() {
  return store.size;
}

function clear() {
  store.clear();
}

module.exports = { makeKey, get, set, size, clear };
