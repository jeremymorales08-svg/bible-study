# Lamp & Light — a Bible study website

*“Thy word is a lamp unto my feet, and a light unto my path.” — Psalm 119:105*

Lamp & Light is a Bible study web app that reads the Bible **next to its history**:
every chapter sits beside the era it was written in, who wrote it, why, and what was
happening in the world around it. Simple, modern, and honest about what is Scripture
and what is commentary.

## Run it

No build step. Either:

```bash
cd bible-study
python3 -m http.server 8000
# open http://localhost:8000
```

…or just double-click `index.html` (it also works from the filesystem).

An internet connection is needed to load Scripture text (it is fetched live and
never stored or edited). The study notes and timeline work offline.

## What's inside

| Feature | Where |
|---|---|
| Reader — every chapter of all 66 books, exact text | center panel |
| Go anywhere: type `John 3:16`, `Genesis 1`, `Psalms 23`… | top search box |
| Per-book study notes: author, date, setting, purpose, themes, outline, key verses | **Context** tab |
| 12-era biblical timeline (Creation → the last writings) | **Timeline** tab |
| Study assistant — answers only from the Bible text + these notes, labelled | **Ask** tab |
| Dark / light mode | top-right button |
| Verse deep-links (`#/john/3?v=16`) — refresh and share keep your place | URL bar |

Keyboard: `←` / `→` move between chapters.

## The honesty rules (built into the design)

1. **Scripture is never altered or paraphrased.** Verses load word-for-word from the
   selected translation via [bible-api.com](https://bible-api.com), and the translation
   is always credited on screen.
2. **Commentary is labelled commentary.** Everything historical (authors, dates,
   settings, themes) is visually tagged as *study note, not Scripture*.
3. **Disputed points are shown as disputed.** Where scholars genuinely disagree —
   the dating of the Exodus, the authorship of Isaiah 40–66, the Pastorals, 2 Peter —
   the notes say both that it's debated and what the main positions are, instead of
   pretending certainty.
4. **The assistant never invents answers.** If a question isn't covered by the Bible
   text or the built-in notes, it says so and suggests what it *can* answer.

## The Amplified Bible (AMP)

The site defaults to the **King James Version** (public domain, no key needed), with
WEB, WEB-British, BBE, Open English Bible and Almeida also available keyless in the
translation dropdown.

For the **Amplified Bible (AMP)** — copyrighted by The Lockman Foundation, so it can't
be bundled — the app integrates [API.bible](https://scripture.api.bible/):

1. Get a **free** API key at scripture.api.bible (register, create an application,
   copy the key — takes a couple of minutes).
2. In the app, click the **AMP** button in the top bar, paste the key, press
   **Enable AMP**.
3. "Amplified Bible (AMP)" appears in the translation dropdown; the reader, verse
   links and the Ask assistant all use it, and its copyright line is shown with the
   text as required.

The key is stored only in your browser (localStorage). The app verifies the key,
finds the AMP edition inside your API.bible catalog automatically, and shows a clear
error if the key is wrong. The AMP fetching layer lives in `fetchAMP()` /
`parseAmpChapterHtml()` in `assets/app.js`.

## Files

```
bible-study/
├── index.html          structure
├── assets/
│   ├── style.css       parchment/ink/bronze design, dark mode
│   ├── data.js         12 eras + all 66 books: author, date, setting, purpose,
│   │                   themes, outline, key verses, historical notes
│   └── app.js          reader, routing, panels, assistant, theming
└── README.md
```

## Extending the study notes

The dataset in `assets/data.js` is plain data — add fields or entries (e.g. per-chapter
notes keyed `"genesis:1"`) and render them in `renderContext()` in `assets/app.js`.
Dates follow the `c. = circa` convention; mark debated matters as debated.

## Sources of the historical content

The notes reflect mainstream scholarly consensus and long-standing Christian/Jewish
tradition as found in standard study Bibles and introductions (e.g. the historical
frames used by the NIV/Zondervan, ESV and Oxford study editions, and the summaries in
resources like the *Baker Encyclopedia of the Bible*). Where those sources disagree
with each other, the note says so. Scripture quotations themselves come exclusively
from the live API.
