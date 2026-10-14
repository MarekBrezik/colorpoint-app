/** Specifikace jednoho výkresu (jednoho nahraného PDF). */
export interface PolozkaVykres {
  id: string;
  nazev: string; // název souboru (u ZIPu "archiv › soubor.pdf")
  detekce: PdfDetekce;
  /** Operátor/AI vynucené hodnoty – mají přednost před detekcí */
  vynuceno?: {
    barevnost?: "cerna_bila" | "barva" | "zvysene_pokryti";
    standard?: "A0" | "A1" | "A2" | "A3" | "A4" | "vlastni";
  };
  pocetKusu: number; // 0 = ještě nezadané
  skladani: {
    ano: boolean;
    typ: "na_A4" | "na_A3" | "vlastni" | null; // null = ještě nezodpovězeno
  };
}

/** Efektivní barevnost položky = vynucená nebo detekovaná. */
export const efBarevnost = (p: PolozkaVykres) =>
  p.vynuceno?.barevnost ?? p.detekce.barevnost;

/** Efektivní standard formátu položky = vynucený nebo detekovaný. */
export const efStandard = (p: PolozkaVykres) =>
  p.vynuceno?.standard ?? p.detekce.standard;

export interface VykresZakazka {
  typSluzby: "tisk" | "kopie" | "sken" | "tisk+sken" | "kopie+sken";
  polozky: PolozkaVykres[];
  // Agregované údaje (odvozené z položek – pro rychlý náhled)
  format: {
    standard: "A0" | "A1" | "A2" | "A3" | "A4" | "vlastni" | null;
    sirkaMm: number;
    vyskaMm: number;
  };
  pocetListu: number;
  barevnost: "cerna_bila" | "barva" | "zvysene_pokryti" | "smisena";
  poznamky?: string;
  cena: number; // zatím mock
}

export interface PdfDetekce {
  pocetStran: number;
  sirkaMm: number;
  vyskaMm: number;
  orientace: "na_sirku" | "na_vysku" | "ctverec";
  standard: "A0" | "A1" | "A2" | "A3" | "A4" | "vlastni" | null;
  barevnost: "cerna_bila" | "barva" | "zvysene_pokryti";
  pokrytiProcent: number;
  nahledDataUrl: string; // thumbnail 1. stránky
}

export interface AnalyzovanySoubor {
  nazev: string;
  detekce: PdfDetekce;
}

// Na co asistent zrovna čeká za odpověď – kontext pro parser vstupu.
// Kusy a skládání se řeší per výkres; "vše"/"všude" aplikuje hromadně.
export type CekanePole = "kusy" | "skladani" | "sluzba" | null;

export interface ChatZprava {
  id: string;
  role: "ai" | "user";
  text: string;
  rychleOdpovedi?: string[];
}

/** Tělo požadavku na /api/ai. */
export interface AiRequestBody {
  vstup: string;
  zakazka: VykresZakazka;
  cekameNa: CekanePole;
  cekanaPolozka: string | null;
}

/** Odpověď z /api/ai. */
export interface AiResponseBody {
  text: string;
  rychleOdpovedi?: string[];
  zmeny?: Partial<VykresZakazka>;
  polozka?: {
    id: string;
    pocetKusu?: number;
    skladani?: Partial<PolozkaVykres["skladani"]>;
    vynuceno?: PolozkaVykres["vynuceno"];
  };
  vsemPolozkam?: {
    pocetKusu?: number;
    skladani?: Partial<PolozkaVykres["skladani"]>;
    vynuceno?: PolozkaVykres["vynuceno"];
  };
  cekaNa?: CekanePole;
}
