# Lamp & Light — a Bible study website / Sitio de estudio bíblico

*“Thy word is a lamp unto my feet, and a light unto my path.” — Psalm 119:105*
*«Lámpara es a mis pies tu palabra, y lumbrera a mi camino.» — Salmos 119:105*

Lamp & Light is a Bible study web app that reads the Bible **next to its history**:
every chapter sits beside the era it was written in, who wrote it, why, and what was
happening in the world around it. **Fully bilingual (English / Español)** — one click
switches the whole interface, the study notes and the Bible text.

## Run it / Cómo ejecutarlo

No build step. Either:

```bash
cd bible-study
python3 -m http.server 8000
# open http://localhost:8000
```

…or just double-click `index.html` (it also works from the filesystem).

An internet connection is needed to load Scripture text (it is fetched live and
never stored or edited). The study notes and timeline work offline.
/ Se necesita conexión para cargar el texto bíblico (se obtiene en vivo, sin
alterarlo). Las notas y la línea de tiempo funcionan sin conexión.

## What's inside / Qué incluye

| Feature | Where / Dónde |
|---|---|
| Reader — every chapter of all 66 books, exact text | center panel |
| Go anywhere: type `John 3:16`, `Genesis 1`, `Juan 3:16`, `Salmos 23`… | top search box |
| Per-book study notes: author, date, setting, purpose, themes, outline, key verses | **Context** tab |
| 12-era biblical timeline (Creation → the last writings) | **Timeline** tab |
| Study assistant — answers only from the Bible text + these notes, labelled | **Ask** tab |
| Dark / light mode; EN/ES language switch | top-right buttons |
| Verse deep-links (`#/john/3?v=16`) | URL bar |

## Bible versions / Versiones bíblicas

**Without an API key / Sin clave:**
- King James Version, World English Bible, WEB (British), Bible in Basic English,
  Open English Bible — public domain via [bible-api.com](https://bible-api.com)
- **Reina-Valera 1909 (Español)** — public domain via [getbible.net](https://getbible.net)

**With a free API.bible key / Con clave gratuita de API.bible**
(click the **AMP y Español** button, paste your key from
[scripture.api.bible](https://scripture.api.bible/)):
- **Amplified Bible (AMP)** — copyrighted (© The Lockman Foundation), served by API.bible
- **Modern Spanish versions** your key can access (RVR1960, NVI, Dios Habla Hoy…) —
  the app discovers them automatically and lists them in the translation dropdown

The key is stored only in your browser. / La clave queda guardada solo en tu navegador.

## The honesty rules (built into the design) / Reglas de honestidad

1. **Scripture is never altered or paraphrased.** Verses load word-for-word from the
   selected source, and the translation is always credited on screen.
   / **La Escritura nunca se altera ni parafrasea**: se carga palabra por palabra y siempre acreditada.
2. **Commentary is labelled commentary.** Everything historical (authors, dates,
   settings, themes) is visually tagged as *study note, not Scripture*.
   / **El comentario está señalado como comentario**, separado del texto bíblico.
3. **Disputed points are shown as disputed.** Where scholars genuinely disagree —
   the dating of the Exodus, the authorship of Isaiah 40–66, the Pastorals, 2 Peter —
   the notes say both that it's debated and what the main positions are.
   / **Los puntos disputados se muestran como disputados**, con las posiciones principales.
4. **The assistant never invents answers.** If a question isn't covered by the Bible
   text or the built-in notes, it says so.
   / **El asistente nunca inventa respuestas**: si no sabe, lo dice.

## Files / Archivos

```
bible-study/
├── index.html          structure / estructura
├── assets/
│   ├── style.css       parchment/ink/bronze design, dark mode
│   ├── data.js         12 eras + all 66 books (English study notes)
│   ├── data.es.js      the same dataset in Spanish + Spanish book names
│   ├── i18n.js         every UI string in English and Spanish
│   └── app.js          reader, routing, panels, assistant, i18n, sources
└── README.md
```

## Deploying / Despliegue

The site is fully static — host the folder on GitHub Pages, Netlify, Vercel or any
static server. No build step, no server code.
/ El sitio es 100% estático: GitHub Pages, Netlify, Vercel o cualquier servidor.

## Sources of the historical content

The notes reflect mainstream scholarly consensus and long-standing Christian/Jewish
tradition as found in standard study Bibles and introductions. Where those sources
disagree with each other, the note says so. Scripture quotations themselves come
exclusively from the live APIs listed above.
