#!/usr/bin/env python3
"""Build word timings for recorded page narration, for convert.py --narration.

Input:  a page script (see examples/*.script.json) + the recording folder
        (<root>/<sentences_dir>/*.mp3 one per page, <root>/<words_dir>/*.mp3 one per word).
Output: narration.json: per page the narration file, the text, and one segment per word
        {word, start, end, clip} in seconds, plus a report.

Timings come from one of two methods (SKILL.md, "Recorded narration"):
  --method whisper   forced alignment of the known text with stable-ts (Whisper). Needs
                     `pip install stable-ts imageio-ffmpeg` (run this script with that Python).
  --method estimate  no ML: find where speech starts/ends in the sentence recording and split
                     that span across the words in proportion to their word-clip lengths.
Whisper words that cannot be matched back to the script fall back to the estimate for that page.
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

SR = 16000


# --------------------------------------------------------------- text helpers

def is_punct_only(tok):
    return all(unicodedata.category(c).startswith(("P", "S")) for c in tok)


def tokenize(line):
    out = []
    for tok in line.split():
        if is_punct_only(tok) and out:
            out[-1] += tok
        else:
            out.append(tok)
    if len(out) > 1 and is_punct_only(out[0]):
        out[1] = out[0] + out[1]
        out.pop(0)
    return out


FOLD = str.maketrans({"ۍ": "ی", "ې": "ی", "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه",
                      "أ": "ا", "إ": "ا", "آ": "ا"})


def fold(word):
    """Loose matching form: punctuation, diacritics and joiners removed, Arabic-script letter variants merged."""
    w = unicodedata.normalize("NFC", word)
    w = "".join(c for c in w if not unicodedata.category(c).startswith(("P", "S", "M", "Z", "C"))
                and c != "ـ")
    return w.translate(FOLD).casefold()


# --------------------------------------------------------------- audio helpers

def setup_ffmpeg():
    """Whisper shells out to `ffmpeg`; use the imageio-ffmpeg binary if none is on PATH."""
    from shutil import which
    if which("ffmpeg"):
        return
    import imageio_ffmpeg
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    link_dir = Path(sys.prefix) / "ffmpeg-bin"
    link_dir.mkdir(exist_ok=True)
    link = link_dir / "ffmpeg"
    if not link.exists():
        link.symlink_to(exe)
    os.environ["PATH"] = f"{link_dir}{os.pathsep}{os.environ['PATH']}"


def load(path):
    import whisper
    return whisper.audio.load_audio(str(path), sr=SR)


def speech_span(audio, frame=0.02, rel=0.08):
    """Start/end (seconds) of the speech in a clip: first/last frame above 8% of peak RMS."""
    import numpy as np
    n = int(frame * SR)
    frames = [audio[i:i + n] for i in range(0, len(audio), n)]
    rms = np.array([float(np.sqrt(np.mean(f ** 2))) if len(f) else 0.0 for f in frames])
    if not len(rms) or rms.max() == 0:
        return 0.0, len(audio) / SR
    on = np.where(rms > rms.max() * rel)[0]
    return on[0] * frame, min((on[-1] + 1) * frame, len(audio) / SR)


# --------------------------------------------------------------- word clips

def clip_name(stem):
    """Word clip file stem -> (word, take number).

    Take numbers are ASCII digits at the end or the start of the name ("کوي3", "3کوي");
    Arabic-Indic digits are words ("۱۰.mp3" is the clip for ۱۰). Invisible characters
    (zero-width spaces, joiners, marks) and outer spaces/underscores are dropped first.
    """
    s = "".join(c for c in unicodedata.normalize("NFC", stem) if unicodedata.category(c) != "Cf")
    s = s.strip(" _\u00a0")
    if re.fullmatch(r"[0-9]+", s):
        return s, 1
    m = re.fullmatch(r"([0-9]+)?(.*?)([0-9]+)?", s)
    num = m.group(3) or m.group(1)
    return m.group(2).strip(" _"), int(num or 1)


def index_word_clips(words_dir):
    """({fold(word): [paths: plain take first, then 2, 3, ...]},
        [(folded words of a multi-word clip, path), ...])"""
    idx, phrases = {}, []
    for p in sorted(Path(words_dir).glob("*.mp3")):
        word, num = clip_name(p.stem)
        if len(word.split()) > 1:
            phrases.append(([fold(w) for w in word.split()], num, p))
        idx.setdefault(fold(word), []).append((num, p.name, p))
    return ({k: [p for *_, p in sorted(v)] for k, v in idx.items()},
            [(ws, p) for ws, _, p in sorted(phrases, key=lambda x: (x[1], x[2].name))])


def phrase_clip(phrases, folded, i):
    """Multi-word clip for token i: one whose words match the tokens around i, else one containing it."""
    for ws, p in phrases:
        for j, w in enumerate(ws):
            if w == folded[i] and folded[i - j:i - j + len(ws)] == ws:
                return p
    return next((p for ws, p in phrases if folded[i] in ws), None)


def page_audio(entry, sdir, cache_dir):
    """Path of the page narration; a list of files is joined in order into one mp3."""
    files = entry["audio"] if isinstance(entry["audio"], list) else [entry["audio"]]
    paths = [sdir / f for f in files]
    for f in paths:
        if not f.is_file():
            sys.exit(f"page {entry['page']}: narration file not found: {f}")
    if len(paths) == 1:
        return paths[0]
    import subprocess
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / f"page-{entry['page']:02d}.mp3"
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for f in paths:
        cmd += ["-i", str(f)]
    cmd += ["-filter_complex", "".join(f"[{i}:a]" for i in range(len(paths)))
            + f"concat=n={len(paths)}:v=0:a=1", "-ac", "1", "-b:a", "192k", str(out)]
    subprocess.run(cmd, check=True)
    return out


# --------------------------------------------------------------- timing methods

def estimate(tokens, sentence_audio, clip_lengths):
    start, end = speech_span(sentence_audio)
    weights = [max(l, 0.15) for l in clip_lengths]
    total, t, out = sum(weights), start, []
    for w in weights:
        d = (end - start) * w / total
        out.append((round(t, 3), round(t + d, 3)))
        t += d
    return out


def whisper_align(model, path, text, tokens, language):
    """Forced alignment; map aligner words back onto script tokens by folded characters."""
    result = model.align(str(path), text, language=language)
    pieces = [(fold(w.word), w.start, w.end) for seg in result.segments for w in seg.words]
    pieces = [p for p in pieces if p[0]]
    targets = [fold(t) for t in tokens]
    if "".join(p[0] for p in pieces) != "".join(targets):
        return None
    out, pi, used = [], 0, ""
    for tgt in targets:
        start = end = None
        while len(used) < len(tgt) and pi < len(pieces):
            txt, s, e = pieces[pi]
            start = s if start is None else start
            end = e
            used += txt
            pi += 1
        if used != tgt or start is None:
            return None
        out.append((round(start, 3), round(end, 3)))
        used = ""
    return out


# --------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--script", required=True)
    ap.add_argument("--audio-root", required=True, help="folder holding the script's sentences_dir and words_dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--method", choices=["whisper", "estimate"], default="whisper")
    ap.add_argument("--model", default="small", help="Whisper model for --method whisper")
    ap.add_argument("--language", default="ps")
    args = ap.parse_args()

    setup_ffmpeg()
    script = json.loads(Path(args.script).read_text(encoding="utf-8"))
    root = Path(args.audio_root)
    sdir, wdir = root / script["sentences_dir"], root / script["words_dir"]
    clips, phrases = index_word_clips(wdir)
    cache_dir = Path(args.out).with_suffix(".audio")
    clip_len = {}
    model = None
    if args.method == "whisper":
        import stable_whisper
        model = stable_whisper.load_model(args.model)

    report = {"method": args.method, "model": args.model if model else None, "pages": [],
              "words_without_clip": [], "phrase_clips": [], "unused_clips": []}
    used_clips, pages, seen = set(), [], {}
    for entry in script["pages"]:
        tokens = tokenize(entry["text"])
        spath = page_audio(entry, sdir, cache_dir)
        audio = load(spath)

        # word clip per token: the n-th take for the n-th time a word appears in the book
        chosen, folded = [], [fold(t) for t in tokens]
        for i, tok in enumerate(tokens):
            takes = clips.get(folded[i], [])
            n = seen.get(folded[i], 0)
            seen[folded[i]] = n + 1
            clip = takes[min(n, len(takes) - 1)] if takes else None
            if not clip:
                clip = phrase_clip(phrases, folded, i)
                if clip:
                    report["phrase_clips"].append({"page": entry["page"], "word": tok, "clip": clip.name})
            if clip:
                used_clips.add(clip)
            else:
                report["words_without_clip"].append({"page": entry["page"], "word": tok})
            chosen.append(clip)
        for c in chosen:
            if c and c not in clip_len:
                a = load(c)
                s, e = speech_span(a)
                clip_len[c] = e - s
        lengths = [clip_len.get(c, 0.3) for c in chosen]

        method, times = args.method, None
        if model:
            try:
                times = whisper_align(model, spath, entry["text"], tokens, args.language)
            except Exception as exc:  # noqa: BLE001 - fall back, but say why
                report.setdefault("errors", []).append({"page": entry["page"], "error": str(exc)})
            if times is None:
                method = "estimate (whisper words did not match the script)"
        if times is None:
            times = estimate(tokens, audio, lengths)

        dur = round(len(audio) / SR, 3)
        segments = [{"word": t, "start": s, "end": min(e, dur), "clip": str(c) if c else None}
                    for t, (s, e), c in zip(tokens, times, chosen)]
        pages.append({"page": entry["page"], "audio": str(spath), "text": entry["text"],
                      "link": entry.get("link", []), "segments": segments, "duration": dur,
                      "method": method})
        report["pages"].append({"page": entry["page"], "words": len(tokens), "duration": dur,
                                "method": method, "check": entry.get("check")})

    report["unused_clips"] = sorted({p.name for v in clips.values() for p in v if p not in used_clips})
    out = {"structure": script.get("structure"), "pages": pages, "report": report}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
