import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";
import type { AiRequestBody, AiResponseBody } from "@/lib/types";

function buildSystemPrompt(): string {
  return `Jsi asistent pro tiskárnu/reprografii. Upravuješ objednávku tisku výkresů.

Dostaneš:
- aktuální stav objednávky (položky: název souboru, formát, barevnost, počet stran, počet kusů, skládání)
- co systém právě očekává za odpověď (kusy / skládání / služba / nic)
- text od uživatele

Tvůj výstup musí být POUZE platný JSON objekt s těmito poli:
{
  "text": "krátká přátelská odpověď v češtině",
  "rychleOdpovedi": ["návrh 1", "návrh 2"],
  "zmeny": { "typSluzby": "tisk" },
  "polozka": { "id": "p1", "pocetKusu": 5, "skladani": {"ano":true,"typ":"na_A4"}, "vynuceno": {"barevnost":"barva","standard":"A3"} },
  "vsemPolozkam": { "pocetKusu": 2, "skladani": {"ano":true,"typ":"na_A4"}, "vynuceno": {"barevnost":"zvysene_pokryti"} },
  "cekaNa": "kusy" | "skladani" | "sluzba" | null
}

Pravidla:
- barevnost: "cerna_bila" | "barva" | "zvysene_pokryti"
- standard: "A0" | "A1" | "A2" | "A3" | "A4" | "vlastni"
- typSluzby: "tisk" | "kopie" | "sken" | "tisk+sken" | "kopie+sken"
- skladani.typ: "na_A4" | "na_A3" | "vlastni" | null
- Když uživatel napíše „všem“ nebo neuvádí konkrétní položku, použi "vsemPolozkam".
- Když se ptá na kusy/skládání/službu a odpověď je jednoznačná, nastav "cekaNa": null.
- Když odpověď není jednoznačná, popros o upřesnění a nastav odpovídající "cekaNa".
- Pokud uživatel napíše „barevně s vyšším pokrytím“, nastav barevnost "zvysene_pokryti".
- Odpověz v češtině.`;
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
    const model = (env.AI_MODEL as string) ?? "@cf/meta/llama-3.1-8b-instruct-fp8";

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
