const hasDb = !!process.env.DATABASE_URL;

let pool = null;
if (hasDb) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

// Fallback em memória para rodar localmente sem Postgres configurado.
// Em produção (Railway com DATABASE_URL definido) os dados vão pro Postgres de verdade.
const memory = { snapshots: [] };

async function ensureSchema() {
  if (!hasDb) {
    console.warn(
      "[db] DATABASE_URL não definido — usando armazenamento em memória (dados serão perdidos ao reiniciar)."
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
}

async function saveSnapshot(payload, filename) {
  if (!hasDb) {
    const row = { id: memory.snapshots.length + 1, uploaded_at: new Date().toISOString() };
    memory.snapshots.push({ ...row, payload, filename });
    return row;
  }
  const result = await pool.query(
    "INSERT INTO dashboard_data (payload, filename) VALUES ($1, $2) RETURNING id, uploaded_at",
    [payload, filename]
  );
  return result.rows[0];
}

async function getLatestSnapshot() {
  if (!hasDb) {
    return memory.snapshots[memory.snapshots.length - 1] || null;
  }
  const result = await pool.query(
    "SELECT payload, filename, uploaded_at FROM dashboard_data ORDER BY uploaded_at DESC LIMIT 1"
  );
  return result.rows[0] || null;
}

module.exports = { pool, hasDb, ensureSchema, saveSnapshot, getLatestSnapshot };
