const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "data");
const STORE_FILE = path.join(DATA_DIR, "processed-posts.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore() {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) {
    return { processedPosts: {} };
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { processedPosts: {} };
  }
}

function saveStore(store) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function isProcessed(postId) {
  const store = loadStore();
  return !!store.processedPosts[postId];
}

function markProcessed(postId, details = {}) {
  const store = loadStore();
  store.processedPosts[postId] = {
    timestamp: new Date().toISOString(),
    ...details
  };
  saveStore(store);
}

function getProcessedCount() {
  const store = loadStore();
  return Object.keys(store.processedPosts).length;
}

module.exports = { isProcessed, markProcessed, getProcessedCount, loadStore };
