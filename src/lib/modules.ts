import type { LucideIcon } from "lucide-react";
import { FileStack, Printer, Ruler } from "lucide-react";

/**
 * Registr nacěňovacích modulů. Aplikace je navržená jako sada nástrojů
 * (výkresy, maloformát, velkoformát…) – každý modul má vlastní workflow,
 * ale sdílí shell (layout, asistent, živý náhled, výstup do nabídky).
 *
 * Nový modul = přidat položku sem + implementovat jeho store/panely.
 */
export interface ModulNaceneni {
  id: string;
  nazev: string;
  popis: string;
  ikona: LucideIcon;
  aktivni: boolean;
}

export const MODULY: ModulNaceneni[] = [
  {
    id: "vykresy",
    nazev: "Výkresy",
    popis: "Tisk technických výkresů",
    ikona: FileStack,
    aktivni: true,
  },
  {
    id: "maloformat",
    nazev: "Maloformát",
    popis: "Letyáky, vizitky, brožury",
    ikona: Printer,
    aktivni: false,
  },
  {
    id: "velkoformat",
    nazev: "Velkoformát",
    popis: "Plakáty, bannery, polepy",
    ikona: Ruler,
    aktivni: false,
  },
];

export const aktivniModul = MODULY.find((m) => m.aktivni)!;
