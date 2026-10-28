// V9 ADMIN no celular // o COFRE DO ORACULO feito aqui no celular (28/10/2026, dono: "tudo igual ao painel"). Mesmo formato
// do v9oracle/collector/cofre.py (membros v2): par X25519 por membro, chave privada trancada com a senha (PBKDF2-SHA256 +
// AES-GCM) e a chave de dados entregue a chave PUBLICA (X25519 + HKDF + AES-GCM). A senha de administrador e a chave de
// dados ficam so' na memoria desta tela: a nuvem recebe a entrada do membro ja' cifrada e nunca ve' chave nem senha.
// Testado contra o cofre.py (testes/cofre_paridade.mjs).
"use strict";
(function (raiz) {
  const sutil = (raiz.crypto || globalThis.crypto).subtle;
  const aleatorio = (n) => (raiz.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ITER = 600000;

  const b64 = (u) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const junta = (...partes) => {
    const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of partes) { out.set(p, i); i += p.length; }
    return out;
  };
  const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, "0")).join("");
  // a chave privada X25519 crua (32 bytes) vira PKCS#8 para o WebCrypto
  const PKCS8 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);

  async function idLogin(login) {
    return hex(new Uint8Array(await sutil.digest("SHA-256", enc.encode(String(login).trim().toLowerCase()))));
  }
  async function idChave(kB64) {                 // o chave_id do latest.json (Vision e Flow)
    return hex(new Uint8Array(await sutil.digest("SHA-256", deB64(kB64)))).slice(0, 12);
  }
  async function aesFecha(chave, dados, aad) {
    const k = await sutil.importKey("raw", chave, "AES-GCM", false, ["encrypt"]);
    const nonce = aleatorio(12);
    return junta(nonce, new Uint8Array(await sutil.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, k, dados)));
  }
  async function aesAbre(chave, blob, aad) {
    const k = await sutil.importKey("raw", chave, "AES-GCM", false, ["decrypt"]);
    return new Uint8Array(await sutil.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12), additionalData: aad }, k, blob.slice(12)));
  }
  async function deriva(senha, salt, iteracoes) {
    const k = await sutil.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await sutil.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iteracoes }, k, 256));
  }
  async function chaveEcies(shared, ephPub, pub) {
    const k = await sutil.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await sutil.deriveBits({ name: "HKDF", hash: "SHA-256", salt: junta(ephPub, pub), info: enc.encode("v9-oracle-k") }, k, 256));
  }
  async function troca(privCru, pubCru) {
    const priv = await sutil.importKey("pkcs8", junta(PKCS8, privCru), { name: "X25519" }, false, ["deriveBits"]);
    const pub = await sutil.importKey("raw", pubCru, { name: "X25519" }, false, []);
    return new Uint8Array(await sutil.deriveBits({ name: "X25519", public: pub }, priv, 256));
  }
  async function parNovo() {                      // -> [privada crua, publica crua]
    const p = await sutil.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    const pk = new Uint8Array(await sutil.exportKey("pkcs8", p.privateKey));
    return [pk.slice(pk.length - 32), new Uint8Array(await sutil.exportKey("raw", p.publicKey))];
  }
  async function entregaChave(chave, pub, ident) {
    const [eph, ephPub] = await parNovo();
    const k = await chaveEcies(await troca(eph, pub), ephPub, pub);
    const nonce = aleatorio(12);
    const kk = await sutil.importKey("raw", k, "AES-GCM", false, ["encrypt"]);
    const ct = new Uint8Array(await sutil.encrypt({ name: "AES-GCM", iv: nonce, additionalData: enc.encode(ident) }, kk, chave));
    return junta(ephPub, nonce, ct);
  }
  const etiqueta = (chave, login, ident) => aesFecha(chave, enc.encode(String(login).trim()), enc.encode("label:" + ident));

  // a chave de dados (base64) quando login e senha abrem a entrada; senao null
  async function abreMembro(membros, login, senha) {
    const ident = await idLogin(login);
    const e = (membros && membros.membros || {})[ident];
    if (!e || membros.v !== 2) return null;
    try {
      const priv = await aesAbre(await deriva(senha, deB64(e.salt), Number(membros.iter || ITER)), deB64(e.priv), enc.encode(ident));
      const k = deB64(e.k);
      const ephPub = k.slice(0, 32), pub = deB64(e.pub);
      const ck = await chaveEcies(await troca(priv, ephPub), ephPub, pub);
      return b64(await aesAbre(ck, k.slice(32), enc.encode(ident)));
    } catch (_) { return null; }
  }
  // {id: entrada} com par novo e a senha dada (igual ao novo_membro do cofre.py)
  async function novoMembro(chaveB64, login, senha, iteracoes = ITER) {
    const chave = deB64(chaveB64), ident = await idLogin(login), salt = aleatorio(16);
    const [priv, pub] = await parNovo();
    const privWrap = await aesFecha(await deriva(senha, salt, iteracoes), priv, enc.encode(ident));
    return { [ident]: { salt: b64(salt), pub: b64(pub), priv: b64(privWrap), k: b64(await entregaChave(chave, pub, ident)),
                        label: b64(await etiqueta(chave, login, ident)) } };
  }
  // a entrada do membro na lista do Flow: o MESMO par do Oraculo com a chave do Flow (igual ao _entrada_flow do painel)
  async function entradaFlow(kfB64, eOracle, login, ident) {
    const kf = deB64(kfB64);
    return { salt: eOracle.salt, pub: eOracle.pub, priv: eOracle.priv, k: b64(await entregaChave(kf, deB64(eOracle.pub), ident)),
             label: b64(await etiqueta(kf, login, ident)) };
  }
  // {id: login} de quem a chave abre a etiqueta
  async function logins(membros, chaveB64) {
    const chave = deB64(chaveB64), out = {};
    for (const [ident, e] of Object.entries(membros && membros.membros || {})) {
      try { out[ident] = dec.decode(await aesAbre(chave, deB64(e.label), enc.encode("label:" + ident))); } catch (_) { /* sem nome */ }
    }
    return out;
  }
  const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function senhaForte() {                         // 14 letras, igual ao painel (sem vies: descarta o que passa de 56*4)
    let s = "";
    while (s.length < 14) for (const x of aleatorio(32)) if (x < 224 && s.length < 14) s += ALFABETO[x % 56];
    return s;
  }
  async function suportado() {
    try { await parNovo(); return true; } catch (_) { return false; }
  }

  const V9Cofre = { ITER, idLogin, idChave, abreMembro, novoMembro, entradaFlow, logins, senhaForte, suportado };
  if (typeof module !== "undefined" && module.exports) module.exports = V9Cofre; else raiz.V9Cofre = V9Cofre;
})(typeof self !== "undefined" ? self : globalThis);
