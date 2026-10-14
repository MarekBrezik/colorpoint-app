"use client";

import { unzipSync } from "fflate";
import type { AnalyzovanySoubor, PdfDetekce } from "./types";

// A-series rozměry (delší × kratší strana v mm)
const A_FORMATY: Array<{ name: string; a: number; b: number }> = [
  { name: "A0", a: 1189, b: 841 },
  { name: "A1", a: 841, b: 594 },
  { name: "A2", a: 594, b: 420 },
  { name: "A3", a: 420, b: 297 },
  { name: "A4", a: 297, b: 210 },
];

function detekujStandard(sirkaMm: number, vyskaMm: number): PdfDetekce["standard"] {
  const long = Math.max(sirkaMm, vyskaMm);
  const short = Math.min(sirkaMm, vyskaMm);
  for (const f of A_FORMATY) {
    if (Math.abs(long - f.a) < 8 && Math.abs(short - f.b) < 8) {
      return f.name as PdfDetekce["standard"];
    }
  }
  return "vlastni";
}

async function analyzujPdfData(data: ArrayBuffer): Promise<PdfDetekce> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);

  // Rozměr v mm (viewport scale 1 = body, 1pt = 25.4/72 mm)
  const viewport = page.getViewport({ scale: 1 });
  const sirkaMm = Math.round((viewport.width * 25.4) / 72);
  const vyskaMm = Math.round((viewport.height * 25.4) / 72);
  const orientace =
    sirkaMm > vyskaMm ? "na_sirku" : sirkaMm < vyskaMm ? "na_vysku" : "ctverec";

  // Render 1. stránky – nízké rozlišení pro analýzu barevnosti
  const analyzaViewport = page.getViewport({ scale: 0.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(analyzaViewport.width);
  canvas.height = Math.floor(analyzaViewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  await page.render({ canvasContext: ctx, viewport: analyzaViewport, canvas }).promise;

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let barevnePixely = 0;
  let nebilePixely = 0;
  let celkem = 0;
  const krok = 16; // vzorkování každého 4. pixelu (RGBA = 4 bajty)
  for (let i = 0; i < img.length; i += krok) {
    const r = img[i];
    const g = img[i + 1];
    const b = img[i + 2];
    celkem++;
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (maxDiff > 25) barevnePixely++;
    if (r < 235 || g < 235 || b < 235) nebilePixely++;
  }
  const podilBarevnych = barevnePixely / celkem;
  const pokrytiProcent = Math.round((nebilePixely / celkem) * 100);

  let barevnost: PdfDetekce["barevnost"] = "cerna_bila";
  if (podilBarevnych > 0.02) {
    barevnost = pokrytiProcent > 40 ? "zvysene_pokryti" : "barva";
  }

  // Náhled v rozumném rozlišení
  const nahledViewport = page.getViewport({ scale: 300 / viewport.width });
  const nc = document.createElement("canvas");
  nc.width = Math.floor(nahledViewport.width);
  nc.height = Math.floor(nahledViewport.height);
  const nctx = nc.getContext("2d")!;
  await page.render({ canvasContext: nctx, viewport: nahledViewport, canvas: nc }).promise;

  const pocetStran = doc.numPages;
  const nahledDataUrl = nc.toDataURL("image/png");
  await loadingTask.destroy();

  return {
    pocetStran,
    sirkaMm,
    vyskaMm,
    orientace,
    standard: detekujStandard(sirkaMm, vyskaMm),
    barevnost,
    pokrytiProcent,
    nahledDataUrl,
  };
}

const jePdf = (nazev: string) => nazev.toLowerCase().endsWith(".pdf");
const jeZip = (nazev: string) => nazev.toLowerCase().endsWith(".zip");

/** Rozbalí ZIPy a vrátí plochý seznam { nazev, data } všech PDF. */
async function rozbalPdfSoubory(
  soubory: File[],
): Promise<Array<{ nazev: string; data: ArrayBuffer }>> {
  const vysledek: Array<{ nazev: string; data: ArrayBuffer }> = [];
  for (const file of soubory) {
    if (jeZip(file.name)) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      for (const [cesta, bytes] of Object.entries(entries)) {
        const nazev = cesta.split("/").pop() ?? cesta;
        if (jePdf(nazev) && bytes.length > 0) {
          vysledek.push({ nazev: `${file.name} › ${nazev}`, data: bytes.buffer as ArrayBuffer });
        }
      }
    } else if (jePdf(file.name) || file.type === "application/pdf") {
      vysledek.push({ nazev: file.name, data: await file.arrayBuffer() });
    }
  }
  return vysledek;
}

/** Přijme libovolný mix PDF a ZIP souborů, analyzuje každé PDF zvlášť. */
export async function analyzujSoubory(soubory: File[]): Promise<AnalyzovanySoubor[]> {
  const pdfSoubory = await rozbalPdfSoubory(soubory);
  const vysledky: AnalyzovanySoubor[] = [];
  for (const s of pdfSoubory) {
    try {
      const detekce = await analyzujPdfData(s.data);
      vysledky.push({ nazev: s.nazev, detekce });
    } catch (e) {
      console.error(`Nepodařilo se analyzovat ${s.nazev}`, e);
    }
  }
  return vysledky;
}
