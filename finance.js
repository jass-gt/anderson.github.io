// Regras financeiras (script clássico: define o objeto global F). Sem DOM/rede.
const F = (() => {
// Regras financeiras puras (sem DOM/rede). Valores monetários internos em CENTAVOS (inteiros).
// Arredondamento: meio para cima em 2 casas (toCents). Limites diários/semanais usam floor (nunca excedem o disponível).
const P = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const I = ms => new Date(ms).toISOString().slice(0, 10);
const pad = n => String(n).padStart(2, '0');

const toCents = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Valor inválido');
  return Math.round(n * 100 + (n >= 0 ? 1e-8 : -1e-8));
};
const money = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100);
const today = (tz = 'America/Maceio') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const addDays = (s, n) => I(P(s) + n * 864e5);
const daysBetween = (a, b) => Math.round((P(b) - P(a)) / 864e5);
// Semana: segunda a domingo (datas ISO sem fuso; o "hoje" já vem no fuso configurado).
const weekRange = s => { const dow = (new Date(P(s)).getUTCDay() + 6) % 7; const start = addDays(s, -dow); return { start, end: addDays(start, 6) }; };
const monthRange = s => { const [y, m] = s.split('-').map(Number); return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` }; };
const periodRange = (p, s) => {
  const [y, m] = s.split('-').map(Number);
  if (p === 'week') return weekRange(s);
  if (p === 'quarter') { const q = Math.floor((m - 1) / 3) * 3 + 1; return { start: `${y}-${pad(q)}-01`, end: monthRange(`${y}-${pad(q + 2)}-01`).end }; }
  if (p === 'year') return { start: `${y}-01-01`, end: `${y}-12-31` };
  return monthRange(s);
};
const inRange = (d, r) => d >= r.start && d <= r.end;

// Soma por tipo/status/período. Canceladas NUNCA entram.
const sumBy = (txs, { type, status, range } = {}) => txs
  .filter(t => t.status !== 'canceled' && (!type || t.type === type) && (!status || t.status === status) && (!range || inRange(t.occurred_on, range)))
  .reduce((a, t) => a + toCents(t.amount), 0);

// Saldo real: só movimentações efetivadas (settled). Transferência move entre contas sem alterar o total.
function balances(accounts, txs) {
  const by = {};
  for (const a of accounts) by[a.id] = toCents(a.opening_balance || 0);
  const add = (id, c) => { if (id in by) by[id] += c; };
  for (const t of txs) {
    if (t.status !== 'settled') continue;
    const c = toCents(t.amount);
    if (t.type === 'income' || t.type === 'investment_redemption') add(t.account_id, c);
    else if (t.type === 'expense' || t.type === 'investment_contribution') add(t.account_id, -c);
    else if (t.type === 'transfer') { add(t.account_id, -c); add(t.to_account_id, c); }
  }
  return { by, total: Object.values(by).reduce((a, b) => a + b, 0) };
}

// Carteira. ops: [{kind:'aporte'|'resgate', amount}]. mv = valor de mercado informado (centavos) ou null.
// Depósitos não são lucro: ganho total = valor atual + resgatado − aportado.
function portfolioStats(ops, mv) {
  let c = 0, r = 0;
  for (const o of ops) (o.kind === 'aporte' ? (c += toCents(o.amount)) : (r += toCents(o.amount)));
  const gain = mv == null ? null : mv + r - c;
  return { contributions: c, redemptions: r, net: c - r, gain, ret: gain == null || c === 0 ? null : gain / c };
}

// Retorno ponderado por fluxos (Modified Dietz). flows: [{date, amount}] aporte(+) / resgate(−), em centavos.
function modifiedDietz({ startValue, endValue, flows, start, end }) {
  const total = daysBetween(start, end);
  if (total <= 0) return null;
  const sum = flows.reduce((a, f) => a + f.amount, 0);
  const w = flows.reduce((a, f) => a + f.amount * (daysBetween(f.date, end) / total), 0);
  const den = startValue + w;
  return den > 0 ? (endValue - startValue - sum) / den : null;
}

// Orçamento livre = saldo real − compromissos pendentes − reservas. Renda esperada só entra no "projetado".
function budgetSummary({ balance, pending, reserve = 0, paid = 0, limit = 0, remainingDays, expectedIncome = 0 }) {
  const free = balance - pending - reserve;
  const days = Math.max(1, remainingDays);
  const pos = Math.max(0, free);
  const usage = limit > 0 ? paid / limit : null;
  return {
    free, remainingDays: days,
    daily: Math.floor(pos / days),
    weekly: Math.floor(pos * Math.min(7, days) / days),
    exceeded: free < 0 ? -free : 0,
    projected: free + expectedIncome,
    usage, alert: usage == null ? null : usage >= 1 ? 100 : usage >= 0.8 ? 80 : usage >= 0.5 ? 50 : null,
  };
}
const simulate = (input, amount) => budgetSummary({ ...input, pending: input.pending + toCents(amount) });

// Ganhos por semana (recebidos, por data) dentro de um período; semanas vazias contam como 0.
function weeklyStats(txs, range) {
  const m = new Map();
  for (let w = weekRange(range.start).start; w <= range.end; w = addDays(w, 7)) m.set(w, 0);
  for (const t of txs) {
    if (t.type !== 'income' || t.status !== 'settled' || !inRange(t.occurred_on, range)) continue;
    const k = weekRange(t.occurred_on).start;
    m.set(k, m.get(k) + toCents(t.amount));
  }
  const weeks = [...m].map(([start, total]) => ({ start, total }));
  const total = weeks.reduce((a, w) => a + w.total, 0);
  return {
    weeks, total, avg: weeks.length ? Math.round(total / weeks.length) : 0,
    best: weeks.reduce((a, w) => (!a || w.total > a.total ? w : a), null),
    worst: weeks.reduce((a, w) => (!a || w.total < a.total ? w : a), null),
  };
}

// Contribuição mensal sugerida para atingir a meta no prazo (estimativa, não garantia).
function goalMonthly({ target, saved, deadline, today: t }) {
  const rest = Math.max(0, toCents(target) - toCents(saved));
  const months = Math.max(1, Math.round(daysBetween(t, deadline) / 30.4375));
  return Math.ceil(rest / months);
}

// CSV compatível com planilhas pt-BR: separador ";", BOM UTF-8, proteção contra injeção de fórmulas.
const toCSV = (rows, cols) => {
  const q = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\uFEFF' + [cols.map(c => q(c[0])).join(';'), ...rows.map(r => cols.map(c => q(c[1](r))).join(';'))].join('\r\n');
};

return { toCents, money, today, addDays, daysBetween, weekRange, monthRange, periodRange, inRange, sumBy, balances, portfolioStats, modifiedDietz, budgetSummary, simulate, weeklyStats, goalMonthly, toCSV };
})();
if (typeof module !== 'undefined') module.exports = F;
