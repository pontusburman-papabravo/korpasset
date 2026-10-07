import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const repoRoot = join(root, "../../..");

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)("playwright-core");
  } catch {
    return createRequire("/tmp/campaign-tools/package.json")("playwright-core");
  }
}

const { chromium } = loadPlaywright();
const shot = join(root, "raw/04-nasta-handledare.png");
const logo = join(repoRoot, "app/public/brand/korpasset-logo.svg");
const outDir = join(root, "exports");
await mkdir(outDir, { recursive: true });

const shotData = `data:image/png;base64,${(await readFile(shot)).toString("base64")}`;
const logoData = `data:image/svg+xml;base64,${(await readFile(logo)).toString("base64")}`;

/**
 * Visible slice of the 390×844 screenshot, in CSS pixels.
 * Starts at "Alex körkortsresa" and ends just below Starta körpass,
 * above the help bubble. The app header is omitted here because the
 * ad already shows the same logo.
 */
const CROP_TOP = 62;
const CROP_HEIGHT = 650;

const formats = [
  {
    name: "korpasset-nasta-korpass-1080x1350.png",
    width: 1080,
    height: 1350,
    padTop: 40,
    padX: 48,
    padBottom: 36,
    logo: 44,
    title: 72,
    support: 30,
    gap: 14,
  },
  {
    name: "korpasset-nasta-korpass-1080x1080.png",
    width: 1080,
    height: 1080,
    padTop: 36,
    padX: 44,
    padBottom: 32,
    logo: 40,
    title: 60,
    support: 26,
    gap: 10,
  },
  {
    name: "korpasset-nasta-korpass-1080x1920.png",
    width: 1080,
    height: 1920,
    padTop: 260,
    padX: 56,
    padBottom: 360,
    logo: 48,
    title: 76,
    support: 32,
    gap: 16,
  },
];

function html(format) {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: "Inter";
    src: url("file:///usr/share/fonts/truetype/macos/Inter-Regular.ttf") format("truetype");
    font-weight: 400;
  }
  @font-face {
    font-family: "Inter";
    src: url("file:///usr/share/fonts/truetype/macos/Inter-Medium.ttf") format("truetype");
    font-weight: 500;
  }
  @font-face {
    font-family: "Inter";
    src: url("file:///usr/share/fonts/truetype/macos/Inter-SemiBold.ttf") format("truetype");
    font-weight: 600;
  }
  @font-face {
    font-family: "Inter";
    src: url("file:///usr/share/fonts/truetype/macos/Inter-Bold.ttf") format("truetype");
    font-weight: 700;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    width: ${format.width}px;
    height: ${format.height}px;
    overflow: hidden;
    background: #F6F3EC;
    color: #1A2B4C;
    font-family: Inter, "Segoe UI", sans-serif;
  }
  .sheet {
    width: ${format.width}px;
    height: ${format.height}px;
    padding: ${format.padTop}px ${format.padX}px ${format.padBottom}px;
    display: flex;
    flex-direction: column;
  }
  .logo {
    height: ${format.logo}px;
    width: auto;
    align-self: flex-start;
    display: block;
  }
  h1 {
    margin: ${format.gap}px 0 0;
    font-size: ${format.title}px;
    line-height: 1.05;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .support {
    margin: ${Math.round(format.gap * 0.7)}px 0 0;
    font-size: ${format.support}px;
    line-height: 1.3;
    font-weight: 500;
    color: #3E4C66;
  }
  .stage {
    flex: 1;
    min-height: 0;
    margin-top: ${format.gap + 6}px;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }
  .phone {
    width: min(100cqw, calc(100cqh * 390 / ${CROP_HEIGHT}));
    aspect-ratio: 390 / ${CROP_HEIGHT};
    overflow: hidden;
    border-radius: 32px;
    background: #F6F3EC;
    border: 3px solid rgba(26, 43, 76, 0.14);
    box-shadow: 0 16px 40px rgba(26, 43, 76, 0.10);
  }
  .phone img {
    width: 100%;
    height: auto;
    display: block;
    margin-top: calc(-100% * ${CROP_TOP} / 390);
  }
  .footer {
    margin-top: ${format.gap}px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .offer {
    font-size: ${Math.max(26, format.support - 2)}px;
    font-weight: 600;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: ${Math.round(format.support * 2.15)}px;
    padding: 0 28px;
    border-radius: 999px;
    background: #00C896;
    color: #1A2B4C;
    font-size: ${Math.max(26, format.support)}px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .url {
    font-size: ${Math.max(28, format.support)}px;
    font-weight: 700;
    color: #1A2B4C;
    letter-spacing: -0.02em;
  }
  .url span { color: #0C9A78; }
</style>
</head>
<body>
  <div class="sheet">
    <img class="logo" src="${logoData}" alt="Körpasset">
    <h1>Vad ska ni öva på<br>nästa körpass?</h1>
    <p class="support">Planera nästa pass. Kom ihåg vad ni tränat på.</p>
    <div class="stage">
      <div class="phone">
        <img src="${shotData}" alt="Skärmbild från Körpasset: nästa körpass">
      </div>
    </div>
    <div class="footer">
      <div class="row">
        <div class="offer">Gratis under betan</div>
        <div class="cta">Hämta för iPhone</div>
      </div>
      <div class="url">korpasset.se/<span>kom-igang</span></div>
    </div>
  </div>
</body>
</html>`;
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

for (const format of formats) {
  const page = await browser.newPage({
    viewport: { width: format.width, height: format.height },
    deviceScaleFactor: 1,
  });
  await page.setContent(html(format), { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    await Promise.all(images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
  });
  await page.waitForTimeout(200);
  const path = join(outDir, format.name);
  await page.screenshot({ path, clip: { x: 0, y: 0, width: format.width, height: format.height } });
  const box = await page.locator(".phone").boundingBox();
  const title = await page.locator("h1").boundingBox();
  const footer = await page.locator(".footer").boundingBox();
  console.log(format.name, {
    phone: box && { w: Math.round(box.width), h: Math.round(box.height), y: Math.round(box.y) },
    titleBottom: title && Math.round(title.y + title.height),
    footerY: footer && Math.round(footer.y),
    footerBottom: footer && Math.round(footer.y + footer.height),
  });
  await page.close();
}

await browser.close();
