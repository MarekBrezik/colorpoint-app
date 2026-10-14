"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useZakazka } from "@/store/useZakazka";
import { analyzujSoubory } from "@/lib/pdf";
import { uvodniZprava } from "@/lib/assistant";
import { Mail, UploadCloud, FileText, Sparkles } from "lucide-react";

const BAREVNOST_LABEL: Record<string, string> = {
  cerna_bila: "ČB",
  barva: "barva",
  zvysene_pokryti: "barva, zvýšené pokrytí",
};

let idCounter = 0;
const nid = () => `z${++idCounter}`;

const prijatelny = (f: File) => {
  const n = f.name.toLowerCase();
  return n.endsWith(".pdf") || n.endsWith(".zip") || f.type === "application/pdf";
};

export function UploadPanel() {
  const {
    zakazka,
    zpracovavaSe,
    emailViditelny,
    emailText,
    nastavSoubory,
    nastavZpracovani,
    pridejZpravu,
    setCekameNa,
    setEmailText,
    setEmailViditelny,
    aplikujEmail,
  } = useZakazka();

  const [dragOver, setDragOver] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const polozky = zakazka.polozky;

  const zpracujSoubory = useCallback(
    async (files: File[]) => {
      const validni = files.filter(prijatelny);
      if (validni.length === 0) {
        setChyba("Podporováno je pouze PDF nebo ZIP s PDF.");
        return;
      }
      setChyba(null);
      nastavZpracovani(true);
      try {
        const vysledky = await analyzujSoubory(validni);
        if (vysledky.length === 0) {
          setChyba("V souborech se nenašlo žádné čitelné PDF.");
          nastavZpracovani(false);
          return;
        }
        nastavSoubory(vysledky);

        // Když je vložený e-mail, nejdřív z něj vytáhneme instrukce
        const stav = useZakazka.getState();
        if (stav.emailText.trim()) {
          const nalezeno = aplikujEmail();
          if (nalezeno.length > 0) {
            pridejZpravu({
              id: nid(),
              role: "ai",
              text: `Z e-mailu jsem vytáhl: ${nalezeno.join(", ")}.`,
            });
          }
        }
        const odpoved = uvodniZprava(useZakazka.getState().zakazka);
        setCekameNa(odpoved.cekaNa ?? null, odpoved.cekanaPolozka);
        pridejZpravu({
          id: nid(),
          role: "ai",
          text: odpoved.text,
          rychleOdpovedi: odpoved.rychleOdpovedi,
        });
      } catch (e) {
        console.error(e);
        setChyba("Soubory se nepodařilo načíst.");
        nastavZpracovani(false);
      }
    },
    [nastavSoubory, nastavZpracovani, pridejZpravu, setCekameNa, aplikujEmail],
  );

  const zpracujEmail = useCallback(() => {
    const nalezeno = aplikujEmail();
    pridejZpravu(
      nalezeno.length > 0
        ? {
            id: nid(),
            role: "ai",
            text: `Z e-mailu jsem vytáhl: ${nalezeno.join(", ")}. Hodnoty jsem propsal do náhledu.`,
          }
        : {
            id: nid(),
            role: "ai",
            text: "V e-mailu jsem nenašel žádné konkrétní instrukce (počet kusů, skládání, typ služby).",
          },
    );
    const odpoved = uvodniZprava(useZakazka.getState().zakazka);
    if (useZakazka.getState().zakazka.polozky.length > 0) {
      setCekameNa(odpoved.cekaNa ?? null, odpoved.cekanaPolozka);
      pridejZpravu({ id: nid(), role: "ai", text: odpoved.text, rychleOdpovedi: odpoved.rychleOdpovedi });
    }
  }, [aplikujEmail, pridejZpravu, setCekameNa]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) zpracujSoubory(files);
    },
    [zpracujSoubory],
  );

  return (
    <Card className="flex h-full flex-col rounded-2xl border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <UploadCloud className="h-4 w-4" />
          </span>
          Vstup
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
            dragOver
              ? "scale-[1.01] border-indigo-400 bg-indigo-50/60"
              : "border-slate-300 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30"
          }`}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100/80">
            <UploadCloud className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-sm font-medium">
            {zpracovavaSe ? "Zpracovávám soubory…" : "Přetáhněte PDF výkresy"}
          </p>
          <p className="text-xs text-muted-foreground">
            více souborů najednou, nebo ZIP s PDF
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,.zip"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) zpracujSoubory(files);
              e.target.value = "";
            }}
          />
        </div>

        {chyba && <p className="text-sm text-destructive">{chyba}</p>}

        <Button
          variant="outline"
          onClick={() => setEmailViditelny(!emailViditelny)}
          className="gap-2"
        >
          <Mail className="h-4 w-4" />
          Vložit e-mail
        </Button>

        {emailViditelny && (
          <div className="flex flex-col gap-2">
            <Textarea
              placeholder="Vložte text poptávkového e-mailu – vytáhnu z něj počty kusů, skládání apod."
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={4}
            />
            <Button
              size="sm"
              variant="secondary"
              className="gap-1 self-start"
              disabled={!emailText.trim()}
              onClick={zpracujEmail}
            >
              <Sparkles className="h-3 w-3" /> Zpracovat e-mail
            </Button>
          </div>
        )}

        {polozky.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              {polozky.length} {polozky.length === 1 ? "výkres" : polozky.length < 5 ? "výkresy" : "výkresů"},{" "}
              celkem {zakazka.pocetListu} {zakazka.pocetListu === 1 ? "list" : zakazka.pocetListu < 5 ? "listy" : "listů"}
            </p>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-3 pr-2">
                {polozky.map((p) => (
                  <div key={p.id} className="rounded-md border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.detekce.nahledDataUrl}
                      alt={p.nazev}
                      className="mb-1 w-full rounded-sm object-contain"
                    />
                    <p className="truncate text-xs font-medium" title={p.nazev}>
                      {p.nazev}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.detekce.pocetStran} str., {p.detekce.standard ?? "?"} (
                      {p.detekce.sirkaMm}×{p.detekce.vyskaMm} mm),{" "}
                      {BAREVNOST_LABEL[p.detekce.barevnost] ?? p.detekce.barevnost} (
                      {p.detekce.pokrytiProcent}&nbsp;% pokrytí)
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-md border bg-muted/30 text-xs text-muted-foreground">
            Náhledy se zobrazí po nahrání PDF
          </div>
        )}
      </CardContent>
    </Card>
  );
}
