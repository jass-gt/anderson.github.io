// Finance OS - login + dashboard
import {
  entrar,
  cadastrar,
  sair,
  usuarioAtual,
  listarCategorias,
  listarGastos,
  adicionarGasto,
  removerGasto,
  quantoPossoGastar,
} from "./db.js";

// ---------- Atalhos ----------
const $ = (id) => document.getElementById(id);
const brl = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Mês atual no formato "2026-11" (usa o fuso local)
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mostrarTela(logado) {
  $("tela-login").hidden = logado;
  $("tela-app").hidden = !logado;
}

function mensagem(id, texto, erro = false) {
  const el = $(id);
  el.textContent = texto;
  el.style.color = erro ? "#ef4444" : "#22c55e";
}

// ---------- Login ----------
async function aoEntrar(e) {
  e.preventDefault();
  try {
    await entrar($("email").value.trim(), $("senha").value);
    $("senha").value = "";
    await iniciarApp();
  } catch (err) {
    mensagem("msg-login", "Não foi possível entrar: " + err.message, true);
  }
}

async function aoCadastrar() {
  const email = $("email").value.trim();
  const senha = $("senha").value;
  if (!email || senha.length < 6) {
    return mensagem("msg-login", "Informe e-mail e uma senha de pelo menos 6 caracteres.", true);
  }
  try {
    const nome = $("nome") ? $("nome").value.trim() : "";
    const data = await cadastrar(email, senha, nome);
    if (data.session) {
      await iniciarApp();
    } else {
      mensagem("msg-login", "Conta criada! Confirme seu e-mail para entrar.");
    }
  } catch (err) {
    mensagem("msg-login", "Erro ao cadastrar: " + err.message, true);
  }
}

async function aoSair() {
  await sair();
  mostrarTela(false);
}

// ---------- Dashboard ----------
async function carregarResumo() {
  const r = await quantoPossoGastar();
  $("pode-gastar").textContent = brl(r?.disponivel);
  $("por-dia").textContent = brl(r?.por_dia);
  $("ganhos-mes").textContent = brl(r?.ganhos_mes);
  $("gastos-mes").textContent = brl(r?.gastos_mes);
}

async function carregarCategorias() {
  const categorias = await listarCategorias("gasto");
  const select = $("gasto-categoria");
  select.replaceChildren();
  for (const c of categorias) {
    const op = document.createElement("option");
    op.value = c.id;
    op.textContent = c.nome;
    select.appendChild(op);
  }
}

async function carregarGastos() {
  const gastos = await listarGastos(mesAtual());
  const lista = $("lista-gastos");
  lista.replaceChildren();

  if (gastos.length === 0) {
    const vazio = document.createElement("li");
    vazio.textContent = "Nenhum gasto neste mês.";
    lista.appendChild(vazio);
    return;
  }

  for (const g of gastos) {
    const li = document.createElement("li");
    const categoria = g.categorias?.nome ?? "Sem categoria";
    const data = new Date(g.data + "T00:00:00").toLocaleDateString("pt-BR");
    li.textContent = `${data} · ${g.descricao} (${categoria}) · ${brl(g.valor)} `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Excluir";
    btn.addEventListener("click", async () => {
      await removerGasto(g.id);
      await atualizarTela();
    });
    li.appendChild(btn);
    lista.appendChild(li);
  }
}

async function aoAdicionarGasto(e) {
  e.preventDefault();
  const gasto = {
    descricao: $("gasto-desc").value.trim(),
    valor: Number($("gasto-valor").value),
    categoria_id: $("gasto-categoria").value || null,
  };
  if ($("gasto-data").value) gasto.data = $("gasto-data").value;

  try {
    await adicionarGasto(gasto);
    e.target.reset();
    await atualizarTela();
  } catch (err) {
    mensagem("msg-gasto", "Erro ao salvar: " + err.message, true);
  }
}

async function atualizarTela() {
  await Promise.all([carregarResumo(), carregarGastos()]);
}

async function iniciarApp() {
  mostrarTela(true);
  await carregarCategorias();
  await atualizarTela();
}

// ---------- Início ----------
$("form-login").addEventListener("submit", aoEntrar);
$("btn-cadastrar").addEventListener("click", aoCadastrar);
$("btn-sair").addEventListener("click", aoSair);
$("form-gasto").addEventListener("submit", aoAdicionarGasto);

usuarioAtual().then((user) => (user ? iniciarApp() : mostrarTela(false)));
