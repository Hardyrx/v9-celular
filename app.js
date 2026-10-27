// V9 Vision no celular (27/10/2026): lê o andamento que o PC manda para a nuvem e deixa pedidos que o PC busca e faz.
// O celular nunca fala direto com o PC. O token deste celular fica só aqui (e o hash dele na nuvem).
"use strict";
const NUVEM = "https://hrvrhaxllsbgiwkliuoc.supabase.co/functions/v1/celular";
const CHAVE_TOKEN = "v9cel_token";
const NUVEM_ADM = "https://hrvrhaxllsbgiwkliuoc.supabase.co/functions/v1/celular_adm";
const CHAVE_ADM = "v9cel_adm";
const $ = (id) => document.getElementById(id);

const guardado = {
  ler(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  gravar(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) { /* aba privada */ } },
};
let token = guardado.ler(CHAVE_TOKEN);
let tokenAdm = guardado.ler(CHAVE_ADM);
let ultimo = null;                 // a última resposta de cel_estado
let esperando = new Map();         // id do pedido -> texto do que foi pedido
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
// Dois acessos independentes: o do aluno/usuário (ligado pelo V9 Vision do PC) e o de administrador (ligado pelo painel
// de licenças). A aba Admin só existe com o segundo.
const TELAS = ["videos", "criar", "admin", "ajustes"];
let abaAtual = "videos";
function aba(nome) {
  if (nome === "admin" && !tokenAdm) nome = "videos";
  abaAtual = nome;
  const precisaPc = (nome === "videos" || nome === "criar") && !token;
  for (const t of TELAS) $("tela-" + t).hidden = precisaPc || t !== nome;
  $("tela-entrar").hidden = !precisaPc;
  document.querySelectorAll("nav.abas button").forEach((b) => {
    if (b.dataset.aba === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  if (nome === "admin") admAtualizar();
  window.scrollTo(0, 0);
}
function montar() {
  const algum = !!(token || tokenAdm);
  $("abas").hidden = !algum;
  $("pc").hidden = !token;
  document.querySelector('nav.abas [data-aba="admin"]').hidden = !tokenAdm;
  $("abas").style.setProperty("--n-abas", tokenAdm ? 4 : 3);
  $("ajuste-adm").hidden = !tokenAdm;
  $("sair").closest(".ajuste").hidden = !token;
  clearInterval(relogio);
  if (!algum) {
    for (const t of TELAS) $("tela-" + t).hidden = true;
    $("tela-entrar").hidden = false;
    return;
  }
  relogio = setInterval(() => {
    if (document.hidden) return;
    if (token) atualizar();
    if (tokenAdm && abaAtual === "admin") admAtualizar(true);
  }, 6000);
  if (token) atualizar();
  textoPush();
}
function desligado() {
  token = null;
  guardado.gravar(CHAVE_TOKEN, null);
  montar();
  aba(tokenAdm ? "admin" : "videos");
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
  opcoesCriar(e.criar);
}

function respostas(d) {
  for (const r of d.respostas || []) {
    if (!esperando.has(r.id) || !r.feito_em) continue;
    const pedido = esperando.get(r.id);
    esperando.delete(r.id);
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
  if (!ultimo || ultimo.pc_online) toast(`${rotulo}: enviado ao PC…`);
  setTimeout(atualizar, 2500);
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

// ------------------------------------------------------------------ criar vídeo
let opcoesFeitas = "";
function encher(sel, itens, manter) {
  const antes = sel.value;
  sel.textContent = "";
  for (const it of itens) {
    const o = document.createElement("option");
    o.value = it.id;
    o.textContent = it.nome || it.id || "Automático";
    sel.appendChild(o);
  }
  if (manter && [...sel.options].some((o) => o.value === antes)) sel.value = antes;
}
function opcoesCriar(c) {
  if (!c) return;
  const marca = JSON.stringify(c);
  if (marca === opcoesFeitas) return;
  opcoesFeitas = marca;
  encher($("c-canal"), c.canais && c.canais.length ? c.canais : [{ id: "", nome: "O padrão do PC" }], true);
  encher($("c-pipeline"), c.pipelines && c.pipelines.length ? c.pipelines : [{ id: "", nome: "Automático" }], true);
  encher($("c-nicho"), c.nichos && c.nichos.length ? c.nichos : [{ id: "", nome: "Automático" }], true);
  $("c-youtube-l").hidden = !c.youtube;
}
$("c-roteiro").addEventListener("input", (e) => {
  const n = e.target.value.trim().length;
  $("c-conta").textContent = n.toLocaleString("pt-BR") + " letras" + (n && n < 200 ? " (mínimo 200)" : "");
});
$("form-criar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = $("c-nome").value.trim(), roteiro = $("c-roteiro").value.trim();
  if (!/^[\w\- À-ÿ]{2,80}$/.test(nome)) { toast("Nome do projeto: só letras, números, espaço, _ e - (2 a 80).", true); return; }
  if (roteiro.length < 200) { toast("O roteiro está curto demais (mínimo 200 letras).", true); return; }
  const dados = { nome, roteiro, canal: $("c-canal").value, pipeline: $("c-pipeline").value, nicho: $("c-nicho").value,
                  rapido: $("c-rapido").checked, logo_emissora: $("c-logo").checked,
                  youtube: !$("c-youtube-l").hidden && $("c-youtube").checked };
  if ($("c-cerebro").value) dados.cerebro = $("c-cerebro").value;
  const b = e.submitter || e.target.querySelector("button[type=submit]");
  b.disabled = true;
  try {
    await pedir("criar_video", dados, "Criar " + nome);
    $("c-nome").value = "";
    $("c-roteiro").value = "";
    $("c-conta").textContent = "0 letras";
    aba("videos");
  } catch (err) { toast(err.message, true); }
  b.disabled = false;
});

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
// uma inscrição só por celular, mandada para os dois acessos que estiverem ligados
async function ligarAvisos() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Sem permissão, os avisos não chegam.", true); textoPush(); return; }
    const { chave } = token ? await nuvem("cel_vapid") : await admNuvem("cel_vapid");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(chave) });
    const inscricao = sub.toJSON();
    if (token) await nuvem("cel_push", { inscricao });
    if (tokenAdm) { await admNuvem("adm_push", { inscricao }); guardado.gravar("v9cel_adm_push", "1"); }
    toast("Avisos ligados.");
    textoPush();
    if (tokenAdm) admTextoPush();
  } catch (e) { toast(e.message || "Não consegui ligar os avisos.", true); }
}
$("push-btn").onclick = () => ligarAvisos();

// ------------------------------------------------------------------ ADMINISTRADOR (só no celular ligado pelo painel)
async function admNuvem(acao, campos = {}) {
  const r = await fetch(NUVEM_ADM, { method: "POST", headers: { "content-type": "application/json" },
                                     body: JSON.stringify({ acao, token: tokenAdm, ...campos }) });
  const d = await r.json().catch(() => ({ ok: false, motivo: "sem_resposta" }));
  if (d.motivo === "desconectado") {
    tokenAdm = null;
    guardado.gravar(CHAVE_ADM, null);
    montar();
    aba("videos");
    throw new Error("O administrador foi desligado deste celular pelo painel.");
  }
  if (!d.ok) throw new Error(MOTIVOS[d.motivo] || (d.detalhe ? "Erro: " + d.detalhe : "Não deu certo agora. Tente de novo."));
  return d;
}
async function entrarAdm(codigo) {
  codigo = String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  try {
    const d = await admNuvem("cel_entrar_adm", { codigo, aparelho: APARELHO });
    tokenAdm = d.token;
    guardado.gravar(CHAVE_ADM, tokenAdm);
    history.replaceState(null, "", location.pathname);
    toast("Administrador ligado neste celular.");
    montar();
    aba("admin");
  } catch (e) { toast(e.message, true); montar(); aba("videos"); }
}

let painel = null;          // a última lista (membros, dispositivos, eventos)
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

const dataBr = (iso) => iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR") : "sem data";
const haQuanto = (iso) => {
  if (!iso) return "nunca";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min" : s < 86400 ? Math.round(s / 3600) + " h" : Math.round(s / 86400) + " d";
};
const nomeApp = (a) => ({ flow: "V9 Flow", lite: "V9 Lite", vision: "V9 Vision", celular_adm: "Celular adm" })[a] || a || "";
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
    linha.append(el("time", "", new Date(e.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })),
                 el("span", "", `${e.quem || "—"} · ${nomeApp(e.app)} · ${e.acao || ""}${e.resultado ? " · " + e.resultado : ""}`));
    return linha;
  }));
  admTextoPush();
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

async function admTextoPush() {
  const caixa = $("adm-avisos-ajuda");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { caixa.hidden = true; return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  caixa.hidden = !!(sub && Notification.permission === "granted" && guardado.ler("v9cel_adm_push") === "1")
    || Notification.permission === "denied";
}
$("adm-push-btn").onclick = () => ligarAvisos();
$("sair-adm").onclick = async () => {
  if (!(await confirmar("Desligar o administrador?", "Este celular para de liberar e editar PCs. Para ligar de novo, use o QR code do painel.", "Desligar"))) return;
  try { await admNuvem("adm_sair"); } catch (_) { /* desliga aqui de qualquer jeito */ }
  tokenAdm = null;
  guardado.gravar(CHAVE_ADM, null);
  montar();
  aba("videos");
};

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
montar();
if (hash.get("a")) entrarAdm(hash.get("a"));
else if (hash.get("c")) entrar(hash.get("c"));
else aba(location.hash === "#adm" && tokenAdm ? "admin" : token || !tokenAdm ? "videos" : "admin");
