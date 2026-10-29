// V9 Lite no celular (28/10/2026, dono: "quero um app para o lite também"): as telas do Lite no mesmo app.
// O PC do Lite (motor/celular.py) manda a foto: vídeos produzindo, esperando a aprovação (thumb, título, descrição e
// checagens), agenda do YouTube, a esteira e os próximos temas de cada canal. Daqui saem os pedidos: aprovar, reprovar,
// novo tema, ligar/desligar/rodar a esteira e fazer a prévia (uma cópia leve do vídeo para assistir aqui).
"use strict";
let liteEstado = null;

const SITUACAO = {
  pronto: ["Esperando a sua aprovação", "pronto"],
  producao: ["Produzindo", ""],
  ajuste: ["Reprovado por você", "ajuste"],
  agendado: ["Na agenda do YouTube", ""],
  noar: ["No ar", ""],
};
const GRUPOS = [["pronto", "Para aprovar"], ["producao", "Produzindo"], ["ajuste", "Reprovados"], ["agendado", "Na agenda"], ["noar", "Publicados"]];

function minSeg(s) { return s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : ""; }

function cartaoLite(v) {
  const art = el("article", "lv" + (v.status === "pronto" ? " pede" : ""));
  const decide = v.status === "pronto" || v.status === "ajuste";      // a thumb grande só onde há decisão a tomar
  if (v.thumb && decide) {
    const img = el("img", "capa");
    img.src = v.thumb;
    img.alt = "";
    img.loading = "lazy";
    art.appendChild(img);
  } else if (decide) {
    art.appendChild(el("div", "capa-sem", "sem thumbnail ainda"));
  }
  const meio = el("div", "meio");
  meio.appendChild(el("h2", "", v.titulo));
  const et = el("p", "etapa");
  const [rot, cls] = SITUACAO[v.status] || [v.status, ""];
  et.appendChild(el("b", cls, v.status === "agendado" && v.quando ? `${rot} · ${v.quando}` : rot));
  if (v.status === "producao" && v.etapa) et.append(" · " + v.etapa);
  if (v.dur) et.append(" · " + minSeg(v.dur));
  meio.appendChild(et);
  if (v.erro) meio.appendChild(el("p", "erro", v.erro));

  if (v.status === "pronto" || v.status === "ajuste") {
    const qa = v.qa || {};
    const selos = el("div");
    if (qa.ok === true && !(qa.erros || []).length) selos.appendChild(el("span", "selo ok", "Checagens OK"));
    else if ((qa.erros || []).length) selos.appendChild(el("span", "selo ruim", `${qa.erros.length} checagem(ns) reprovada(s)`));
    if ((qa.avisos || []).length) selos.appendChild(el("span", "selo", `${qa.avisos.length} aviso(s)`));
    if (v.shorts) selos.appendChild(el("span", "selo", `${v.shorts} shorts`));
    if (selos.children.length) meio.appendChild(selos);
    const itens = [...(qa.erros || []), ...(qa.avisos || [])];
    if (itens.length) {
      const ul = el("ul");
      for (const x of itens) ul.appendChild(el("li", "", x));
      meio.appendChild(ul);
    }
    if (v.descricao) {
      const det = el("details");
      det.appendChild(el("summary", "", "Descrição"));
      det.appendChild(el("p", "", v.descricao));
      meio.appendChild(det);
    }
    const acoes = el("div", "acoes");
    if (v.final) acoes.appendChild(botaoPrevia(v.id, v.previa, v.previa_fazendo, () => pedirPrevia(v)));   // em app.js
    const ap = el("button", "btn forte", "Aprovar");
    ap.type = "button";
    ap.onclick = () => aprovar(v);
    if (!v.final) ap.disabled = true;
    acoes.appendChild(ap);
    if (v.status === "pronto") {
      const rp = el("button", "btn perigo", "Reprovar");
      rp.type = "button";
      rp.onclick = () => reprovar(v);
      acoes.appendChild(rp);
    }
    meio.appendChild(acoes);
  }
  if (v.status === "noar" && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(v.url || "")) {
    const a = el("a", "", "Ver no YouTube");
    a.href = v.url;
    a.target = "_blank";
    a.rel = "noopener";
    const p = el("p", "etapa");
    p.style.marginTop = "8px";
    p.appendChild(a);
    meio.appendChild(p);
  }
  art.appendChild(meio);
  return art;
}

function desenharLite(d) {
  const e = d.estado;
  liteEstado = e;
  $("fila-pausada").hidden = true;
  const lista = $("lista");
  lista.textContent = "";
  if (!e) {
    lista.innerHTML = '<div class="vazio">O PC ainda não mandou nada. Deixe o V9 Lite aberto no PC: em alguns segundos os vídeos aparecem aqui.</div>';
  } else if (!e.videos || !e.videos.length) {
    lista.innerHTML = '<div class="vazio">Nenhum vídeo no PC ainda. Toque em Novo tema para pôr um tema na lista da esteira.</div>';
  } else {
    for (const [st, nome] of GRUPOS) {
      const vs = e.videos.filter((v) => v.status === st);
      if (!vs.length) continue;
      lista.appendChild(el("h3", "grupo-t", `${nome} (${vs.length})`));
      for (const v of vs) lista.appendChild(cartaoLite(v));
    }
  }
  esteiraTela(e && e.esteira, d.pc_online);
  temaTela(e);
}

// ------------------------------------------------------------------ aprovar e reprovar
function pedirTexto(titulo, texto, botao, dica, obrigatorio) {
  const d = $("dlg-nota");
  $("nota-titulo").textContent = titulo;
  $("nota-texto").textContent = texto;
  $("nota-sim").textContent = botao;
  const t = $("nota");
  t.value = "";
  t.placeholder = dica;
  return new Promise((ok) => {
    d.querySelectorAll(".acoes button").forEach((b) => {
      b.onclick = () => {
        if (b.value === "sim" && obrigatorio && !t.value.trim()) { t.focus(); toast("Escreva o motivo: ele fica anotado no vídeo.", true); return; }
        d.close();
        ok(b.value === "sim" ? t.value.trim() : null);
      };
    });
    d.showModal();
  });
}
async function aprovar(v) {
  const nota = await pedirTexto("Aprovar este vídeo?", `"${v.titulo}" entra na agenda do YouTube na próxima publicação (com os shorts).`,
                                "Aprovar", "Nota (opcional)", false);
  if (nota === null) return;
  try { await pedir("aprovar", { video: v.id, nota }, "Aprovar: " + v.titulo.slice(0, 40)); } catch (e) { toast(e.message, true); }
}
async function reprovar(v) {
  const motivo = await pedirTexto("Reprovar este vídeo?", "Diga o que está errado. O motivo fica anotado no vídeo, para corrigir.",
                                  "Reprovar", "Ex.: a thumbnail está escura; o começo está lento", true);
  if (motivo === null) return;
  try { await pedir("reprovar", { video: v.id, motivo }, "Reprovar: " + v.titulo.slice(0, 40)); } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ prévia (o botão, o assistir e o fechar estão em app.js)
async function pedirPrevia(v) {
  const ok = await confirmar("Fazer a prévia?", "O PC faz uma cópia leve do vídeo e manda para cá. Vídeo longo leva alguns minutos; chega um aviso quando der para assistir.", "Fazer");
  if (!ok) return;
  try {
    previasPedidas.set(v.id, Date.now());
    await pedir("previa", { video: v.id }, "Prévia: " + v.titulo.slice(0, 40));
    if (ultimo) desenharLite(ultimo);
  } catch (e) { previasPedidas.delete(v.id); toast(e.message, true); }
}

// ------------------------------------------------------------------ esteira
function esteiraTela(es, online) {
  const t = $("esteira-txt"), liga = $("esteira-liga"), rodar = $("esteira-rodar");
  if (!es) { t.textContent = "O PC ainda não mandou como está a esteira."; liga.hidden = rodar.hidden = true; return; }
  liga.hidden = rodar.hidden = false;
  const partes = [es.ligada ? "Ligada: roda sozinha todo dia" + (es.hora ? ` às ${es.hora}` : "") : "Desligada: só roda quando você manda"];
  if (es.rodando) partes.push("rodando agora");
  else if (es.ligada && es.proxima) partes.push("próxima rodada " + es.proxima.slice(8, 10) + "/" + es.proxima.slice(5, 7) + " " + es.proxima.slice(11));
  t.textContent = partes.join(" · ") + ".";
  liga.textContent = es.ligada ? "Desligar" : "Ligar";
  liga.className = "btn" + (es.ligada ? " perigo" : "");
  liga.onclick = async () => {
    const o = es.ligada ? "desligar" : "ligar";
    if (o === "desligar" && !(await confirmar("Desligar a esteira?", "Os vídeos param de ser produzidos sozinhos. Você pode ligar de novo aqui.", "Desligar"))) return;
    try { await pedir("esteira", { o }, o === "ligar" ? "Ligar a esteira" : "Desligar a esteira"); } catch (e) { toast(e.message, true); }
  };
  rodar.disabled = !!es.rodando;
  rodar.textContent = es.rodando ? "Rodando agora…" : "Rodar agora";
  rodar.onclick = async () => {
    if (!(await confirmar("Rodar a esteira agora?", "O PC produz agora os próximos vídeos da lista, igual à rodada da noite (usa a IA e a voz do mesmo jeito)." + (online ? "" : " O PC parece desligado: roda quando ele voltar."), "Rodar"))) return;
    try { await pedir("esteira", { o: "rodar" }, "Rodar a esteira"); } catch (e) { toast(e.message, true); }
  };
}

// ------------------------------------------------------------------ novo tema
let temaCanal = "";
function temaTela(e) {
  const sel = $("t-canal");
  const canais = (e && e.canais) || [];
  const chave = canais.map((c) => c.id + ":" + c.nome).join("|");
  if (sel.dataset.chave !== chave) {
    sel.dataset.chave = chave;
    sel.textContent = "";
    for (const c of canais) {
      const o = el("option", "", `${c.nome} (${c.temas} na lista)`);
      o.value = c.id;
      sel.appendChild(o);
    }
    if (canais.some((c) => c.id === temaCanal)) sel.value = temaCanal;
  }
  temaCanal = sel.value;
  const c = canais.find((x) => x.id === sel.value);
  const caixa = $("t-proximos");
  caixa.textContent = "";
  if (!c) { caixa.appendChild(el("div", "vazio", "Deixe o V9 Lite aberto no PC para ver os canais.")); return; }
  if (!c.proximos.length) { caixa.appendChild(el("div", "vazio", "A lista deste canal está vazia.")); return; }
  const ul = el("ul", "temas");
  for (const t of c.proximos) ul.appendChild(el("li", "", t));
  if (c.temas > c.proximos.length) ul.appendChild(el("li", "", `e mais ${c.temas - c.proximos.length}`));
  caixa.appendChild(ul);
}
$("t-canal").onchange = () => { temaCanal = $("t-canal").value; temaTela(liteEstado); };
$("form-tema").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const tema = $("t-tema").value.replace(/\s+/g, " ").trim();
  if (tema.length < 4) { toast("Escreva o tema do vídeo.", true); return; }
  try {
    await pedir("nova_pauta", { canal: $("t-canal").value, tema, titulo: $("t-titulo").value.trim() }, "Novo tema: " + tema.slice(0, 40));
    $("t-tema").value = "";
    $("t-titulo").value = "";
  } catch (e) { toast(e.message, true); }
});
