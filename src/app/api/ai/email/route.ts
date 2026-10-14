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

  return `Jsi expert na zpracování poptávek tiskových výkresů. Tvým cílem je převést e-mail od klienta a technické údaje z PDF do strukturovaného JSON.

Dostaneš:
1. Text e-mailu od klienta
2. Seznam PDF souborů s technickými údaji z preflightu (název, rozměry v mm, počet stran, barevnost)

Pravidla:
- Pro každé PDF vytvoř jednu položku.
- Údaje z preflightu (rozměry, počet stran, barevnost) mají absolutní prioritu – nikdy je neměň.
- Počet kusů, skládání a typ služby ber z e-mailu.
- Globální instrukce („všechny 2× a skládat na A4“, „každý výkres barevně“) aplikuj na všechny položky.
- Konkrétní instrukce k souboru aplikuj jen na něj.
- Pokud e-mail neurčí počet kusů → nastav 1.
- Pokud e-mail neurčí skládání → nastav "ne".
- Pokud e-mail neurčí typ služby → nastav "tisk".
- Pokud něco důležitého chybí nebo je nejasné, napiš otázku do pole "dotazy".

Povolené hodnoty:
- barevnost: "Černobílá", "Barevná", "Barva – zvýšené pokrytí"
- skladani: "ne", "na A4", "na A3"
- typSluzby: "tisk", "kopie", "sken", "tisk+sken", "kopie+sken"

Příklad 1 – globální instrukce:
E-MAIL: "Dobrý den, prosím všechny výkresy 2×, skládat na A4, jeden komplet. Díky."
PDF: "Anděl.pdf: 910×3543 mm, 3 str., Černobílá"
VÝSTUP:
{
  "polozky": [
    {
      "nazevSouboru": "Anděl.pdf",
      "format": { "standard": "vlastni", "sirkaMm": 910, "vyskaMm": 3543 },
      "pocetStran": 3,
      "barevnost": "Černobílá",
      "pocetKusu": 2,
      "skladani": "na A4",
      "typSluzby": "tisk"
    }
  ],
  "dotazy": []
}

Příklad 2 – různé instrukce pro různé soubory:
E-MAIL: "Anděl.pdf 5× barevně, Václav.pdf 1× černobíle bez skládání."
PDF: "Anděl.pdf: 910×3543 mm, 3 str., Černobílá\nVáclav.pdf: 594×420 mm, 2 str., Barevná"
VÝSTUP:
{
  "polozky": [
    {
      "nazevSouboru": "Anděl.pdf",
      "format": { "standard": "vlastni", "sirkaMm": 910, "vyskaMm": 3543 },
      "pocetStran": 3,
      "barevnost": "Barevná",
      "pocetKusu": 5,
      "skladani": "ne",
      "typSluzby": "tisk"
    },
    {
      "nazevSouboru": "Václav.pdf",
      "format": { "standard": "A2", "sirkaMm": 594, "vyskaMm": 420 },
      "pocetStran": 2,
      "barevnost": "Černobílá",
      "pocetKusu": 1,
      "skladani": "ne",
      "typSluzby": "tisk"
    }
  ],
  "dotazy": []
}

Příklad 3 – chybějící informace:
E-MAIL: "Prosím vytisknout přiložené výkresy."
PDF: "Anděl.pdf: 910×3543 mm, 3 str., Černobílá"
VÝSTUP:
{
  "polozky": [
    {
      "nazevSouboru": "Anděl.pdf",
      "format": { "standard": "vlastni", "sirkaMm": 910, "vyskaMm": 3543 },
      "pocetStran": 3,
      "barevnost": "Černobílá",
      "pocetKusu": 1,
      "skladani": "ne",
      "typSluzby": "tisk"
    }
  ],
  "dotazy": ["Kolik kusů máme vytisknout?"]
}

Nyní zpracuj tuto skutečnou poptávku. Vrať POUZE validní JSON (žádný text navíc).

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
    const model = (env.AI_MODEL as string) ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

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
