"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useZakazka } from "@/store/useZakazka";
import { odpovezNaVstup, uvodniZprava } from "@/lib/assistant";
import { aiAsistent } from "@/lib/services";
import type { OdpovedAsistenta } from "@/lib/assistant";
import { SendHorizonal, BotMessageSquare, Loader2 } from "lucide-react";

let idCounter = 100;
const nid = () => `c${++idCounter}`;

export function ChatPanel() {
  const {
    zpravy,
    pridejZpravu,
    aktualizujZakazku,
    aktualizujPolozku,
    aktualizujSkladaniPolozky,
    aktualizujVynuceni,
    aktualizujVsechnyPolozky,
    cekameNa,
    setCekameNa,
  } = useZakazka();
  const [vstup, setVstup] = useState("");
  const [nacitam, setNacitam] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  // úvodní zpráva při mountu
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const o = uvodniZprava(useZakazka.getState().zakazka);
    pridejZpravu({ id: nid(), role: "ai", text: o.text, rychleOdpovedi: o.rychleOdpovedi });
  }, [pridejZpravu]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [zpravy]);

  const aplikujOdpoved = (odp: OdpovedAsistenta) => {
    if (odp.zmeny) aktualizujZakazku(odp.zmeny);
    if (odp.polozka) {
      const { id, pocetKusu, skladani, vynuceno } = odp.polozka;
      if (pocetKusu !== undefined) aktualizujPolozku(id, { pocetKusu });
      if (skladani) aktualizujSkladaniPolozky(id, skladani);
      if (vynuceno) aktualizujVynuceni(id, vynuceno);
    }
    if (odp.vsemPolozkam) {
      aktualizujVsechnyPolozky(
        odp.vsemPolozkam.pocetKusu !== undefined
          ? { pocetKusu: odp.vsemPolozkam.pocetKusu }
          : {},
        odp.vsemPolozkam.skladani,
        odp.vsemPolozkam.vynuceno,
      );
    }
    if (odp.cekaNa !== undefined) setCekameNa(odp.cekaNa, odp.cekanaPolozka);
  };

  const odeslat = async (text: string) => {
    const t = text.trim();
    if (!t || nacitam) return;
    pridejZpravu({ id: nid(), role: "user", text: t });
    setVstup("");
    setNacitam(true);

    const stav = useZakazka.getState();
    let odp: OdpovedAsistenta;
    try {
      odp = await aiAsistent(t, stav.zakazka, stav.cekameNa, stav.cekanaPolozka);
    } catch (e) {
      console.warn("AI asistent selhal, používám lokální logiku:", e);
      odp = odpovezNaVstup(t, stav.zakazka, stav.cekameNa, stav.cekanaPolozka);
    }

    aplikujOdpoved(odp);
    setNacitam(false);
    pridejZpravu({
      id: nid(),
      role: "ai",
      text: odp.text,
      rychleOdpovedi: odp.rychleOdpovedi,
    });
  };

  const posledniAi = [...zpravy].reverse().find((z) => z.role === "ai");

  return (
    <Card className="flex h-full flex-col rounded-2xl border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <BotMessageSquare className="h-4 w-4" />
          </span>
          AI asistent
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="flex flex-col gap-3 pb-2">
            {zpravy.map((z) => (
              <div
                key={z.id}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                  z.role === "ai"
                    ? "self-start rounded-tl-sm bg-slate-100 text-slate-800"
                    : "self-end rounded-tr-sm bg-indigo-600 text-white shadow-sm"
                }`}
              >
                {z.text}
              </div>
            ))}
            {nacitam && (
              <div className="self-start rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Přemýšlím…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {posledniAi?.rychleOdpovedi && posledniAi.rychleOdpovedi.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {posledniAi.rychleOdpovedi.map((r) => (
              <Button
                key={r}
                size="sm"
                variant="outline"
                className="rounded-full border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                onClick={() => odeslat(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            odeslat(vstup);
          }}
        >
          <Textarea
            value={vstup}
            onChange={(e) => setVstup(e.target.value)}
            placeholder={
              cekameNa === "kusy"
                ? "Počet kusů, nebo „všem 2“…"
                : cekameNa === "skladani"
                  ? "Neskládat / Na A4 / Na A3 / „všem na A4“…"
                  : cekameNa === "sluzba"
                    ? "Tisk / Kopie / Sken…"
                    : "Napište odpověď…"
            }
            rows={1}
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                odeslat(vstup);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!vstup.trim() || nacitam}>
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
