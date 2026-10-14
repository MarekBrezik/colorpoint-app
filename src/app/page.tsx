import { UploadPanel } from "@/components/UploadPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { MODULY } from "@/lib/modules";

export default function Home() {
  return (
    <main className="flex h-dvh flex-col bg-gradient-to-br from-slate-50 via-background to-indigo-50/40">
      {/* App bar */}
      <header className="flex items-center gap-4 border-b bg-white/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="ColorPoint" className="h-9 w-9 rounded-lg object-contain" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight">AI ColorPoint</p>
            <p className="text-[11px] text-muted-foreground">Nacenění zakázek</p>
          </div>
        </div>

        {/* Přepínač modulů – sada nástrojů */}
        <nav className="ml-4 flex items-center gap-1 rounded-xl bg-muted/60 p-1">
          {MODULY.map((m) => (
            <button
              key={m.id}
              disabled={!m.aktivni}
              title={m.aktivni ? m.popis : `${m.popis} – připravujeme`}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                m.aktivni
                  ? "bg-white text-foreground shadow-sm"
                  : "cursor-not-allowed text-muted-foreground/60"
              }`}
            >
              <m.ikona className="h-3.5 w-3.5" />
              {m.nazev}
              {!m.aktivni && <span className="text-[10px]">· brzy</span>}
            </button>
          ))}
        </nav>

        <div className="ml-auto text-xs text-muted-foreground">fáze 1 · interní nástroj</div>
      </header>

      {/* 3 sloupce */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-3">
        <UploadPanel />
        <ChatPanel />
        <PreviewPanel />
      </div>
    </main>
  );
}
