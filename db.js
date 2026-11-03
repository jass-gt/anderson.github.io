// Finance OS - acesso ao banco (Supabase)
// Use só a URL e a anon key aqui. Nunca coloque a senha do banco no front-end.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://agdnlftejngbmmqkawfw.supabase.co";
const SUPABASE_ANON_KEY = "SUA_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Executa a query e lança erro se algo falhar
async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Datas: mes = "2026-11" -> intervalo [2026-11-01, 2026-12-01)
function intervaloMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  const inicio = `${ano}-${String(m).padStart(2, "0")}-01`;
  const prox = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
  return { inicio, fim: prox };
}

// ---------- Autenticação ----------
export const cadastrar = (email, senha, nome) =>
  run(supabase.auth.signUp({ email, password: senha, options: { data: { nome } } }));

export const entrar = (email, senha) =>
  run(supabase.auth.signInWithPassword({ email, password: senha }));

export const sair = () => run(supabase.auth.signOut());

export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// ---------- Categorias ----------
export const listarCategorias = (tipo) => {
  let q = supabase.from("categorias").select("*").order("nome");
  if (tipo) q = q.eq("tipo", tipo);
  return run(q);
};

// ---------- Gastos ----------
export const listarGastos = (mes) => {
  const { inicio, fim } = intervaloMes(mes);
  return run(
    supabase
      .from("gastos")
      .select("*, categorias(nome, cor)")
      .gte("data", inicio)
      .lt("data", fim)
      .order("data", { ascending: false })
  );
};

export const adicionarGasto = (gasto) => run(supabase.from("gastos").insert(gasto).select().single());
export const atualizarGasto = (id, campos) => run(supabase.from("gastos").update(campos).eq("id", id));
export const removerGasto = (id) => run(supabase.from("gastos").delete().eq("id", id));

// ---------- Ganhos ----------
export const listarGanhos = (mes) => {
  const { inicio, fim } = intervaloMes(mes);
  return run(
    supabase
      .from("ganhos")
      .select("*, categorias(nome, cor)")
      .gte("data", inicio)
      .lt("data", fim)
      .order("data", { ascending: false })
  );
};

export const adicionarGanho = (ganho) => run(supabase.from("ganhos").insert(ganho).select().single());
export const removerGanho = (id) => run(supabase.from("ganhos").delete().eq("id", id));

// ---------- Orçamento ----------
// categoriaId = null define o orçamento total do mês
export async function definirOrcamento(mes, limite, categoriaId = null) {
  const mesData = `${mes}-01`;
  let q = supabase.from("orcamentos").select("id").eq("mes", mesData);
  q = categoriaId ? q.eq("categoria_id", categoriaId) : q.is("categoria_id", null);
  const existente = await run(q.maybeSingle());

  if (existente) {
    return run(supabase.from("orcamentos").update({ limite }).eq("id", existente.id));
  }
  return run(supabase.from("orcamentos").insert({ mes: mesData, limite, categoria_id: categoriaId }));
}

export const listarOrcamentos = (mes) =>
  run(supabase.from("orcamentos").select("*, categorias(nome)").eq("mes", `${mes}-01`));

// ---------- Investimentos ----------
export const listarInvestimentos = () =>
  run(supabase.from("investimentos").select("*").order("created_at", { ascending: false }));
export const adicionarInvestimento = (inv) => run(supabase.from("investimentos").insert(inv).select().single());
export const atualizarInvestimento = (id, campos) => run(supabase.from("investimentos").update(campos).eq("id", id));
export const removerInvestimento = (id) => run(supabase.from("investimentos").delete().eq("id", id));

// ---------- Metas ----------
export const listarMetas = () =>
  run(supabase.from("metas").select("*").order("prazo", { ascending: true, nullsFirst: false }));
export const adicionarMeta = (meta) => run(supabase.from("metas").insert(meta).select().single());
export const atualizarMeta = (id, campos) => run(supabase.from("metas").update(campos).eq("id", id));
export const removerMeta = (id) => run(supabase.from("metas").delete().eq("id", id));

// ---------- Dashboard e relatórios (views) ----------
export const quantoPossoGastar = () => run(supabase.from("v_quanto_posso_gastar").select("*").maybeSingle());
export const resumoMensal = () => run(supabase.from("v_resumo_mensal").select("*").order("mes", { ascending: false }));
export const ganhosSemanais = () => run(supabase.from("v_ganhos_semanais").select("*").order("semana", { ascending: false }));
export const gastosPorCategoria = (mes) =>
  run(supabase.from("v_gastos_por_categoria").select("*").eq("mes", `${mes}-01`));
export const resumoInvestimentos = () => run(supabase.from("v_investimentos_resumo").select("*").maybeSingle());
