const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");

const db = require("./db");
const { parseWorkbook } = require("./parseXlsm");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "bmx1-dev-secret-troque-em-producao";

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

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin/upload")) {
    return res.status(401).json({ ok: false, error: "Não autenticado." });
  }
  return res.redirect("/login");
}

app.get("/login", (req, res) => {
  if (req.session && req.session.authed) return res.redirect("/");
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.post("/login", (req, res) => {
  if (!APP_PASSWORD) {
    return res
      .status(500)
      .send(
        "Servidor sem senha configurada. Defina a variável de ambiente APP_PASSWORD no Railway e reinicie o serviço."
      );
  }
  const { password } = req.body;
  if (password && password === APP_PASSWORD) {
    req.session.authed = true;
    return res.redirect("/");
  }
  return res.redirect("/login?erro=1");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

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

async function start() {
  await db.ensureSchema();
  app.listen(PORT, () => {
    console.log(`BMX1 Dashboard rodando na porta ${PORT}`);
    if (!APP_PASSWORD) {
      console.warn("[aviso] APP_PASSWORD não definida — o login não vai funcionar até configurar essa variável de ambiente.");
    }
  });
}

start();
