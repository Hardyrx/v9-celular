// O cofre do celular (adm/cofre.js) contra o cofre do Oraculo (v9oracle/collector/cofre.py), nos dois sentidos.
//   node testes/cofre_paridade.mjs          (precisa do v9oracle ao lado e de um python com "cryptography")
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const C = createRequire(import.meta.url)(path.join(aqui, "..", "adm", "cofre.js"));
const COLETOR = path.join(aqui, "..", "..", "v9oracle", "collector");
const ITER = 2000;                                  // poucas voltas so' no teste (o app usa as do arquivo)
// o python do V9 Vision ja' tem a "cryptography" (ou o de V9_PY)
const VENV = path.join(aqui, "..", "..", "app-videos", "venv", "Scripts", "python.exe");
const PY = process.env.V9_PY || (fs.existsSync(VENV) ? VENV : "python");
let falhas = 0;
const confere = (nome, ok) => { console.log((ok ? "OK    " : "FALHA ") + nome); if (!ok) falhas++; };
const py = (codigo, entrada) => execFileSync(PY, ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(COLETOR)}); import cofre as C\n` + codigo],
                                             { input: JSON.stringify(entrada), encoding: "utf-8" }).trim();

// 1) o Python cadastra, o celular abre
const K = py("print(C.nova_chave())", {});
const KF = py("print(C.nova_chave())", {});
const doPy = JSON.parse(py(`d = json.load(sys.stdin); print(json.dumps(C.monta_membros(d["K"], {"Admin": "senha-adm-1", "aluno.um": "s2"}, ${ITER})))`, { K }));
confere("1 o celular abre a entrada feita pelo Python", (await C.abreMembro(doPy, "admin", "senha-adm-1")) === K);
confere("1b senha errada nao abre", (await C.abreMembro(doPy, "admin", "errada")) === null);
const nomes = await C.logins(doPy, K);
confere("1c o celular le as etiquetas do Python", Object.values(nomes).sort().join(",") === "Admin,aluno.um");
confere("1d id do login igual", (await C.idLogin(" ALUNO.um ")) === py(`print(C.id_login(" ALUNO.um "))`, {}));

// 2) o celular cadastra, o Python abre (e le' a etiqueta)
const senha = C.senhaForte();
confere("2a senha forte com 14 letras do alfabeto", /^[a-km-zA-HJ-NP-Z2-9]{14}$/.test(senha));
const novo = await C.novoMembro(K, "Novo.Aluno", senha, ITER);
const juntos = { ...doPy, membros: { ...doPy.membros, ...novo } };
confere("2 o Python abre a entrada feita no celular",
        py(`d = json.load(sys.stdin); print(C.abre_membro(d["m"], "novo.aluno", d["s"]))`, { m: juntos, s: senha }) === K);
confere("2b o Python le' a etiqueta do celular",
        py(`d = json.load(sys.stdin); print(",".join(C.lista_logins(d["m"], d["K"])))`, { m: juntos, K }) === "Admin,Novo.Aluno,aluno.um");

// 3) a entrada do Flow (mesmo par, chave do Flow): o Python abre com a MESMA senha e devolve a chave do Flow
const ident = await C.idLogin("Novo.Aluno");
const eFlow = await C.entradaFlow(KF, novo[ident], "Novo.Aluno", ident);
const flow = { v: 2, kdf: "PBKDF2-SHA256", iter: ITER, membros: { [ident]: eFlow } };
confere("3 o Python abre o Flow com a senha do membro", py(`d = json.load(sys.stdin); print(C.abre_membro(d["m"], "Novo.Aluno", d["s"]))`, { m: flow, s: senha }) === KF);
confere("3b o par do Flow e' o mesmo do Oraculo", eFlow.pub === novo[ident].pub && eFlow.priv === novo[ident].priv && eFlow.salt === novo[ident].salt);

// 4) o chave_id do latest.json
confere("4 chave_id igual ao do publicar", (await C.idChave(K)) === py(`import base64, hashlib; print(hashlib.sha256(base64.b64decode(${JSON.stringify(K)})).hexdigest()[:12])`, {}));

console.log("falhas: " + falhas);
process.exit(falhas);
