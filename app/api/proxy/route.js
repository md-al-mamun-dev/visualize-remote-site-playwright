import { NextResponse } from "next/server";
import { chromium } from "playwright";

export async function GET(req) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "URL missing" });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle" });

  await page.evaluate(async () => await document.fonts.ready);

  let html = await page.content();

  await browser.close();

  const origin = new URL(url).origin;

  // Rewrite ALL resource URLs to proxy them
  html = html.replace(/src="\/([^"]+)"/g, `src="/api/proxy/resource?url=${origin}/$1"`)
             .replace(/href="\/([^"]+)"/g, `href="/api/proxy/resource?url=${origin}/$1"`);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}