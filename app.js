// V9 Vision no celular (27/10/2026): lê o andamento que o PC manda para a nuvem e deixa pedidos que o PC busca e faz.
// O celular nunca fala direto com o PC. O token deste celular fica só aqui (e o hash dele na nuvem).
"use strict";
const NUVEM = "https://hrvrhaxllsbgiwkliuoc.supabase.co/functions/v1/celular";
const CHAVE_TOKEN = "v9cel_token";
const $ = (id) => document.getElementById(id);

const guardado = {
  ler(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  gravar(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) { /* aba privada */ } },
};
let token = guardado.ler(CHAVE_TOKEN);
let ultimo = null;                 // a última resposta de cel_estado
// id do pedido -> texto do que foi pedido (guardado: fechar o app no meio não perde a resposta)
let esperando = new Map(Object.entries(JSON.parse(guardado.ler("v9cel_esperando") || "{}")).map(([k, v]) => [Number(k), v]));
function guardarEsperando() { guardado.gravar("v9cel_esperando", JSON.stringify(Object.fromEntries(esperando))); }
// o nome de cada pedido na lista "Seus pedidos" (fica depois da resposta; só os 30 últimos)
const rotulos = new Map(Object.entries(JSON.parse(guardado.ler("v9cel_rotulos") || "{}")).map(([k, v]) => [Number(k), v]));
function guardarRotulo(id, r) { rotulos.set(id, r); while (rotulos.size > 30) rotulos.delete(rotulos.keys().next().value);
  guardado.gravar("v9cel_rotulos", JSON.stringify(Object.fromEntries(rotulos))); }
let relogio = null;

async function nuvem(acao, campos = {}) {
  const r = await fetch(NUVEM, { method: "POST", headers: { "content-type": "application/json" },
                                 body: JSON.stringify({ acao, token, ...campos }) });
  const d = await r.json().catch(() => ({ ok: false, motivo: "sem_resposta" }));
  if (d.motivo === "desconectado") { desligado(); throw new Error("Este celular foi desligado do PC."); }
  if (!d.ok) throw new Error(MOTIVOS[d.motivo] || "Não deu certo agora. Tente de novo.");
  return d;
}
const MOTIVOS = {
  codigo_invalido: "O código tem 8 letras e números. Confira e digite de novo.",
  codigo_vencido: "Esse código venceu ou já foi usado. No PC, clique em Mostrar outro QR code.",
  pedidos_demais: "Muitos pedidos em 1 hora. Espere um pouco.",
  sem_resposta: "Sem internet ou a nuvem não respondeu.",
  grande_demais: "O roteiro está grande demais para mandar pelo celular.",
  tipo_de_arquivo: "Esse tipo de arquivo não vale aqui. Áudio: mp3, wav, m4a; legenda: .srt; material: fotos e vídeos.",
  arquivo_grande: "O arquivo passa de 50 MB. Mande em mp3 ou m4a (um áudio de 15 min em mp3 tem uns 15 MB).",
  arquivos_demais: "Muitos arquivos esperando o PC. Deixe o V9 Vision aberto no PC para ele buscar e tente de novo.",
  arquivo_invalido: "Não consegui ler esse arquivo. Escolha de novo.",
};

// ------------------------------------------------------------------ avisos na tela
function toast(texto, ruim = false) {
  const t = $("toast");
  t.textContent = texto;
  t.classList.toggle("ruim", ruim);
  t.classList.add("mostra");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("mostra"), 4200);
}
function confirmar(titulo, texto, botao) {
  const d = $("confirmar");
  $("conf-titulo").textContent = titulo;
  $("conf-texto").textContent = texto;
  $("conf-sim").textContent = botao;
  return new Promise((ok) => {
    d.querySelectorAll("button").forEach((b) => { b.onclick = () => { d.close(); ok(b.value === "sim"); }; });
    d.showModal();
  });
}

// ------------------------------------------------------------------ telas
const TELAS = ["videos", "criar", "ajustes"];
let abaAtual = "videos";
function aba(nome) {
  abaAtual = nome;
  const precisaPc = (nome === "videos" || nome === "criar") && !token;
  for (const t of TELAS) $("tela-" + t).hidden = precisaPc || t !== nome;
  $("tela-entrar").hidden = !precisaPc;
  document.querySelectorAll("nav.abas button").forEach((b) => {
    if (b.dataset.aba === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}
function montar() {
  const algum = !!token;
  $("abas").hidden = !algum;
  $("pc").hidden = !token;
  clearInterval(relogio);
  if (!algum) {
    for (const t of TELAS) $("tela-" + t).hidden = true;
    $("tela-entrar").hidden = false;
    return;
  }
  relogio = setInterval(() => {
    if (document.hidden) return;
    if (token) atualizar();
  }, 6000);
  if (token) atualizar();
  textoPush();
}
function desligado() {
  token = null;
  guardado.gravar(CHAVE_TOKEN, null);
  montar();
  aba("videos");
}
function ligado() {
  montar();
  aba("videos");
}

// ------------------------------------------------------------------ entrar com o código
const APARELHO = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Celular";
async function entrar(codigo) {
  codigo = String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (codigo.length !== 8) { toast(MOTIVOS.codigo_invalido, true); return; }
  try {
    const d = await nuvem("cel_entrar", { codigo, aparelho: APARELHO });
    token = d.token;
    guardado.gravar(CHAVE_TOKEN, token);
    history.replaceState(null, "", location.pathname);
    toast("Ligado ao PC.");
    ligado();
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ o andamento
const ESTADOS_FIM = ["concluido", "erro", "parado", "interrompido", "desconhecido"];
function rotuloPc(d) {
  const el = $("pc");
  el.classList.toggle("ligado", d.pc_online);
  el.classList.toggle("desligado", !d.pc_online);
  if (!d.atualizado_em) { $("pc-txt").textContent = "PC sem notícia"; return; }
  const s = Math.max(0, Math.round((Date.now() - new Date(d.atualizado_em).getTime()) / 1000));
  const ha = s < 60 ? s + " s" : s < 3600 ? Math.round(s / 60) + " min" : Math.round(s / 3600) + " h";
  $("pc-txt").textContent = (d.pc_online ? "PC ligado · " : "PC desligado · ") + "há " + ha;
}

const BOTOES = [
  ["continuar", "Continuar de onde parou", "forte"],
  ["retomar", "Retomar", "forte"],
  ["gerar_veo", "Mandar as cenas de IA", "forte"],
  ["exportar_mp4", "Exportar o MP4", ""],
  ["pausar", "Pausar", ""],
  ["refazer_youtube", "Refazer YouTube", ""],
  ["refazer_fotos", "Refazer fotos", ""],
  ["parar", "Parar", "perigo"],
];
function cartao(p) {
  const div = document.createElement("article");
  div.className = "video" + (ESTADOS_FIM.includes(p.etapa) ? "" : " ativo");
  const h = document.createElement("h2");
  h.textContent = p.nome;
  const et = document.createElement("p");
  et.className = "etapa";
  const b = document.createElement("b");
  b.textContent = p.pausado ? "Pausado" : p.etapa === "na_fila" && p.fila ? `Na fila (${p.fila}º)` : p.label;
  et.appendChild(b);
  if (p.detalhe && !ESTADOS_FIM.includes(p.etapa)) et.append(" · " + p.detalhe);
  div.append(h, et);
  if (!ESTADOS_FIM.includes(p.etapa) && typeof p.pct === "number") {
    const barra = document.createElement("div");
    barra.className = "barra";
    const i = document.createElement("i");
    i.style.width = Math.max(2, Math.min(100, p.pct)) + "%";
    barra.appendChild(i);
    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = Math.round(p.pct) + "%";
    div.append(barra, pct);
  }
  if (p.veo && p.veo.total > p.veo.prontos && p.etapa === "concluido") {
    const v = document.createElement("p");
    v.className = "etapa";
    v.textContent = `Cenas de IA esperando: ${p.veo.total - p.veo.prontos} de ${p.veo.total}`;
    div.appendChild(v);
  }
  if (p.mp4 && p.mp4.estado === "rodando") {
    const m = document.createElement("p");
    m.className = "etapa";
    m.textContent = `Exportando o MP4… ${Math.round(p.mp4.pct || 0)}%`;
    div.appendChild(m);
  } else if (p.mp4 && p.mp4.estado === "pronto") {
    const m = document.createElement("p");
    m.className = "etapa";
    m.textContent = "MP4 pronto no PC" + (p.mp4.duracao_s ? ` · ${Math.floor(p.mp4.duracao_s / 60)}:${String(Math.round(p.mp4.duracao_s % 60)).padStart(2, "0")}` : "");
    div.appendChild(m);
  }
  if (p.erro && ["erro", "parado", "interrompido"].includes(p.etapa)) {
    const e = document.createElement("p");
    e.className = "erro";
    e.textContent = p.erro;
    div.appendChild(e);
  }
  const pode = p.pode || {};
  const acoes = document.createElement("div");
  acoes.className = "acoes";
  for (const [k, rotulo, tipo] of BOTOES) {
    const chave = k.startsWith("refazer_") ? "refazer" : k;
    if (!pode[chave]) continue;
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "btn " + tipo;
    const fila = k === "parar" && p.etapa === "na_fila";        // na fila, o Parar do Vision só tira da fila
    bt.textContent = fila ? "Tirar da fila" : rotulo;
    bt.onclick = () => acao(fila ? "tirar_da_fila" : k, p.nome, bt.textContent);
    acoes.appendChild(bt);
  }
  if (acoes.children.length) div.appendChild(acoes);
  return div;
}

function desenhar(d) {
  rotuloPc(d);
  const e = d.estado;
  $("fila-pausada").hidden = !(e && e.fila_pausada);
  const lista = $("lista");
  lista.textContent = "";
  if (!e) {
    lista.innerHTML = '<div class="vazio">O PC ainda não mandou nada. Deixe o V9 Vision aberto no PC: em alguns segundos os vídeos aparecem aqui.</div>';
    return;
  }
  if (!e.projetos || !e.projetos.length) {
    lista.innerHTML = '<div class="vazio">Nenhum vídeo no PC ainda. Toque em Criar vídeo para mandar um roteiro.</div>';
  } else {
    for (const p of e.projetos) lista.appendChild(cartao(p));
  }
  if (typeof criarTela === "function") criarTela(e.criar);
}

const NOME_PEDIDO = { pausar: "Pausar", retomar: "Retomar", parar: "Parar", continuar: "Continuar", retomar_fila: "Retomar a fila",
                      gerar_veo: "Mandar as cenas de IA", exportar_mp4: "Exportar o MP4", criar_video: "Criar vídeo", refazer: "Refazer" };
function respostas(d) {
  const lista = (d.respostas || []).filter((r) => Date.now() - new Date(r.criado_em).getTime() < 24 * 3600e3).slice(0, 6);
  const caixa = $("pedidos");
  caixa.textContent = "";
  if (lista.length) {
    caixa.appendChild(el("h3", "sec pedidos-t", "Seus pedidos"));
    for (const r of lista) {
      const res = r.resultado || {};
      const estado = r.feito_em ? (res.ok ? "ok" : "ruim") : "roda";
      const linha = el("div", "pedido " + estado);
      const meio = el("div");
      meio.appendChild(el("b", "", rotulos.get(r.id) || NOME_PEDIDO[r.acao] || r.acao));
      meio.appendChild(el("p", "", r.feito_em ? (res.ok ? "Feito." + (res.msg ? " " + res.msg : "") : "Não deu: " + (res.msg || "o PC não conseguiu."))
                                              : r.pego_em ? "O PC está fazendo…" : d.pc_online ? "Esperando o PC pegar…" : "Esperando o PC ligar (o V9 Vision precisa estar aberto)."));
      linha.append(el("i"), meio, el("time", "", new Date(r.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })));
      caixa.appendChild(linha);
    }
  }
  for (const r of d.respostas || []) {
    if (!esperando.has(r.id) || !r.feito_em) continue;
    const pedido = esperando.get(r.id);
    esperando.delete(r.id);
    guardarEsperando();
    const res = r.resultado || {};
    toast(res.ok ? `${pedido}: feito.${res.msg ? " " + res.msg : ""}` : `${pedido}: ${res.msg || "o PC não conseguiu."}`, !res.ok);
  }
}

async function atualizar() {
  if (!token) return;
  try {
    const d = await nuvem("cel_estado");
    ultimo = d;
    desenhar(d);
    respostas(d);
  } catch (e) {
    if (token) $("pc-txt").textContent = "sem internet";
  }
}

// ------------------------------------------------------------------ os pedidos
const PERIGOSOS = {
  parar: ["Parar este vídeo?", "O que está rodando é interrompido e a fila pausa. Depois você pode Continuar de onde parou.", "Parar"],
  tirar_da_fila: ["Tirar da fila?", "Este vídeo sai da fila e não começa. O projeto continua no PC.", "Tirar"],
  gerar_veo: ["Mandar as cenas de IA?", "O PC manda as cenas para o V9 Flow, que gasta créditos do seu Flow. O Flow precisa estar aberto e o CapCut fechado.", "Mandar"],
  refazer_youtube: ["Refazer o YouTube?", "O PC busca de novo os trechos do YouTube deste vídeo e remonta.", "Refazer"],
  refazer_fotos: ["Refazer as fotos?", "O PC busca de novo as fotos deste vídeo e remonta.", "Refazer"],
};
async function pedir(pedido, dados, rotulo) {
  if (ultimo && !ultimo.pc_online) toast("O PC parece desligado. O pedido fica guardado e roda quando ele voltar.");
  const d = await nuvem("cel_comando", { pedido, dados });
  esperando.set(d.id, rotulo);
  guardarEsperando();
  guardarRotulo(d.id, rotulo);
  if (!ultimo || ultimo.pc_online) toast(`${rotulo}: enviado ao PC…`);
  setTimeout(atualizar, 2500);
  setTimeout(atualizar, 7000);
  return d.id;
}
async function acao(k, projeto, rotulo) {
  const p = PERIGOSOS[k];
  if (p && !(await confirmar(p[0], p[1], p[2]))) return;
  try {
    if (k === "tirar_da_fila") await pedir("parar", { projeto }, rotulo);
    else if (k.startsWith("refazer_")) await pedir("refazer", { projeto, tipo: k.slice(8) }, rotulo);
    else await pedir(k, { projeto }, rotulo);
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ avisos (Web Push)
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
  if (sub && Notification.permission === "granted") {
    t.textContent = "Avisos ligados neste celular: vídeo pronto, parou com erro e MP4 pronto.";
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
    const { chave } = await nuvem("cel_vapid");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(chave) });
    const inscricao = sub.toJSON();
    await nuvem("cel_push", { inscricao });
    toast("Avisos ligados.");
    textoPush();
  } catch (e) { toast(e.message || "Não consegui ligar os avisos.", true); }
}
$("push-btn").onclick = () => ligarAvisos();

// o administrador é o app do dono, em adm/ (27/10: "esse aí é só meu, não é dos alunos, tem que ser app diferente")
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

// ------------------------------------------------------------------ começo
$("sair").onclick = async () => {
  if (!(await confirmar("Desligar do PC?", "Este celular para de ver e de comandar o V9 Vision do PC.", "Desligar"))) return;
  try { await nuvem("cel_sair"); } catch (_) { /* desliga aqui de qualquer jeito */ }
  desligado();
};
document.querySelectorAll("nav.abas button").forEach((b) => { b.onclick = () => aba(b.dataset.aba); });
document.querySelectorAll("[data-pedido]").forEach((b) => {
  b.onclick = () => pedir(b.dataset.pedido, {}, b.textContent).catch((e) => toast(e.message, true));
});
$("form-entrar").addEventListener("submit", (e) => { e.preventDefault(); entrar($("codigo").value); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && token) atualizar(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const hash = new URLSearchParams(location.hash.slice(1));
// o QR code do painel de licenças antigo (#a=) e os avisos antigos (#adm) vão para o app do dono
if (hash.get("a") || location.hash === "#adm") location.replace("adm/" + location.hash);
montar();
if (hash.get("c")) entrar(hash.get("c"));
else aba("videos");
