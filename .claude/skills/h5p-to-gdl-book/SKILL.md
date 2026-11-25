---
name: h5p-to-gdl-book
description: Convert an old H5P book from CRWebPlayer's BookContent/ into a GDL book folder under interactive-book-static/<slug>/ that the GDL player loads as ?book=gdl-<slug>, keeping page narration, autoplay, word-by-word highlighting, per-word tap audio and word-to-picture effects. Handles Curious Reader books (content.json with "presentation", narrated), Digital Library books (content.json with "chapters", e.g. the Pashto books, silent), and new language versions built from separately recorded narration (a folder of sentence and word MP3s) laid over a Curious Reader book's pages, with Whisper word alignment. Use when asked to translate, port, migrate or convert an old/H5P/Curious Reader/Digital Library book to the new GDL format, or to add recorded audio to one.
---

# H5P book to GDL book

Turns one old H5P book into a GDL book: a new `content.json` in the GDL player's format,
images copied into `assets/`, narration and word clips copied into `audio/`, and the GDL
player bundle copied alongside so CRWebPlayer can open it at `?book=gdl-<slug>`.

Pictures stay static images. Some are linked to words, so tapping the word plays an effect
on the picture and tapping the picture highlights its words. Narrated pages autoplay on
every page turn and highlight each word as it is spoken, like the Urdu GDL books.

The conversion is done by `convert.py` in this folder (Python 3 standard library only).
The rules below are what it implements; change the script and this file together.

## Which kind of book is it

| `content.json` has | Book kind | Audio after conversion |
|---|---|---|
| `presentation` | Curious Reader book (all 208 in `BookContent/` as of Nov 2026) | Yes: narration, autoplay, word highlighting, per-word tap clips |
| `chapters` | Digital Library book (e.g. `BeeandElephantPashto`) | **None.** These books ship no narration and no timestamps |

Check before promising audio: a Digital Library book has no narration of its own. The same
story usually exists as a narrated Curious Reader book in another language
(`TheBeeAndTheElephantEnLv4`, `...HindiLv4`, `...NepLv4`); its audio is in the wrong language
and must not be reused. When recordings in the right language exist (a folder of one MP3
per sentence and one MP3 per word), follow **Recorded narration** below instead.

## Steps

1. **Find the source folder** and look at the top-level keys of its `content.json` (table
   above). If the book is only on a branch, extract it without switching branches:
   `git archive origin/develop BookContent/<Book>/content | tar -x -C <scratch dir>`
2. **Pick the inputs** (the H5P file holds none of these):
   - `--slug`: lowercase, hyphenated, ending in the language code, matching the existing
     GDL books (`bee-and-the-elephant-ur`, `bee-and-the-elephant-en`).
   - `--language`: ISO code (`ps`, `ur`, `en`, `ne`...). Right-to-left comes from the H5P
     `isRTL` flag (Digital Library books) or from the language code.
   - `--title`: the title in the book's own language. H5P books have no title field, so it
     must come from a person or the catalogue; say so if it was guessed.
   - `--player-from`: an existing GDL book folder whose `gdlplayer.umd.js` and
     `my-lib-style.css` are current and built for the `interactive-book-static` folder.
   - `--source-note` (optional): a credits line, e.g. `Source: Global Digital Library (digitallibrary.io)`.
3. **Run the converter** from the CRWebPlayer repo root:
   ```bash
   python3 .claude/skills/h5p-to-gdl-book/convert.py \
     --src <path>/BookContent/<Book>/content \
     --out interactive-book-static/<slug> \
     --slug <slug> --language <code> --title "<title>" \
     --player-from interactive-book-static/together-ur
   ```
   The printed report gives the format, pages, narrated pages, audio files copied, which
   pictures were linked to which words, and warnings. Read every warning.
4. **Test locally** with the `crwebplayer-static` launch config (port 8791):
   `http://localhost:8791/?book=gdl-<slug>&cr_user_id=<test id>&source=<test>&campaign_id=<test>`.
   Use clearly fake attribution values: the player sends real events to the production
   analytics project. Check:
   - every page turns, text runs in the right direction;
   - on a narrated page, narration starts about 0.75 s after the turn and each word is
     highlighted while spoken (should match the timestamps to within ~0.1 s);
   - turning back to a page plays it again;
   - tapping a word plays that word's clip; tapping a word from the report's `links` list
     also animates its picture.
5. **Do not commit or publish** unless the user asks. The output is plain files in
   `interactive-book-static/`, which CircleCI syncs to S3 once merged. Narrated books are
   large (Bee and Elephant English: 12 MB, mostly WAV).

## Mapping rules: Curious Reader (`presentation`) books

| H5P | GDL | Notes |
|---|---|---|
| `presentation.slides[i]` | `body[i]`, same order | The first slide is usually the title page and has no audio; it stays a normal page. |
| `H5P.Image` with a `file` | `media[]` item, `mediaType: "static"` | Placed at the element's `x`/`y`/`width`/`height` (percent of the slide) mapped onto the 1280 × 600 stage, scaled to fit inside that box without stretching, centred in it. |
| `H5P.Image` without a file, `id: "img<audioId>_<n>"` | a word link on a picture | These are the invisible "glow" hotspots: word `n` of the page's timestamps glows that area. GDL has no hotspots, so word `n` is linked to the picture under the hotspot's centre (else the largest picture) and gets the picture effect. |
| `H5P.CRAdvancedText` | `text` and `words` | Kept for reference; when the page has audio the player shows the timestamp words instead. |
| `H5P.CRAudio` `files[0]` | `audio.pageAudio.mp3/path/filename` | Copied to `audio/`. The player autoplays it on every page turn. |
| `timeStampForEachText[n]` | `pageAudio.segments[n]` | `text` trimmed and entities decoded -> `word`; `startDuration`/`endDuration` (strings, seconds) -> `start`/`end` numbers; `id: n`, `uid: "h5p-<slide>-<n>"`. |
| `timeStampForEachText[n].wordfile[0]` | `segments[n].mp3/path/filename` | The word's own clip, copied to `audio/`; played when the word is tapped. |
| `globalBackgroundSelector.fillGlobalBackground`, `slideBackgroundSelector.fillSlideBackground` | `background: {type: "color", color}` | Slide colour wins over the global one; white if neither. |

Audio rules:
- `pageAudio.provider` is `"h5p"`, `text` is the timestamp words joined by spaces, and
  `transcription` is `null`.
- A page only gets `audio` when it has both a narration file and at least one usable
  timestamp; otherwise it is left silent with a warning. Reason: the player highlights
  from `segments`, and an audio file without them would play with no highlighting.
- Timestamps with no word or an unreadable time are dropped with a warning.
- If the timestamp words differ from the page's text (ignoring spaces, punctuation and
  case) the report warns: readers will see the timestamp words, so the H5P text error
  is now visible.
- Audio paths are written as `/resources/books/<id>/assets/audio/<file>`; the player only
  uses the file name and loads it from `interactive-book-static/<slug>/audio/`.
- Effect `timing` entries are copies of the segments, because the player matches them by
  exact `word` and `start`.

## Mapping rules: Digital Library (`chapters`) books

| H5P | GDL | Notes |
|---|---|---|
| `chapters[i]` (`H5P.Column`) | `body[i]`, same order | Other chapter types are skipped with a warning. The first chapter is often a title/credits page; it is kept. |
| `H5P.Image` | `media[]` item, `mediaType: "static"` | Several images on one page are placed side by side, centred, in a 1240 × 440 area starting 12 from the top, above the bottom text band. |
| `H5P.AdvancedText` / `H5P.Text` | `text` and `words` | All text blocks on the page are joined in order. |
| `<p>` / `<br>` | one line each; a `"\n"` word item between lines | Same encoding the GDL authoring tool produces. |
| `bookCover.coverImage` | `illustration` | Shown on the GDL cover slide with the title. |
| `bookCover.coverDescription` | `bookDescription` | HTML stripped. Not shown by the player. |
| `bookCover.contributors`, `publisher` | `credits.text`, one `role: name` line each | Shown on the credits slide. |
| `isRTL` | `config.textDirection` | Falls back to the language code. |

Text and word rules:
- HTML tags removed, entities decoded, non-breaking spaces become spaces, whitespace
  collapsed, empty lines dropped.
- Words split on spaces. A punctuation-only token (H5P often wraps a quotation mark in its
  own `<span>`) is glued onto the word before it, or the next word at the start of a line.
  Reason: otherwise a lone `"` becomes a tappable word.
- Word items use the GDL no-audio shape: `{word, start: i, end: i+1, uid: "txt--i-(i+1)", id: i}`,
  with `i` counting words and line breaks together.

Word-to-picture rules (there are no hotspots in these books):
- Words of each picture's H5P `alt` text are compared with the page's words after
  normalising both (punctuation, symbols, Arabic diacritics, tatweel and zero-width joiners
  removed, case folded). Every matching page word is linked, repeats included.
- Words under 3 letters after normalising are never linked. Reason: Pashto/Urdu particles
  (`د`, `په`, `او`) appear in almost every alt text and would make pictures react to most taps.
- A picture with no matching word stays static and is not tappable. That is expected when
  the alt text describes the picture in other words.

## Recorded narration (new language over a Curious Reader book)

For a language that only has a silent Digital Library book but has separate recordings,
e.g. the Pashto Drive folders (`<Book>/<book>_ sentences/*.mp3`, `<Book>/<book>_ words/*.mp3`,
the sentence file named with its sentence, each word file named with its word).

1. **Match the recordings to a story first.** Read the sentence file names against both
   versions of the story. The Pashto recordings follow the short Curious Reader story
   (same pages as `TheBeeAndTheElephantEnLv4`), not the longer Digital Library translation in
   `BookContent/BeeandElephantPashto`. Narration must sit on the book whose sentences it
   speaks, so use that Curious Reader book's folder as `--src`; the Digital Library text is
   not used. If the sentences match neither story, stop and ask.
2. **Write a page script** (`examples/bee-and-the-elephant-ps.script.json` is the model):
   `structure` (the Curious Reader source), `sentences_dir`, `words_dir`, and one entry per
   narrated page: `page` (body index of the converted Curious Reader book, 0 = title page),
   `audio` (sentence file name, or a list of names when the page's sentences were recorded
   separately: they are joined in that order, see Rules), `text` (the page text exactly as spoken), `link` (words that
   trigger the page's picture, replacing the other language's glow hotspots) and an optional
   `check` note. Take `text` from the file names, but file names get cut short: complete a
   line only from the word clips that exist for it, and record that in `check`. Get the
   script checked by a reader of the language before release.
   Don't trust file names blindly: recordings are sometimes misnamed (Let's Fly had sentences
   inside files named after other sentences, and files named only `11`/`16`). Transcribe each
   sentence file with Whisper and compare it with its name before writing the script; work
   out a misnamed file's page from what is said, and say so in `check`.
3. **Align** with a Python that has `stable-ts` and `imageio-ffmpeg` (a throwaway venv is
   fine: `python3 -m venv <venv> && <venv>/bin/pip install stable-ts imageio-ffmpeg`, about
   1 GB):
   ```bash
   <venv>/bin/python .claude/skills/h5p-to-gdl-book/align.py \
     --script <script.json> --audio-root "<Drive folder>/<Book>/<book>" \
     --out <scratch>/narration.json --method whisper --model small --language <code>
   ```
   If the model download fails with `CERTIFICATE_VERIFY_FAILED` (Python's certificates on
   this Mac), fetch it with curl into `~/.cache/whisper/<model>.pt` from the URL in
   `whisper._MODELS[<model>]` and check the SHA-256 in that URL. `--method estimate` needs no
   model and is the fallback.
4. **Convert** with `--narration <scratch>/narration.json` added to the usual command and
   `--src` pointing at the Curious Reader book.

Rules:
- Timings: `whisper` force-aligns the known script to the recording; the aligner's words
  are mapped back onto the script's words by their letters. If they cannot be mapped (the
  recording says something else), that page falls back to `estimate` and the report says so.
  `estimate` finds where speech starts and ends (frames above 8% of peak loudness) and
  splits that span across the words in proportion to their word-clip lengths. It misses
  pauses inside a sentence, so prefer `whisper` (on Bee and Elephant the two differed by
  0.14 s on average, 0.48 s at most, almost all from mid-sentence pauses).
- Several recordings for one page (`"audio": [..]`): align.py joins them in order into
  `<out>.audio/page-NN.mp3` (mono, 192 kbps, no gap) and aligns that file; the narration
  JSON points at the joined file, so keep that folder until the book is converted. Use this
  when the source page has two or three sentences recorded separately (Let's Fly, Lost Doll),
  and when one sentence has several takes, give each page a different take.
- Word clips: matched to the page words ignoring punctuation, diacritics, invisible
  characters (zero-width spaces/joiners) and Arabic-script letter variants
  (`ی`/`ۍ`/`ې`/`ي`, `ک`/`ك`, so `کي` finds `کې`). Outer spaces and underscores in a file
  name are ignored. ASCII digits at the end or the start of a name mark another take of the
  same word (`کوي3`, `3کوي`); Arabic-Indic digits are the word itself (`۱۰.mp3` is the
  clip for ۱۰). The n-th time a word appears in the book gets the n-th take (plain name
  first), the last take repeating after that.
- A word with no clip of its own gets a multi-word clip that contains it (`پټ پټونې`,
  `خپلې لنزکه`), preferring one whose words match the words around it on the page; tapping
  the word then plays the phrase. The report lists these under `phrase_clips`. Words with no
  clip at all are listed under `words_without_clip` and play nothing when tapped.
- Files are copied under ASCII names (`page-NN.mp3`, `word-<hash>.mp3`) because recording
  names contain spaces, dots and the book's script.
- Recorded narration replaces the H5P audio, text and hotspot links on the pages it lists.
  The picture links go to the pictures that had hotspots (else the largest picture). Pages
  not in the script (the credits page) keep the source book's content, which is still in
  the source language.
- `pageAudio.provider` is `"recorded"`.

## Rules for every kind

- Default effect is `highlight` (glow plus scale 1 → 1.1 → 0.9 → 1). `--effect` can pick
  `shake`, `bounce` or `jump`, or `none` for no word links. `move` is never used: it needs
  a destination the H5P file does not have.
- A linked picture gets `effect: {type, triggers: ["click"], settings: {}, timing: [...]}`.
- `_id`s are derived from the slug and position, so re-running gives the same ids and
  analytics stay comparable between runs.
- `published` is `true`; `tags` contains `converted-from-h5p` so converted books can be told
  apart from authored ones.
- H5P content types other than images, text and audio are skipped and listed as warnings.

## Known limits

- The player's default font (Quicksand) has no Arabic-script letters, so Pashto/Urdu text
  uses the device's system font. Set `fonts` for a release.
- Curious Reader books keep the H5P layout but not its text styling (white text, font
  sizes); text goes in the standard bottom band.
- In Digital Library books, pages with 3+ lines can push the text band over the bottom of
  the art on narrow screens; lower `IMAGE_MAX_H` in the script for such books.
- A silent book with no recordings can only get narration elsewhere, e.g. by importing the
  converted book into the GDL authoring tool (GDLbook) and generating audio there.
- Whisper alignment accuracy depends on the language; check highlighting by ear on a few
  pages. For Pashto with the `small` model all 10 Bee and Elephant pages aligned.
