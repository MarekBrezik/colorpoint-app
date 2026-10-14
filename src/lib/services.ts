import type { AiRequestBody, AiResponseBody, CekanePole, VykresZakazka } from "./types";

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
export async function vytvorNabidku(zakazka: VykresZakazka): Promise<{ id: string }> {
  // TODO Fáze 2: POST /api/nabidka (Worker), vrátí ID nabídky / PDF
  return { id: `N-${Date.now()}` };
}

export async function fetchMailZpravy(): Promise<string[]> {
  // TODO Fáze 2: načtení příchozích poptávek z e-mailu přes Worker
  return [];
}
