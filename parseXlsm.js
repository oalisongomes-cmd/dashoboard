const XLSX = require("xlsx");

const MESES_NUM = {
  1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
  7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez",
};
const MESES_LABEL = {
  1: "JANEIRO", 2: "FEVEREIRO", 3: "MARÇO", 4: "ABRIL", 5: "MAIO", 6: "JUNHO",
  7: "JULHO", 8: "AGOSTO", 9: "SETEMBRO", 10: "OUTUBRO", 11: "NOVEMBRO", 12: "DEZEMBRO",
};

function r2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function sheetRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

function excelDateToJs(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  return null;
}

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const wsPedidos = wb.Sheets["PEDIDOS 2026"];
  const wsComp = wb.Sheets["COMPARATIVO DE ECONOMIA"];
  if (!wsPedidos || !wsComp) {
    throw new Error(
      "A planilha precisa conter as abas 'PEDIDOS 2026' e 'COMPARATIVO DE ECONOMIA'."
    );
  }

  const pedRowsRaw = sheetRows(wsPedidos).slice(1);
  const pedRows = [];
  for (const row of pedRowsRaw) {
    const dataRaw = row[0];
    if (dataRaw === null || dataRaw === undefined) continue;
    const data = excelDateToJs(dataRaw);
    if (!data) continue;
    pedRows.push({
      data,
      forn: row[1],
      cnpj: row[2],
      pedido: row[3],
      valor: Number(row[4]) || 0,
      obra: row[5],
      nota: row[11] === null || row[11] === undefined ? null : Number(row[11]),
    });
  }

  const compRowsRaw = sheetRows(wsComp).slice(1);
  const compRows = [];
  for (const row of compRowsRaw) {
    const periodo = row[0];
    if (periodo === null || periodo === undefined || periodo === "-") continue;
    const parts = String(periodo).split("/");
    if (parts.length !== 2) continue;
    const mm = parseInt(parts[0], 10);
    const yyyy = parseInt(parts[1], 10);
    if (!mm || !yyyy) continue;
    compRows.push({
      mm, yyyy,
      material: row[1],
      pedido: row[2],
      obra: row[3],
      req: Number(row[4]) || 0,
      comp: Number(row[5]) || 0,
      eco: Number(row[6]) || 0,
    });
  }

  if (pedRows.length === 0 || compRows.length === 0) {
    throw new Error(
      "Não foi possível extrair linhas válidas das abas 'PEDIDOS 2026' / 'COMPARATIVO DE ECONOMIA'. Confira o formato do arquivo."
    );
  }

  const yearCounts = {};
  for (const r of compRows) yearCounts[r.yyyy] = (yearCounts[r.yyyy] || 0) + 1;
  const targetYear = Number(
    Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0]
  );

  const monthsPresent = Array.from(
    new Set(compRows.filter((r) => r.yyyy === targetYear).map((r) => r.mm))
  ).sort((a, b) => a - b);

  const out = { MESES: {}, EVO: [], ML_EVO: [], FORN_RANK: {}, OD: {} };
  const allFornYear = new Map();

  function fornAgg(map, key) {
    if (!map.has(key)) {
      map.set(key, { v: 0, p: 0, notas: [], obras: new Set() });
    }
    return map.get(key);
  }

  for (const mnum of monthsPresent) {
    const mkey = MESES_NUM[mnum];
    const pr = pedRows.filter(
      (r) => r.data.getUTCMonth() + 1 === mnum && r.data.getUTCFullYear() === targetYear
    );
    const cr = compRows.filter((r) => r.mm === mnum && r.yyyy === targetYear);

    const req = cr.reduce((s, r) => s + r.req, 0);
    const comp = cr.reduce((s, r) => s + r.comp, 0);
    const eco = cr.reduce((s, r) => s + r.eco, 0);
    const pct = req ? eco / req : 0;

    const fornUnique = new Set(pr.map((r) => r.forn));
    const obrasUniqueComp = new Set(cr.map((r) => r.obra));
    const pedVal = pr.reduce((s, r) => s + r.valor, 0);
    const notas = pr.map((r) => r.nota).filter((n) => n !== null);
    const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;

    const daily = new Map();
    for (const r of pr) {
      const day = r.data.getUTCDate();
      daily.set(day, (daily.get(day) || 0) + r.valor);
    }
    const cal = Array.from(daily.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([d, v]) => ({ d, v: r2(v) }));
    const calDays = new Date(Date.UTC(targetYear, mnum, 0)).getUTCDate();
    const firstDay = new Date(Date.UTC(targetYear, mnum - 1, 1)).getUTCDay();

    const fg = new Map();
    for (const r of pr) {
      const g = fornAgg(fg, r.forn);
      g.v += r.valor;
      g.p += 1;
      if (r.nota !== null) g.notas.push(r.nota);
      g.obras.add(r.obra);

      const ag = fornAgg(allFornYear, r.forn);
      ag.v += r.valor;
      ag.p += 1;
      if (r.nota !== null) ag.notas.push(r.nota);
      ag.obras.add(r.obra);
    }
    const topForn = Array.from(fg.entries())
      .map(([n, g]) => ({
        n,
        v: r2(g.v),
        p: g.p,
        na: g.notas.length ? r2(g.notas.reduce((a, b) => a + b, 0) / g.notas.length) : 0,
        o: g.obras.size,
      }))
      .sort((a, b) => b.v - a.v);

    const og = new Map();
    for (const r of cr) {
      if (!og.has(r.obra)) og.set(r.obra, { req: 0, comp: 0, eco: 0, mat: new Map() });
      const o = og.get(r.obra);
      o.req += r.req;
      o.comp += r.comp;
      o.eco += r.eco;
      o.mat.set(r.material, (o.mat.get(r.material) || 0) + r.comp);
    }
    const obrasList = Array.from(og.entries())
      .map(([k, o]) => {
        let topMat = null, topMatV = 0;
        for (const [mat, v] of o.mat.entries()) {
          if (v > topMatV) { topMat = mat; topMatV = v; }
        }
        return { k, req: r2(o.req), comp: r2(o.comp), eco: r2(o.eco), mat: topMat, matV: r2(topMatV) };
      })
      .sort((a, b) => b.comp - a.comp);

    const mg = new Map();
    for (const r of cr) {
      if (!mg.has(r.material)) mg.set(r.material, { v: 0, eco: 0, items: [] });
      const m = mg.get(r.material);
      m.v += r.comp;
      m.eco += r.eco;
      m.items.push({ n: r.material, o: r.obra, v: r2(r.comp), r: r2(r.req), e: r2(r.eco) });
    }
    const matList = Array.from(mg.entries())
      .map(([cat, m]) => ({ cat, v: r2(m.v), eco: r2(m.eco), items: m.items }))
      .sort((a, b) => b.v - a.v);

    out.MESES[mkey] = {
      label: MESES_LABEL[mnum],
      req: r2(req), comp: r2(comp), eco: r2(eco), pct: Math.round(pct * 10000) / 10000,
      ped: pr.length, forn: fornUnique.size, obras: obrasUniqueComp.size,
      nota: r2(notaMedia), pedVal: r2(pedVal),
      cal, calDays, firstDay,
      topForn,
      mat: matList,
    };
    out.MESES[mkey].obras = obrasList;

    out.EVO.push({ mes: mkey.toUpperCase(), req: r2(req), comp: r2(comp), eco: r2(eco), pct: Math.round(pct * 10000) / 100 });

    const ml = fg.get("MERCADO LIVRE");
    const mlV = ml ? ml.v : 0;
    out.ML_EVO.push({ mes: mkey.toUpperCase(), pct: pedVal ? Math.round((mlV / pedVal) * 10000) / 100 : 0, v: r2(mlV), total: r2(pedVal) });

    out.FORN_RANK[mkey] = topForn;

    const odMat = new Map();
    const odCats = new Map();
    for (const r of cr) {
      if (!odMat.has(r.obra)) odMat.set(r.obra, new Map());
      const om = odMat.get(r.obra);
      if (!om.has(r.material)) om.set(r.material, { v: 0, e: 0 });
      const mm2 = om.get(r.material);
      mm2.v += r.comp;
      mm2.e += r.eco;

      if (!odCats.has(r.obra)) odCats.set(r.obra, new Map());
      const oc = odCats.get(r.obra);
      if (!oc.has(r.material)) oc.set(r.material, { v: 0, e: 0, items: [] });
      const cc = oc.get(r.material);
      cc.v += r.comp;
      cc.e += r.eco;
      cc.items.push({ n: r.material, v: r2(r.comp), r: r2(r.req), e: r2(r.eco) });
    }
    const odSup = new Map();
    for (const r of pr) {
      if (!odSup.has(r.obra)) odSup.set(r.obra, new Map());
      const os = odSup.get(r.obra);
      os.set(r.forn, (os.get(r.forn) || 0) + r.valor);
    }
    const obrasWithMovement = new Set([...odMat.keys(), ...odSup.keys()]);
    for (const obra of obrasWithMovement) {
      if (!out.OD[obra]) out.OD[obra] = {};
      const matlist = Array.from((odMat.get(obra) || new Map()).entries())
        .map(([n, v]) => ({ n, v: r2(v.v), e: r2(v.e) }))
        .sort((a, b) => b.v - a.v);
      const suplist = Array.from((odSup.get(obra) || new Map()).entries())
        .map(([n, v]) => ({ n, v: r2(v) }))
        .sort((a, b) => b.v - a.v);
      const catlist = Array.from((odCats.get(obra) || new Map()).entries())
        .map(([cat, c]) => ({
          cat, v: r2(c.v), r: r2(c.items.reduce((s, it) => s + it.r, 0)), e: r2(c.e), items: c.items,
        }))
        .sort((a, b) => b.v - a.v);
      out.OD[obra][mkey] = { mat: matlist, sup: suplist, cats: catlist };
    }
  }

  const Q1 = {
    label: String(targetYear),
    req: r2(out.EVO.reduce((s, m) => s + m.req, 0)),
    comp: r2(out.EVO.reduce((s, m) => s + m.comp, 0)),
    eco: r2(out.EVO.reduce((s, m) => s + m.eco, 0)),
    ped: pedRows.filter((r) => monthsPresent.includes(r.data.getUTCMonth() + 1) && r.data.getUTCFullYear() === targetYear).length,
    forn: new Set(
      pedRows.filter((r) => monthsPresent.includes(r.data.getUTCMonth() + 1) && r.data.getUTCFullYear() === targetYear).map((r) => r.forn)
    ).size,
    obras: new Set(
      compRows.filter((r) => monthsPresent.includes(r.mm) && r.yyyy === targetYear).map((r) => r.obra)
    ).size,
  };
  const notasAll = pedRows.filter(
    (r) => r.nota !== null && monthsPresent.includes(r.data.getUTCMonth() + 1) && r.data.getUTCFullYear() === targetYear
  );
  Q1.nota = notasAll.length ? r2(notasAll.reduce((s, r) => s + r.nota, 0) / notasAll.length) : 0;
  Q1.pct = Q1.req ? Math.round((Q1.eco / Q1.req) * 10000) / 10000 : 0;
  out.Q1 = Q1;

  const tri = Array.from(allFornYear.entries()).map(([n, g]) => ({
    n,
    v: r2(g.v),
    p: g.p,
    na: g.notas.length ? r2(g.notas.reduce((a, b) => a + b, 0) / g.notas.length) : 0,
    o: g.obras.size,
  }));
  out.FORN_RANK.tri = [...tri].sort((a, b) => b.na - a.na);
  out.FORN_Q1 = [...tri].sort((a, b) => b.v - a.v).slice(0, 15);

  return out;
}

module.exports = { parseWorkbook };
