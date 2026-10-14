import type {
  AiEmailRequestBody,
  AiEmailResponseBody,
  AiRequestBody,
  AiResponseBody,
  CekanePole,
  PolozkaVykres,
  VykresZakazka,
} from "./types";

/**
 * Servisní vrstva – jediné místo, kde se bude měnit napojení na backend.
 * Fáze 1: vše mock / client-side. Později zde budou volání na
 * Cloudflare Workers (API routes / service bindings):
 *   - fetchMailZpravy()      → napojení na schránku (Workers + Email Routing)
 *   - vytvorNabidku()        → POST /api/nabidka → PDF nabídka / předání do dalšího modulu
 *   - aiAsistent()           → POST /api/ai → Workers AI
 */

export async function aiAsistent(
  vstup: string,
  zakazka: VykresZakazka,
  cekameNa: CekanePole,
  cekanaPolozka: string | null,
): Promise<AiResponseBody> {
  const body: AiRequestBody = { vstup, zakazka, cekameNa, cekanaPolozka };
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI asistent failed: ${res.status}`);
  return (await res.json()) as AiResponseBody;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BAREVNOST_AI_MAP: Record<string, PolozkaVykres["detekce"]["barevnost"]> = {
  "černobílá": "cerna_bila",
  "barevná": "barva",
  "barva – zvýšené pokrytí": "zvysene_pokryti",
};

function mapBarevnost(ai: string): PolozkaVykres["detekce"]["barevnost"] {
  return BAREVNOST_AI_MAP[ai.toLowerCase()] ?? "cerna_bila";
}

function mapSkladani(ai: string): PolozkaVykres["skladani"] {
  const t = ai.toLowerCase();
  if (t.includes("a4")) return { ano: true, typ: "na_A4" };
  if (t.includes("a3")) return { ano: true, typ: "na_A3" };
  return { ano: false, typ: "vlastni" };
}

function isValidTypSluzby(s: string): s is VykresZakazka["typSluzby"] {
  return ["tisk", "kopie", "sken", "tisk+sken", "kopie+sken"].includes(s);
}

export interface EmailExtrakceVysledek {
  polozky: PolozkaVykres[];
  typSluzby?: VykresZakazka["typSluzby"];
  dotazy: string[];
}

export async function aiExtrakceEmailu(
  emailText: string,
  soubory: AiEmailRequestBody["soubory"],
): Promise<EmailExtrakceVysledek> {
  const body: AiEmailRequestBody = { emailText, soubory };
  const res = await fetch("/api/ai/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI email extraction failed: ${res.status}`);
  const data = (await res.json()) as AiEmailResponseBody;

  // Najdeme nejčastější typ služby v odpovědi, pokud je konzistentní
  const typy = data.polozky.map((p) => p.typSluzby);
  const unikatni = Array.from(new Set(typy));
  const typSluzby =
    unikatni.length === 1 && isValidTypSluzby(unikatni[0]) ? unikatni[0] : undefined;

  const polozky: PolozkaVykres[] = data.polozky.map((p) => ({
    id: `p-${p.nazevSouboru}`,
    nazev: p.nazevSouboru,
    detekce: {
      pocetStran: p.pocetStran,
      sirkaMm: p.format.sirkaMm,
      vyskaMm: p.format.vyskaMm,
      orientace:
        p.format.sirkaMm > p.format.vyskaMm
          ? "na_sirku"
          : p.format.sirkaMm < p.format.vyskaMm
            ? "na_vysku"
            : "ctverec",
      standard:
        ["A0", "A1", "A2", "A3", "A4"].includes(p.format.standard.toUpperCase())
          ? (p.format.standard.toUpperCase() as PolozkaVykres["detekce"]["standard"])
          : "vlastni",
      barevnost: mapBarevnost(p.barevnost),
      pokrytiProcent: 0,
      nahledDataUrl: "",
    },
    pocetKusu: p.pocetKusu,
    skladani: mapSkladani(p.skladani),
  }));

  return { polozky, typSluzby, dotazy: data.dotazy };
}

export async function vytvorNabidku(_zakazka: VykresZakazka): Promise<{ id: string }> {
  // TODO Fáze 2: POST /api/nabidka (Worker), vrátí ID nabídky / PDF
  return { id: `N-${Date.now()}` };
}

export async function fetchMailZpravy(): Promise<string[]> {
  // TODO Fáze 2: načtení příchozích poptávek z e-mailu přes Worker
  return [];
}
