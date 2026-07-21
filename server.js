const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");

const db = require("./db");
const { parseWorkbook } = require("./parseXlsm");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// A senha pode vir de uma variável de ambiente (APP_PASSWORD) OU ser criada pela
// própria tela do site na primeira vez (fica guardada, com hash, no banco/arquivo).
const ENV_PASSWORD = process.env.APP_PASSWORD || "";

// Segredo do cookie de sessão. Se não vier por variável de ambiente, é gerado na hora.
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

let sessionStore = undefined;
if (db.hasDb) {
  const pgSession = require("connect-pg-simple")(session);
  sessionStore = new pgSession({ pool: db.pool, createTableIfMissing: true });
}

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias
    },
  })
);

// ---------- Senha (hash) ----------
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, useSalt, 64).toString("hex");
  return { salt: useSalt, hash };
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Retorna: "env" (senha via variável), "stored" (senha criada no site) ou "unset" (ainda não existe).
async function passwordState() {
  if (ENV_PASSWORD) return "env";
  const stored = await db.getConfig("password");
  return stored ? "stored" : "unset";
}

async function checkPassword(input) {
  if (!input) return false;
  if (ENV_PASSWORD) return safeEqual(input, ENV_PASSWORD);
  const stored = await db.getConfig("password");
  if (!stored) return false;
  const { hash } = hashPassword(input, stored.salt);
  return safeEqual(hash, stored.hash);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin/upload")) {
    return res.status(401).json({ ok: false, error: "Não autenticado." });
  }
  return res.redirect("/login");
}

// ---------- Primeira configuração da senha ----------
app.get("/setup", async (req, res) => {
  const state = await passwordState();
  if (state !== "unset") return res.redirect("/login");
  res.sendFile(path.join(PUBLIC_DIR, "setup.html"));
});

app.post("/setup", async (req, res) => {
  const state = await passwordState();
  if (state !== "unset") {
    return res.status(400).json({ ok: false, error: "A senha já foi definida." });
  }
  const { password, confirm } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, error: "A senha precisa ter pelo menos 4 caracteres." });
  }
  if (password !== confirm) {
    return res.status(400).json({ ok: false, error: "As senhas não são iguais." });
  }
  const { salt, hash } = hashPassword(password);
  await db.setConfig("password", { salt, hash });
  req.session.authed = true;
  res.json({ ok: true });
});

// ---------- Login ----------
app.get("/login", async (req, res) => {
  if (req.session && req.session.authed) return res.redirect("/");
  const state = await passwordState();
  if (state === "unset") return res.redirect("/setup");
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.post("/login", async (req, res) => {
  const ok = await checkPassword(req.body.password);
  if (ok) {
    req.session.authed = true;
    return res.redirect("/");
  }
  return res.redirect("/login?erro=1");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Trocar a senha (só quando a senha é gerenciada pelo site, não por variável de ambiente).
app.post("/admin/change-password", requireAuth, async (req, res) => {
  if (ENV_PASSWORD) {
    return res.status(400).json({
      ok: false,
      error: "A senha está definida por variável de ambiente (APP_PASSWORD) e deve ser alterada no Railway.",
    });
  }
  const { atual, nova, confirm } = req.body;
  const ok = await checkPassword(atual);
  if (!ok) return res.status(400).json({ ok: false, error: "Senha atual incorreta." });
  if (!nova || nova.length < 4) {
    return res.status(400).json({ ok: false, error: "A nova senha precisa ter pelo menos 4 caracteres." });
  }
  if (nova !== confirm) {
    return res.status(400).json({ ok: false, error: "A confirmação não confere." });
  }
  const { salt, hash } = hashPassword(nova);
  await db.setConfig("password", { salt, hash });
  res.json({ ok: true });
});

// ---------- Páginas protegidas ----------
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/admin", requireAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/api/dashboard-data", requireAuth, async (req, res) => {
  try {
    const snap = await db.getLatestSnapshot();
    if (!snap) return res.json({ ok: true, data: null, uploaded_at: null, filename: null });
    res.json({ ok: true, data: snap.payload, uploaded_at: snap.uploaded_at, filename: snap.filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Erro ao carregar dados." });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.post("/admin/upload", requireAuth, upload.single("planilha"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Nenhum arquivo enviado." });
  }
  try {
    const payload = parseWorkbook(req.file.buffer);
    const saved = await db.saveSnapshot(payload, req.file.originalname);
    res.json({
      ok: true,
      uploaded_at: saved.uploaded_at,
      months: Object.keys(payload.MESES),
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message || "Falha ao processar a planilha." });
  }
});

// Qualquer outra rota manda para a raiz (que exige login).
app.use((req, res) => res.redirect("/"));

async function start() {
  await db.ensureSchema();
  app.listen(PORT, () => {
    console.log(`BMX1 Dashboard rodando na porta ${PORT}`);
  });
}

start();
