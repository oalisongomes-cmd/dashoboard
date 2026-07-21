const fs = require("fs");
const path = require("path");

const hasDb = !!process.env.DATABASE_URL;

let pool = null;
if (hasDb) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

// Quando NÃO há Postgres (DATABASE_URL), os dados são guardados em um arquivo JSON local.
// Em restart normal do mesmo deploy isso sobrevive; para durar entre redeploys, use Postgres.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

function readFileStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return { config: {}, snapshot: null };
  }
}

function writeFileStore(store) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store), "utf8");
  } catch (e) {
    console.error("[db] não foi possível gravar o arquivo local:", e.message);
  }
}

async function ensureSchema() {
  if (!hasDb) {
    console.warn(
      "[db] DATABASE_URL não definido — usando arquivo local (" +
        DATA_FILE +
        "). Recomenda-se adicionar Postgres no Railway para os dados durarem entre deploys."
    );
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_data (
      id SERIAL PRIMARY KEY,
      payload JSONB NOT NULL,
      filename TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
}

async function getConfig(key) {
  if (!hasDb) {
    const store = readFileStore();
    return store.config ? store.config[key] : undefined;
  }
  const r = await pool.query("SELECT value FROM app_config WHERE key = $1", [key]);
  return r.rows[0] ? r.rows[0].value : undefined;
}

async function setConfig(key, value) {
  if (!hasDb) {
    const store = readFileStore();
    store.config = store.config || {};
    store.config[key] = value;
    writeFileStore(store);
    return;
  }
  await pool.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

async function saveSnapshot(payload, filename) {
  if (!hasDb) {
    const store = readFileStore();
    store.snapshot = { payload, filename, uploaded_at: new Date().toISOString() };
    writeFileStore(store);
    return { uploaded_at: store.snapshot.uploaded_at };
  }
  const result = await pool.query(
    "INSERT INTO dashboard_data (payload, filename) VALUES ($1, $2) RETURNING id, uploaded_at",
    [payload, filename]
  );
  return result.rows[0];
}

async function getLatestSnapshot() {
  if (!hasDb) {
    return readFileStore().snapshot || null;
  }
  const result = await pool.query(
    "SELECT payload, filename, uploaded_at FROM dashboard_data ORDER BY uploaded_at DESC LIMIT 1"
  );
  return result.rows[0] || null;
}

module.exports = {
  pool,
  hasDb,
  ensureSchema,
  getConfig,
  setConfig,
  saveSnapshot,
  getLatestSnapshot,
};
