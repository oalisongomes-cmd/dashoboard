# DEPLOY DO DASHBOARD BMX1 NO RAILWAY — via Claude Code

Este guia coloca o Dashboard de Compras BMX1 no ar com um **link permanente** (não expira, não pede
login pra quem acessa) usando o **Railway**. O trabalho pesado é feito pelo **Claude Code**.

O pacote `railway_deploy/` já vem pronto:
```
railway_deploy/
├── public/
│   └── index.html      ← o dashboard (junho + balanço do semestre já incluídos)
├── server.js           ← servidor mínimo (Node nativo, sem dependências)
├── package.json        ← configuração do projeto
├── railway.json        ← configuração de deploy do Railway
└── .gitignore
```

---

## PRÉ-REQUISITOS (uma vez só)

1. Criar conta gratuita no Railway: https://railway.com (pode logar com o GitHub).
2. Ter o **Claude Code** instalado no seu computador.
3. Descompactar o `railway_deploy.zip` numa pasta do seu PC.

---

## OPÇÃO A — DEPLOY VIA RAILWAY CLI (mais rápido, recomendado)

Abra o Claude Code **dentro da pasta `railway_deploy`** e cole o prompt abaixo:

```
Faça o deploy deste projeto no Railway. Siga estes passos e me avise quando precisar que eu
autentique no navegador:

1. Verifique se a Railway CLI está instalada (`railway --version`). Se não estiver, instale com
   `npm install -g @railway/cli`.
2. Rode `railway login` — isso abre o navegador pra eu autenticar. Aguarde eu confirmar.
3. Rode `railway init` pra criar um novo projeto (nome sugerido: "dashboard-bmx1").
4. Rode `railway up` pra subir o projeto.
5. Rode `railway domain` pra gerar o domínio público permanente.
6. Me mostre o link final (algo como https://dashboard-bmx1-production.up.railway.app).
```

O Claude Code vai executar os comandos. Quando ele rodar `railway login`, abre uma aba no navegador
pra você entrar na sua conta Railway — é só confirmar. No fim ele te dá o **link permanente**.

---

## OPÇÃO B — DEPLOY VIA GITHUB (melhor para atualizar todo mês)

Vantagem: depois de configurado, **atualizar o dashboard = dar um "git push"**, e o Railway
republica sozinho. Ótimo para a rotina mensal.

Abra o Claude Code na pasta `railway_deploy` e cole:

```
Prepare este projeto para deploy no Railway via GitHub:

1. Inicialize um repositório git aqui (`git init`), adicione os arquivos e faça o primeiro commit.
2. Crie um repositório novo no GitHub chamado "dashboard-bmx1" (use o GitHub CLI `gh` se estiver
   disponível; se não, me diga os comandos e o link pra eu criar manualmente).
3. Faça o push do código para o GitHub.
4. Me explique como conectar esse repositório no Railway (New Project → Deploy from GitHub repo →
   selecionar dashboard-bmx1) e como gerar o domínio público (Settings → Networking → Generate Domain).
```

Depois, no site do Railway: **New Project → Deploy from GitHub repo → dashboard-bmx1**. O Railway
detecta o `package.json` e sobe sozinho. Em **Settings → Networking → Generate Domain** você cria o
link permanente.

---

## COMO ATUALIZAR NO MÊS SEGUINTE

Quando você gerar o `index.html` novo (com o mês novo):

- **Se usou a Opção A (CLI):** substitua o arquivo em `public/index.html` e, na pasta do projeto,
  rode `railway up` de novo (ou peça ao Claude Code).
- **Se usou a Opção B (GitHub):** substitua `public/index.html`, e no Claude Code:
  `git add . && git commit -m "dashboard mês X" && git push`. O Railway republica automaticamente e
  o link continua o mesmo.

---

## OBSERVAÇÕES

- O link do Railway é **permanente** e **não pede login** para quem acessa — pode mandar por e-mail
  para a diretoria e as áreas.
- O plano gratuito do Railway tem um limite de horas/uso por mês, geralmente suficiente para um
  dashboard interno. Se precisar de mais, há planos pagos baratos.
- O servidor (`server.js`) não tem dependências externas — o Railway só precisa do Node, que ele já
  fornece. Isso torna o deploy rápido e estável.
- Se o Railway pedir para escolher o "start command", use: `npm start`.
