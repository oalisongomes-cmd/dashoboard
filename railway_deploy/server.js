// Servidor estático mínimo para o Dashboard BMX1 no Railway.
// Sem dependências externas — usa só módulos nativos do Node.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const server = http.createServer((req, res) => {
  // Sempre serve o index.html (single page)
  let filePath = path.join(PUBLIC, req.url === "/" ? "index.html" : req.url);
  // Segurança: não sair da pasta public
  if (!filePath.startsWith(PUBLIC)) filePath = path.join(PUBLIC, "index.html");

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Se não achou o arquivo, devolve o index (SPA)
      fs.readFile(path.join(PUBLIC, "index.html"), (e2, home) => {
        res.writeHead(e2 ? 500 : 200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(e2 ? "Erro ao carregar" : home);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Dashboard BMX1 rodando na porta ${PORT}`);
});
