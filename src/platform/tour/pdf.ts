// Pitch decks as PDF: the deck page (src/app/deck/[id]) printed by a headless Chrome or Edge on this server, so the PDF
// looks exactly like the page, map included. One at a time: a browser is heavy, and each deck is rendered once and kept
// (tour_decks). After changing the deck's design, empty that table so plans print again with the new one.
import { existsSync } from "node:fs";
import { setting } from "@/lib/settings";
import { TourError } from "@/core/tour/types";

const PLACES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** The browser that prints decks: the one set in PDF_BROWSER, else the first usual install that exists. */
export const deckBrowser = () => [setting("PDF_BROWSER"), ...PLACES].find((p): p is string => !!p && existsSync(p));

let queue: Promise<unknown> = Promise.resolve();

/** Prints a page of this server to PDF (its own @page size: A4 landscape). */
export function renderPdf(url: string): Promise<Buffer> {
  const run = queue.then(async () => {
    const executablePath = deckBrowser();
    if (!executablePath) throw new TourError("no_browser", "This server can't make PDFs yet: it needs Chrome or Edge. Open the deck and print it to PDF instead.", 503);
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      // Tall enough that every page of the deck is in view, so its pictures load before printing.
      const page = await browser.newPage({ viewport: { width: 1123, height: 6000 } });
      await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      return await page.pdf({ printBackground: true, preferCSSPageSize: true });
    } finally {
      await browser.close();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}
