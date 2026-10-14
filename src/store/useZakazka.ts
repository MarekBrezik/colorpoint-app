"use client";

import { create } from "zustand";
import type {
  AnalyzovanySoubor,
  CekanePole,
  ChatZprava,
  PolozkaVykres,
  VykresZakazka,
} from "@/lib/types";
import { efBarevnost, efStandard } from "@/lib/types";
import { spocitejCenu } from "@/lib/pricing";
import { analyzujEmail } from "@/lib/emailParse";

let polozkaId = 0;

interface StavZakazky {
  zakazka: VykresZakazka;
  smiseneFormaty: boolean;
  smisenaBarevnost: boolean;
  zpracovavaSe: boolean;
  zpravy: ChatZprava[];
  cekameNa: CekanePole;
  /** ID položky, na kterou se zrovna ptáme (kusy/skládání). null = globálně. */
  cekanaPolozka: string | null;
  emailText: string;
  emailViditelny: boolean;

  nastavSoubory: (s: AnalyzovanySoubor[]) => void;
  aktualizujZakazku: (p: Partial<VykresZakazka>) => void;
  aktualizujPolozku: (id: string, p: Partial<Omit<PolozkaVykres, "id" | "detekce">>) => void;
  aktualizujSkladaniPolozky: (id: string, s: Partial<PolozkaVykres["skladani"]>) => void;
  aktualizujVynuceni: (id: string, v: NonNullable<PolozkaVykres["vynuceno"]>) => void;
  aktualizujVsechnyPolozky: (
    p: Partial<Pick<PolozkaVykres, "pocetKusu">>,
    s?: Partial<PolozkaVykres["skladani"]>,
    v?: NonNullable<PolozkaVykres["vynuceno"]>,
  ) => void;
  aplikujEmail: () => string[]; // vrátí seznam nalezených instrukcí
  pridejZpravu: (z: ChatZprava) => void;
  setCekameNa: (v: CekanePole, polozkaId?: string | null) => void;
  nastavZpracovani: (v: boolean) => void;
  setEmailText: (v: string) => void;
  setEmailViditelny: (v: boolean) => void;
  reset: () => void;
}

const vychoziZakazka: VykresZakazka = {
  typSluzby: "tisk",
  polozky: [],
  format: { standard: null, sirkaMm: 0, vyskaMm: 0 },
  pocetListu: 0,
  barevnost: "cerna_bila",
  cena: 0,
};

const sCenou = (z: VykresZakazka): VykresZakazka => ({ ...z, cena: spocitejCenu(z) });

/** Nastaví položky a přepočítá agregáty + cenu (volat po každé změně položek). */
function sPolozkami(
  s: Pick<StavZakazky, "zakazka">,
  polozky: PolozkaVykres[],
) {
  const agg = agreguj(polozky);
  return {
    zakazka: sCenou({
      ...s.zakazka,
      polozky,
      format: agg.format,
      pocetListu: agg.pocetListu,
      barevnost: agg.barevnost,
    }),
    smiseneFormaty: agg.smiseneFormaty,
    smisenaBarevnost: agg.smisenaBarevnost,
  };
}

function agreguj(polozky: PolozkaVykres[]) {
  const prvni = polozky[0];
  const stejnyFormat = (p: PolozkaVykres) =>
    efStandard(p) === efStandard(prvni) &&
    (p.vynuceno?.standard
      ? true // vynucený standard – rozměry se řídí standardem
      : p.detekce.sirkaMm === prvni.detekce.sirkaMm &&
        p.detekce.vyskaMm === prvni.detekce.vyskaMm);
  const smiseneFormaty = polozky.some((p) => !stejnyFormat(p));
  const smisenaBarevnost = polozky.some((p) => efBarevnost(p) !== efBarevnost(prvni));
  const barevnost = smisenaBarevnost
    ? ("smisena" as const)
    : prvni
      ? efBarevnost(prvni)
      : "cerna_bila";
  return {
    pocetListu: polozky.reduce((s, p) => s + p.detekce.pocetStran, 0),
    format: {
      standard: smiseneFormaty ? ("vlastni" as const) : prvni ? efStandard(prvni) : null,
      sirkaMm: smiseneFormaty ? 0 : (prvni?.detekce.sirkaMm ?? 0),
      vyskaMm: smiseneFormaty ? 0 : (prvni?.detekce.vyskaMm ?? 0),
    },
    barevnost,
    smiseneFormaty,
    smisenaBarevnost,
  };
}

export const useZakazka = create<StavZakazky>((set, get) => ({
  zakazka: vychoziZakazka,
  smiseneFormaty: false,
  smisenaBarevnost: false,
  zpracovavaSe: false,
  zpravy: [],
  cekameNa: null,
  cekanaPolozka: null,
  emailText: "",
  emailViditelny: false,

  nastavSoubory: (soubory) =>
    set((s) => {
      const polozky: PolozkaVykres[] = soubory.map((f) => ({
        id: `p${++polozkaId}`,
        nazev: f.nazev,
        detekce: f.detekce,
        pocetKusu: 0,
        skladani: { ano: false, typ: null },
      }));
      const agg = agreguj(polozky);
      return {
        zakazka: sCenou({
          ...s.zakazka,
          polozky,
          format: agg.format,
          pocetListu: agg.pocetListu,
          barevnost: agg.barevnost,
        }),
        smiseneFormaty: agg.smiseneFormaty,
        smisenaBarevnost: agg.smisenaBarevnost,
        zpracovavaSe: false,
      };
    }),

  aktualizujZakazku: (p) =>
    set((s) => ({ zakazka: sCenou({ ...s.zakazka, ...p }) })),

  aktualizujPolozku: (id, p) =>
    set((s) => sPolozkami(s, s.zakazka.polozky.map((x) => (x.id === id ? { ...x, ...p } : x)))),

  aktualizujSkladaniPolozky: (id, sk) =>
    set((s) =>
      sPolozkami(
        s,
        s.zakazka.polozky.map((x) =>
          x.id === id ? { ...x, skladani: { ...x.skladani, ...sk } } : x,
        ),
      ),
    ),

  aktualizujVynuceni: (id, v) =>
    set((s) =>
      sPolozkami(
        s,
        s.zakazka.polozky.map((x) =>
          x.id === id ? { ...x, vynuceno: { ...x.vynuceno, ...v } } : x,
        ),
      ),
    ),

  aktualizujVsechnyPolozky: (p, sk, v) =>
    set((s) =>
      sPolozkami(
        s,
        s.zakazka.polozky.map((x) => ({
          ...x,
          ...p,
          skladani: sk ? { ...x.skladani, ...sk } : x.skladani,
          vynuceno: v ? { ...x.vynuceno, ...v } : x.vynuceno,
        })),
      ),
    ),

  aplikujEmail: () => {
    const s = get();
    const v = analyzujEmail(s.emailText, s.zakazka.polozky);
    if (v.nalezeno.length === 0) return [];

    const polozky = s.zakazka.polozky.map((p) => {
      const per = v.perPolozka.get(p.id);
      const kusy = per?.kusy ?? v.kusyGlobal;
      const skladani = per?.skladani ?? v.skladaniGlobal;
      return {
        ...p,
        pocetKusu: kusy !== undefined ? kusy : p.pocetKusu,
        skladani: skladani !== undefined ? { ...skladani } : p.skladani,
      };
    });
    const zakazka: VykresZakazka = {
      ...s.zakazka,
      polozky,
      typSluzby: v.typSluzby ?? s.zakazka.typSluzby,
    };
    set({ zakazka: sCenou(zakazka) });
    return v.nalezeno;
  },

  pridejZpravu: (z) => set((s) => ({ zpravy: [...s.zpravy, z] })),
  setCekameNa: (v, polozkaId = null) => set({ cekameNa: v, cekanaPolozka: polozkaId }),
  nastavZpracovani: (v) => set({ zpracovavaSe: v }),
  setEmailText: (v) => set({ emailText: v }),
  setEmailViditelny: (v) => set({ emailViditelny: v }),

  reset: () =>
    set({
      zakazka: vychoziZakazka,
      smiseneFormaty: false,
      smisenaBarevnost: false,
      zpracovavaSe: false,
      zpravy: [],
      cekameNa: null,
      cekanaPolozka: null,
      emailText: "",
      emailViditelny: false,
    }),
}));
