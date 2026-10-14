import { efBarevnost, efStandard } from "./types";
import type { PolozkaVykres, VykresZakazka } from "./types";

// Mock cenová kalkulace – později nahradit skutečným ceníkem.
const ZAKLAD_ZA_LIST: Record<string, number> = {
  A0: 90,
  A1: 55,
  A2: 32,
  A3: 18,
  A4: 9,
  vlastni: 40,
};

function cenaPolozky(p: PolozkaVykres): number {
  if (p.pocetKusu === 0) return 0;
  const zaklad = ZAKLAD_ZA_LIST[efStandard(p) ?? "vlastni"] ?? 40;
  const barvaKoef =
    efBarevnost(p) === "barva"
      ? 1.6
      : efBarevnost(p) === "zvysene_pokryti"
        ? 2.2
        : 1;
  const skladaniZaList = p.skladani.ano ? 4 : 0;
  return (zaklad * barvaKoef + skladaniZaList) * p.detekce.pocetStran * p.pocetKusu;
}

export function spocitejCenu(z: VykresZakazka): number {
  const suma = z.polozky.reduce((s, p) => s + cenaPolozky(p), 0);
  if (suma === 0) return 0;
  const sluzbaKoef =
    z.typSluzby === "sken" ? 0.5 : z.typSluzby.includes("+") ? 1.4 : 1;
  return Math.round(suma * sluzbaKoef);
}
