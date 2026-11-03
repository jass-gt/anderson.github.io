import test from 'node:test';
import assert from 'node:assert/strict';
import F from '../js/finance.js';

const tx = (type, amount, occurred_on, status = 'settled', extra = {}) => ({ type, amount, occurred_on, status, account_id: 'a', ...extra });
const acc = [{ id: 'a', opening_balance: 1000 }, { id: 'b', opening_balance: 0 }];

test('soma receitas recebidas e despesas pagas; ignora previstas/pendentes', () => {
  const t = [tx('income', 100, '2026-10-02'), tx('income', 50, '2026-10-03', 'planned'), tx('expense', 30, '2026-10-04'), tx('expense', 20, '2026-10-05', 'pending')];
  const r = F.monthRange('2026-10-10');
  assert.equal(F.sumBy(t, { type: 'income', status: 'settled', range: r }), 10000);
  assert.equal(F.sumBy(t, { type: 'expense', status: 'settled', range: r }), 3000);
});
test('canceladas não entram em nenhum total', () => {
  const t = [tx('expense', 99, '2026-10-02', 'canceled')];
  assert.equal(F.sumBy(t, { type: 'expense' }), 0);
  assert.equal(F.balances(acc, t).total, 100000);
});
test('despesa pendente não reduz saldo real, mas reduz orçamento livre', () => {
  const t = [tx('expense', 200, '2026-10-05', 'pending')];
  const bal = F.balances(acc, t).total;
  assert.equal(bal, 100000);
  const s = F.budgetSummary({ balance: bal, pending: F.sumBy(t, { status: 'pending' }), reserve: 0, remainingDays: 10 });
  assert.equal(s.free, 80000);
});
test('despesa paga não é descontada duas vezes', () => {
  const t = [tx('expense', 200, '2026-10-05')];
  const bal = F.balances(acc, t).total;
  const s = F.budgetSummary({ balance: bal, pending: F.sumBy(t, { status: 'pending' }), remainingDays: 10 });
  assert.equal(s.free, 80000);
});
test('limites diário e semanal sem duplicar o orçamento', () => {
  const s = F.budgetSummary({ balance: 70000, pending: 0, remainingDays: 14 });
  assert.equal(s.daily, 5000);
  assert.equal(s.weekly, 35000);
  const e = F.budgetSummary({ balance: 70000, pending: 0, remainingDays: 3 });
  assert.equal(e.weekly, 70000);
});
test('orçamento negativo informa excedente; renda esperada só no projetado', () => {
  const s = F.budgetSummary({ balance: 10000, pending: 15000, remainingDays: 5, expectedIncome: 20000 });
  assert.equal(s.free, -5000); assert.equal(s.exceeded, 5000); assert.equal(s.daily, 0); assert.equal(s.projected, 15000);
});
test('alertas em 50%, 80% e 100% do limite', () => {
  const a = p => F.budgetSummary({ balance: 0, pending: 0, paid: p, limit: 1000, remainingDays: 1 }).alert;
  assert.deepEqual([a(400), a(500), a(800), a(1000)], [null, 50, 80, 100]);
});
test('simulador aumenta compromissos', () => {
  assert.equal(F.simulate({ balance: 100000, pending: 0, remainingDays: 10 }, 100).free, 90000);
});
test('troca de mês e ano', () => {
  assert.deepEqual(F.monthRange('2026-02-15'), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(F.monthRange('2028-02-15').end, '2028-02-29');
  assert.equal(F.addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(F.periodRange('quarter', '2026-11-10'), { start: '2026-10-01', end: '2026-12-31' });
});
test('semana segunda→domingo cruzando dois meses', () => {
  assert.deepEqual(F.weekRange('2026-10-01'), { start: '2026-09-28', end: '2026-10-04' });
  const t = [tx('income', 100, '2026-09-30'), tx('income', 50, '2026-10-02'), tx('income', 70, '2026-10-06')];
  const w = F.weeklyStats(t, { start: '2026-09-28', end: '2026-10-11' });
  assert.deepEqual(w.weeks.map(x => x.total), [15000, 7000]);
  assert.equal(w.best.start, '2026-09-28'); assert.equal(w.avg, 11000);
});
test('aportes e resgates: não é despesa; depósito não é lucro', () => {
  const t = [tx('investment_contribution', 500, '2026-10-01'), tx('investment_redemption', 100, '2026-10-02')];
  assert.equal(F.sumBy(t, { type: 'expense' }), 0);
  assert.equal(F.balances(acc, t).total, 60000);
  const p = F.portfolioStats([{ kind: 'aporte', amount: 500 }, { kind: 'resgate', amount: 100 }], 40000);
  assert.equal(p.net, 40000); assert.equal(p.gain, 0); assert.equal(p.ret, 0);
  assert.equal(F.portfolioStats([{ kind: 'aporte', amount: 500 }], null).gain, null);
});
test('transferência entre contas próprias mantém total e não é receita/despesa', () => {
  const t = [tx('transfer', 300, '2026-10-01', 'settled', { to_account_id: 'b' })];
  const b = F.balances(acc, t);
  assert.equal(b.by.a, 70000); assert.equal(b.by.b, 30000); assert.equal(b.total, 100000);
  assert.equal(F.sumBy(t, { type: 'income' }) + F.sumBy(t, { type: 'expense' }), 0);
});
test('arredondamento monetário', () => {
  assert.equal(F.toCents(0.1 + 0.2), 30); assert.equal(F.toCents(1.005), 101); assert.equal(F.toCents('19.99'), 1999);
  assert.throws(() => F.toCents('abc'));
});
test('usuário sem movimentações', () => {
  assert.equal(F.balances([], []).total, 0);
  assert.equal(F.weeklyStats([], { start: '2026-10-01', end: '2026-10-31' }).total, 0);
  assert.equal(F.sumBy([], { type: 'income' }), 0);
});
test('Modified Dietz considera o momento dos fluxos', () => {
  const r = F.modifiedDietz({ startValue: 100000, endValue: 121000, flows: [{ date: '2026-07-01', amount: 10000 }], start: '2026-01-01', end: '2026-12-31' });
  assert.ok(r > 0.09 && r < 0.11);
});
test('meta: contribuição mensal e prazo vencido', () => {
  assert.equal(F.goalMonthly({ target: 1200, saved: 0, deadline: '2027-10-24', today: '2026-10-24' }), 10000);
  assert.equal(F.goalMonthly({ target: 100, saved: 100, deadline: '2026-01-01', today: '2026-10-24' }), 0);
});
test('CSV: separador, aspas e injeção de fórmula', () => {
  assert.ok(F.toCSV([{ d: '=1+1;x' }], [['Descrição', r => r.d]]).includes("\"'=1+1;x\""));
});
