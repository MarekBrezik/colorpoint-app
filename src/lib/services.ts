import type { VykresZakazka } from "./types";

/**
 * Servisní vrstva – jediné místo, kde se bude měnit napojení na backend.
 * Fáze 1: vše mock / client-side. Později zde budou volání na
 * Cloudflare Workers (API routes / service bindings):
 *   - fetchMailZpravy()      → napojení na schránku (Workers + Email Routing)
 *   - vytvorNabidku()        → POST /api/nabidka → PDF nabídka / předání do dalšího modulu
 *   - aiExtrakce()           → Workers AI (parsing e-mailu, extrakce z PDF)
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function vytvorNabidku(zakazka: VykresZakazka): Promise<{ id: string }> {
  // TODO Fáze 2: POST /api/nabidka (Worker), vrátí ID nabídky / PDF
  return { id: `N-${Date.now()}` };
}

export async function fetchMailZpravy(): Promise<string[]> {
  // TODO Fáze 2: načtení příchozích poptávek z e-mailu přes Worker
  return [];
}
