#!/usr/bin/env python3
"""Convert an old H5P book from CRWebPlayer's BookContent/<Book>/content/ into a GDL book
folder the GDL player can load (interactive-book-static/<slug>/).

Two H5P formats are handled (rules in SKILL.md next to this file):
  * Curious Reader books   - content.json has "presentation": images, text, and a
                             CRAudio element with page narration + per-word timestamps.
  * Digital Library books  - content.json has "chapters": images and text, no audio.

Standard library only.

Usage:
  python3 convert.py --src BookContent/TheBeeAndTheElephantEnLv4/content \
      --out interactive-book-static/bee-and-the-elephant-en \
      --slug bee-and-the-elephant-en --language en --title "The Bee and the Elephant" \
      [--player-from interactive-book-static/together-ur] [--effect highlight]
"""
import argparse
import hashlib
import html
import json
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

STAGE_W, STAGE_H = 1280, 600          # GDL page stage, in player units
IMAGE_TOP = 12                         # Digital Library layout: gap above the art
IMAGE_MAX_H = 440                      # Digital Library layout: keeps art above the text band
IMAGE_MAX_W = 1240
GAP = 24                               # between images sharing a page
MIN_LINK_LEN = 3                       # shorter words (particles) never trigger effects by alt text
RTL_LANGS = {"ar", "ps", "fa", "prs", "ur", "ug", "sd", "ckb", "he", "yi", "dv"}
EFFECTS = {"highlight", "shake", "bounce", "jump"}
HOTSPOT_ID = re.compile(r"^img(?P<audio>.+)_(?P<index>\d+)$")


# ---------------------------------------------------------------- helpers

def oid(*parts):
    """Deterministic 24-hex id (Mongo ObjectId shape), stable across re-runs."""
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:24]


def clean_text(s):
    return re.sub(r"\s+", " ", html.unescape(s).replace(" ", " ")).strip()


def html_to_lines(fragment):
    """H5P text HTML -> list of plain-text lines (one per <p>/<br>)."""
    t = re.sub(r"(?i)<br\s*/?>", "\n", fragment or "")
    t = re.sub(r"(?i)</(p|div|h[1-6]|li)>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    lines = [clean_text(ln) for ln in t.split("\n")]
    return [ln for ln in lines if ln]


def is_punct_only(tok):
    return all(unicodedata.category(c).startswith(("P", "S")) for c in tok)


def tokenize(line):
    """Split on spaces; glue punctuation-only tokens (stray quotes, colons) onto a word."""
    out = []
    for tok in line.split(" "):
        if not tok:
            continue
        if is_punct_only(tok) and out:
            out[-1] += tok
        else:
            out.append(tok)
    if len(out) > 1 and is_punct_only(out[0]):
        out[1] = out[0] + out[1]
        out.pop(0)
    return out


def norm(word):
    """Matching form: no punctuation, no Arabic diacritics/tatweel, no joiners, casefolded."""
    w = unicodedata.normalize("NFC", word)
    w = "".join(
        c for c in w
        if not unicodedata.category(c).startswith(("P", "S", "M", "Cf"))
        and c != "ـ"
    )
    return w.casefold()


def build_words(text_lines):
    """GDL no-audio word items; a "\\n" item between lines."""
    words, i = [], 0
    for li, line in enumerate(text_lines):
        if li > 0:
            words.append({"word": "\n", "start": i, "end": i + 1, "uid": f"txt--{i}-{i+1}", "id": i})
            i += 1
        for tok in tokenize(line):
            words.append({"word": tok, "start": i, "end": i + 1, "uid": f"txt--{i}-{i+1}", "id": i})
            i += 1
    return words


def seconds(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def make_effect(effect_type, timing):
    if not timing or effect_type == "none":
        return None
    return {"type": effect_type, "triggers": ["click"], "settings": {}, "timing": timing}


def media_item(slug, page_no, idx, filename, width, height, left, top, scale, name, effect, asset_prefix):
    mid = oid("media", slug, page_no, idx)
    return {
        "_id": mid, "id": mid, "name": name or filename, "extension": Path(filename).suffix,
        "mediaType": "static", "path": asset_prefix + filename, "filename": filename,
        "position": {"left": round(left, 2), "top": round(top, 2)}, "scaleSize": round(scale, 3),
        "zIndex": 10 + idx, "width": width, "height": height,
        "effect": effect, "linkedWords": [], "mirror": False,
    }


class Ctx:
    def __init__(self, args):
        self.args = args
        self.src = Path(args.src)
        self.out = Path(args.out)
        self.assets = self.out / "assets"
        self.audio = self.out / "audio"
        self.book_id = oid("book", args.slug)
        self.asset_prefix = f"/resources/books/{self.book_id}/assets/images/"
        self.audio_prefix = f"/resources/books/{self.book_id}/assets/audio/"
        self.report = {"format": None, "pages": 0, "images": 0, "linked_images": 0,
                       "static_images": 0, "text_pages": 0, "audio_pages": 0,
                       "audio_files": 0, "narrated_from_script": 0, "links": [], "warnings": []}
        self.assets.mkdir(parents=True, exist_ok=True)
        self.copied = set()
        self.narration = {}
        if args.narration:
            data = json.loads(Path(args.narration).read_text(encoding="utf-8"))
            self.narration = {p["page"]: p for p in data["pages"]}

    def warn(self, msg):
        self.report["warnings"].append(msg)

    def copy(self, rel, dest_dir):
        p = self.src / (rel or "")
        if not rel or not p.is_file():
            self.warn(f"missing file {rel!r}")
            return None
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest_dir / p.name)
        return p.name

    def copy_narration(self, path, stem):
        """Copy a recorded file under an ASCII name (recordings are named in the book's script)."""
        p = Path(path)
        name = stem + p.suffix.lower()
        if name not in self.copied:
            self.audio.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, self.audio / name)
            self.copied.add(name)
            self.report["audio_files"] += 1
        return name

    def copy_audio(self, rel):
        name = self.copy(rel, self.audio)
        if name:
            self.report["audio_files"] += 1
        return name


# ------------------------------------------------- Digital Library ("chapters") books

def layout_row(images):
    """Fit 1+ images side by side, centred, inside the art area above the text band."""
    n = len(images)
    box_w = (IMAGE_MAX_W - GAP * (n - 1)) / n
    placed, total_w = [], 0
    for img in images:
        w, h = img["width"] or 1, img["height"] or 1
        scale = min(box_w / w, IMAGE_MAX_H / h)
        placed.append((img, w, h, scale))
        total_w += w * scale
    total_w += GAP * (n - 1)
    left = (STAGE_W - total_w) / 2
    out = []
    for img, w, h, scale in placed:
        top = IMAGE_TOP + (IMAGE_MAX_H - h * scale) / 2
        out.append((img, left, top, scale * 100))
        left += w * scale + GAP
    return out


def pages_from_chapters(ctx, raw):
    args, body = ctx.args, []
    for ci, ch in enumerate(raw["chapters"]):
        lib = ch.get("library", "")
        if not lib.startswith("H5P.Column"):
            ctx.warn(f"chapter {ci}: unsupported library {lib}, skipped")
            continue
        images, text_lines = [], []
        for item in ch["params"].get("content", []):
            c = item.get("content", {})
            clib, params = c.get("library", ""), c.get("params", {})
            if clib.startswith("H5P.Image"):
                f = params.get("file") or {}
                name = ctx.copy(f.get("path"), ctx.assets)
                if name:
                    images.append({"filename": name, "width": f.get("width") or 0,
                                   "height": f.get("height") or 0, "alt": params.get("alt", "")})
            elif clib.startswith(("H5P.AdvancedText", "H5P.Text")):
                text_lines += html_to_lines(params.get("text", ""))
            else:
                ctx.warn(f"chapter {ci}: {clib} not converted (only images and text are)")

        words = build_words(text_lines)
        media = []
        for mi, (img, left, top, scale) in enumerate(layout_row(images) if images else []):
            alt_words = {norm(w) for w in tokenize(img["alt"])}
            timing = [dict(w) for w in words
                      if w["word"] != "\n" and len(norm(w["word"])) >= MIN_LINK_LEN
                      and norm(w["word"]) in alt_words]
            effect = make_effect(args.effect, timing)
            note_links(ctx, ci + 1, img["filename"], effect)
            media.append(media_item(args.slug, ci, mi, img["filename"], img["width"], img["height"],
                                    left, top, scale, img["alt"], effect, ctx.asset_prefix))
        body.append(page(ctx, ci, len(body), text_lines, words, media, "#ffffff", None))

    cover = raw.get("bookCover") or {}
    illustration = None
    cf = cover.get("coverImage") or {}
    if cf.get("path"):
        name = ctx.copy(cf["path"], ctx.assets)
        if name:
            illustration = {"url": ctx.asset_prefix + name, "path": ctx.asset_prefix + name,
                            "name": name, "filename": name,
                            "meta": {"width": cf.get("width"), "height": cf.get("height")}}
    credits = [f'{c.get("type", "").strip()}: {c.get("name", "").strip()}'
               for c in cover.get("contributors", []) if c.get("name")]
    if cover.get("publisher"):
        credits.append(f'{raw.get("publisherLabel", "Publisher")}: {cover["publisher"]}')
    description = " ".join(html_to_lines(cover.get("coverDescription", ""))) or None
    return body, illustration, credits, description, raw.get("isRTL") is True


# ----------------------------------------------- Curious Reader ("presentation") books

def pages_from_presentation(ctx, raw):
    args, body = ctx.args, []
    pres = raw["presentation"]
    global_bg = (pres.get("globalBackgroundSelector") or {}).get("fillGlobalBackground") or "#ffffff"

    for si, slide in enumerate(pres["slides"]):
        bg = (slide.get("slideBackgroundSelector") or {}).get("fillSlideBackground") or global_bg
        images, hotspots, text_lines, audio_el = [], [], [], None
        for el in slide.get("elements", []):
            act = el.get("action", {})
            lib, params = act.get("library", ""), act.get("params", {})
            if lib.startswith("H5P.Image"):
                f = params.get("file")
                if f:
                    images.append((el, f))
                else:
                    m = HOTSPOT_ID.match(el.get("id", ""))
                    if m:
                        hotspots.append((el, int(m.group("index"))))
            elif "AdvancedText" in lib or lib.startswith("H5P.Text"):
                text_lines += html_to_lines(params.get("text", ""))
            elif "Audio" in lib:
                if audio_el is not None:
                    ctx.warn(f"slide {si}: more than one audio element, only the first is used")
                else:
                    audio_el = act
            else:
                ctx.warn(f"slide {si}: {lib} not converted")

        page_id = oid("page", args.slug, si)
        segments, audio = [], None
        if audio_el and si not in ctx.narration:   # recorded narration replaces the H5P audio
            ap = audio_el.get("params", {})
            files = ap.get("files") or []
            main = ctx.copy_audio(files[0]["path"]) if files else None
            for wi, ts in enumerate(ap.get("timeStampForEachText") or []):
                word = clean_text(ts.get("text", ""))
                start, end = seconds(ts.get("startDuration")), seconds(ts.get("endDuration"))
                if not word or start is None or end is None:
                    ctx.warn(f"slide {si}: timestamp {wi} skipped (empty word or bad time)")
                    continue
                seg = {"id": wi, "uid": f"h5p-{si}-{wi}", "word": word, "start": start, "end": end}
                wf = (ts.get("wordfile") or [{}])[0].get("path")
                wname = ctx.copy_audio(wf) if wf else None
                if wname:
                    seg.update({"mp3": ctx.audio_prefix + wname, "path": ctx.audio_prefix + wname,
                                "filename": wname})
                segments.append(seg)
            if main and segments:
                audio = {
                    "_id": oid("audio", args.slug, si), "pageId": page_id, "bookId": ctx.book_id,
                    "created": now_iso(),
                    "pageAudio": {"provider": "h5p", "mp3": ctx.audio_prefix + main,
                                  "path": ctx.audio_prefix + main, "filename": main,
                                  "segments": segments, "text": " ".join(s["word"] for s in segments),
                                  "transcription": None},
                }
                ctx.report["audio_pages"] += 1
            elif audio_el:
                ctx.warn(f"slide {si}: audio element without a usable file or timestamps, page left silent")

        narrated = ctx.narration.get(si)
        if narrated:
            text_lines, segments, audio = narration_page(ctx, si, page_id, narrated)

        # Hotspot -> the art image it sits on (centre point inside the image box; else largest image)
        linked = {i: [] for i in range(len(images))}
        if narrated:
            # Recorded narration replaces the H5P words, so the H5P hotspots (word numbers) no
            # longer apply: the script's link words go to the pictures that had hotspots.
            targets = sorted({hotspot_target(images, hs) for hs, _ in hotspots} - {None})
            if not targets and images and narrated.get("link"):
                targets = [largest(images)]
            wanted = {fold_word(w) for w in narrated.get("link", [])}
            for t in targets:
                linked[t] = [s for s in segments if fold_word(s["word"]) in wanted]
            for w in narrated.get("link", []):
                if not any(fold_word(s["word"]) == fold_word(w) for s in segments):
                    ctx.warn(f"slide {si}: link word {w!r} is not in the page text")
            hotspots = []
        for hs, word_index in hotspots:
            seg = next((s for s in segments if s["id"] == word_index), None)
            if seg is None:
                ctx.warn(f"slide {si}: glow hotspot for word {word_index} has no matching timestamp")
                continue
            target = hotspot_target(images, hs)
            if target is not None and seg not in linked[target]:
                linked[target].append(seg)

        media = []
        for mi, (el, f) in enumerate(images):
            name = ctx.copy(f.get("path"), ctx.assets)
            if not name:
                continue
            w, h = f.get("width") or 1, f.get("height") or 1
            box_l, box_t = el["x"] / 100 * STAGE_W, el["y"] / 100 * STAGE_H
            box_w, box_h = el["width"] / 100 * STAGE_W, el["height"] / 100 * STAGE_H
            scale = min(box_w / w, box_h / h)          # contain inside the H5P box
            left = box_l + (box_w - w * scale) / 2
            top = box_t + (box_h - h * scale) / 2
            timing = [dict(s) for s in sorted(linked[mi], key=lambda s: s["start"])]
            effect = make_effect(args.effect, timing)
            note_links(ctx, si + 1, name, effect)
            media.append(media_item(args.slug, si, mi, name, w, h, left, top, scale * 100,
                                    params_alt(f, el), effect, ctx.asset_prefix))

        words = build_words(text_lines)
        if segments and text_lines:
            spoken = re.sub(r"\s+", "", norm("".join(s["word"] for s in segments)))
            written = re.sub(r"\s+", "", norm("".join(text_lines)))
            if spoken != written:
                ctx.warn(f"slide {si}: timestamp words differ from the page text; the player shows the timestamp words")
        body.append(page(ctx, si, len(body), text_lines, words, media, bg, audio))

    return body, None, [], None, False


def largest(images):
    return max(range(len(images)), key=lambda i: images[i][0]["width"] * images[i][0]["height"])


def hotspot_target(images, hs):
    """Index of the picture under the hotspot's centre, else the largest picture."""
    if not images:
        return None
    cx, cy = hs["x"] + hs["width"] / 2, hs["y"] + hs["height"] / 2
    hit = next((i for i, (el, _) in enumerate(images)
                if el["x"] <= cx <= el["x"] + el["width"] and el["y"] <= cy <= el["y"] + el["height"]), None)
    return hit if hit is not None else largest(images)


FOLD = str.maketrans({"ۍ": "ی", "ې": "ی", "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه",
                      "أ": "ا", "إ": "ا", "آ": "ا"})


def fold_word(w):
    """Same loose form as align.py: norm() plus Arabic-script letter variants merged."""
    return re.sub(r"\s+", "", norm(w)).translate(FOLD)


def narration_page(ctx, si, page_id, n):
    """Recorded narration (align.py output) -> text lines, GDL segments, page audio."""
    main = ctx.copy_narration(n["audio"], f"page-{si:02d}")
    segments = []
    for wi, s in enumerate(n["segments"]):
        seg = {"id": wi, "uid": f"rec-{si}-{wi}", "word": s["word"], "start": s["start"], "end": s["end"]}
        if s.get("clip"):
            name = ctx.copy_narration(s["clip"], "word-" + oid("clip", s["clip"])[:12])
            seg.update({"mp3": ctx.audio_prefix + name, "path": ctx.audio_prefix + name, "filename": name})
        else:
            ctx.warn(f"slide {si}: no word clip for {s['word']!r}; tapping it plays nothing")
        segments.append(seg)
    audio = {
        "_id": oid("audio", ctx.args.slug, si), "pageId": page_id, "bookId": ctx.book_id, "created": now_iso(),
        "pageAudio": {"provider": "recorded", "mp3": ctx.audio_prefix + main, "path": ctx.audio_prefix + main,
                      "filename": main, "segments": segments, "text": n["text"], "transcription": None},
    }
    ctx.report["audio_pages"] += 1
    ctx.report["narrated_from_script"] += 1
    return [n["text"]], segments, audio


def params_alt(f, el):
    return el.get("action", {}).get("params", {}).get("alt") or f.get("path", "").split("/")[-1]


# ---------------------------------------------------------------- shared

def note_links(ctx, page_no, filename, effect):
    ctx.report["images"] += 1
    if effect:
        ctx.report["linked_images"] += 1
        ctx.report["links"].append({"page": page_no, "image": filename,
                                    "words": [t["word"] for t in effect["timing"]]})
    else:
        ctx.report["static_images"] += 1


def page(ctx, src_index, pos, text_lines, words, media, bg_color, audio):
    ctx.report["pages"] += 1
    ctx.report["text_pages"] += 1 if (words or audio) else 0
    p = {
        "_id": oid("page", ctx.args.slug, src_index), "title": f"Page {pos + 1}", "description": "",
        "text": "\n".join(text_lines), "media": media, "words": words or None,
        "background": {"type": "color", "color": bg_color, "crop": None},
        "layoutStyle": 1, "textPosition": None, "textStyle": None,
    }
    if audio:
        p["audio"] = audio
    return p


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def convert(args):
    ctx = Ctx(args)
    raw = json.loads((ctx.src / "content.json").read_text(encoding="utf-8-sig"))
    if "presentation" in raw:
        ctx.report["format"] = "curious-reader (presentation)"
        body, illustration, credits, description, h5p_rtl = pages_from_presentation(ctx, raw)
    elif "chapters" in raw:
        ctx.report["format"] = "digital-library (chapters)"
        body, illustration, credits, description, h5p_rtl = pages_from_chapters(ctx, raw)
    else:
        sys.exit("content.json has neither 'presentation' nor 'chapters': not an H5P book this skill knows.")

    if args.source_note:
        credits.append(args.source_note)
    rtl = h5p_rtl or args.language.split("-")[0] in RTL_LANGS
    ts = now_iso()
    book = {
        "_id": ctx.book_id, "title": args.title, "license": args.license, "published": True,
        "slug": args.slug, "version": "0.0.1", "createdAt": ts, "updatedAt": ts,
        "language": args.language, "credits": {"text": "\n".join(credits), "logos": []},
        "illustration": illustration, "coverText": args.cover_text or "",
        "config": {"textDirection": "RTL" if rtl else "LTR", "voiceId": "", "audioLanguage": args.language},
        "bookDescription": description, "bookText": None, "tags": ["converted-from-h5p"],
        "body": body, "cover": {"show": False, "image": None, "text": None, "description": None},
    }
    (ctx.out / "content.json").write_text(json.dumps(book, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.player_from:
        for f in ("gdlplayer.umd.js", "my-lib-style.css"):
            p = Path(args.player_from) / f
            if p.exists():
                shutil.copy2(p, ctx.out / f)
            else:
                ctx.warn(f"player file {p} not found")
    ctx.report["text_direction"] = book["config"]["textDirection"]
    return ctx.report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="H5P book content dir (holds content.json, images/, audios/)")
    ap.add_argument("--out", required=True, help="output GDL book dir, e.g. interactive-book-static/<slug>")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--language", required=True, help="ISO code, e.g. ps, ur, en")
    ap.add_argument("--title", required=True, help="book title in the book's language (H5P has no title field)")
    ap.add_argument("--cover-text", default="")
    ap.add_argument("--license", default="CC-BY-4.0")
    ap.add_argument("--source-note", default="")
    ap.add_argument("--effect", default="highlight", choices=sorted(EFFECTS) + ["none"])
    ap.add_argument("--player-from", help="GDL book dir to copy gdlplayer.umd.js and my-lib-style.css from")
    ap.add_argument("--narration", help="align.py output: recorded narration that replaces the H5P audio and text "
                                        "on the pages it lists (Curious Reader books only)")
    args = ap.parse_args()
    print(json.dumps(convert(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
