// Roteiro fixo do assistente por voz: entende as respostas mais comuns sem IA
// (trabalho, material, dentes, arcada, cor, data, sim/não) e decide qual é a
// próxima pergunta, uma de cada vez. A IA só entra quando a fala foge do roteiro.

import { CATALOGO, SEPARADOR, todasAsFolhas, unidadeDoServico, prazoMinimoDias, type NoCatalogo } from "@/lib/catalogo";
import { ORDEM_DENTES } from "@/lib/odontograma";

export const FOLHAS: string[][] = todasAsFolhas();

/** Minúsculas, sem acento e sem pontuação. */
export function norm(t: string) {
  return ` ${t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*\/\s*(\d)/g, "$1 de $2")
    .replace(/(\d)[.,](\d)/g, "$1#$2")
    .replace(/[^a-z0-9# ]/g, " ")
    .replace(/#/g, ".")
    .replace(/\s+/g, " ")
    .trim()} `;
}

// ---------- trabalhos ----------
interface Conceito {
  re: RegExp;
  nos: string[];
  /** apaga o trecho reconhecido (para não confundir com outro conceito) */
  apaga?: boolean;
}

// A ordem importa: os mais específicos primeiro.
const CONCEITOS: Conceito[] = [
  { re: /planejament\w*( de)?( implantes?)?|guias? cirurgic\w*/, nos: ["Planejamento de implante"], apaga: true },
  { re: /bio ?modelos?/, nos: ["Impressao de biomodelo"], apaga: true },
  { re: /(impressao|imprimir|impresso)( de| do| dos)?( um| o| os)? modelos?|\bmodelos?\b/, nos: ["Impressao de modelo"], apaga: true },
  { re: /ajuste de cor|ajustar (a )?cor|maquiagem|caracteriza\w*/, nos: ["Ajuste de cor"], apaga: true },
  { re: /encera\w*|\bwax\w*/, nos: ["Enceramento diagnostico"], apaga: true },
  { re: /protocolo/, nos: ["Protocolo"] },
  { re: /placa|miorr?elax\w*|mio relax\w*/, nos: ["Placa miorelaxante"] },
  { re: /smile|sorriso|\bdsd\b/, nos: ["Smile design"] },
  { re: /\b(so|somente|apenas)( o| a)? (desenho|design|cad|projeto|modelagem)\b|design cad|\bdesign\b|\bdesenho\b/, nos: ["Design CAD"] },
  { re: /meia arcada|meia barra|um lado|hemi ?arcada/, nos: ["IBAR meia arcada"] },
  { re: /\b(i|ai) ?bar\b|\bibar\b|\bbarra\b/, nos: ["IBAR", "IBAR meia arcada"] },
  { re: /pilar|munhao|ucla|abutment/, nos: ["Pilar personalizado + coroa"] },
  { re: /implantes?|\bpsi\b/, nos: ["PSI"] },
  { re: /sobre (o |os )?dentes?|dentes? natura\w*|natural|preparo|\bpsd\b/, nos: ["PSD"] },
  { re: /coroas?/, nos: ["Coroa", "Coroa / faceta"] },
  { re: /facetas?|\blentes?\b|laminad\w*/, nos: ["Faceta", "Coroa / faceta"] },
  { re: /pontic\w*|elemento suspenso/, nos: ["Pontico"] },
  { re: /inlay|onlay|inlei|onlei|overlay|restauracao indireta/, nos: ["Inlay/Onlay"] },
  { re: /zirc\w*/, nos: ["Zirconia", "Definitivo zirconia"] },
  { re: /dissilicato|disilicato|\be ?max\b|emax|ceramica pura/, nos: ["Dissilicato"] },
  { re: /hibrid\w*|nanoceram\w*/, nos: ["Resina hibrida"] },
  { re: /provisori\w*|temporari\w*|pmma/, nos: ["Resina provisoria", "Provisorio"] },
  { re: /definitiv\w*/, nos: ["Definitivo resina", "Definitivo zirconia"] },
  { re: /resina/, nos: ["Resina hibrida", "Resina provisoria", "Definitivo resina"] },
  { re: /guiad\w*/, nos: ["Guiado"] },
  { re: /orientad\w*/, nos: ["Orientado"] },
  { re: /fresad\w*|usinad\w*/, nos: ["Fresada"] },
  { re: /impress[ao]\b|impresso|\b3d\b/, nos: ["Impressa"] },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const contem = (folha: string[], nos: string[]) => folha.some((p) => nos.includes(semAcento(p)));
export const chave = (f: string[]) => f.join(SEPARADOR);

/** Filtra as folhas pelos nomes citados; um filtro que zeraria tudo é ignorado. */
export function filtrar(cands: string[][], grupos: string[][]) {
  let r = cands;
  for (const nos of grupos) {
    const f = r.filter((c) => contem(c, nos.map(semAcento)));
    if (f.length) r = f;
  }
  return r;
}

/** Nomes do catálogo reconhecidos na fala (null se nada). */
export function conceitosDaFala(fala: string): string[][] {
  let t = norm(fala);
  const achados: string[][] = [];
  for (const c of CONCEITOS) {
    if (c.re.test(t)) {
      achados.push(c.nos);
      if (c.apaga) t = t.replace(new RegExp(c.re.source, "g"), " ");
    }
  }
  return achados;
}

/** Quantos tipos de peça diferentes a fala cita (para saber se são vários trabalhos de uma vez). */
export function variosTrabalhos(fala: string) {
  const t = norm(fala);
  const tipos = [/pilar/.test(t) ? /$^/ : /coroas?/, /facetas?|\blentes?\b/, /pontic/, /inlay|onlay/, /protocolo/, /placa/, /encera/, /modelo/, /planejament/, /ajuste de cor/, /smile/, /ibar|barra/, /pilar/].filter((r) => r.test(t));
  return tipos.length > 1 || /\btambem\b|\balem disso\b|\bmais (uma|um)\b/.test(t);
}

/** Candidatos a partir de uma fala livre (sem conceitos = null). */
export function candidatosDaFala(fala: string, base: string[][] = FOLHAS): string[][] | null {
  const g = conceitosDaFala(fala);
  if (!g.length) return null;
  let r = filtrar(base, g);
  if (r === base) return null; // nada bateu de verdade
  // "Design CAD" só se ele falou em design/desenho (ou se só sobrou isso)
  const falouDesign = g.some((n) => n.includes("Design CAD") || n.includes("Smile design") || n.includes("IBAR"));
  if (!falouDesign) {
    const semDesign = r.filter((f) => f[0] !== "Design CAD");
    if (semDesign.length) r = semDesign;
  }
  return r;
}

/** Candidatos a partir de nomes exatos do catálogo (resposta da IA). */
export function candidatosDosNos(nos: string[]): string[][] | null {
  const validos = nos.filter((n) => FOLHAS.some((f) => f.includes(n)));
  if (!validos.length) return null;
  let r = filtrar(FOLHAS, validos.map((n) => [semAcento(n)]));
  if (!validos.includes("Design CAD")) {
    const semDesign = r.filter((f) => f[0] !== "Design CAD");
    if (semDesign.length) r = semDesign;
  }
  return r;
}

// ---------- como falar cada coisa ----------
const FALADO: Record<string, string> = {
  PSI: "sobre implante",
  PSD: "sobre dente",
  "Pilar personalizado + coroa": "pilar personalizado com coroa",
  "Definitivo resina": "definitivo em resina",
  "Definitivo zircônia": "definitivo em zircônia",
  "Coroa / faceta": "coroa e faceta",
  "IBAR": "IBAR da arcada inteira",
  "IBAR meia arcada": "IBAR de meia arcada",
  "Smile design": "smile design",
  "Inlay/Onlay": "inlay ou onlay",
  "Design CAD": "só o design",
};
const falado = (n: string) => FALADO[n] ?? n.toLowerCase();

export function juntarOu(l: string[]) {
  return l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} ou ${l[l.length - 1]}`;
}
export function juntarE(l: string[]) {
  return l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

/** Nome falado de um trabalho completo. Ex.: "coroa de zircônia sobre implante". */
export function nomeTrabalho(f: string[]) {
  const [a, b, c] = f;
  if (a === "PSI" || a === "PSD") {
    if (b === "Pilar personalizado + coroa") return "pilar personalizado com coroa sobre implante";
    const peca = b === "Inlay/Onlay" ? "inlay/onlay" : b.toLowerCase();
    return `${peca}${c ? ` de ${c.toLowerCase()}` : ""} ${falado(a)}`;
  }
  if (a === "Protocolo") return `protocolo ${falado(b ?? "").toLowerCase()}`.trim();
  if (a === "Planejamento de implante") return `planejamento de implante ${b?.toLowerCase() ?? ""}`.trim();
  if (a === "Placa miorelaxante") return `placa miorrelaxante ${b?.toLowerCase() ?? ""}`.trim();
  if (a === "Design CAD") {
    const d: Record<string, string> = { "Smile design": "smile design", "Coroa / faceta": "design de coroa e faceta", Protocolo: "design de protocolo", IBAR: "design de IBAR", "IBAR meia arcada": "design de IBAR meia arcada" };
    return d[b] ?? `design de ${b?.toLowerCase()}`;
  }
  return a.toLowerCase();
}

/** Pergunta para escolher entre os candidatos (primeiro nível em que eles diferem). */
export function perguntaOpcao(cands: string[][]): string {
  let n = 0;
  while (cands.every((c) => c[n] === cands[0][n])) n++;
  const valores = Array.from(new Set(cands.map((c) => c[n]).filter(Boolean)));
  const pai = n > 0 ? cands[0][n - 1] : null;
  const set = new Set(valores);
  if (set.size === 2 && set.has("PSI") && set.has("PSD")) return "É sobre implante ou sobre dente?";
  const noPai = n > 0 ? noDe(cands[0].slice(0, n)) : null;
  if (noPai?.filhosSaoMaterial) return `Qual material: ${juntarOu(valores.map((v) => v.toLowerCase()))}?`;
  if (pai === "Protocolo" && cands[0][0] === "Protocolo") return `O protocolo é ${juntarOu(valores.map(falado))}?`;
  if (pai === "Placa miorelaxante") return "A placa é fresada ou impressa?";
  if (pai === "Planejamento de implante") return "O planejamento é guiado ou orientado?";
  if (pai === "Design CAD") return `Qual design: ${juntarOu(valores.map(falado))}?`;
  if (n === 0) {
    // ex.: falou só "zircônia": pode ser coroa, faceta, protocolo...
    const pecas = Array.from(new Set(cands.map((c) => (c[0] === "PSI" || c[0] === "PSD" ? c[1] : c[0]))));
    return `Qual trabalho: ${juntarOu(pecas.map((p) => (p === "Inlay/Onlay" ? "inlay ou onlay" : p === "Pilar personalizado + coroa" ? "pilar com coroa" : p.toLowerCase())))}?`;
  }
  return `É ${juntarOu(valores.map(falado))}?`;
}

function noDe(caminho: string[]): NoCatalogo | undefined {
  let nivel: NoCatalogo[] | undefined = CATALOGO;
  let no: NoCatalogo | undefined;
  for (const p of caminho) {
    no = nivel?.find((x) => x.nome === p);
    nivel = no?.filhos;
  }
  return no;
}

/** Resposta a uma pergunta de opção: filtra os candidatos (aceita "dente"/"implante" soltos). */
export function responderOpcao(cands: string[][], fala: string): string[][] {
  const t = norm(fala);
  const temPsi = cands.some((c) => c[0] === "PSI");
  const temPsd = cands.some((c) => c[0] === "PSD");
  if (temPsi && temPsd) {
    const imp = /implante|\bpsi\b/.test(t);
    const den = /\bdentes?\b|natural|preparo|\bpsd\b/.test(t);
    if (imp && !den) cands = cands.filter((c) => c[0] === "PSI");
    else if (den && !imp) cands = cands.filter((c) => c[0] === "PSD");
  }
  const g = conceitosDaFala(fala);
  return g.length ? filtrar(cands, g) : cands;
}

// ---------- dentes ----------
const SUP = ORDEM_DENTES.filter((d) => d[0] === "1" || d[0] === "2");
const INF = ORDEM_DENTES.filter((d) => d[0] === "3" || d[0] === "4");
const QUADRANTE: Record<string, string[]> = {
  "1": ORDEM_DENTES.filter((d) => d[0] === "1"),
  "2": ORDEM_DENTES.filter((d) => d[0] === "2"),
  "3": ORDEM_DENTES.filter((d) => d[0] === "3"),
  "4": ORDEM_DENTES.filter((d) => d[0] === "4"),
};

const DEZENAS: Record<string, string> = { vinte: "2", trinta: "3", quarenta: "4" };
const UNIDADES: Record<string, string> = { um: "1", uma: "1", dois: "2", duas: "2", tres: "3", quatro: "4", cinco: "5", seis: "6", sete: "7", oito: "8" };
const DEZ: Record<string, string> = { onze: "11", doze: "12", treze: "13", quatorze: "14", catorze: "14", quinze: "15", dezesseis: "16", dezessete: "17", dezoito: "18" };

/** Troca número por extenso ("vinte e um") por dígitos. */
function numerosPorExtenso(t: string) {
  t = t.replace(/\b(vinte|trinta|quarenta) e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito)\b/g, (_, d, u) => DEZENAS[d] + UNIDADES[u]);
  t = t.replace(/\b(onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito)\b/g, (m) => DEZ[m]);
  t = t.replace(/\b([1-4])\.([1-8])\b/g, "$1$2"); // 1.1 → 11
  return t;
}

/** Dentes citados na fala, já ajustados à unidade do serviço. */
export function dentesDaFala(fala: string, f?: string[]): string[] {
  let t = numerosPorExtenso(norm(fala));
  const sel = new Set<string>();
  // faixas: "do 13 ao 23"
  t = t.replace(/\b(?:do|de|dos|entre)?\s*([1-4][1-8])\s*(?:ao|a|ate|e o)\s*([1-4][1-8])\b/g, (m, a, b) => {
    const ia = ORDEM_DENTES.indexOf(a);
    const ib = ORDEM_DENTES.indexOf(b);
    const mesmaArcada = (ia < 16) === (ib < 16);
    if (ia < 0 || ib < 0 || !mesmaArcada || !/\b(ao|ate|a)\b/.test(m)) return m;
    const [x, y] = ia < ib ? [ia, ib] : [ib, ia];
    ORDEM_DENTES.slice(x, y + 1).forEach((d) => sel.add(d));
    return " ";
  });
  for (const m of t.matchAll(/\b([1-4][1-8])\b/g)) sel.add(m[1]);

  const u = f ? unidadeDoServico(f) : "elemento";
  const sup = /superior|de cima|maxila/.test(t);
  const inf = /inferior|de baixo|mandibula/.test(t);
  const ambas = /\bas duas\b|\bambas\b|duas arcadas|\btotal\b|\bboca toda\b/.test(t) || (sup && inf);
  const dir = /direit/.test(t);
  const esq = /esquerd/.test(t);

  if (u === "meia arcada") {
    const q = new Set(Array.from(sel).map((d) => d[0]));
    if (!q.size) {
      if (sup && dir) q.add("1");
      if (sup && esq) q.add("2");
      if (inf && esq) q.add("3");
      if (inf && dir) q.add("4");
    }
    return ORDEM_DENTES.filter((d) => q.has(d[0]));
  }
  if (u === "arcada") {
    let s = sel.size ? Array.from(sel).some((d) => d[0] === "1" || d[0] === "2") : sup || ambas;
    let i = sel.size ? Array.from(sel).some((d) => d[0] === "3" || d[0] === "4") : inf || ambas;
    if (!sel.size && !sup && !inf && !ambas) s = i = false;
    return [...(s ? SUP : []), ...(i ? INF : [])];
  }
  if (!sel.size && (sup || inf || ambas)) return [...(sup || ambas ? SUP : []), ...(inf || ambas ? INF : [])];
  return ORDEM_DENTES.filter((d) => sel.has(d));
}

/** Pergunta dos dentes conforme o serviço. */
export function perguntaDentes(f: string[]) {
  const u = unidadeDoServico(f);
  if (u === "arcada") return "Superior, inferior ou as duas?";
  if (u === "meia arcada") return "Qual lado: superior direito, superior esquerdo, inferior direito ou inferior esquerdo?";
  if (f[0] === "Enceramento diagnóstico") return "Quais dentes vamos encerar?";
  return "Em quais dentes?";
}

/** Dentes do jeito falado. */
export function dentesFalados(dentes: string[], f: string[]) {
  const u = unidadeDoServico(f);
  if (u !== "elemento" || dentes.length >= 14) {
    const s = dentes.some((d) => d[0] === "1" || d[0] === "2");
    const i = dentes.some((d) => d[0] === "3" || d[0] === "4");
    if (u === "meia arcada") {
      const nomes: Record<string, string> = { "1": "superior direito", "2": "superior esquerdo", "3": "inferior esquerdo", "4": "inferior direito" };
      return juntarE(Array.from(new Set(dentes.map((d) => d[0]))).map((q) => nomes[q]));
    }
    return s && i ? "nas duas arcadas" : s ? "superior" : "inferior";
  }
  if (dentes.length === 1) return `no ${dentes[0]}`;
  // sequência seguida (na ordem da boca) vira "do 13 ao 23"
  const idx = dentes.map((d) => ORDEM_DENTES.indexOf(d)).sort((a, b) => a - b);
  const seguidos = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1) && (idx[0] < 16) === (idx[idx.length - 1] < 16);
  if (seguidos && dentes.length >= 3) return `do ${ORDEM_DENTES[idx[0]]} ao ${ORDEM_DENTES[idx[idx.length - 1]]}`;
  return `no ${juntarE([...dentes].sort())}`;
}

// ---------- respostas curtas ----------
export function ehNao(fala: string) {
  const t = norm(fala);
  return /^ (nao|nada|nenhum|nenhuma|so isso|e so|era isso|acabou|mais nada|sem|pode seguir|segue|negativo|nem)\b/.test(t) || /\bso isso\b|\bmais nada\b|\bnao tem\b|\bsem observ/.test(t);
}
export function ehSim(fala: string) {
  const t = norm(fala);
  return /^ (sim|tem|tenho|quero|isso|pode|confirm\w*|ta certo|esta certo|certo|ok|okay|beleza|perfeito|fechado|fechou|correto|exato|positivo|claro|manda|envia|pode ser|ta bom|ta otimo|show)\b/.test(t);
}

/** Cor na escala Vita (A1…D4, BL1…BL4). */
export function corDaFala(fala: string): string | null {
  let t = norm(fala)
    .replace(/\b(um|uma)\b/g, "1")
    .replace(/\b(dois|duas)\b/g, "2")
    .replace(/\btres\b/g, "3")
    .replace(/\bquatro\b/g, "4")
    .replace(/(\d) e meio\b/g, "$1.5")
    .replace(/(\d) ponto 5\b/g, "$1.5");
  t = t.replace(/\b(be|bê)\b/g, "b").replace(/\b(ce|se)\s(?=\d)/g, "c ").replace(/\bde\s(?=\d)/g, "d ").replace(/\bb l\b/g, "bl");
  const m = t.match(/\b(bl|om|a|b|c|d)\s?([1-4](?:\.5)?)\b/);
  if (!m) return null;
  return `${m[1].toUpperCase()}${m[2]}`;
}

// ---------- datas ----------
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
export const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function somaDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(a, m - 1, d + n));
}
export function dataFalada(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `dia ${d} de ${["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][m - 1]}`;
}

/** Data de entrega a partir da fala ("dia 20", "sexta", "20 de novembro", "daqui 10 dias"). */
export function dataDaFala(fala: string, hojeIso: string): { data?: string; urgente?: boolean } | null {
  const t = numerosPorExtenso(norm(fala)).replace(/\bvinte\b/g, "20").replace(/\btrinta\b/g, "30").replace(/\bdez\b/g, "10").replace(/\bquinze\b/g, "15");
  if (/urgen/.test(t)) return { urgente: true };
  const [ha, hm, hd] = hojeIso.split("-").map(Number);
  if (/\bamanha\b/.test(t)) return { data: somaDias(hojeIso, 1) };
  let m = t.match(/\b(?:daqui|em|com)\s*(?:a\s*)?(\d{1,2})\s*dias?\b/);
  if (m) return { data: somaDias(hojeIso, Number(m[1])) };
  if (/\bduas semanas\b/.test(t)) return { data: somaDias(hojeIso, 14) };
  if (/\b(uma semana|semana que vem|proxima semana)\b/.test(t) && !SEMANA.some((s) => t.includes(s))) return { data: somaDias(hojeIso, 7) };
  m = t.match(/\b(\d{1,2})\s*(?:\/|de)\s*(\d{1,2}|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  if (m) {
    const dia = Number(m[1]);
    const mes = /^\d+$/.test(m[2]) ? Number(m[2]) : MESES.indexOf(m[2]) + 1;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = ha;
      if (mes < hm || (mes === hm && dia <= hd)) ano++;
      return { data: isoLocal(new Date(ano, mes - 1, dia)) };
    }
  }
  m = t.match(/\bdia (\d{1,2})\b/);
  if (m) {
    const dia = Number(m[1]);
    if (dia >= 1 && dia <= 31) {
      const d = dia > hd ? new Date(ha, hm - 1, dia) : new Date(ha, hm, dia);
      return { data: isoLocal(d) };
    }
  }
  const s = SEMANA.findIndex((w) => new RegExp(`\\b${w}`).test(t));
  if (s >= 0) {
    const hojeDow = new Date(ha, hm - 1, hd).getDay();
    let n = (s - hojeDow + 7) % 7 || 7;
    if (/que vem|proxima/.test(t) && n < 3) n += 7;
    return { data: somaDias(hojeIso, n) };
  }
  return null;
}

/** Menor data de entrega aceita para os trabalhos do caso. */
export function dataMinima(servicos: string[], hojeIso: string) {
  const dias = Math.max(0, ...servicos.map((s) => prazoMinimoDias(s.split(SEPARADOR))));
  return somaDias(hojeIso, dias || 7);
}

/** Nome do paciente sem "o nome é", com iniciais maiúsculas. */
export function nomePaciente(fala: string) {
  let t = fala.trim().replace(/[.!?]+$/, "");
  t = t.replace(/^(o\s+|a\s+)?(nome\s+d[oa]\s+paciente\s+(é|e)\s+|(o\s+|a\s+)?paciente\s+(é\s+|e\s+)?|nome\s+(é\s+)?|(ele|ela)\s+se\s+chama\s+|se\s+chama\s+|é\s+(o|a)\s+)/i, "");
  return t
    .split(/\s+/)
    .map((w, i) => (i > 0 && /^(da|de|do|das|dos|e)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
    .slice(0, 120);
}

/** Trabalho pede cor? (próteses, protocolo e ajuste de cor) */
export function trabalhoPedeCor(servico: string) {
  const a = servico.split(SEPARADOR)[0];
  return a === "PSI" || a === "PSD" || a === "Protocolo" || a === "Ajuste de cor";
}

export const ehRetrabalho = (fala: string) => /retrabalho|refazer|refacao|repeti(r|cao)/.test(norm(fala));
export { chave as chaveFolha };
