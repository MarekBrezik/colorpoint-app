import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";
import type { AiRequestBody, AiResponseBody } from "@/lib/types";

function buildSystemPrompt(): string {
  return `Jsi precizní asistent pro tiskárnu/reprografii. Upravuješ objednávku tisku výkresů a vždy odpovídáš POUZE platným JSON objektem.

Dostaneš:
- aktuální stav objednávky (položky: název souboru, formát, barevnost, počet stran, počet kusů, skládání)
- co systém právě očekává za odpověď (kusy / skládání / služba / nic)
- text od uživatele

Formát odpovědi (žádný text mimo tento JSON):
{
  "text": "krátká přátelská odpověď v češtině",
  "rychleOdpovedi": ["návrh 1", "návrh 2"],
  "zmeny": { "typSluzby": "tisk" },
  "polozka": { "id": "p1", "pocetKusu": 5, "skladani": {"ano":true,"typ":"na_A4"}, "vynuceno": {"barevnost":"barva","standard":"A3"} },
  "vsemPolozkam": { "pocetKusu": 2, "skladani": {"ano":true,"typ":"na_A4"}, "vynuceno": {"barevnost":"zvysene_pokryti"} },
  "cekaNa": "kusy" | "skladani" | "sluzba" | null
}

Hodnoty:
- barevnost: "cerna_bila" | "barva" | "zvysene_pokryti"
- standard: "A0" | "A1" | "A2" | "A3" | "A4" | "vlastni"
- typSluzby: "tisk" | "kopie" | "sken" | "tisk+sken" | "kopie+sken"
- skladani.typ: "na_A4" | "na_A3" | "vlastni" | null

Pravidla:
- „všem“, „všechny“, „každý“ → použi "vsemPolozkam".
- Konkrétní název souboru → použi "polozka" s odpovídajícím id.
- Pokud odpověď není jednoznačná, popros o upřesnění a nastav "cekaNa".
- „barevně s vyšším pokrytím“ / „plná barva“ → "zvysene_pokryti".
- „černobíle“ / „ČB“ / „grayscale“ → "cerna_bila".
- „barevně“ / „do barvy“ → "barva".

Příklady:

Uživatel: "všem 2 kusy a skládat na A4"
VÝSTUP:
{
  "text": "Všem výkresům nastavuji 2 kusy a skládání na A4.",
  "rychleOdpovedi": ["OK"],
  "vsemPolozkam": { "pocetKusu": 2, "skladani": {"ano":true,"typ":"na_A4"} },
  "cekaNa": null
}

Uživatel: "A01.pdf 5 kusů barevně"
VÝSTUP:
{
  "text": "A01.pdf: 5 kusů, barevný tisk.",
  "rychleOdpovedi": ["OK"],
  "polozka": { "id": "A01.pdf", "pocetKusu": 5, "vynuceno": {"barevnost":"barva"} },
  "cekaNa": null
}

Uživatel: "nevím"
VÝSTUP:
{
  "text": "Bez obav. Řekni mi prosím, kolik kusů potřebuješ, případně napiš 'všem 2'.",
  "rychleOdpovedi": ["1", "2", "5"],
  "cekaNa": "kusy"
}

Odpovídej v češtině.`;
}

function buildUserPrompt(body: AiRequestBody): string {
  const { vstup, zakazka, cekameNa, cekanaPolozka } = body;
  const polozky = zakazka.polozky
    .map(
      (p, i) =>
        `${i + 1}. ${p.nazev}: ${p.detekce.pocetStran} str., ${p.detekce.standard ?? "vlastni"}, ` +
        `barevnost=${p.detekce.barevnost}, kusy=${p.pocetKusu || "?"}, ` +
        `skládání=${p.skladani.ano ? p.skladani.typ : "ne"}` +
        `${p.vynuceno ? ` (vynuceno: ${JSON.stringify(p.vynuceno)})` : ""}`,
    )
    .join("\n");

  return `AKTUÁLNÍ STAV:
Typ služby: ${zakazka.typSluzby}
Položky:
${polozky || "žádné"}

ČEKÁM NA: ${cekameNa ?? "nic"}
ČEKANÁ POLOŽKA ID: ${cekanaPolozka ?? "žádná"}

UŽIVATEL NAPSAL: "${vstup}"`;
}

function cleanJson(raw: string): string {
  // Odstraní markdown blok ```json ... ```
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : raw;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AiRequestBody;
    const { env } = getCloudflareContext();
    const model = (env.AI_MODEL as string) ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(body) },
      ],
    });

    const raw =
      typeof response === "string"
        ? response
        : (response as { response?: string }).response ?? JSON.stringify(response);

    const jsonText = cleanJson(raw);
    const parsed = JSON.parse(jsonText) as AiResponseBody;

    return Response.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("AI route error:", message);
    return Response.json(
      {
        text: `AI asistent selhal: ${message}`,
        cekaNa: null,
      } as AiResponseBody,
      { status: 200 },
    );
  }
}
