import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";


export interface AiEmailRequestBody {
  emailText: string;
  soubory: Array<{
    nazev: string;
    sirkaMm: number;
    vyskaMm: number;
    pocetStran: number;
    barevnost: string;
  }>;
}

export interface AiEmailResponseBody {
  polozky: Array<{
    nazevSouboru: string;
    format: {
      standard: string;
      sirkaMm: number;
      vyskaMm: number;
    };
    pocetStran: number;
    barevnost: string;
    pocetKusu: number;
    skladani: string;
    typSluzby: string;
  }>;
  dotazy: string[];
}

function buildPrompt(body: AiEmailRequestBody): string {
  const souboryText = body.soubory
    .map(
      (s) =>
        `- ${s.nazev}: ${s.sirkaMm}×${s.vyskaMm} mm, ${s.pocetStran} str., ${s.barevnost}`,
    )
    .join("\n");

  return `Jsi expert na zpracování poptávek tiskových výkresů.

Dostaneš:
1. Text e-mailu od klienta
2. Seznam PDF souborů s technickými údaji z preflightu (název, rozměry v mm, počet stran, barevnost)

Tvůj úkol:
- Pro každé PDF vytvoř jednu položku
- Údaje z preflightu (rozměry, počet stran, barevnost) mají absolutní prioritu – nikdy je neměň
- Počet kusů, skládání a typ služby ber z e-mailu
- Pokud e-mail říká něco globálně (např. „všechny 2× a skládat na A4“), aplikuj to na všechny položky
- Pokud e-mail zmiňuje konkrétní soubor, aplikuj instrukci jen na něj
- Pokud e-mail neurčí počet kusů → nastav 1
- Pokud e-mail neurčí skládání → nastav "ne"
- Pokud e-mail neurčí typ služby → nastav "tisk"

Vrať POUZE validní JSON v tomto přesném formátu (žádný text navíc):

{
  "polozky": [
    {
      "nazevSouboru": "Anděl.pdf",
      "format": {
        "standard": "vlastni",
        "sirkaMm": 910,
        "vyskaMm": 3543
      },
      "pocetStran": 3,
      "barevnost": "Černobílá",
      "pocetKusu": 1,
      "skladani": "na A4",
      "typSluzby": "tisk"
    }
  ],
  "dotazy": []
}

Povolené hodnoty:
- barevnost: "Černobílá", "Barevná", "Barva – zvýšené pokrytí"
- skladani: "ne", "na A4", "na A3"
- typSluzby: "tisk", "kopie", "sken", "tisk+sken", "kopie+sken"

E-MAIL:
${body.emailText}

PDF SOUBORY:
${souboryText}`;
}

function cleanJson(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : raw;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AiEmailRequestBody;
    const { env } = getCloudflareContext();
    const model = (env.AI_MODEL as string) ?? "@cf/meta/llama-3.1-8b-instruct";

    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: buildPrompt(body) },
        { role: "user", content: "Zpracuj tuto poptávku a vrať JSON." },
      ],
    });

    const raw =
      typeof response === "string"
        ? response
        : (response as { response?: string }).response ?? JSON.stringify(response);

    const jsonText = cleanJson(raw);
    const parsed = JSON.parse(jsonText) as AiEmailResponseBody;

    return Response.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("AI email route error:", message);
    return Response.json(
      {
        polozky: [],
        dotazy: [`AI extrakce selhala: ${message}`],
      } as AiEmailResponseBody,
      { status: 200 },
    );
  }
}
