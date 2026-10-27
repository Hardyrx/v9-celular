// V9 ADMIN no celular (27/10/2026, dono: "esse aí é só meu, não é dos alunos, tem que ser app diferente"): o app do
// DONO, separado do app dos alunos (que fica em ../). Liga pelo QR code do painel de licenças (código de 5 min); o
// token deste celular fica só aqui (e o hash na nuvem). Abas: PCs (liberar, bloquear, chaves, validade), Publicar
// (Flow e Vision pelos workflows do GitHub) e Ajustes (avisos, desligar).
"use strict";
const NUVEM_ADM = "https://hrvrhaxllsbgiwkliuoc.supabase.co/functions/v1/celular_adm";
const CHAVE_ADM = "v9adm_token";
const $ = (id) => document.getElementById(id);

const guardado = {
  ler(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  gravar(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) { /* aba privada */ } },
};
// o token de antes (quando o admin era uma aba do app dos alunos, mesmo endereço) continua valendo
let tokenAdm = guardado.ler(CHAVE_ADM) || guardado.ler("v9cel_adm");
if (tokenAdm && !guardado.ler(CHAVE_ADM)) guardado.gravar(CHAVE_ADM, tokenAdm);
let relogio = null;

const MOTIVOS = {
  codigo_invalido: "O código tem 8 letras e números. Confira e digite de novo.",
  codigo_vencido: "Esse código venceu ou já foi usado. No painel de licenças, mostre outro QR code.",
  pedidos_demais: "Muitos pedidos em 1 hora. Espere um pouco.",
  sem_resposta: "Sem internet ou a nuvem não respondeu.",
  celulares_demais: "Já há 3 celulares de administrador ligados. Desligue um no painel.",
  publicando: "Já tem uma publicação rodando. Espere ela terminar.",
  versao_igual: "Essa versão do Flow já está no ar. Para publicar de novo, a versão (arquivo VERSAO) tem que subir.",
  publicar_sem_token: "Falta o token do GitHub na nuvem (veja as instruções nesta tela).",
  github_recusou: "O GitHub recusou o pedido de publicar. Confira o token (permissão de Actions no v9-flow).",
  github_sem_resposta: "O GitHub não respondeu agora. Tente de novo em 1 minuto.",
};

// ------------------------------------------------------------------ pedacinhos de tela
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}
function botao(rotulo, cls, aoTocar) {
  const b = el("button", "btn " + cls, rotulo);
  b.type = "button";
  b.onclick = aoTocar;
  return b;
}
function chave(rotulo, ligado, aoTocar) {
  const b = el("button", "chave", rotulo);
  b.type = "button";
  b.setAttribute("aria-pressed", ligado ? "true" : "false");
  b.onclick = aoTocar;
  return b;
}
function toast(texto, ruim = false) {
  const t = $("toast");
  t.textContent = texto;
  t.classList.toggle("ruim", ruim);
  t.classList.add("mostra");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("mostra"), 4200);
}
function confirmar(titulo, texto, rotulo) {
  const d = $("confirmar");
  $("conf-titulo").textContent = titulo;
  $("conf-texto").textContent = texto;
  $("conf-sim").textContent = rotulo;
  return new Promise((ok) => {
    d.querySelectorAll("button").forEach((b) => { b.onclick = () => { d.close(); ok(b.value === "sim"); }; });
    d.showModal();
  });
}
const dataBr = (iso) => iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR") : "sem data";
const quando = (iso) => iso ? new Date(String(iso).replace(" ", "T")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const haQuanto = (iso) => {
  if (!iso) return "nunca";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min" : s < 86400 ? Math.round(s / 3600) + " h" : Math.round(s / 86400) + " d";
};
const nomeApp = (a) => ({ flow: "V9 Flow", lite: "V9 Lite", vision: "V9 Vision", celular_adm: "Celular adm" })[a] || a || "";

// ------------------------------------------------------------------ a nuvem
async function admNuvem(acao, campos = {}) {
  const r = await fetch(NUVEM_ADM, { method: "POST", headers: { "content-type": "application/json" },
                                     body: JSON.stringify({ acao, token: tokenAdm, ...campos }) });
  const d = await r.json().catch(() => ({ ok: false, motivo: "sem_resposta" }));
  if (d.motivo === "desconectado") { desligado(); throw new Error("Este celular foi desligado pelo painel de licenças."); }
  if (!d.ok) throw new Error(MOTIVOS[d.motivo] || (d.detalhe ? "Erro: " + d.detalhe : "Não deu certo agora. Tente de novo."));
  return d;
}

// ------------------------------------------------------------------ telas
const TELAS = ["pcs", "publicar", "ajustes"];
let abaAtual = "pcs";
function aba(nome) {
  abaAtual = nome;
  for (const t of TELAS) $("tela-" + t).hidden = !tokenAdm || t !== nome;
  $("tela-entrar").hidden = !!tokenAdm;
  document.querySelectorAll("nav.abas button").forEach((b) => {
    if (b.dataset.aba === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  if (nome === "pcs") admAtualizar();
  if (nome === "publicar") pubAtualizar();
  window.scrollTo(0, 0);
}
function montar() {
  $("abas").hidden = !tokenAdm;
  clearInterval(relogio);
  if (!tokenAdm) { for (const t of TELAS) $("tela-" + t).hidden = true; $("tela-entrar").hidden = false; return; }
  relogio = setInterval(() => {
    if (document.hidden) return;
    if (abaAtual === "pcs") admAtualizar(true);
    if (abaAtual === "publicar") pubAtualizar(true);
  }, 8000);
  textoPush();
}
function desligado() {
  tokenAdm = null;
  guardado.gravar(CHAVE_ADM, null);
  guardado.gravar("v9cel_adm", null);
  montar();
  aba("pcs");
}

const APARELHO = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Celular";
async function entrarAdm(codigo) {
  codigo = String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (codigo.length !== 8) { toast(MOTIVOS.codigo_invalido, true); return; }
  try {
    const d = await admNuvem("cel_entrar_adm", { codigo, aparelho: APARELHO });
    tokenAdm = d.token;
    guardado.gravar(CHAVE_ADM, tokenAdm);
    history.replaceState(null, "", location.pathname);
    toast("Administrador ligado neste celular.");
    montar();
    aba("pcs");
  } catch (e) { toast(e.message, true); montar(); aba("pcs"); }
}

// ------------------------------------------------------------------ PCs e membros
let painel = null;
let admLendo = false;
async function admAtualizar(quieto = false) {
  if (!tokenAdm || admLendo) return;
  admLendo = true;
  try {
    painel = await admNuvem("adm_painel");
    admDesenhar();
  } catch (e) { if (!quieto) toast(e.message, true); }
  admLendo = false;
}
function somarPlano(plano, base) {          // a mesma conta da função "admin": soma do fim da validade se ela ainda vale
  if (plano === "vitalicio") return null;
  const meses = { "1m": 1, "3m": 3, "1a": 12 }[plano];
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const b = base && new Date(base + "T00:00:00Z") > hoje ? new Date(base + "T00:00:00Z") : hoje;
  const dia = b.getUTCDate();
  b.setUTCMonth(b.getUTCMonth() + meses);
  if (b.getUTCDate() !== dia) b.setUTCDate(0);
  return b.toISOString().slice(0, 10);
}
async function admPedir(pedido, dados, ok) {
  try {
    await admNuvem("adm_acao", { pedido, dados });
    toast(ok);
    admAtualizar(true);
  } catch (e) { toast(e.message, true); }
}
async function bloquearPc(x) {
  if (await confirmar("Bloquear este PC?", `${x.codigo} não vai conseguir abrir os apps.`, "Bloquear"))
    admPedir("dispositivo_bloquear", { id: x.id, bloqueado: true }, "PC bloqueado.");
}
function cartaoPede(x) {
  const c = el("article", "pc-card pede");
  c.append(el("h4", "", x.nome_pc || "PC sem nome"), el("div", "cod", x.codigo),
           el("p", "info", `${nomeApp(x.ultimo_app)} · pediu há ${haQuanto(x.primeiro_uso)}${x.ip ? " · IP " + x.ip : ""}`));
  const a = el("div", "acoes");
  a.append(botao("Liberar", "forte", () => liberar(x)), botao("Bloquear", "perigo", () => bloquearPc(x)));
  c.appendChild(a);
  return c;
}
function cartaoIp(x) {
  const c = el("article", "pc-card pede");
  c.append(el("h4", "", x.nome || x.membro || x.nome_pc || "PC"), el("div", "cod", x.codigo),
           el("p", "info", `Tentou entrar de outro IP: ${x.ip_tentativa || "?"} (registrado: ${x.ip || "nenhum"})`));
  const a = el("div", "acoes");
  a.appendChild(botao("Aceitar o IP novo", "forte", () => admPedir("dispositivo_liberar", { id: x.id }, "IP novo aceito.")));
  c.appendChild(a);
  return c;
}
function cartaoPc(x) {
  const c = el("article", "pc-card");
  c.append(el("h4", "", x.membro ? `${x.membro} (login)` : (x.nome || x.nome_pc || "PC sem nome")),
           el("div", "cod", x.codigo + (x.nome_pc ? " · " + x.nome_pc : "")));
  const vence = x.membro_id ? "" : ` · vale até ${x.validade ? dataBr(x.validade) : "sempre"}`;
  c.appendChild(el("p", "info", `${nomeApp(x.ultimo_app)} · último uso há ${haQuanto(x.ultimo_uso)}${vence}`));
  const ch = el("div", "chaves");
  if (!x.membro_id) {
    ch.append(
      chave("Uso", x.liberado, () => admPedir("dispositivo_uso", { id: x.id, liberado: !x.liberado }, x.liberado ? "Uso desligado." : "Uso ligado.")),
      chave("Atualização", x.atualiza, () => admPedir("dispositivo_atualizacao", { id: x.id, atualiza: !x.atualiza }, "Atualização trocada.")),
      chave("ÍCARO", x.icaro, () => admPedir("dispositivo_codigo", { id: x.id, icaro: !x.icaro }, "ÍCARO trocado.")),
      chave("Lite", x.lite, () => admPedir("dispositivo_lite", { id: x.id, lite: !x.lite }, "Lite trocado.")));
  }
  ch.appendChild(chave(x.bloqueado ? "Bloqueado" : "Desbloqueado", !x.bloqueado, () => (x.bloqueado
    ? admPedir("dispositivo_bloquear", { id: x.id, bloqueado: false }, "PC desbloqueado.") : bloquearPc(x))));
  c.appendChild(ch);
  if (!x.membro_id) {
    const a = el("div", "acoes");
    for (const [p, r] of [["1m", "+1 mês"], ["3m", "+3 meses"], ["1a", "+1 ano"]]) {
      const nova = somarPlano(p, x.validade);
      a.appendChild(botao(r, "", () => admPedir("dispositivo_codigo", { id: x.id, validade: nova }, `Validade: ${dataBr(nova)}.`)));
    }
    c.appendChild(a);
  }
  return c;
}
function cartaoMembro(m) {
  const c = el("article", "pc-card");
  c.append(el("h4", "", m.nome || "Membro"),
           el("p", "info", `Login · ${m.status === "ativo" ? "ativo" : "bloqueado"} · vale até ${m.validade ? dataBr(m.validade) : "sempre"}`));
  const ch = el("div", "chaves");
  ch.append(
    chave(m.status === "ativo" ? "Ativo" : "Bloqueado", m.status === "ativo", async () => {
      if (m.status === "ativo" && !(await confirmar("Bloquear este membro?", `${m.nome} perde o acesso em todos os PCs.`, "Bloquear"))) return;
      admPedir("membro_atualizar", { id: m.id, status: m.status === "ativo" ? "bloqueado" : "ativo" }, "Membro atualizado.");
    }),
    chave("ÍCARO", m.icaro, () => admPedir("membro_atualizar", { id: m.id, icaro: !m.icaro }, "ÍCARO trocado.")));
  c.appendChild(ch);
  const a = el("div", "acoes");
  for (const [p, r] of [["1m", "+1 mês"], ["3m", "+3 meses"], ["1a", "+1 ano"]]) {
    a.appendChild(botao(r, "", () => admPedir("membro_atualizar", { id: m.id, plano: p }, "Plano renovado.")));
  }
  c.appendChild(a);
  return c;
}
function admDesenhar() {
  if (!painel) return;
  const ds = painel.dispositivos || [];
  const pede = ds.filter((x) => !x.membro_id && !x.liberado && !x.bloqueado);
  const ip = ds.filter((x) => x.bloqueado && x.motivo_bloqueio === "ip_diferente");
  $("k-pede").querySelector("b").textContent = pede.length;
  $("k-pede").classList.toggle("quente", pede.length > 0);
  $("k-ativos").textContent = ds.filter((x) => (x.membro_id || x.liberado) && !x.bloqueado).length;
  $("k-bloq").textContent = ds.filter((x) => x.bloqueado).length;
  $("t-pede").hidden = !pede.length;
  $("l-pede").replaceChildren(...pede.map(cartaoPede));
  $("t-ip").hidden = !ip.length;
  $("l-ip").replaceChildren(...ip.map(cartaoIp));
  const q = $("adm-busca").value.trim().toLowerCase();
  const casa = (...s) => !q || s.some((v) => String(v || "").toLowerCase().includes(q));
  const pcs = ds.filter((x) => !pede.includes(x) && casa(x.nome, x.nome_pc, x.codigo, x.membro)).slice(0, 60);
  const membros = (painel.membros || []).filter((m) => casa(m.nome)).slice(0, 40);
  $("l-pcs").replaceChildren(...membros.map(cartaoMembro), ...pcs.map(cartaoPc));
  $("l-eventos").replaceChildren(...(painel.eventos || []).slice(0, 40).map((e) => {
    const linha = el("div", "evento");
    linha.append(el("time", "", quando(e.em)), el("span", "", `${e.quem || "—"} · ${nomeApp(e.app)} · ${e.acao || ""}${e.resultado ? " · " + e.resultado : ""}`));
    return linha;
  }));
}
$("adm-busca").addEventListener("input", admDesenhar);

function liberar(x) {
  const d = $("liberar");
  $("lib-titulo").textContent = "Liberar " + x.codigo;
  $("lib-info").textContent = `${x.nome_pc || "PC sem nome"} · ${nomeApp(x.ultimo_app)}`;
  $("lib-nome").value = x.nome || "";
  $("lib-plano").value = "1m";
  $("lib-data").hidden = true;
  $("lib-icaro").checked = false;
  $("lib-lite").checked = x.ultimo_app === "lite";
  $("lib-voltar").onclick = () => d.close();
  $("form-liberar").onsubmit = (e) => {
    e.preventDefault();
    const nome = $("lib-nome").value.trim();
    if (!nome) { toast("Escreva o nome do aluno.", true); return; }
    const plano = $("lib-plano").value;
    const validade = plano === "data" ? $("lib-data").value : somarPlano(plano, null);
    if (plano === "data" && !validade) { toast("Escolha a data.", true); return; }
    d.close();
    admPedir("dispositivo_codigo", { id: x.id, nome, validade, liberado: true, atualiza: true,
                                     icaro: $("lib-icaro").checked, lite: $("lib-lite").checked },
             `${nome} liberado até ${validade ? dataBr(validade) : "sempre"}.`);
  };
  d.showModal();
  $("lib-nome").focus();
}
$("lib-plano").addEventListener("change", (e) => { $("lib-data").hidden = e.target.value !== "data"; });

// ------------------------------------------------------------------ PUBLICAR (os workflows do GitHub, pela nuvem)
let pub = null;
let pubLendo = false;
const ESTADO_RUN = (r) => r.status !== "completed" ? (r.status === "queued" || r.status === "pending" || r.status === "waiting" ? "Na fila" : "Publicando…")
  : r.conclusao === "success" ? "Publicado" : r.conclusao === "cancelled" ? "Cancelado" : "Falhou";
async function pubAtualizar(quieto = false) {
  if (!tokenAdm || pubLendo) return;
  pubLendo = true;
  try {
    pub = await admNuvem("adm_publicacoes");
    pubDesenhar();
  } catch (e) { if (!quieto) toast(e.message, true); }
  pubLendo = false;
}
function pubDesenhar() {
  const p = pub || {};
  $("pub-sem").hidden = p.configurado !== false;
  $("pub-erro").hidden = !p.erro_github;
  const caixa = $("pub-apps");
  caixa.textContent = "";
  if (!p.apps) { $("pub-runs").textContent = ""; return; }
  const rodando = (p.execucoes || []).some((r) => r.status !== "completed");
  const f = p.apps.flow, v = p.apps.vision;
  const flowIgual = f.versao_github && f.no_ar && f.versao_github === f.no_ar.versao;
  const visionIgual = v.github && v.no_ar && String(v.no_ar.versao || "").endsWith(v.github.sha);
  for (const [app, nome, info, igual, motivo] of [
    ["flow", "V9 Flow", f, flowIgual, `A versão ${f.versao_github} já está no ar. Para publicar de novo, a versão (arquivo VERSAO) tem que subir.`],
    ["vision", "V9 Vision", v, visionIgual, "O último commit do Vision já está no ar."],
  ]) {
    const c = el("article", "pc-card");
    c.appendChild(el("h4", "", nome));
    c.appendChild(el("p", "info", `No ar: ${info.no_ar ? info.no_ar.versao : "—"}${info.no_ar && info.no_ar.em ? " · " + quando(info.no_ar.em) : ""}`));
    if (info.github) {
      c.appendChild(el("p", "info", `No GitHub: ${app === "flow" && info.versao_github ? info.versao_github + " · " : ""}${info.github.sha} · ${info.github.msg}`));
    }
    if (igual) c.appendChild(el("p", "info nota", motivo));
    const a = el("div", "acoes");
    const b = botao(rodando ? "Esperando a publicação que está rodando" : `Publicar ${nome}`, "forte", () => publicar(app, nome, info));
    b.disabled = rodando || igual;
    a.appendChild(b);
    c.appendChild(a);
    caixa.appendChild(c);
  }
  $("pub-runs").replaceChildren(...(p.execucoes || []).slice(0, 8).map((r) => {
    const linha = el("div", "pedido " + (r.status !== "completed" ? "roda" : r.conclusao === "success" ? "ok" : "ruim"));
    const meio = el("div");
    meio.append(el("b", "", r.nome.replace("Publicar ", "")), el("p", "", ESTADO_RUN(r)));
    const link = el("a", "", "ver");
    link.href = r.url;
    link.target = "_blank";
    link.rel = "noopener";
    linha.append(el("i"), meio, el("time", "", quando(r.criado_em)), link);
    return linha;
  }));
}
async function publicar(app, nome, info) {
  const versao = app === "flow" ? `versão ${info.versao_github}` : `commit ${info.github ? info.github.sha : ""}`;
  if (!(await confirmar(`Publicar o ${nome}?`, `Vai para todos os alunos (${versao}). Leva de 3 a 10 minutos e roda na nuvem do GitHub.`, "Publicar"))) return;
  try {
    await admNuvem("adm_publicar", { app });
    toast(`${nome}: publicação começou.`);
    setTimeout(() => pubAtualizar(true), 4000);
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ avisos (só deste app: PC novo pedindo acesso)
function b64url(s) {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function textoPush() {
  const t = $("push-txt"), b = $("push-btn");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    t.textContent = ios ? "No iPhone, os avisos só funcionam com o app na Tela de Início: no Safari, toque em Compartilhar e em Adicionar à Tela de Início, e abra pelo ícone."
                        : "Este navegador não recebe avisos. Use o Chrome no Android.";
    b.hidden = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === "granted" && guardado.ler("v9adm_push") === "1") {
    t.textContent = "Avisos ligados neste celular: PC novo pedindo acesso.";
    b.textContent = "Ligar de novo";
  } else if (Notification.permission === "denied") {
    t.textContent = "Os avisos estão bloqueados para este app. Libere nas configurações de notificação do celular.";
    b.hidden = true;
  }
}
async function ligarAvisos() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Sem permissão, os avisos não chegam.", true); textoPush(); return; }
    const { chave: publica } = await admNuvem("cel_vapid");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(publica) });
    await admNuvem("adm_push", { inscricao: sub.toJSON() });
    guardado.gravar("v9adm_push", "1");
    toast("Avisos ligados.");
    textoPush();
  } catch (e) { toast(e.message || "Não consegui ligar os avisos.", true); }
}
$("push-btn").onclick = () => ligarAvisos();
$("sair-adm").onclick = async () => {
  if (!(await confirmar("Desligar o administrador?", "Este celular para de liberar PCs e de publicar. Para ligar de novo, use o QR code do painel.", "Desligar"))) return;
  try { await admNuvem("adm_sair"); } catch (_) { /* desliga aqui de qualquer jeito */ }
  desligado();
};

// ------------------------------------------------------------------ começo
document.querySelectorAll("nav.abas button").forEach((b) => { b.onclick = () => aba(b.dataset.aba); });
$("form-entrar").addEventListener("submit", (e) => { e.preventDefault(); entrarAdm($("codigo").value); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && tokenAdm) aba(abaAtual); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const hash = new URLSearchParams(location.hash.slice(1));
montar();
if (hash.get("a")) entrarAdm(hash.get("a"));
else aba("pcs");
