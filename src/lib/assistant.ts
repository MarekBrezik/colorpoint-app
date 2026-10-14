import type { CekanePole, PolozkaVykres, VykresZakazka } from "./types";

/**
 * Abstrakce nad AI asistentem.
 * Aktuálně deterministický pravidlový mock; později lze přepnout na
 * Cloudflare Workers AI bez změny zbytku aplikace.
 *
 * Asistent pracuje s položkami (jednotlivými výkresy) zvlášť – každý
 * může mít jiný formát, barevnost, počet kusů i skládání. „Všem/všechny"
 * aplikuje hodnotu hromadně.
 */
export interface OdpovedAsistenta {
  text: string;
  rychleOdpovedi?: string[];
  /** změny na úrovni celé zakázky (typSluzby apod.) */
  zmeny?: Partial<VykresZakazka>;
  /** změny konkrétní položky */
  polozka?: {
    id: string;
    pocetKusu?: number;
    skladani?: Partial<PolozkaVykres["skladani"]>;
    vynuceno?: PolozkaVykres["vynuceno"];
  };
  /** hromadná změna všech položek */
  vsemPolozkam?: {
    pocetKusu?: number;
    skladani?: Partial<PolozkaVykres["skladani"]>;
    vynuceno?: PolozkaVykres["vynuceno"];
  };
  cekaNa?: CekanePole;
  cekanaPolozka?: string | null;
}

const KUSY_ODPOVEDI = ["1", "2", "5", "10"];
const SKLADANI_ODPOVEDI = ["Neskládat", "Na A4", "Na A3"];
const SLUZBA_ODPOVEDI = ["Tisk", "Kopie", "Sken", "Tisk + sken", "Kopie + sken"];

const kratkyNazev = (p: PolozkaVykres) => p.nazev.split("›").pop()!.trim();

const popisFormatu = (p: PolozkaVykres) =>
  p.detekce.standard
    ? `${p.detekce.standard} (${p.detekce.sirkaMm}×${p.detekce.vyskaMm} mm)`
    : `${p.detekce.sirkaMm}×${p.detekce.vyskaMm} mm`;

const popisBarevnosti = (b: PolozkaVykres["detekce"]["barevnost"]) =>
  b === "cerna_bila" ? "ČB" : b === "zvysene_pokryti" ? "barva, vysoké pokrytí" : "barva";

export function uvodniZprava(z: VykresZakazka): OdpovedAsistenta {
  if (z.polozky.length === 0) {
    return {
      text: "Dobrý den! Nahrajte PDF výkresy vlevo – klidně víc najednou nebo jako ZIP. Případně vložte text poptávkového e-mailu a já z něj vytáhnu instrukce (počty kusů, skládání…).",
    };
  }
  const radky = z.polozky
    .map(
      (p) =>
        `• ${kratkyNazev(p)}: ${p.detekce.pocetStran} str., ${popisFormatu(p)}, ${popisBarevnosti(p.detekce.barevnost)}`,
    )
    .join("\n");
  const next = dalsiOtazka({ ...z });
  return {
    text: `Detekováno ${z.polozky.length} ${z.polozky.length === 1 ? "výkres" : z.polozky.length < 5 ? "výkresy" : "výkresů"} (${z.pocetListu} listů celkem):\n${radky}\n\n${next.text}`,
    rychleOdpovedi: next.rychleOdpovedi,
    cekaNa: next.cekaNa,
    cekanaPolozka: next.cekanaPolozka,
  };
}

/** Najde další nezodpovězenou otázku – nejdřív kusy a skládání per položka, pak služba. */
function dalsiOtazka(z: VykresZakazka): OdpovedAsistenta {
  const bezKusu = z.polozky.find((p) => p.pocetKusu === 0);
  if (bezKusu) {
    const vic = z.polozky.length > 1;
    return {
      text: vic
        ? `Výkres „${kratkyNazev(bezKusu)}": kolik kusů? (můžete psát „všem 2")`
        : "Kolik kusů potřebujete?",
      rychleOdpovedi: vic ? [...KUSY_ODPOVEDI, "Všem 2"] : KUSY_ODPOVEDI,
      cekaNa: "kusy",
      cekanaPolozka: bezKusu.id,
    };
  }
  const bezSkladani = z.polozky.find((p) => p.skladani.typ === null);
  if (bezSkladani) {
    const vic = z.polozky.length > 1;
    return {
      text: vic
        ? `Výkres „${kratkyNazev(bezSkladani)}": skládat? („všem na A4" platí pro všechny)`
        : "Má se výkres skládat?",
      rychleOdpovedi: vic ? [...SKLADANI_ODPOVEDI, "Všem na A4"] : SKLADANI_ODPOVEDI,
      cekaNa: "skladani",
      cekanaPolozka: bezSkladani.id,
    };
  }
  if (!z.typSluzby) {
    return { text: "O jaký typ služby jde?", rychleOdpovedi: SLUZBA_ODPOVEDI, cekaNa: "sluzba" };
  }
  return {
    text: "Specifikace je kompletní – vpravo vidíte živý náhled včetně orientační ceny. Změnu napíšete třeba jako „A01 3 kusy“ nebo „všem neskládat“.",
    rychleOdpovedi: ["Změnit kusy", "Změnit skládání", "Změnit službu"],
    cekaNa: null,
    cekanaPolozka: null,
  };
}

function parseSluzba(t: string): { val: VykresZakazka["typSluzby"]; label: string } | null {
  const sluzby: Array<[RegExp, VykresZakazka["typSluzby"], string]> = [
    [/tisk.*sken|tisk\+sken/, "tisk+sken", "Tisk + sken"],
    [/kopie.*sken|kopie\+sken/, "kopie+sken", "Kopie + sken"],
    [/tisk|print/, "tisk", "Tisk"],
    [/kopie|kopír/, "kopie", "Kopie"],
    [/sken|scan/, "sken", "Sken"],
  ];
  for (const [re, val, label] of sluzby) {
    if (re.test(t)) return { val, label };
  }
  return null;
}

function parseSkladani(t: string): Partial<PolozkaVykres["skladani"]> | "zeptat" | null {
  if (/\ba4\b/.test(t)) return { ano: true, typ: "na_A4" };
  if (/\ba3\b/.test(t)) return { ano: true, typ: "na_A3" };
  if (t.includes("nesklá") || t.includes("bez sklád") || t === "ne" || t === "role") {
    return { ano: false, typ: "vlastni" };
  }
  if (t.includes("sklád") || t === "ano") return "zeptat";
  return null;
}

function parseKusy(t: string): number | null {
  // číslo, které nestojí za A-formátem ("na A4" nesmí znamenat 4 kusy)
  const bezFormatu = t.replace(/\ba[0-4]\b/g, "");
  const cislo = bezFormatu.match(/\d+/);
  if (!cislo) return null;
  const n = parseInt(cislo[0], 10);
  return n > 0 && n < 10000 ? n : null;
}

const jeHromadne = (t: string) => /\bvšem\b|\bvšude\b|\bvšechny\b|\bkažd\w*\b|\bvše\b/.test(t);

// Slovesa, která znamenají vynucení formátu (ne skládání): "vytiskni na A1"…
const FORMAT_TRIGGER = /formát|vytisk|udělej|dej |vynuť|přehoď|přeformát|zmenši|zvětši|výstup|tiskni|rozměr/i;

function parseBarevnost(t: string): PolozkaVykres["detekce"]["barevnost"] | null {
  // Zvýšené pokrytí – různé české varianty včetně „vyšší/větší/plné/silné pokrytí“
  if (
    /\b(zvýšen\w*|vyšší|větší|plné|pln[áéo]|silné|intenzivní|maximální)\s+pokryt\w*/i.test(t) ||
    /\b(pln[áéo]\s+barv\w*|hodně\s+barv\w*|vysok[áéo]\s+barv\w*|plnobarevn\w*)/i.test(t) ||
    /\b(coverage|heavy\s+cover|full\s+color)\b/i.test(t)
  ) {
    return "zvysene_pokryti";
  }
  // Negace → černobíle (pokud není přímo řečeno „černobíle“)
  if (
    /(?:\bne(?:chci|chtěl|tiskni|dej)?\s+)barevn\w*|\bnebarevn\w*|\bbez\s+bar/i.test(t) &&
    !/černobíl\w*|čb\b|černo.bíl\w*/i.test(t)
  ) {
    return "cerna_bila";
  }
  if (/černobíl\w*|čb\b|černo.bíl\w*|do čb|šediv\w*|grayscale|monochrom/i.test(t)) return "cerna_bila";
  if (/barevn\w*|do barvy|barvu\b|color/i.test(t)) return "barva";
  return null;
}

function parseFormatOverride(t: string): PolozkaVykres["detekce"]["standard"] | null {
  if (!FORMAT_TRIGGER.test(t)) return null;
  const m = t.match(/\ba([0-4])\b/);
  if (!m) return null;
  return `A${m[1]}` as PolozkaVykres["detekce"]["standard"];
}

const BAREVNOST_POPIS: Record<string, string> = {
  cerna_bila: "černobíle",
  barva: "barevně",
  zvysene_pokryti: "barevně se zvýšeným pokrytím",
};

/** Zkusí najít v textu odkaz na konkrétní položku podle názvu souboru. */
function najdiPolozkuVTextu(t: string, polozky: PolozkaVykres[]): PolozkaVykres | null {
  for (const p of polozky) {
    const stem = kratkyNazev(p).replace(/\.pdf$/i, "");
    const tokeny = stem.split(/[\s_\-.]+/).filter((s) => s.length >= 2);
    if (tokeny.some((tok) => t.includes(tok.toLowerCase()))) return p;
  }
  return null;
}

export function odpovezNaVstup(
  vstup: string,
  z: VykresZakazka,
  cekameNa: CekanePole,
  cekanaPolozka: string | null,
): OdpovedAsistenta {
  const t = vstup.trim().toLowerCase();

  if (t.includes("změnit kusy") || t.includes("změnit kus")) {
    const vic = z.polozky.length > 1;
    return {
      text: vic ? "Kterému výkresu, nebo „všem“?" : "Kolik kusů tedy?",
      rychleOdpovedi: KUSY_ODPOVEDI,
      cekaNa: "kusy",
      cekanaPolozka: vic ? null : z.polozky[0]?.id,
    };
  }
  if (t.includes("změnit sklád")) {
    return {
      text: "Skládat nebo ne? („všem na A4“ = pro všechny výkresy)",
      rychleOdpovedi: SKLADANI_ODPOVEDI,
      cekaNa: "skladani",
      cekanaPolozka: null,
    };
  }
  if (t.includes("změnit služb") || t.includes("změnit typ")) {
    return { text: "Jaký typ služby?", rychleOdpovedi: SLUZBA_ODPOVEDI, cekaNa: "sluzba" };
  }

  const hromadne = jeHromadne(t);
  const odkazanaPolozka = najdiPolozkuVTextu(t, z.polozky);
  const cilovaPolozka = odkazanaPolozka ?? z.polozky.find((p) => p.id === cekanaPolozka) ?? null;

  // 1) Kontextová interpretace podle čekané otázky
  if (cekameNa === "kusy") {
    const n = parseKusy(t);
    if (n !== null) {
      if (hromadne || !cilovaPolozka) {
        const z2: VykresZakazka = {
          ...z,
          polozky: z.polozky.map((p) => ({ ...p, pocetKusu: n })),
        };
        const next = dalsiOtazka(z2);
        return {
          text: `Všem výkresům ${n} ks. ${next.text}`,
          rychleOdpovedi: next.rychleOdpovedi,
          vsemPolozkam: { pocetKusu: n },
          cekaNa: next.cekaNa,
          cekanaPolozka: next.cekanaPolozka,
        };
      }
      const z2: VykresZakazka = {
        ...z,
        polozky: z.polozky.map((p) => (p.id === cilovaPolozka.id ? { ...p, pocetKusu: n } : p)),
      };
      const next = dalsiOtazka(z2);
      return {
        text: `„${kratkyNazev(cilovaPolozka)}": ${n} ks. ${next.text}`,
        rychleOdpovedi: next.rychleOdpovedi,
        polozka: { id: cilovaPolozka.id, pocetKusu: n },
        cekaNa: next.cekaNa,
        cekanaPolozka: next.cekanaPolozka,
      };
    }
  }

  if (cekameNa === "skladani" || /\bsklád|\bslož|\brole\b/.test(t)) {
    const s = parseSkladani(t);
    if (s === "zeptat") {
      return {
        text: "Na jaký cílový formát skládat?",
        rychleOdpovedi: SKLADANI_ODPOVEDI,
        cekaNa: "skladani",
        cekanaPolozka,
      };
    }
    if (s) {
      const popis = s.ano
        ? `skládání ${s.typ === "na_A4" ? "na A4" : "na A3"}`
        : "bez skládání (role)";
      if (hromadne || (!cilovaPolozka && cekameNa === "skladani")) {
        const z2: VykresZakazka = {
          ...z,
          polozky: z.polozky.map((p) => ({ ...p, skladani: { ...p.skladani, ...s } })),
        };
        const next = dalsiOtazka(z2);
        return {
          text: `Všem výkresům: ${popis}. ${next.text}`,
          rychleOdpovedi: next.rychleOdpovedi,
          vsemPolozkam: { skladani: s },
          cekaNa: next.cekaNa,
          cekanaPolozka: next.cekanaPolozka,
        };
      }
      if (cilovaPolozka) {
        const z2: VykresZakazka = {
          ...z,
          polozky: z.polozky.map((p) =>
            p.id === cilovaPolozka.id ? { ...p, skladani: { ...p.skladani, ...s } } : p,
          ),
        };
        const next = dalsiOtazka(z2);
        return {
          text: `„${kratkyNazev(cilovaPolozka)}": ${popis}. ${next.text}`,
          rychleOdpovedi: next.rychleOdpovedi,
          polozka: { id: cilovaPolozka.id, skladani: s },
          cekaNa: next.cekaNa,
          cekanaPolozka: next.cekanaPolozka,
        };
      }
    }
  }

  // Vynucení barevnosti / formátu – může přijít kdykoliv a přebíjí detekci
  const novaBarevnost = parseBarevnost(t);
  const novyFormat = parseFormatOverride(t);
  if (novaBarevnost || novyFormat) {
    const vynuceno: NonNullable<PolozkaVykres["vynuceno"]> = {};
    const popisy: string[] = [];
    if (novaBarevnost) {
      vynuceno.barevnost = novaBarevnost;
      popisy.push(`tisk ${BAREVNOST_POPIS[novaBarevnost]}`);
    }
    if (novyFormat) {
      vynuceno.standard = novyFormat;
      popisy.push(`formát ${novyFormat}`);
    }
    const popis = `Vynucuji ${popisy.join(" a ")}`;
    // Bez uvedení výkresu u více položek aplikujeme na všechny (bezpečnější mock)
    const seTtykaVsech = hromadne || !cilovaPolozka;
    if (seTtykaVsech) {
      const z2: VykresZakazka = {
        ...z,
        polozky: z.polozky.map((p) => ({ ...p, vynuceno: { ...p.vynuceno, ...vynuceno } })),
      };
      const next = dalsiOtazka(z2);
      return {
        text: `${popis} pro všechny výkresy. ${next.text}`,
        rychleOdpovedi: next.rychleOdpovedi,
        vsemPolozkam: { vynuceno },
        cekaNa: next.cekaNa,
        cekanaPolozka: next.cekanaPolozka,
      };
    }
    if (cilovaPolozka) {
      const z2: VykresZakazka = {
        ...z,
        polozky: z.polozky.map((p) =>
          p.id === cilovaPolozka.id
            ? { ...p, vynuceno: { ...p.vynuceno, ...vynuceno } }
            : p,
        ),
      };
      const next = dalsiOtazka(z2);
      return {
        text: `${popis} pro „${kratkyNazev(cilovaPolozka)}“ (detekce zůstává, jen se přebíjí). ${next.text}`,
        rychleOdpovedi: next.rychleOdpovedi,
        polozka: { id: cilovaPolozka.id, vynuceno },
        cekaNa: next.cekaNa,
        cekanaPolozka: next.cekanaPolozka,
      };
    }
  }

  // 2) Heuristiky napříč poli
  const sl = parseSluzba(t);
  if (sl) {
    const next = dalsiOtazka({ ...z, typSluzby: sl.val });
    return {
      text: `Typ služby: ${sl.label}. ${next.text}`,
      rychleOdpovedi: next.rychleOdpovedi,
      zmeny: { typSluzby: sl.val },
      cekaNa: next.cekaNa,
      cekanaPolozka: next.cekanaPolozka,
    };
  }

  const kusy = parseKusy(t);
  if (kusy !== null && cilovaPolozka) {
    const z2: VykresZakazka = {
      ...z,
      polozky: z.polozky.map((p) => (p.id === cilovaPolozka.id ? { ...p, pocetKusu: kusy } : p)),
    };
    const next = dalsiOtazka(z2);
    return {
      text: `„${kratkyNazev(cilovaPolozka)}": ${kusy} ks. ${next.text}`,
      rychleOdpovedi: next.rychleOdpovedi,
      polozka: { id: cilovaPolozka.id, pocetKusu: kusy },
      cekaNa: next.cekaNa,
      cekanaPolozka: next.cekanaPolozka,
    };
  }

  // 3) Neporozumění → zopakovat aktuální otázku
  const next = dalsiOtazka(z);
  const nerozumim =
    cekameNa === "kusy"
      ? "Nerozuměl jsem počtu – napište prosím číslo, případně „všem 2“."
      : cekameNa === "skladani"
        ? "Nerozuměl jsem – stačí „Neskládat“, „Na A4“, „Na A3“, případně „všem na A4“"
        : cekameNa === "sluzba"
          ? "Nerozuměl jsem – vyberte typ služby."
          : "Tomu jsem moc nerozuměl.";
  return {
    text: `${nerozumim} ${next.text}`,
    rychleOdpovedi: next.rychleOdpovedi,
    cekaNa: next.cekaNa,
    cekanaPolozka: next.cekanaPolozka,
  };
}
