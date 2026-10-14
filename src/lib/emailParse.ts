import type { PolozkaVykres, VykresZakazka } from "./types";

/**
 * Jednoduché pravidlové parsování průvodního e-mailu.
 * Extrahuje instrukce typu "2×", "skládat na A4", "barevně", "tisk"…
 * a pokusí se je přiřadit ke konkrétním výkresům podle názvu souboru.
 * Později nahradit / doplnit Cloudflare Workers AI extrakcí.
 */
export interface VysledekEmailu {
  kusyGlobal?: number;
  skladaniGlobal?: PolozkaVykres["skladani"];
  typSluzby?: VykresZakazka["typSluzby"];
  barevnost?: VykresZakazka["barevnost"];
  /** kusy / skládání nalezené u konkrétního výkresu (podle shody názvu) */
  perPolozka: Map<string, { kusy?: number; skladani?: PolozkaVykres["skladani"] }>;
  nalezeno: string[]; // lidsky čitelný souhrn pro chat
}

function najdiSkladani(t: string): PolozkaVykres["skladani"] | undefined {
  if (/sklá\w*\s+(?:do |na )?a4|slož\w*\s+(?:do |na )?a4|na a4/i.test(t)) {
    return { ano: true, typ: "na_A4" };
  }
  if (/sklá\w*\s+(?:do |na )?a3|slož\w*\s+(?:do |na )?a3|na a3/i.test(t)) {
    return { ano: true, typ: "na_A3" };
  }
  if (/nesklá\w*|bez sklád\w*|(?:jako |do )?rol[eiíč]\w*/i.test(t)) {
    return { ano: false, typ: "vlastni" };
  }
  return undefined;
}

function najdiSluzbu(t: string): VykresZakazka["typSluzby"] | undefined {
  const maTisk = /\btisk\w*|vytisk\w*|vytiskn\w*/i.test(t);
  const maKopie = /\bkop\w*/i.test(t);
  const maSken = /\bsken\w*/i.test(t);
  if (maTisk && maSken) return "tisk+sken";
  if (maKopie && maSken) return "kopie+sken";
  if (maTisk) return "tisk";
  if (maKopie) return "kopie";
  if (maSken) return "sken";
  return undefined;
}

/** Tokeny ze jména souboru, které se mohou objevit v textu ("A01.pdf" → "A01"). */
function tokenyNazvu(nazev: string): string[] {
  const stem = nazev.split("›").pop()!.replace(/\.pdf$/i, "");
  return stem
    .split(/[\s_\-.]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export function analyzujEmail(text: string, polozky: PolozkaVykres[]): VysledekEmailu {
  const v: VysledekEmailu = { perPolozka: new Map(), nalezeno: [] };
  const t = text.toLowerCase();
  if (!t.trim()) return v;

  // Globální počet kusů: "2×", "2 ks", "dvě sady"…
  const kusy = t.match(/(\d{1,4})\s*(?:×|x\s|ks\b|kus\w*|sad\w*|sét\w*)/);
  if (kusy) {
    v.kusyGlobal = parseInt(kusy[1], 10);
    v.nalezeno.push(`${v.kusyGlobal} ks`);
  } else if (/\bkažd\w* (?:jednou|1[×x])\b|jeden výtisk|1[×x]\b/.test(t)) {
    v.kusyGlobal = 1;
    v.nalezeno.push("1 ks");
  }

  const skladani = najdiSkladani(t);
  if (skladani) {
    v.skladaniGlobal = skladani;
    v.nalezeno.push(
      skladani.ano
        ? `skládání ${skladani.typ === "na_A4" ? "na A4" : "na A3"}`
        : "bez skládání (role)",
    );
  }

  const sluzba = najdiSluzbu(t);
  if (sluzba) {
    v.typSluzby = sluzba;
    v.nalezeno.push(`služba: ${sluzba.replace("+", " + ")}`);
  }

  if (
    /\b(zvýšen\w*|vyšší|větší|plné|pln[áéo]|silné|intenzivní|maximální)\s+pokryt\w*/i.test(t) ||
    /\b(pln[áéo]\s+barv\w*|hodně\s+barv\w*|vysok[áéo]\s+barv\w*|plnobarevn\w*)/i.test(t) ||
    /\b(coverage|heavy\s+cover|full\s+color)\b/i.test(t)
  ) {
    v.barevnost = "zvysene_pokryti";
    v.nalezeno.push("barevně se zvýšeným pokrytím");
  } else if (/barevn\w*|color|ve barvě/i.test(t)) {
    v.barevnost = "barva";
    v.nalezeno.push("barevně");
  } else if (/černobíl\w*|čb\b|černo.bíl\w*/i.test(t)) {
    v.barevnost = "cerna_bila";
    v.nalezeno.push("černobíle");
  }

  // Per-výkres: hledáme "NAZEV 2×" nebo "2× NAZEV" apod.
  for (const p of polozky) {
    const tokeny = tokenyNazvu(p.nazev);
    for (const tok of tokeny) {
      const re = new RegExp(
        `${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]{0,40}?(\\d{1,4})\\s*(?:×|x\\b|ks\\b|kus\\w*|sad\\w*)`,
        "i",
      );
      const m = t.match(re);
      const re2 = new RegExp(
        `(\\d{1,4})\\s*(?:×|x\\b|ks\\b|kus\\w*|sad\\w*)[^\\n]{0,40}?${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i",
      );
      const m2 = t.match(re2);
      const kusyTokenu = m ? parseInt(m[1], 10) : m2 ? parseInt(m2[1], 10) : undefined;
      if (kusyTokenu) {
        const stavajici = v.perPolozka.get(p.id) ?? {};
        stavajici.kusy = kusyTokenu;
        v.perPolozka.set(p.id, stavajici);
        v.nalezeno.push(`${tok}: ${kusyTokenu} ks`);
        break;
      }
    }
  }

  return v;
}
