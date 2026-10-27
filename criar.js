// V9 Vision no celular · CRIAR VÍDEO (27/10/2026, dono: "tá bem incompleto o app, não dá pra subir áudio, as
// configurações são limitadas"). A tela é a /novo do Vision do PC, lida lá (celular.py: esquema_de_criar) e desenhada
// aqui: narração (áudio + legenda, ou Fish com a voz), material da pessoa, fontes, ULTRA, impacto, modo rápido, logo da
// emissora, Pipeline/Nicho/Narração/Tom/Estilo das imagens, o cérebro, todos os Ajustes, "Só a introdução" e
// "Comparar cérebros". Os arquivos sobem para o depósito privado da nuvem; o PC baixa, cria o projeto e apaga.
"use strict";
const LIMITE_ARQ = 50 * 1024 * 1024;
const PECAS_ULTRA = ["veo_auto", "tomada_unica", "abertura", "cartelas", "trilha", "normalizar_voz", "inscreva"];
let esquema = null;
let marcaEsquema = "";
const mexeu = new Set();            // os campos que a pessoa mexeu (vão em padrao_mao, como na tela do PC)
const C = { narr: "audio", fontes: {}, ultra: false, impacto: "", topo: {}, receita: {}, tomLivre: "", cerebro: "",
            ajustes: {}, voz: "", vozCodigo: "", arquivos: { audio: null, srt: null, material: [] } };

// ------------------------------------------------------------------ pedacinhos de tela
function seg(caixa, itens, atual, aoEscolher) {
  caixa.textContent = "";
  for (const it of itens) {
    const b = el("button", "", it.nome);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(it.id === atual));
    b.onclick = () => aoEscolher(it.id);
    caixa.appendChild(b);
  }
}
function marcaCaixa(rotulo, ajuda, ligado, aoMudar, desligado) {
  const l = el("label", "marca" + (desligado ? " desligada" : ""));
  const i = document.createElement("input");
  i.type = "checkbox";
  i.checked = !!ligado;
  i.disabled = !!desligado;
  i.onchange = () => aoMudar(i.checked);
  const t = el("span", "", rotulo);
  if (ajuda) t.appendChild(el("small", "", ajuda));
  l.append(i, t);
  return l;
}
function dobra(titulo, resumo, corpo, aberta) {
  const d = el("details", "dobra");
  if (aberta) d.open = true;
  const s = el("summary", "", titulo);
  if (resumo !== null) s.appendChild(el("em", "", resumo));
  const c = el("div", "corpo");
  c.appendChild(corpo);
  d.append(s, c);
  return d;
}
const nomeDe = (lista, id) => ((lista || []).find((x) => x.id === id) || {}).nome || "";

// ------------------------------------------------------------------ o esquema que o PC manda
function criarTela(c) {
  const e = c && c.esquema;
  $("criar-espera").hidden = !!e;
  $("form-criar").hidden = !e;
  if (!e) return;
  const marca = JSON.stringify(e);
  if (marca === marcaEsquema) return;
  marcaEsquema = marca;
  esquema = e;
  padroes(e);
  desenharCriar();
}

// o padrão da tela do PC, sem desfazer o que a pessoa já mexeu aqui
function padroes(e) {
  for (const f of e.fontes || []) if (!mexeu.has(f.campo)) C.fontes[f.campo] = !!(f.ok && f.on);
  if (!C.impacto || !(e.impacto || []).some((x) => x.id === C.impacto)) C.impacto = ((e.impacto || [])[0] || {}).id || "normal";
  for (const t of e.topo || []) if (!mexeu.has(t.nome)) C.topo[t.nome] = !!t.on;
  for (const [k, itens] of Object.entries(e.receita || {})) {
    if (mexeu.has("formato_" + k) && itens.some((x) => x.id === C.receita[k])) continue;
    C.receita[k] = (itens.find((x) => x.padrao) || itens[0] || { id: "" }).id;
  }
  if (!mexeu.has("modo_cerebro") || !(e.cerebro || []).some((x) => x.id === C.cerebro)) {
    C.cerebro = ((e.cerebro || []).find((x) => x.on) || (e.cerebro || [])[0] || { id: "" }).id;
  }
  for (const g of e.ajustes || []) {
    for (const f of g.campos) {
      if (mexeu.has(f.nome) && f.nome in C.ajustes) continue;
      C.ajustes[f.nome] = f.tipo === "checkbox" ? !!f.on : String(f.valor ?? "");
    }
  }
}

function mudar(nome, aplicar) {
  mexeu.add(nome);
  aplicar();
  desenharCriar();
}

// ------------------------------------------------------------------ desenha tudo de novo (a tela é pequena)
function desenharCriar() {
  const e = esquema;
  if (!e) return;
  const rolagem = window.scrollY;
  // 01 · narração
  seg($("c-narr"), [{ id: "audio", nome: "Tenho o áudio" }, { id: "fish", nome: "Narrar com o Fish" }], C.narr, (v) => { C.narr = v; desenharCriar(); });
  $("c-bloco-audio").hidden = C.narr !== "audio";
  $("c-bloco-fish").hidden = C.narr !== "fish";
  vozes(e.fish || {});
  $("c-material-d").hidden = !e.material_pessoa;
  // 02 · fontes
  const caixa = $("c-fontes");
  caixa.textContent = "";
  for (const f of e.fontes || []) {
    const b = el("button", "fonte");
    b.type = "button";
    b.disabled = !f.ok;
    b.title = f.ok ? (f.dica || "") : "Sem chave ou desligado no PC";
    b.setAttribute("aria-pressed", String(!!C.fontes[f.campo]));
    b.append(el("b", "", f.nome), el("small", "", f.sub || ""));
    b.onclick = () => mudar(f.campo, () => { C.fontes[f.campo] = !C.fontes[f.campo]; });
    caixa.appendChild(b);
  }
  if (e.ultra) {
    const u = el("button", "fonte ultra");
    u.type = "button";
    u.setAttribute("aria-pressed", String(C.ultra));
    u.append(el("b", "", "⚡ " + e.ultra.nome), el("small", "", e.ultra.sub || ""));
    u.title = e.ultra.dica || "";
    u.onclick = () => ultra(!C.ultra);
    caixa.appendChild(u);
  }
  const on = (k) => !!C.fontes[k];
  const semEstoque = !["src_pexels", "src_pixabay", "src_coverr", "src_freepik", "src_acervo"].some(on);
  $("c-fontes-aviso").hidden = !(semEstoque && on("usar_youtube") && !on("usar_veo") && !on("usar_fotos"));
  seg($("c-impacto"), (e.impacto || []).map((x) => ({ id: x.id, nome: x.id === "normal" ? "Normal" : x.id === "mais" ? "Mais" : x.id === "muito" ? "Muito" : x.nome })),
      C.impacto, (v) => mudar("impacto", () => { C.impacto = v; }));
  const topo = $("c-topo");
  topo.textContent = "";
  for (const t of e.topo || []) topo.appendChild(marcaCaixa(t.rotulo, t.ajuda, C.topo[t.nome], (v) => mudar(t.nome, () => { C.topo[t.nome] = v; })));
  receita(e);
  seg($("c-cerebro"), e.cerebro || [], C.cerebro, (v) => mudar("modo_cerebro", () => { C.cerebro = v; }));
  $("c-cerebro").previousElementSibling.hidden = $("c-cerebro").hidden = !(e.cerebro || []).length;
  ajustes(e);
  $("c-so-intro").hidden = !(e.botoes || {}).so_intro;
  $("c-comparar").hidden = !(e.botoes || {}).comparar;
  window.scrollTo(0, rolagem);
}

function vozes(f) {
  const sel = $("c-voz");
  if (sel.dataset.marca !== JSON.stringify(f)) {
    sel.dataset.marca = JSON.stringify(f);
    sel.textContent = "";
    const pad = document.createElement("option");
    pad.value = "";
    pad.textContent = f.tem_padrao ? "A voz padrão das Configurações do PC" : "Escolha uma voz";
    sel.appendChild(pad);
    for (const g of f.grupos || []) {
      const og = document.createElement("optgroup");
      og.label = g.grupo;
      for (const v of g.vozes) {
        const o = document.createElement("option");
        o.value = v.id;
        o.textContent = v.nome;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    const outra = document.createElement("option");
    outra.value = "__outra";
    outra.textContent = "Outra voz: colar o código…";
    sel.appendChild(outra);
    sel.value = C.voz;
  }
  $("c-voz-codigo").hidden = sel.value !== "__outra";
}

function ultra(ligar) {
  C.ultra = ligar;
  mexeu.add("ultra");
  for (const f of esquema.fontes || []) {
    if (!f.ok) continue;
    if (f.tipo === "src") C.fontes[f.campo] = true;                      // ULTRA usa os bancos que têm chave
    else if (["usar_youtube", "usar_fotos", "usar_veo"].includes(f.campo)) C.fontes[f.campo] = ligar;
  }
  for (const k of PECAS_ULTRA) if (k in C.ajustes && !campoAjuste(k)?.desligado) C.ajustes[k] = ligar;
  C.impacto = ligar ? "muito" : "normal";
  desenharCriar();
}
function campoAjuste(nome) {
  for (const g of esquema.ajustes || []) for (const f of g.campos) if (f.nome === nome) return f;
  return null;
}

// ------------------------------------------------------------------ Como o vídeo vai ser
const ORDEM_RECEITA = ["pipeline", "nicho", "narrativa", "tom", "estilo_img"];
const TITULOS = { pipeline: "Pipeline", nicho: "Nicho", narrativa: "Narração", tom: "Tom", estilo_img: "Estilo das imagens" };
function receita(e) {
  const caixa = $("c-receita");
  const abertas = new Set([...caixa.querySelectorAll("details[open]")].map((d) => d.dataset.k));
  caixa.textContent = "";
  // a ordem da tela do PC (a nuvem guarda o JSON com as chaves em outra ordem)
  for (const k of ORDEM_RECEITA) {
    const itens = (e.receita || {})[k] || [];
    if (!itens.length) continue;
    const chips = k !== "pipeline" && k !== "narrativa";
    const corpo = el("div", chips ? "chips" : "opcs");
    let grupo = "";
    for (const it of itens) {
      if (it.grupo && it.grupo !== grupo) {
        grupo = it.grupo;
        const g = el("div", "grupo-nome", grupo);
        g.style.flexBasis = "100%";
        corpo.appendChild(g);
      }
      const b = el("button", "opc");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(C.receita[k] === it.id));
      b.appendChild(el("b", "", it.nome));
      if (it.desc && !chips) b.appendChild(el("small", "", it.desc));
      b.onclick = () => mudar("formato_" + k, () => {
        C.receita[k] = it.id;
        if (k === "pipeline" && it.narrativa && (e.receita.narrativa || []).some((x) => x.id === it.narrativa)) C.receita.narrativa = it.narrativa;
        if (k === "estilo_img" && "cenas_ia_modo" in C.ajustes) C.ajustes.cenas_ia_modo = it.id ? "imagem" : C.ajustes.cenas_ia_modo;
      });
      corpo.appendChild(b);
    }
    if (k === "tom" && e.tom_livre && C.receita.tom === "outro") {
      const t = document.createElement("input");
      t.type = "text";
      t.maxLength = 160;
      t.placeholder = "Escreva o tom (ex.: leve e acolhedor, como uma conversa com a avó)";
      t.value = C.tomLivre;
      t.style.marginTop = "8px";
      t.oninput = () => { C.tomLivre = t.value; };
      corpo.appendChild(t);
    }
    const resumo = k === "tom" && C.receita.tom === "outro" ? (C.tomLivre || "Outro") : nomeDe(itens, C.receita[k]) || "Automático";
    const d = dobra(TITULOS[k] || k, resumo, corpo, abertas.has(k));
    d.dataset.k = k;
    caixa.appendChild(d);
  }
}

// ------------------------------------------------------------------ Ajustes (os grupos da tela do PC)
function ajustes(e) {
  const caixa = $("c-ajustes");
  const abertas = new Set([...caixa.querySelectorAll("details[open]")].map((d) => d.dataset.k));
  caixa.textContent = "";
  for (const g of e.ajustes || []) {
    const corpo = el("div");
    let ligados = 0;
    for (const f of g.campos) {
      const v = C.ajustes[f.nome];
      if (f.tipo === "checkbox") {
        if (v) ligados++;
        corpo.appendChild(marcaCaixa(f.rotulo, f.ajuda, v, (x) => mudar(f.nome, () => { C.ajustes[f.nome] = x; }), f.desligado));
        continue;
      }
      const bloco = el("div", "campo-aj");
      const id = "aj-" + f.nome;
      const lab = el("label", "rotulo", f.rotulo);
      lab.htmlFor = id;
      let entrada;
      if (f.tipo === "select") {
        entrada = document.createElement("select");
        for (const o of f.opcoes || []) {
          const op = document.createElement("option");
          op.value = o.id;
          op.textContent = o.nome;
          entrada.appendChild(op);
        }
      } else {
        entrada = document.createElement("input");
        entrada.type = f.tipo === "number" ? "number" : "text";
        for (const k of ["min", "max", "step", "placeholder"]) if (f[k]) entrada.setAttribute(k, f[k]);
        if (f.tipo === "number") entrada.inputMode = "decimal";
      }
      entrada.id = id;
      entrada.value = v ?? "";
      entrada.disabled = !!f.desligado;
      entrada.onchange = () => { mexeu.add(f.nome); C.ajustes[f.nome] = entrada.value; };
      bloco.append(lab, entrada);
      if (f.ajuda) bloco.appendChild(el("small", "", f.ajuda));
      corpo.appendChild(bloco);
    }
    const d = dobra(g.grupo, ligados ? `${ligados} ligado${ligados > 1 ? "s" : ""}` : null, corpo, abertas.has(g.grupo));
    d.dataset.k = g.grupo;
    caixa.appendChild(d);
  }
}

// ------------------------------------------------------------------ arquivos
const EXT_DO_TIPO = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
                      "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/opus": "opus",
                      "audio/flac": "flac", "audio/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                      "image/heic": "heic", "video/mp4": "mp4", "video/quicktime": "mov", "application/x-subrip": "srt" };
function nomeDoArquivo(a, campo) {
  let n = (a.name || "").trim() || campo;
  if (!/\.[A-Za-z0-9]{1,5}$/.test(n)) n += "." + (EXT_DO_TIPO[a.type] || (campo === "srt" ? "srt" : "bin"));
  return n;
}
const mb = (n) => (n / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
function pintarVaga(input, arquivos) {
  const vaga = input.closest(".vaga");
  const small = vaga.querySelector("small");
  vaga.classList.toggle("cheia", arquivos.length > 0);
  if (!arquivos.length) { small.textContent = small.dataset.vazio; return; }
  const total = arquivos.reduce((s, a) => s + a.size, 0);
  small.textContent = arquivos.length === 1 ? `${arquivos[0].name} · ${mb(total)}` : `${arquivos.length} arquivos · ${mb(total)}`;
  if (total > LIMITE_ARQ * arquivos.length || arquivos.some((a) => a.size > LIMITE_ARQ)) {
    small.textContent += " · passa de 50 MB";
    toast(MOTIVOS.arquivo_grande, true);
  }
}
$("c-audio").addEventListener("change", (ev) => {
  const a = ev.target.files[0] || null;
  C.arquivos.audio = a;
  pintarVaga(ev.target, a ? [a] : []);
  if (!a) return;
  const url = URL.createObjectURL(a);                             // a duração, como o leitor de fala do PC
  const au = new Audio();
  au.preload = "metadata";
  au.onloadedmetadata = () => {
    const s = Math.round(au.duration || 0);
    if (s) ev.target.closest(".vaga").querySelector("small").textContent += ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} de fala`;
    URL.revokeObjectURL(url);
  };
  au.onerror = () => URL.revokeObjectURL(url);
  au.src = url;
});
$("c-srt").addEventListener("change", (ev) => { C.arquivos.srt = ev.target.files[0] || null; pintarVaga(ev.target, C.arquivos.srt ? [C.arquivos.srt] : []); });
$("c-material").addEventListener("change", (ev) => { C.arquivos.material = [...ev.target.files].slice(0, 20); pintarVaga(ev.target, C.arquivos.material); });
$("c-voz").addEventListener("change", (ev) => { C.voz = ev.target.value; mexeu.add("voz_fish"); $("c-voz-codigo").hidden = C.voz !== "__outra"; });
$("c-voz-codigo").addEventListener("input", (ev) => { C.vozCodigo = ev.target.value.trim(); });
$("c-roteiro").addEventListener("input", (ev) => {
  const t = ev.target.value;
  const palavras = (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const min = palavras / 150 + (t.match(/\n\s*\n/g) || []).length * 0.6 / 60;
  $("c-conta").textContent = `${palavras.toLocaleString("pt-BR")} palavras · ~${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")} de fala`
    + (t.trim().length && t.trim().length < 200 ? " (mínimo 200 letras)" : "");
});

function progresso(texto, fracao, sub) {
  $("envio").hidden = false;
  $("envio-txt").textContent = texto;
  $("envio-barra").style.width = Math.round(Math.max(0.02, Math.min(1, fracao)) * 100) + "%";
  $("envio-sub").textContent = sub || "";
}
async function subir(campo, arquivo, rotulo) {
  if (arquivo.size > LIMITE_ARQ) throw new Error(MOTIVOS.arquivo_grande);
  const d = await nuvem("cel_arquivo", { campo, nome: nomeDoArquivo(arquivo, campo), tamanho: arquivo.size });
  await new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open("PUT", d.url);
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (ev) => { if (ev.lengthComputable) progresso(rotulo, ev.loaded / ev.total, `${mb(ev.loaded)} de ${mb(ev.total)}`); };
    x.onload = () => (x.status < 300 ? ok() : falha(new Error(`A nuvem não aceitou o arquivo (${x.status}). Tente de novo.`)));
    x.onerror = () => falha(new Error("A conexão caiu no meio do envio. Tente de novo."));
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", arquivo, nomeDoArquivo(arquivo, campo));
    x.send(fd);
  });
  return d.caminho;
}

// ------------------------------------------------------------------ mandar para o PC
function camposDoForm(modo) {
  const e = esquema;
  const k = {};
  k.nome_projeto = $("c-nome").value.trim();
  if (C.narr === "fish") {
    k.narrar_fish = true;
    k.roteiro_fish = $("c-roteiro").value.trim();
    const voz = C.voz === "__outra" ? C.vozCodigo : C.voz;
    if (voz) k.voz_fish = voz;
  } else {
    k.narrar_fish = false;
  }
  for (const f of e.fontes || []) {
    if (!f.ok) continue;
    k[f.campo] = f.tipo === "src" ? (C.fontes[f.campo] ? "1" : "0") : !!C.fontes[f.campo];
  }
  if (e.ultra) k.ultra = C.ultra ? "1" : "0";
  if (C.impacto) k.impacto = C.impacto;
  for (const t of e.topo || []) k[t.nome] = !!C.topo[t.nome];
  for (const [r, v] of Object.entries(C.receita)) k["formato_" + r] = v || "";
  if (C.receita.tom === "outro" && C.tomLivre.trim()) k.formato_tom_livre = C.tomLivre.trim();
  if (C.cerebro) k.modo_cerebro = C.cerebro;
  for (const g of e.ajustes || []) for (const f of g.campos) if (!f.desligado) k[f.nome] = C.ajustes[f.nome];
  k.padrao_mao = [...mexeu].join(",");
  if (modo === "so_intro") k.so_intro = "1";
  if (modo === "comparar") k.comparar = "1";
  return k;
}

$("form-criar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!esquema) return;
  const modo = (ev.submitter && ev.submitter.dataset.modo) || "gerar";
  const nome = $("c-nome").value.trim();
  if (!/^[\w\- À-ÿ]{2,80}$/.test(nome)) { toast("Nome do projeto: só letras, números, espaço, _ e - (2 a 80).", true); $("c-nome").focus(); return; }
  if (C.narr === "audio" && !C.arquivos.audio) { toast("Escolha o áudio da narração (ou toque em Narrar com o Fish).", true); return; }
  if (C.narr === "fish") {
    if ($("c-roteiro").value.trim().length < 200) { toast("O roteiro está curto demais (mínimo 200 letras).", true); return; }
    const voz = C.voz === "__outra" ? C.vozCodigo : C.voz;
    if (!voz && !(esquema.fish || {}).tem_padrao) { toast("Escolha a voz do Fish: este PC não tem voz padrão nas Configurações.", true); $("c-voz").focus(); return; }
  }
  const botoes = [...ev.target.querySelectorAll("button[type=submit]")];
  botoes.forEach((b) => { b.disabled = true; });
  try {
    const arquivos = {};
    const fila = [];
    if (C.narr === "audio") {
      fila.push(["audio", C.arquivos.audio, "Enviando o áudio"]);
      if (C.arquivos.srt) fila.push(["srt", C.arquivos.srt, "Enviando a legenda"]);
    }
    C.arquivos.material.forEach((a, i) => fila.push(["material_pessoa", a, `Enviando o material (${i + 1} de ${C.arquivos.material.length})`]));
    for (const [campo, a, rotulo] of fila) {
      progresso(rotulo, 0);
      const caminho = await subir(campo, a, rotulo);
      if (campo === "material_pessoa") (arquivos.material_pessoa = arquivos.material_pessoa || []).push(caminho);
      else arquivos[campo] = caminho;
    }
    progresso("Mandando para o PC", 1);
    const rot = { so_intro: "Só a introdução de ", comparar: "Comparar cérebros: " }[modo] || "Criar ";
    await pedir("criar_video", { campos: camposDoForm(modo), arquivos }, rot + nome);
    $("c-nome").value = "";
    $("c-roteiro").value = "";
    $("c-conta").textContent = "0 palavras";
    for (const id of ["c-audio", "c-srt", "c-material"]) { $(id).value = ""; pintarVaga($(id), []); }
    C.arquivos = { audio: null, srt: null, material: [] };
    aba("videos");
  } catch (err) {
    toast(err.message || "Não deu para mandar agora. Tente de novo.", true);
  } finally {
    $("envio").hidden = true;
    botoes.forEach((b) => { b.disabled = false; });
  }
});
