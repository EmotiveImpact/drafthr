"""Build the DraftHR front page studio: one page whose sections can each be
switched between the Novera (A), Thornhill (B) and Asset (C) mock directions.

Each section variant renders inside its own shadow root with its source page's
stylesheet, so the three styles never clash. Images that the stylesheets embed
are lifted into document-level custom properties (which inherit into shadow
roots), so each image is stored once.

Usage: python3 build.py OUT.html
"""
import html
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
SRC = HERE.parent
PAGES = {"A": "novera", "B": "thornhill", "C": "asset"}
NAMES = {"A": "Novera", "B": "Thornhill", "C": "Asset"}

# slot id, label, {letter: [block selectors in source page order]}
# Block keys: "nav", "footer", or an index into <main>'s element children.
SLOTS = [
    ("top", "Top of page", {"A": ["nav", 0, 1], "B": ["nav", 0], "C": ["nav", 0]}),
    ("what", "What DraftHR is", {"A": [2], "B": [1], "C": [2]}),
    ("letters", "Letter types", {"B": [2]}),
    ("how", "How it works", {"A": [3], "B": [4], "C": [1]}),
    ("trust", "Records and numbers", {"A": [4], "B": [3], "C": [3]}),
    ("stories", "Customer stories", {"A": [6], "C": [4]}),
    ("pricing", "Pricing", {"A": [5], "B": [5], "C": [5]}),
    ("faq", "Questions", {"A": [7], "B": [6], "C": [6]}),
    ("cta", "Closing call to action", {"A": [8], "C": [7]}),
    ("footer", "Footer", {"A": ["footer"], "B": ["footer"], "C": ["footer"]}),
]

PRESETS = {
    "All A · Novera": {s[0]: ("A" if "A" in s[2] else "off") for s in SLOTS},
    "All B · Thornhill": {s[0]: ("B" if "B" in s[2] else "off") for s in SLOTS},
    "All C · Asset": {s[0]: ("C" if "C" in s[2] else "off") for s in SLOTS},
    "Suggested mix": {
        "top": "A", "what": "A", "letters": "B", "how": "C", "trust": "B",
        "stories": "off", "pricing": "B", "faq": "A", "cta": "A", "footer": "B",
    },
}
DEFAULT = "Suggested mix"


def load(letter):
    text = (SRC / f"{PAGES[letter]}.html").read_text()
    css = re.findall(r"<style[^>]*>(.*?)</style>", text, re.S)[0]
    fonts = re.findall(r'<link href="(https://fonts\.googleapis\.com/[^"]+)"', text)
    soup = BeautifulSoup(text, "html.parser")
    main = [c for c in soup.main.children if getattr(c, "name", None)]
    blocks = {"nav": str(soup.header), "footer": str(soup.footer)}
    for i, el in enumerate(main):
        blocks[i] = str(el)
    return css, fonts, blocks


def scope_css(css, letter, images):
    """Make a page stylesheet work inside a shadow root and lift its images out."""
    def lift(m):
        key = f"--img-{letter.lower()}{len(images)}"
        images[key] = m.group(0)
        return f"var({key})"

    css = re.sub(r"url\(data:[^)]*\)", lift, css)
    css = css.replace(":root{", ":host{")
    css = re.sub(r"(^|[}\s])html\{", r"\1:host{", css)
    css = re.sub(r"(^|[}\s])body\{", r"\1.page{", css)
    css = css.replace(".js .rv", ":host(.js) .rv")
    return css


def main(out):
    images, fonts, styles, templates = {}, [], {}, []
    for letter in PAGES:
        css, page_fonts, blocks = load(letter)
        fonts += [f for f in page_fonts if f not in fonts]
        styles[letter] = scope_css(css, letter, images)
        for slot, _, variants in SLOTS:
            if letter in variants:
                inner = "".join(blocks[k] for k in variants[letter])
                templates.append(
                    f'<template id="t-{slot}-{letter}"><div class="page">{inner}</div></template>'
                )

    style_tpl = "".join(
        f'<template id="css-{l}"><style>{css}</style></template>' for l, css in styles.items()
    )
    img_vars = ";".join(f"{k}:{v}" for k, v in images.items())
    slots_js = json.dumps([[s, label, sorted(v.keys())] for s, label, v in SLOTS])
    shell = (HERE / "shell.html").read_text()
    page = (
        shell.replace("/*IMG_VARS*/", img_vars)
        .replace("<!--FONTS-->", "".join(f'<link rel="stylesheet" href="{html.escape(f)}">' for f in fonts))
        .replace("<!--TEMPLATES-->", style_tpl + "".join(templates))
        .replace("/*SLOTS*/", slots_js)
        .replace("/*NAMES*/", json.dumps(NAMES))
        .replace("/*PRESETS*/", json.dumps(PRESETS))
        .replace("/*DEFAULT*/", json.dumps(DEFAULT))
    )
    Path(out).write_text(page)
    print(out, len(page))


if __name__ == "__main__":
    main(sys.argv[1])
