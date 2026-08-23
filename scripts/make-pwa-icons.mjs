import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const GLYPH = `
  <rect width="32" height="32" rx="7" fill="#0a0a0b"/>
  <rect x="5" y="7" width="22" height="18" rx="3" fill="#d5d9e0"/>
  <rect x="8" y="10" width="16" height="12" rx="1.5" fill="#0a0a0b"/>
  <rect x="14" y="12" width="8" height="6" rx="1" fill="#d5d9e0"/>
`;

async function raster(size, file, padRatio = 0) {
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const browser = await chromium.launch({ args: ["--disable-web-security"] });
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!DOCTYPE html>
    <html>
      <body style="margin:0;background:#0a0a0b">
        <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#0a0a0b">
          <svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}" viewBox="0 0 32 32">${GLYPH}</svg>
        </div>
      </body>
    </html>`);
  const buf = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await writeFile(file, buf);
  await browser.close();
}

await raster(192, "public/icon-192.png");
await raster(512, "public/icon-512.png");
await raster(512, "public/icon-512-maskable.png", 0.1);
console.log("wrote public/icon-192.png, icon-512.png, icon-512-maskable.png");
