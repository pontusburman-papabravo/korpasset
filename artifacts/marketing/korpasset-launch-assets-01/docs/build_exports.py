#!/usr/bin/env python3
"""Package Körpasset launch assets from canonical brand files.

Does not modify product code. SVG is master; existing transparent PNGs are
second-choice fallbacks. No new logo, icon, or color system is invented.
"""

from __future__ import annotations

import hashlib
import shutil
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

NAVY = (26, 43, 76, 255)
TEAL = (0, 200, 150, 255)
OFF_WHITE = (248, 249, 250, 255)
NAVY_SOFT = (26, 43, 76, 210)
WHITE = (255, 255, 255, 255)

ROOT = Path(__file__).resolve().parents[1]
REPO_BRAND = Path("/workspace/app/public/brand")
FONT_DIR = Path("/usr/share/fonts/truetype/macos")

COPY = {
    "headline": "Nu är Körpasset snart här",
    "sub": "För smartare övningskörning tillsammans",
    "points": [
        "En app för elev och handledare",
        "Mer träning i vardagen",
        "Starkare samarbete",
        "Närmare körkortet",
    ],
    "cta": "Vi söker de 25 första familjerna som vill bli beta-testare",
    "url": "Läs mer på korpasset.se",
    "brandline": "ÖVNING IDAG. FRIHET IMORGON.",
}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def raster_svg(path: Path, width: int) -> Image.Image:
    png = cairosvg.svg2png(url=str(path), output_width=width)
    im = Image.open(BytesIO(png)).convert("RGBA")
    return crop_alpha(im)


def crop_alpha(im: Image.Image, threshold: int = 8) -> Image.Image:
    alpha = im.getchannel("A")
    bbox = alpha.point(lambda p: 255 if p > threshold else 0).getbbox()
    return im.crop(bbox) if bbox else im


def fit_width(im: Image.Image, width: int) -> Image.Image:
    if im.width == width:
        return im
    height = max(1, round(im.height * (width / im.width)))
    return im.resize((width, height), Image.Resampling.LANCZOS)


def paste(base: Image.Image, overlay: Image.Image, xy: tuple[int, int]) -> None:
    base.alpha_composite(overlay, xy)


def center_x(canvas_w: int, item_w: int) -> int:
    return (canvas_w - item_w) // 2


def text_width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> int:
    left, _top, right, _bottom = draw.textbbox((0, 0), text, font=fnt)
    return int(right - left)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if text_width(draw, trial, fnt) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [text]


def draw_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    y: int,
    font_obj: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    canvas_w: int,
    spacing: int,
) -> int:
    for line in lines:
        w = text_width(draw, line, font_obj)
        draw.text(((canvas_w - w) // 2, y), line, font=font_obj, fill=fill)
        y += font_obj.size + spacing
    return y


def canvas(size: tuple[int, int], color: tuple[int, int, int, int] = OFF_WHITE) -> Image.Image:
    return Image.new("RGBA", size, color)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()[:16]


def inspect_image(path: Path) -> dict:
    if path.suffix.lower() == ".svg":
        text = path.read_text(encoding="utf-8")
        transparent = "transparent" if 'fill="none"' in text or "viewBox" in text else "vector"
        return {
            "format": "SVG",
            "dimension": "vector",
            "transparent": "ja (ingen bakgrund i logotyp-SVG)",
        }
    im = Image.open(path)
    mode = im.mode
    has_alpha = mode in {"RGBA", "LA"} or (mode == "P" and "transparency" in im.info)
    transparent = "nej"
    if has_alpha:
        extrema = im.getchannel("A").getextrema()
        if extrema[0] < 255:
            transparent = "ja" if extrema[0] == 0 else f"delvis (alpha {extrema[0]}–{extrema[1]})"
        else:
            transparent = "nej (opak alpha)"
    return {
        "format": path.suffix.upper().lstrip("."),
        "dimension": f"{im.size[0]}×{im.size[1]}",
        "transparent": transparent,
    }


def copy_sources() -> None:
    source = ROOT / "source"
    source.mkdir(parents=True, exist_ok=True)
    names = [
        "korpasset-logo.svg",
        "korpasset-logo-tagline.svg",
        "korpasset-symbol.svg",
        "favicon.svg",
        "korpasset-social-light.svg",
        "korpasset-social-dark.svg",
        "korpasset-logo-1200.png",
        "korpasset-logo-tagline-1600.png",
        "korpasset-og-1200x630.png",
        "korpasset-social-1024.png",
        "korpasset-social-dark-1024.png",
        "README.md",
    ]
    for name in names:
        shutil.copy2(REPO_BRAND / name, source / name)


def build_logo_and_icon() -> dict[str, Image.Image]:
    logo_dir = ROOT / "logo"
    icon_dir = ROOT / "icon"
    campaign_dir = ROOT / "campaign"
    for d in (logo_dir, icon_dir, campaign_dir):
        d.mkdir(parents=True, exist_ok=True)

    shutil.copy2(REPO_BRAND / "korpasset-logo.svg", logo_dir / "korpasset-logo.svg")
    shutil.copy2(REPO_BRAND / "korpasset-logo-tagline.svg", logo_dir / "korpasset-logo-tagline.svg")
    shutil.copy2(REPO_BRAND / "korpasset-logo-1200.png", logo_dir / "korpasset-logo-1200.png")
    shutil.copy2(
        REPO_BRAND / "korpasset-logo-tagline-1600.png",
        logo_dir / "korpasset-logo-tagline-1600.png",
    )

    logo = raster_svg(REPO_BRAND / "korpasset-logo.svg", 1800)
    logo_tagline = raster_svg(REPO_BRAND / "korpasset-logo-tagline.svg", 2100)
    logo.save(logo_dir / "korpasset-logo.png")
    logo_tagline.save(logo_dir / "korpasset-logo-tagline.png")

    shutil.copy2(REPO_BRAND / "korpasset-symbol.svg", icon_dir / "korpasset-symbol.svg")
    shutil.copy2(REPO_BRAND / "favicon.svg", icon_dir / "favicon.svg")
    shutil.copy2(REPO_BRAND / "korpasset-social-light.svg", icon_dir / "korpasset-icon-light.svg")
    shutil.copy2(REPO_BRAND / "korpasset-social-dark.svg", icon_dir / "korpasset-icon-dark.svg")
    shutil.copy2(REPO_BRAND / "korpasset-social-1024.png", icon_dir / "korpasset-icon-light-1024.png")
    shutil.copy2(
        REPO_BRAND / "korpasset-social-dark-1024.png",
        icon_dir / "korpasset-icon-dark-1024.png",
    )

    symbol = raster_svg(REPO_BRAND / "korpasset-symbol.svg", 800)
    symbol.save(icon_dir / "korpasset-symbol.png")

    shutil.copy2(
        REPO_BRAND / "korpasset-og-1200x630.png",
        campaign_dir / "korpasset-campaign-landscape-original-1200x630.png",
    )

    return {
        "logo": logo,
        "logo_tagline": logo_tagline,
        "symbol": symbol,
        "icon_light": Image.open(REPO_BRAND / "korpasset-social-1024.png").convert("RGBA"),
        "icon_dark": Image.open(REPO_BRAND / "korpasset-social-dark-1024.png").convert("RGBA"),
        "og": Image.open(REPO_BRAND / "korpasset-og-1200x630.png").convert("RGBA"),
    }


def brand_lockup(size: tuple[int, int], logo: Image.Image, max_logo_w: int) -> Image.Image:
    im = canvas(size)
    mark = fit_width(logo, min(max_logo_w, size[0] - 120))
    x = center_x(size[0], mark.width)
    y = (size[1] - mark.height) // 2
    paste(im, mark, (x, y))
    return im


def compose_centered(size: tuple[int, int], content: Image.Image, top_safe: int, bottom_safe: int) -> Image.Image:
    im = canvas(size)
    usable = size[1] - top_safe - bottom_safe
    y = top_safe + max(0, (usable - content.height) // 2)
    x = center_x(size[0], content.width)
    paste(im, content, (x, y))
    return im


def beta_launch_portrait(logo_tagline: Image.Image) -> Image.Image:
    w, h = 1080, 1920
    col = Image.new("RGBA", (w, 1600), (0, 0, 0, 0))
    draw = ImageDraw.Draw(col)

    y = 0
    mark = fit_width(logo_tagline, 780)
    paste(col, mark, (center_x(w, mark.width), y))
    y += mark.height + 64
    draw.rounded_rectangle(
        (center_x(w, 72), y, center_x(w, 72) + 72, y + 4),
        radius=2,
        fill=TEAL,
    )
    y += 72

    headline_font = font("Inter-Bold.ttf", 54)
    y = draw_lines(draw, wrap(draw, COPY["headline"], headline_font, 900), y, headline_font, NAVY, w, 12)
    y += 36
    sub_font = font("Inter-Medium.ttf", 32)
    y = draw_lines(draw, wrap(draw, COPY["sub"], sub_font, 860), y, sub_font, NAVY_SOFT, w, 10)
    y += 64
    point_font = font("Inter-Regular.ttf", 30)
    for point in COPY["points"]:
        draw.text((center_x(w, text_width(draw, point, point_font)), y), point, font=point_font, fill=NAVY)
        y += 58
    y += 56
    cta_font = font("Inter-SemiBold.ttf", 30)
    y = draw_lines(draw, wrap(draw, COPY["cta"], cta_font, 860), y, cta_font, NAVY, w, 10)
    y += 40
    url_font = font("Inter-SemiBold.ttf", 28)
    y = draw_lines(draw, [COPY["url"]], y, url_font, TEAL, w, 0)
    y += url_font.size

    content = crop_alpha(col.crop((0, 0, w, y + 8)))
    # Keep TikTok chrome out of the way: top ~160px, bottom ~240px.
    return compose_centered((w, h), content, 168, 248)


def beta_launch_square(logo_tagline: Image.Image) -> Image.Image:
    w, h = 1080, 1080
    col = Image.new("RGBA", (w, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(col)

    y = 0
    mark = fit_width(logo_tagline, 700)
    paste(col, mark, (center_x(w, mark.width), y))
    y += mark.height + 40
    draw.rounded_rectangle(
        (center_x(w, 72), y, center_x(w, 72) + 72, y + 4),
        radius=2,
        fill=TEAL,
    )
    y += 48

    headline_font = font("Inter-Bold.ttf", 42)
    y = draw_lines(draw, wrap(draw, COPY["headline"], headline_font, 920), y, headline_font, NAVY, w, 6)
    y += 18
    sub_font = font("Inter-Medium.ttf", 26)
    y = draw_lines(draw, wrap(draw, COPY["sub"], sub_font, 900), y, sub_font, NAVY_SOFT, w, 6)
    y += 28
    point_font = font("Inter-Regular.ttf", 24)
    y = draw_lines(draw, wrap(draw, "  ·  ".join(COPY["points"][:2]), point_font, 920), y, point_font, NAVY, w, 4)
    y = draw_lines(draw, wrap(draw, "  ·  ".join(COPY["points"][2:]), point_font, 920), y, point_font, NAVY, w, 4)
    y += 28
    cta_font = font("Inter-SemiBold.ttf", 24)
    y = draw_lines(draw, wrap(draw, COPY["cta"], cta_font, 900), y, cta_font, NAVY, w, 6)
    y += 18
    url_font = font("Inter-SemiBold.ttf", 24)
    y = draw_lines(draw, [COPY["url"]], y, url_font, TEAL, w, 0)
    y += url_font.size

    content = crop_alpha(col.crop((0, 0, w, y + 8)))
    return compose_centered((w, h), content, 64, 64)


def beta_launch_landscape(logo_tagline: Image.Image) -> Image.Image:
    w, h = 1920, 1080
    im = canvas((w, h))
    draw = ImageDraw.Draw(im)

    mark = fit_width(logo_tagline, 820)
    paste(im, mark, (120, (h - mark.height) // 2))

    x = 1020
    col_w = 780
    y = 220
    headline_font = font("Inter-Bold.ttf", 44)
    for line in wrap(draw, COPY["headline"], headline_font, col_w):
        draw.text((x, y), line, font=headline_font, fill=NAVY)
        y += headline_font.size + 8

    y += 18
    sub_font = font("Inter-Medium.ttf", 26)
    for line in wrap(draw, COPY["sub"], sub_font, col_w):
        draw.text((x, y), line, font=sub_font, fill=NAVY_SOFT)
        y += sub_font.size + 6

    y += 36
    draw.rounded_rectangle((x, y, x + 72, y + 4), radius=2, fill=TEAL)
    y += 28
    point_font = font("Inter-Regular.ttf", 24)
    for point in COPY["points"]:
        draw.text((x, y), point, font=point_font, fill=NAVY)
        y += 38

    y += 28
    cta_font = font("Inter-SemiBold.ttf", 24)
    for line in wrap(draw, COPY["cta"], cta_font, col_w):
        draw.text((x, y), line, font=cta_font, fill=NAVY)
        y += cta_font.size + 6
    y += 16
    url_font = font("Inter-SemiBold.ttf", 24)
    draw.text((x, y), COPY["url"], font=url_font, fill=TEAL)
    return im


def scale_icon_to_square(icon: Image.Image, bg: tuple[int, int, int, int]) -> Image.Image:
    im = canvas((1080, 1080), bg)
    fitted = icon.resize((1080, 1080), Image.Resampling.LANCZOS)
    paste(im, fitted, (0, 0))
    return im


def save_rgb(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path, "PNG", optimize=True)


def save_rgba(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def build_exports(assets: dict[str, Image.Image]) -> list[Path]:
    exports = ROOT / "exports"
    if exports.exists():
        shutil.rmtree(exports)
    portrait = exports / "9x16-tiktok-reels-stories"
    square = exports / "1x1-square"
    landscape = exports / "16x9-landscape"

    written: list[Path] = []

    p = portrait / "korpasset-9x16-brand-lockup-1080x1920.png"
    save_rgb(brand_lockup((1080, 1920), assets["logo_tagline"], 860), p)
    written.append(p)

    p = portrait / "korpasset-9x16-beta-launch-1080x1920.png"
    save_rgb(beta_launch_portrait(assets["logo_tagline"]), p)
    written.append(p)

    p = square / "korpasset-1x1-brand-lockup-1080x1080.png"
    save_rgb(brand_lockup((1080, 1080), assets["logo_tagline"], 820), p)
    written.append(p)

    p = square / "korpasset-1x1-beta-launch-1080x1080.png"
    save_rgb(beta_launch_square(assets["logo_tagline"]), p)
    written.append(p)

    p = square / "korpasset-1x1-icon-light-1080x1080.png"
    save_rgb(scale_icon_to_square(assets["icon_light"], OFF_WHITE), p)
    written.append(p)

    p = square / "korpasset-1x1-icon-dark-1080x1080.png"
    save_rgb(scale_icon_to_square(assets["icon_dark"], NAVY), p)
    written.append(p)

    p = landscape / "korpasset-16x9-brand-lockup-1920x1080.png"
    save_rgb(brand_lockup((1920, 1080), assets["logo_tagline"], 1100), p)
    written.append(p)

    p = landscape / "korpasset-16x9-beta-launch-1920x1080.png"
    save_rgb(beta_launch_landscape(assets["logo_tagline"]), p)
    written.append(p)

    # Also keep a 16:9 pad of the original OG plate, without new typesetting.
    og = assets["og"]
    plate = canvas((1920, 1080), OFF_WHITE)
    scaled = og.resize((1920, round(og.height * (1920 / og.width))), Image.Resampling.LANCZOS)
    paste(plate, scaled, (0, (1080 - scaled.height) // 2))
    p = landscape / "korpasset-16x9-og-plate-1920x1080.png"
    save_rgb(plate, p)
    written.append(p)

    return written


def write_inventory(assets_written: list[Path]) -> None:
    rows = []

    def add(path: Path, use: str, canonical: str = "") -> None:
        meta = inspect_image(path)
        rel = path.relative_to(ROOT)
        rows.append(
            {
                "file": str(rel),
                "use": use,
                "canonical": canonical,
                **meta,
                "sha": sha256(path),
            }
        )

    add(ROOT / "logo/korpasset-logo.svg", "Huvudlogga utan tagline. Webbheader, video-end card, ljus bakgrund.", "canonical master")
    add(ROOT / "logo/korpasset-logo.png", "Högupplöst raster av huvudloggan. Använd när SVG inte stöds.", "raster från SVG")
    add(ROOT / "logo/korpasset-logo-1200.png", "Befintlig PNG-preview av huvudloggan. Lägre prioritet än SVG-rastern.", "befintlig PNG")
    add(ROOT / "logo/korpasset-logo-tagline.svg", "Huvudlogga med brandline ÖVNING IDAG. FRIHET IMORGON.", "canonical master")
    add(ROOT / "logo/korpasset-logo-tagline.png", "Högupplöst raster av logga + brandline.", "raster från SVG")
    add(ROOT / "logo/korpasset-logo-tagline-1600.png", "Befintlig PNG av logga + brandline. Andrahandsval.", "befintlig PNG")
    add(ROOT / "icon/korpasset-symbol.svg", "Icon-only / symbol utan text. Favicon-släkt, appikon-master.", "canonical master")
    add(ROOT / "icon/korpasset-symbol.png", "Transparent raster av symbolen.", "raster från SVG")
    add(ROOT / "icon/favicon.svg", "Favicon. Samma symbol, avsedd för webbläsarikon.", "canonical favicon")
    add(ROOT / "icon/korpasset-icon-light.svg", "Appikon / social profil, ljus bakgrund.", "canonical light icon")
    add(ROOT / "icon/korpasset-icon-light-1024.png", "Appikon ljus 1024×1024. Instagram/TikTok/Facebook profil.", "canonical light PNG")
    add(ROOT / "icon/korpasset-icon-dark.svg", "Appikon / social profil, mörk bakgrund.", "canonical dark icon")
    add(ROOT / "icon/korpasset-icon-dark-1024.png", "Appikon mörk 1024×1024.", "canonical dark PNG")
    add(
        ROOT / "campaign/korpasset-campaign-landscape-original-1200x630.png",
        "Närmaste befintliga liggande kampanj-/OG-platta. Ingen separat vertikal originalfil fanns i källan.",
        "canonical landscape plate",
    )
    for path in assets_written:
        add(path, "Annonsredo export. Se README för kanal.", "derived export")

    lines = [
        "# Inventering — Körpasset launch assets 01",
        "",
        "Källmappen `artifacts/input/korpasset-brand/` fanns inte i den här miljön.",
        "Canonical source är därför den låsta identiteten i `app/public/brand/` (riktning **Länken / Vägbanor**).",
        "",
        "Prioritet vid överlapp: **SVG master → transparent PNG → lågupplöst preview**.",
        "",
        "| Fil | Format | Dimension | Transparent | Canonical | Rekommenderad användning | SHA256-16 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| `{row['file']}` | {row['format']} | {row['dimension']} | {row['transparent']} | {row['canonical']} | {row['use']} | `{row['sha']}` |"
        )
    lines += [
        "",
        "## Saknade original",
        "",
        "Följande fanns **inte** som egna källfiler (varken i `artifacts/input/korpasset-brand/` eller i `app/public/brand/`):",
        "",
        "- separat stående kampanjoriginal (9:16)",
        "- separat kvadratisk kampanjoriginal med launch-copy (1:1 med text)",
        "- ny logotyp eller avvikande färgpalett",
        "",
        "9:16- och 1:1-kampanjexporten är därför **formatanpassningar** av den befintliga loggan, brandlinen och den copy som angavs för paketeringen. Ingen ny symbol ritades.",
        "",
    ]
    (ROOT / "docs" / "inventory.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    copy_sources()
    assets = build_logo_and_icon()
    written = build_exports(assets)
    write_inventory(written)
    print(f"Wrote {len(written)} exports under {ROOT / 'exports'}")


if __name__ == "__main__":
    main()
