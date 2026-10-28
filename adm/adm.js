// V9 ADMIN no celular (27/10/2026, dono: "esse aí é só meu, não é dos alunos, tem que ser app diferente"): o app do
// DONO, separado do app dos alunos (que fica em ../). Liga pelo QR code do painel de licenças (código de 5 min); o
// token deste celular fica só aqui (e o hash na nuvem). Abas: PCs (liberar, bloquear, chaves, validade, IP), Membros
// (28/10, dono: "tudo igual ao painel": cadastrar, nova senha, V9 Flow, nome, PCs, verificador; o cofre do Oráculo é
// aberto e cifrado AQUI, em cofre.js), Publicar (Flow e Vision pelos workflows do GitHub), Registro (logs e suspeitas
// do ÍCARO) e Ajustes. Apagar membro, apagar PC e zerar o ÍCARO continuam só no painel do PC (dono, 28/10).
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
  pedido_invalido: "Pedido inválido. Confira os campos e tente de novo.",
  cofre_sem_token: "Falta o token do cofre na nuvem (veja as instruções na aba Membros).",
  ja_no_cofre: "Esse login já está no cofre. Use Nova senha na linha dele.",
  fora_do_cofre: "Esse membro não está no cofre do Oráculo. Use Criar senha na linha dele primeiro.",
  par_diferente: "As chaves deste membro mudaram no meio. Feche e abra o cofre e tente de novo.",
  flow_proibido: "Esse login é proibido no V9 Flow.",
  flow_ultimo: "A lista do V9 Flow não pode ficar vazia.",
  cofre_ocupado: "O cofre estava sendo gravado por outro lugar. Tente de novo.",
  cofre_formato: "O cofre do Oráculo não está no formato esperado. Confira pelo painel do PC.",
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
const TELAS = ["pcs", "membros", "publicar", "registro", "ajustes"];
let abaAtual = "pcs";
function aba(nome) {
  abaAtual = nome;
  for (const t of TELAS) $("tela-" + t).hidden = !tokenAdm || t !== nome;
  $("tela-entrar").hidden = !!tokenAdm;
  document.querySelectorAll("nav.abas button").forEach((b) => {
    if (b.dataset.aba === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  if (nome === "pcs" || nome === "membros" || nome === "registro") admAtualizar();
  if (nome === "membros") cofreLer();
  if (nome === "registro") icaroAtualizar();
  if (nome === "publicar") pubAtualizar();
  window.scrollTo(0, 0);
}
function montar() {
  $("abas").hidden = !tokenAdm;
  clearInterval(relogio);
  if (!tokenAdm) { for (const t of TELAS) $("tela-" + t).hidden = true; $("tela-entrar").hidden = false; return; }
  relogio = setInterval(() => {
    if (document.hidden) return;
    if (abaAtual === "pcs" || abaAtual === "membros" || abaAtual === "registro") admAtualizar(true);
    if (abaAtual === "publicar") pubAtualizar(true);
  }, 8000);
  textoPush();
}
function desligado() {
  cofreFechar();
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
  const a = el("div", "acoes");
  if (!x.membro_id) {
    for (const [p, r] of [["1m", "+1 mês"], ["3m", "+3 meses"], ["1a", "+1 ano"]]) {
      const nova = somarPlano(p, x.validade);
      a.appendChild(botao(r, "", () => admPedir("dispositivo_codigo", { id: x.id, validade: nova }, `Validade: ${dataBr(nova)}.`)));
    }
  }
  a.appendChild(botao(x.ip ? "IP " + x.ip : "IP", "", () => trocarIp(x)));
  c.appendChild(a);
  return c;
}
function trocarIp(x) {
  const novo = prompt(`IP registrado de ${x.codigo}. Deixe vazio para o próximo acesso registrar o IP dele.`, x.ip || "");
  if (novo === null) return;
  admPedir("dispositivo_ip", { id: x.id, ip: novo.trim() }, novo.trim() ? "IP atualizado." : "IP limpo: o próximo acesso registra.");
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
  const pcs = ds.filter((x) => !pede.includes(x) && casa(x.nome, x.nome_pc, x.codigo, x.membro)).slice(0, 80);
  $("l-pcs").replaceChildren(...pcs.map(cartaoPc));
  membrosDesenhar();
  logsDesenhar();
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

// ------------------------------------------------------------------ MEMBROS e o COFRE DO ORÁCULO (28/10)
// A chave de dados (K) e a do Flow (KF) são abertas aqui com a senha de administrador e ficam só na memória desta tela.
// A nuvem recebe a entrada do membro já cifrada (cofre.js) e confere o formato antes de gravar no GitHub.
let cofre = null;            // { K, KF, admin, adminId, idK, idKF, logins } com o cofre aberto
let lista = null;            // { configurado, oracle, flow, chave_vision, chave_flow } (só coisa cifrada)
let cofreFechouEm = 0;
function cofreFechar() {
  cofre = null;
  if ($("cofre-senha")) $("cofre-senha").value = "";
  cofreDesenhar();
}
async function cofreLer(quieto = true) {
  if (!tokenAdm) return;
  try {
    lista = await admNuvem("adm_cofre");
    if (cofre && lista.oracle) cofre.logins = await V9Cofre.logins(lista.oracle, cofre.K);
  } catch (e) { if (!quieto) toast(e.message, true); }
  cofreDesenhar();
  membrosDesenhar();
}
function cofreErroChave() {   // a chave aberta não é a do V9 Vision publicado (23/10, mesma trava do painel)
  return cofre && lista && lista.chave_vision && lista.chave_vision !== cofre.idK
    ? "A chave do cofre não é a do V9 Vision publicado. Feche e abra o cofre de novo; se continuar, publique o V9 Vision." : "";
}
function flowPronto() {
  if (!cofre || !cofre.KF) return "este cofre não abriu a chave do V9 Flow (o seu login precisa estar na lista do Flow)";
  if (lista && lista.chave_flow && lista.chave_flow !== cofre.idKF) return "a chave do V9 Flow foi trocada no publicar; feche e abra o cofre de novo";
  return "";
}
function cofreDesenhar() {
  const sem = !!(lista && lista.configurado === false);
  $("cofre-sem").hidden = !sem;
  $("cofre-caixa").hidden = sem;
  $("form-cofre").hidden = !!cofre;
  $("cofre-fechar").hidden = !cofre;
  $("novo-membro").disabled = sem || !!cofreErroChave();
  const t = $("cofre-txt");
  if (!cofre) {
    t.textContent = "Para cadastrar, criar senha e liberar o V9 Flow, abra o cofre com o seu login e a senha de administrador. A senha fica só nesta tela e some quando você fecha o app.";
    return;
  }
  const n = lista && lista.oracle ? Object.keys(lista.oracle.membros || {}).length : 0;
  const f = flowPronto();
  t.textContent = `Aberto como ${cofre.admin} · ${n} no cofre · V9 Flow ${f ? "travado: " + f : "pronto"}`;
  const erro = cofreErroChave();
  if (erro) t.textContent += ". " + erro;
}
$("form-cofre").addEventListener("submit", async (e) => {
  e.preventDefault();
  const login = $("cofre-login").value.trim(), senha = $("cofre-senha").value;
  if (!login || !senha) { toast("Digite o login e a senha de administrador.", true); return; }
  if (!(await V9Cofre.suportado())) { toast("Este celular não tem a criptografia que o cofre usa. Atualize o sistema (iPhone: iOS 17 ou mais novo).", true); return; }
  const b = $("cofre-abrir");
  b.disabled = true;
  b.textContent = "Abrindo…";
  try {
    if (!lista || !lista.oracle) lista = await admNuvem("adm_cofre");
    if (lista.configurado === false) return;
    const K = await V9Cofre.abreMembro(lista.oracle, login, senha);
    if (!K) { toast("Login ou senha do cofre errados.", true); return; }
    const KF = lista.flow ? await V9Cofre.abreMembro(lista.flow, login, senha) : null;
    cofre = { K, KF, admin: login, adminId: await V9Cofre.idLogin(login), idK: await V9Cofre.idChave(K),
              idKF: KF ? await V9Cofre.idChave(KF) : "", logins: await V9Cofre.logins(lista.oracle, K) };
    $("cofre-senha").value = "";
    toast("Cofre aberto.");
  } catch (er) { toast(er.message, true); }
  finally { b.disabled = false; b.textContent = "Abrir o cofre"; cofreDesenhar(); membrosDesenhar(); }
});
$("cofre-fechar").onclick = () => { cofreFechar(); toast("Cofre fechado."); };
// fora do app por mais de 5 minutos: o cofre fecha sozinho
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cofreFechouEm = Date.now();
  else if (cofre && cofreFechouEm && Date.now() - cofreFechouEm > 5 * 60e3) { cofreFechar(); toast("O cofre fechou (app em segundo plano)."); }
});
function exigeCofre() {
  if (!cofre) { if (abaAtual !== "membros") aba("membros"); toast("Abra o cofre primeiro (login e senha de administrador).", true); return false; }
  const erro = cofreErroChave();
  if (erro) { toast(erro, true); return false; }
  return true;
}
async function gravarCofre(dados) {
  const r = await admNuvem("adm_cofre_gravar", dados);
  await cofreLer();
  return r;
}
function mostrarEntrega(login, senha) {
  const texto = `Login: ${login}\nSenha: ${senha}`;
  $("entrega").textContent = texto;
  $("entrega-copiar").onclick = async () => {
    try { await navigator.clipboard.writeText(texto); toast("Copiado."); } catch (_) { toast("Não consegui copiar: segure o texto para copiar.", true); }
  };
  $("entrega-ok").onclick = () => { $("entrega").textContent = ""; $("dlg-entrega").close(); };
  $("dlg-entrega").showModal();
}
// entrega a chave do Flow na chave pública do membro (o mesmo par do Oráculo)
async function flowLiberar(login, id, eOracle) {
  const f = flowPronto();
  if (f) throw new Error(f.charAt(0).toUpperCase() + f.slice(1) + ".");
  const entrada = await V9Cofre.entradaFlow(cofre.KF, eOracle, login, id);
  await gravarCofre({ lista: "flow", login, entrada });
}

$("novo-membro").onclick = () => {
  if (!exigeCofre()) return;
  const d = $("dlg-novo");
  $("form-novo").reset();
  $("novo-voltar").onclick = () => d.close();
  d.showModal();
  $("novo-login").focus();
};
$("form-novo").onsubmit = async (e) => {
  e.preventDefault();
  const login = $("novo-login").value.trim(), nome = $("novo-nome").value.trim() || login, plano = $("novo-plano").value;
  const querFlow = $("novo-flow").checked;
  if (login.length < 3) { toast("O login precisa de pelo menos 3 letras.", true); return; }
  if (!exigeCofre()) return;
  const id = await V9Cofre.idLogin(login);
  if ((lista.oracle.membros || {})[id]) { toast(MOTIVOS.ja_no_cofre, true); return; }
  const b = $("novo-ok");
  b.disabled = true;
  b.textContent = "Cadastrando…";
  try {
    await admNuvem("adm_acao", { pedido: "membro_criar", dados: { login, nome, plano } });     // 1) a licença
    const senha = V9Cofre.senhaForte();                                                            // 2) o cofre
    const ent = await V9Cofre.novoMembro(cofre.K, login, senha, Number(lista.oracle.iter || V9Cofre.ITER));
    try { await gravarCofre({ lista: "oracle", login, entrada: ent[id] }); }
    catch (er) { $("dlg-novo").close(); toast(`A licença foi criada, mas o cofre não: ${er.message} Use Criar senha na linha dele.`, true); admAtualizar(true); return; }
    let aviso = "", ruim = false;
    if (querFlow) {                                                                                // 3) o V9 Flow
      try { await flowLiberar(login, id, ent[id]); aviso = " V9 Flow liberado."; }
      catch (er) { aviso = " O V9 Flow não foi liberado: " + er.message; ruim = true; }
    }
    $("dlg-novo").close();
    mostrarEntrega(login, senha);
    toast("Membro cadastrado (licença + cofre)." + aviso + " A voz de boas-vindas sai quando o painel do PC abrir.", ruim);
    admAtualizar(true);
  } catch (er) { toast(er.message, true); }
  finally { b.disabled = false; b.textContent = "Cadastrar"; }
};

async function loginDe(m) {   // o login não fica na licença: vem da etiqueta do cofre (ou é digitado e conferido)
  if (cofre.logins[m.id]) return cofre.logins[m.id];
  const l = prompt(`Login de ${m.nome} (o mesmo que ele usa para entrar):`, "");
  if (l === null) return null;
  if ((await V9Cofre.idLogin(l)) !== m.id) { toast("Esse login não é o deste membro.", true); return null; }
  return l.trim();
}
async function novaSenha(m) {
  if (!exigeCofre()) return;
  const noCofre = !!(lista.oracle.membros || {})[m.id];
  if (!(await confirmar(noCofre ? "Nova senha?" : "Criar senha no cofre?",
    noCofre ? `${m.nome} vai precisar da senha nova para entrar. A antiga para de valer.` : `${m.nome} tem licença, mas ainda não está no cofre do Oráculo.`,
    noCofre ? "Trocar a senha" : "Criar senha"))) return;
  const login = await loginDe(m);
  if (!login) return;
  try {
    const senha = V9Cofre.senhaForte();
    const ent = await V9Cofre.novoMembro(cofre.K, login, senha, Number(lista.oracle.iter || V9Cofre.ITER));
    await gravarCofre({ lista: "oracle", login, entrada: ent[m.id], redefinir: true });
    let aviso = "", ruim = false;
    if (lista.flow && (lista.flow.membros || {})[m.id]) {      // o par de chaves mudou: a entrada do Flow vai junto
      try { await flowLiberar(login, m.id, ent[m.id]); aviso = " V9 Flow atualizado."; }
      catch (er) { aviso = " Atenção: o V9 Flow dele não foi atualizado (" + er.message + ")."; ruim = true; }
    }
    mostrarEntrega(login, senha);
    toast((noCofre ? "Senha nova gravada." : "Senha criada.") + aviso, ruim);
  } catch (er) { toast(er.message, true); }
}
async function trocarFlow(m, tem) {
  if (!exigeCofre()) return;
  try {
    if (tem) {
      if (m.id === cofre.adminId) { toast("Você não pode sair da lista do V9 Flow: é o seu login que publica.", true); return; }
      if (!(await confirmar("Tirar o V9 Flow?", `${m.nome} perde o acesso ao V9 Flow.`, "Tirar"))) return;
      await gravarCofre({ lista: "flow", id: m.id, tirar: true });
      toast("V9 Flow tirado.");
    } else {
      const e = (lista.oracle.membros || {})[m.id];
      if (!e) { toast(MOTIVOS.fora_do_cofre, true); return; }
      const login = cofre.logins[m.id];
      if (!login) { toast("Não consegui ler o login deste membro no cofre.", true); return; }
      await flowLiberar(login, m.id, e);
      toast(`V9 Flow liberado para ${m.nome}.`);
    }
  } catch (er) { toast(er.message, true); }
}
function cartaoMembro(m) {
  const noCofre = !!(lista && lista.oracle && (lista.oracle.membros || {})[m.id]);
  const temFlow = !!(lista && lista.flow && (lista.flow.membros || {})[m.id]);
  const c = el("article", "pc-card" + (m.status === "ativo" ? "" : " apagado"));
  const login = cofre && cofre.logins[m.id];
  c.append(el("h4", "", m.nome || "Membro"),
           el("p", "info", `${login ? login + " · " : ""}${m.status === "ativo" ? "ativo" : "bloqueado"} · vale até ${m.validade ? dataBr(m.validade) : "sempre"} · até ${m.max_dispositivos || 1} PC(s)`));
  if (lista && lista.oracle) {
    const chips = el("div");
    chips.append(el("span", "chip " + (noCofre ? "sim" : "ruim"), noCofre ? "no cofre" : "fora do cofre"));
    c.appendChild(chips);
  }
  const ch = el("div", "chaves");
  ch.append(
    chave(m.status === "ativo" ? "Ativo" : "Bloqueado", m.status === "ativo", async () => {
      if (m.status === "ativo" && !(await confirmar("Bloquear este membro?", `${m.nome} perde o acesso em todos os PCs.`, "Bloquear"))) return;
      admPedir("membro_atualizar", { id: m.id, status: m.status === "ativo" ? "bloqueado" : "ativo" }, "Membro atualizado.");
    }),
    chave("ÍCARO", m.icaro, () => admPedir("membro_atualizar", { id: m.id, icaro: !m.icaro }, "ÍCARO trocado.")));
  if (lista && lista.flow) ch.appendChild(chave("V9 Flow", temFlow, () => trocarFlow(m, temFlow)));
  c.appendChild(ch);
  const a = el("div", "acoes");
  for (const [p, r] of [["1m", "+1 mês"], ["3m", "+3 meses"], ["1a", "+1 ano"]]) {
    a.appendChild(botao(r, "", () => admPedir("membro_atualizar", { id: m.id, plano: p }, "Plano renovado.")));
  }
  a.append(
    botao("Nome", "", () => {
      const n = prompt("Nome do membro:", m.nome || "");
      if (n !== null && n.trim()) admPedir("membro_atualizar", { id: m.id, nome: n.trim() }, "Nome trocado.");
    }),
    botao("PCs", "", () => {
      const t = prompt("Quantos PCs este membro pode ativar (1 a 20)?", String(m.max_dispositivos || 1));
      if (t === null) return;
      const n = Number(t);
      if (Number.isInteger(n) && n >= 1 && n <= 20) admPedir("membro_atualizar", { id: m.id, max_dispositivos: n }, `Até ${n} PC(s).`);
      else toast("Use um número de 1 a 20.", true);
    }),
    botao(noCofre || !lista ? "Nova senha" : "Criar senha", "", () => novaSenha(m)));
  if (m.verificador) {
    a.appendChild(botao("Resetar verificador", "", async () => {
      if (await confirmar("Resetar o verificador?", `${m.nome} volta a cadastrar o verificador no próximo acesso. Use se ele trocou a senha.`, "Resetar"))
        admPedir("membro_atualizar", { id: m.id, resetar_verificador: true }, "Verificador resetado.");
    }));
  }
  c.appendChild(a);
  return c;
}
function membrosDesenhar() {
  if (!painel) return;
  const q = $("mem-busca").value.trim().toLowerCase();
  const casa = (m) => !q || [m.nome, cofre && cofre.logins[m.id]].some((v) => String(v || "").toLowerCase().includes(q));
  const ms = (painel.membros || []).filter(casa).sort((a, b) => String(b.criado_em || "").localeCompare(String(a.criado_em || ""))).slice(0, 80);
  $("l-membros").replaceChildren(...(ms.length ? ms.map(cartaoMembro) : [el("div", "vazio", q ? "Nenhum membro com esse nome." : "Nenhum membro ainda.")]));
}
$("mem-busca").addEventListener("input", membrosDesenhar);

// ------------------------------------------------------------------ REGISTRO: logs e suspeitas do ÍCARO
const LG_TIPOS = { "ativar|ok": "Login / ativação", "renovar|ok": "Renovação de licença", "baixar|ok": "Atualização baixada",
  "saudacoes|ok": "Saudação baixada", "codigo|codigo": "Pedido por código", "ativar|verificador_errado": "Falha: senha errada" };
const logTipo = (e) => LG_TIPOS[`${e.acao}|${e.resultado}`] || (e.resultado === "ip_diferente" ? "Bloqueio por IP"
  : e.resultado === "ok" ? (e.acao || "evento") : e.resultado === "codigo" ? "Pedido por código"
  : String(e.resultado || "").startsWith("ok ") ? `${e.acao || "evento"} · ${String(e.resultado).slice(3)}`
  : `Falha: ${String(e.resultado || "?").replace(/_/g, " ")}`);
const logFalha = (e) => e.resultado && e.resultado !== "ok" && e.resultado !== "codigo" && !String(e.resultado).startsWith("ok ");
function logsDesenhar() {
  if (!painel) return;
  const q = $("log-busca").value.trim().toLowerCase();
  const soFalha = $("log-falhas").getAttribute("aria-pressed") === "true";
  const evs = (painel.eventos || []).filter((e) => (!soFalha || logFalha(e)) &&
    (!q || [e.quem, nomeApp(e.app), e.acao, e.resultado, logTipo(e)].some((v) => String(v || "").toLowerCase().includes(q))));
  $("l-eventos").replaceChildren(...(evs.length ? evs.map((e) => {
    const linha = el("div", "evento" + (logFalha(e) ? " falha" : ""));
    linha.append(el("time", "", quando(e.em)), el("span", "", `${e.quem || "—"} · ${nomeApp(e.app)} · ${logTipo(e)}`));
    return linha;
  }) : [el("div", "vazio", "Nada por aqui.")]));
}
$("log-busca").addEventListener("input", logsDesenhar);
$("log-falhas").onclick = (e) => {
  const b = e.currentTarget;
  b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  logsDesenhar();
};

const IC_MOTIVO = {
  lista_diferente: "Lista de profissões do PC diferente da do servidor",
  xp_salto: "XP subiu sem explicação (salto impossível)",
  assinatura_invalida: "Assinatura inválida (arquivo ou resposta adulterados)",
  outro_computador: "Lista de profissões de outro computador",
  xp_acima_do_teto: "Mandou mais XP do que o teto do dia",
  legado_acima_do_credito: "Aluno antigo: profissões além do crédito (ficaram trancadas)",
  legado_xp_absurdo: "Aluno antigo: XP impossível no PC (não foi importado)",
};
let icaro = null;
async function icaroAtualizar(quieto = true) {
  try {
    icaro = await admNuvem("adm_icaro", { todas: $("ic-todas").getAttribute("aria-pressed") === "true" });
  } catch (e) { if (!quieto) toast(e.message, true); }
  icaroDesenhar();
}
function icaroDesenhar() {
  const ss = (icaro && icaro.suspeitas) || [];
  const abertas = ss.filter((s) => !s.resolvido).length;
  $("ic-cont").textContent = icaro ? (abertas ? `· ${abertas} aberta(s)` : "· nenhuma aberta") : "";
  $("l-icaro").replaceChildren(...(ss.length ? ss.map((s) => {
    const m = s.membro_id && painel ? (painel.membros || []).find((x) => x.id === s.membro_id) : null;
    const pc = !s.membro_id && s.codigo && painel ? (painel.dispositivos || []).find((x) => !x.membro_id && x.codigo === s.codigo) : null;
    const c = el("article", "pc-card" + (s.resolvido ? " apagado" : ""));
    c.append(el("h4", "", (m && m.nome) || (pc && (pc.nome || pc.nome_pc)) || s.nome || "—"),
             el("p", "info", `${quando(s.em)} · ${s.membro_id ? "membro" : "PC por código"}${s.codigo ? " · " + s.codigo : ""}`),
             el("p", "info", `${IC_MOTIVO[s.motivo] || s.motivo} · ${s.origem === "servidor" ? "detectado pelo servidor" : "detectado pelo app"}${s.canal ? " · canal " + s.canal : ""}`));
    if (s.detalhe) c.appendChild(el("p", "info", s.detalhe));
    const a = el("div", "acoes");
    if (!s.resolvido) a.appendChild(botao("Marcar como resolvido", "", async () => {
      try { await admNuvem("adm_acao", { pedido: "icaro_suspeita_resolver", dados: { id: s.id, resolvido: true } }); toast("Marcada como resolvida."); icaroAtualizar(); }
      catch (e) { toast(e.message, true); }
    }));
    if (m && m.status === "ativo") a.appendChild(botao("Bloquear licença", "perigo", async () => {
      if (await confirmar("Bloquear a licença?", `${m.nome} perde o acesso em todos os PCs.`, "Bloquear"))
        admPedir("membro_atualizar", { id: m.id, status: "bloqueado" }, "Licença bloqueada.");
    }));
    if (pc && !pc.bloqueado) a.appendChild(botao("Bloquear PC", "perigo", () => bloquearPc(pc)));
    if (a.childNodes.length) c.appendChild(a);
    return c;
  }) : [el("div", "vazio", "Nenhuma suspeita. Tudo confere com o servidor.")]));
}
$("ic-todas").onclick = (e) => {
  const b = e.currentTarget;
  b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  icaroAtualizar(false);
};

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
