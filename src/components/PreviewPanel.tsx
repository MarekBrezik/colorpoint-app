"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useZakazka } from "@/store/useZakazka";
import { efBarevnost, efStandard } from "@/lib/types";
import { spocitejCenu } from "@/lib/pricing";
import { ClipboardList, Pencil, RefreshCw, FileCheck } from "lucide-react";

const SLUZBY_LABEL: Record<string, string> = {
  tisk: "Tisk",
  kopie: "Kopie",
  sken: "Sken",
  "tisk+sken": "Tisk + sken",
  "kopie+sken": "Kopie + sken",
};

const BAREVNOST_LABEL: Record<string, string> = {
  cerna_bila: "Černobílá",
  barva: "Barevná",
  zvysene_pokryti: "Barva – zvýšené pokrytí",
  smisena: "Smíšená (viz položky)",
};

const popisSkladani = (s: { ano: boolean; typ: string | null }) =>
  s.typ === null
    ? "–"
    : s.ano
      ? `na ${s.typ === "na_A4" ? "A4" : s.typ === "na_A3" ? "A3" : "vlastní"}`
      : "ne";

export function PreviewPanel() {
  const { zakazka, aktualizujZakazku, smiseneFormaty } = useZakazka();
  const z = zakazka;

  const radek = (label: string, hodnota: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{hodnota}</span>
    </div>
  );

  return (
    <Card className="flex h-full flex-col rounded-2xl border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <ClipboardList className="h-4 w-4" />
          </span>
          Živý náhled zakázky
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {radek("Typ služby", <Badge variant="secondary">{SLUZBY_LABEL[z.typSluzby]}</Badge>)}
        {radek("Počet listů celkem", z.pocetListu || "–")}
        {radek(
          "Formát",
          smiseneFormaty ? (
            <span className="text-amber-600">smíšené formáty</span>
          ) : z.format.standard ? (
            <>
              {z.format.standard}{" "}
              <span className="text-muted-foreground">
                ({z.format.sirkaMm}×{z.format.vyskaMm} mm)
              </span>
            </>
          ) : (
            "–"
          ),
        )}
        {radek("Barevnost", BAREVNOST_LABEL[z.barevnost] ?? z.barevnost)}

        {z.polozky.length > 0 && (
          <>
            <Separator className="my-1" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Položky
            </p>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-2 pr-2">
                {z.polozky.map((p) => (
                  <div key={p.id} className="rounded-md border p-2 text-xs">
                    <p className="truncate font-medium" title={p.nazev}>
                      {p.nazev.split("›").pop()}
                    </p>
                    <p className="text-muted-foreground">
                      {efStandard(p) ?? "?"} · {p.detekce.sirkaMm}×{p.detekce.vyskaMm} mm ·{" "}
                      {p.detekce.pocetStran} str. · {BAREVNOST_LABEL[efBarevnost(p)]}
                    </p>
                    {(p.vynuceno?.barevnost || p.vynuceno?.standard) && (
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {p.vynuceno?.standard && (
                          <Badge variant="outline" className="border-amber-400 px-1 text-[10px] text-amber-600">
                            vynucený formát {p.vynuceno.standard}
                          </Badge>
                        )}
                        {p.vynuceno?.barevnost && (
                          <Badge variant="outline" className="border-amber-400 px-1 text-[10px] text-amber-600">
                            vynucená {BAREVNOST_LABEL[p.vynuceno.barevnost].toLowerCase()}
                          </Badge>
                        )}
                      </p>
                    )}
                    <p className="mt-1">
                      <span className={p.pocetKusu ? "" : "text-amber-600"}>
                        {p.pocetKusu ? `${p.pocetKusu} ks` : "kusy?"}
                      </span>
                      {" · "}
                      <span className={p.skladani.typ ? "" : "text-amber-600"}>
                        skládání: {popisSkladani(p.skladani)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <Separator className="my-1" />

        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-2.5">
          <span className="text-sm font-medium text-slate-600">Orientační cena</span>
          <span className="text-2xl font-bold tracking-tight text-indigo-700">
            {z.cena > 0 ? `${z.cena.toLocaleString("cs-CZ")} Kč` : "–"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Bez DPH, zatím mock výpočet.</p>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1" disabled>
              <Pencil className="h-3 w-3" /> Upravit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              onClick={() => aktualizujZakazku({ cena: spocitejCenu(z) })}
            >
              <RefreshCw className="h-3 w-3" /> Přepočítat
            </Button>
          </div>
          <Button size="sm" className="gap-1" disabled={z.cena === 0}>
            <FileCheck className="h-3 w-3" /> Vytvořit nabídku
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
