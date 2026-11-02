/* Lamp & Light — application logic
   Scripture text is fetched live (never edited) from three honest sources:
   - bible-api.com  : KJV, WEB, BBE… (public domain, English, no key)
   - getbible.net   : Reina-Valera 1909 (public domain, Spanish, no key)
   - API.bible      : AMP and modern Spanish versions (copyrighted; user's free key)
   All commentary beside it comes from data.js / data.es.js and is labelled as study material. */

"use strict";

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripAccents = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ---------- translations ---------- */
/* bible-api.com identifiers verified against the API. */
const FALLBACK_TRANSLATIONS = [
  { identifier: "kjv", name: "King James Version" },
  { identifier: "web", name: "World English Bible" },
  { identifier: "webbe", name: "World English Bible (British)" },
  { identifier: "bbe", name: "Bible in Basic English" },
  { identifier: "oeb-cw", name: "Open English Bible" }
];
let TRANSLATIONS = FALLBACK_TRANSLATIONS.slice();

function translationName(id) {
  if (id === "valera") return "Reina-Valera 1909";
  if (id === "amp") return ampName();
  if (id.startsWith("ab:")) {
    const r = abRegistry().find(x => x.id === id.slice(3));
    return r ? r.name : "API.bible";
  }
  const t = TRANSLATIONS.find(t => t.identifier === id);
  return t ? t.name : id.toUpperCase();
}

/* ---------- language ---------- */
let LANG = localStorage.getItem("ll-lang") ||
  ((navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en");

function t(k, vars) {
  let s = (I18N[LANG] && I18N[LANG][k] !== undefined) ? I18N[LANG][k]
        : (I18N.en[k] !== undefined ? I18N.en[k] : k);
  if (vars) for (const key in vars) s = s.replace(new RegExp("\\{" + key + "\\}", "g"), vars[key]);
  return s;
}
function bookName(b) { return (LANG === "es" && ES_NAMES[b.slug]) ? ES_NAMES[b.slug] : b.name; }
function bookInfo(b) { return (LANG === "es" && BOOKS_ES[b.slug]) ? BOOKS_ES[b.slug] : b; }
function eraInfo(e) {
  if (LANG === "es") { const f = ERAS_ES.find(x => x.id === e.id); if (f) return f; }
  return e;
}
function usesPool() { // no random endpoint on these sources: draw from the study dataset's key verses
  return state.translation === "valera" || state.translation === "amp" || state.translation.startsWith("ab:");
}

const state = {
  book: null, chapter: 1, selectedVerse: null,
  translation: localStorage.getItem("ll-translation") || "kjv"
};

/* Some bible-api.com slugs differ from our display habits; verified against the API:
   numbered books must be queried as "1john", "2samuel" (a hyphen breaks verse refs). */
function apiSlug(slug) { return /^\d-/.test(slug) ? slug.replace("-", "") : slug; }

/* ---------- API.bible (user's free key): AMP + modern Spanish ---------- */
const API_BIBLE_ROOT = "https://api.scripture.api.bible/v1";
const AMP_KEY_LS = "ll-amp-key", AMP_ID_LS = "ll-amp-id", AMP_NAME_LS = "ll-amp-name", AB_REG_LS = "ll-abibles";

const OSIS = {
  genesis:"GEN", exodus:"EXO", leviticus:"LEV", numbers:"NUM", deuteronomy:"DEU",
  joshua:"JOS", judges:"JDG", ruth:"RUT", "1-samuel":"1SA", "2-samuel":"2SA",
  "1-kings":"1KI", "2-kings":"2KI", "1-chronicles":"1CH", "2-chronicles":"2CH",
  ezra:"EZR", nehemiah:"NEH", esther:"EST", job:"JOB", psalms:"PSA", proverbs:"PRO",
  ecclesiastes:"ECC", "song-of-solomon":"SNG", isaiah:"ISA", jeremiah:"JER",
  lamentations:"LAM", ezekiel:"EZK", daniel:"DAN", hosea:"HOS", joel:"JOL", amos:"AMO",
  obadiah:"OBA", jonah:"JON", micah:"MIC", nahum:"NAM", habakkuk:"HAB",
  zephaniah:"ZEP", haggai:"HAG", zechariah:"ZEC", malachi:"MAL",
  matthew:"MAT", mark:"MRK", luke:"LUK", john:"JHN", acts:"ACT", romans:"ROM",
  "1-corinthians":"1CO", "2-corinthians":"2CO", galatians:"GAL", ephesians:"EPH",
  philippians:"PHP", colossians:"COL", "1-thessalonians":"1TH", "2-thessalonians":"2TH",
  "1-timothy":"1TI", "2-timothy":"2TI", titus:"TIT", philemon:"PHM", hebrews:"HEB",
  james:"JAS", "1-peter":"1PE", "2-peter":"2PE", "1-john":"1JN", "2-john":"2JN",
  "3-john":"3JN", jude:"JUD", revelation:"REV"
};

function ampKey() { return localStorage.getItem(AMP_KEY_LS) || ""; }
function ampBibleId() { return localStorage.getItem(AMP_ID_LS) || ""; }
function ampName() { return localStorage.getItem(AMP_NAME_LS) || "Amplified Bible"; }
function ampEnabled() { return !!(ampKey() && ampBibleId()); }

function abRegistry() {
  try { return JSON.parse(localStorage.getItem(AB_REG_LS) || "[]"); } catch { return []; }
}
function abRegistryUpsert(entries) {
  const reg = abRegistry();
  for (const e of entries) {
    const i = reg.findIndex(x => x.id === e.id);
    if (i >= 0) reg[i] = e; else reg.push(e);
  }
  localStorage.setItem(AB_REG_LS, JSON.stringify(reg));
}
function abRegistryRemoveAll() {
  localStorage.removeItem(AB_REG_LS);
}

async function apiBible(path) {
  const res = await fetch(API_BIBLE_ROOT + path, {
    headers: { "api-key": ampKey(), "Accept": "application/json" }
  });
  if (res.status === 401 || res.status === 403)
    throw new Error("API.bible rejected the key (" + res.status + "). Check the key from scripture.api.bible.");
  if (res.status === 404) throw new Error("Not found on API.bible (404).");
  if (!res.ok) throw new Error("API.bible error " + res.status + ".");
  return res.json();
}

/* Find the AMP edition inside this key's catalog (ids are not stable across keys). */
async function resolveAmpBible() {
  let list = [];
  try {
    const data = await apiBible("/bibles?language=eng&abbreviation=AMP");
    list = data.data || [];
  } catch (e) { /* fall through to the broader search */ }
  if (!list.length) {
    const data = await apiBible("/bibles?language=eng");
    list = (data.data || []).filter(b =>
      /amplified/i.test(b.name || "") || (b.abbreviation || "").toUpperCase() === "AMP" ||
      (b.abbreviationLocal || "").toUpperCase() === "AMP");
  }
  if (!list.length) throw new Error(LANG === "es"
    ? "No se encontró la Amplified Bible en los permisos de esta clave."
    : "No Amplified Bible found in this key's permissions.");
  return list[0];
}

/* Every Spanish edition this key can access (RVR1960, NVI, Dios Habla Hoy…). */
async function discoverSpanishEditions() {
  const data = await apiBible("/bibles?language=spa");
  return (data.data || [])
    .filter(b => b.id)
    .map(b => ({ id: b.id, name: b.name || b.abbreviationLocal || b.abbreviation || "Español", kind: "spa" }));
}

/* Parse API.bible chapter HTML into [{verse, text}].
   Verse numbers arrive as <span class="v"> (sometimes with an id like "JHN.3.16").
   We only ever read textContent — no HTML is ever injected. */
function parseAmpChapterHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [];
  let current = null;
  const close = () => {
    if (current) {
      current.text = current.text.replace(/\s+/g, " ").trim();
      if (current.text) out.push(current);
      current = null;
    }
  };
  const numFrom = (el) => {
    if (el.id && el.id.split(".").length === 3) {
      const n = parseInt(el.id.split(".")[2], 10);
      if (Number.isFinite(n)) return n;
    }
    const n = parseInt((el.textContent || "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  const containers = Array.from(doc.querySelectorAll("p, div"))
    .filter(c => !c.querySelector("p, div") && !c.closest(".note, .footnote, .f"));
  for (const c of containers) {
    for (const node of Array.from(c.childNodes)) {
      if (node.nodeType === 1 && node.matches('span.v, span[data-vid]')) {
        const n = numFrom(node);
        close();
        current = n ? { verse: n, text: "" } : null;
        continue;
      }
      if (node.nodeType === 1 && node.matches(".f, .note, .footnote")) continue;
      if (current) current.text += node.textContent + " ";
    }
  }
  close();
  return out.length ? out : null;
}

const ampChapterCache = new Map(); // "bid|JHN.3" -> [{verse, text}]

async function fetchAmpChapterVerses(bidRaw, osis, ch) {
  const cacheKey = `${bidRaw}|${osis}.${ch}`;
  if (ampChapterCache.has(cacheKey)) return ampChapterCache.get(cacheKey);
  const bid = encodeURIComponent(bidRaw);
  let verses = null;
  const data = await apiBible(`/bibles/${bid}/chapters/${osis}.${ch}?content-type=html&include-verse-numbers=true&include-notes=false`);
  verses = parseAmpChapterHtml((data.data && data.data.content) || "");
  if (!verses) {
    // fallback: plain text with verse numbers, one verse per line
    const t2 = await apiBible(`/bibles/${bid}/chapters/${osis}.${ch}?content-type=text&include-verse-numbers=true&include-notes=false`);
    const lines = ((t2.data && t2.data.content) || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    verses = [];
    let seq = 0;
    for (const line of lines) {
      const m = line.match(/^\[?(\d{1,3})\]?\s+/);
      let v, text;
      if (m) { v = parseInt(m[1], 10); text = line.slice(m[0].length); }
      else { seq += 1; v = seq; text = line; }
      verses.push({ verse: v, text: text.replace(/\s+/g, " ").trim() });
    }
  }
  ampChapterCache.set(cacheKey, verses);
  return verses;
}

/* Same contract as the bible-api fetch: {reference, verses:[{book_name, chapter, verse, text}], text, translation_name, translation_note} */
async function fetchAMP(refString, bidRaw, bibleName) {
  const plus = refString.indexOf("+");
  const slug = plus > 0 ? refString.slice(0, plus) : refString;
  const rest = plus > 0 ? refString.slice(plus + 1) : "";
  const book = BOOK_BY_SLUG[slug];
  if (!book || !OSIS[slug]) throw new Error("Unknown book: " + slug);
  const m = rest.match(/^(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
  if (!m) throw new Error("Cannot parse reference: " + refString);
  const ch = Math.min(parseInt(m[1], 10), book.chapters);
  const v1 = m[2] ? parseInt(m[2], 10) : null;
  const v2 = m[3] ? parseInt(m[3], 10) : v1;
  const all = await fetchAmpChapterVerses(bidRaw, OSIS[slug], ch);
  let picked, reference;
  const nm = bookName(book);
  if (v1 == null) {
    picked = all;
    reference = `${nm} ${ch}`;
  } else {
    picked = all.filter(x => x.verse >= v1 && x.verse <= (v2 || v1));
    reference = (v2 && v2 !== v1) ? `${nm} ${ch}:${v1}-${v2}` : `${nm} ${ch}:${v1}`;
  }
  if (!picked.length) throw new Error(`${reference} — ${LANG === "es" ? "no se encontró en el texto devuelto." : "not found in the returned text."}`);
  return {
    reference,
    verses: picked.map(x => ({ book_name: nm, chapter: ch, verse: x.verse, text: x.text })),
    text: picked.map(x => x.text).join("\n"),
    translation_name: bibleName,
    translation_note: bidRaw === ampBibleId()
      ? "The Amplified Bible, copyright © 1954, 1958, 1962, 1964, 1965, 1987, 2015 by The Lockman Foundation. All rights reserved. Served via API.bible."
      : "Served via API.bible. All rights reserved by the copyright holders."
  };
}

/* ---------- getbible.net: Reina-Valera 1909 (public domain, Spanish, no key) ---------- */
const GETBIBLE_ROOT = "https://api.getbible.net/v2";

async function fetchGetBible(refString) {
  const plus = refString.indexOf("+");
  const slug = plus > 0 ? refString.slice(0, plus) : refString;
  const rest = plus > 0 ? refString.slice(plus + 1) : "";
  const book = BOOK_BY_SLUG[slug];
  if (!book) throw new Error("Unknown book: " + slug);
  const bookNr = BOOKS.indexOf(book) + 1; // canon order = getbible book number
  const m = rest.match(/^(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
  if (!m) throw new Error("Cannot parse reference: " + refString);
  const ch = Math.min(parseInt(m[1], 10), book.chapters);
  const v1 = m[2] ? parseInt(m[2], 10) : null;
  const v2 = m[3] ? parseInt(m[3], 10) : v1;
  const res = await fetch(`${GETBIBLE_ROOT}/valera/${bookNr}/${ch}.json`);
  if (!res.ok) throw new Error("getbible.net error " + res.status);
  const d = await res.json();
  const nm = bookName(book);
  const all = (d.verses || []).map(v => ({ book_name: nm, chapter: ch, verse: v.verse, text: String(v.text) }));
  let picked, reference;
  if (v1 == null) { picked = all; reference = `${nm} ${ch}`; }
  else {
    picked = all.filter(x => x.verse >= v1 && x.verse <= (v2 || v1));
    reference = (v2 && v2 !== v1) ? `${nm} ${ch}:${v1}-${v2}` : `${nm} ${ch}:${v1}`;
  }
  if (!picked.length) throw new Error(`${reference} — ${LANG === "es" ? "no se encontró en el texto devuelto." : "not found in the returned text."}`);
  return {
    reference,
    verses: picked,
    text: picked.map(x => x.text).join("\n"),
    translation_name: d.translation || "Reina-Valera 1909",
    translation_note: "Public domain / dominio público — served by getbible.net"
  };
}

/* ---------- fetching (returns raw API data; text is never modified) ---------- */
async function fetchBibleApi(refString) {
  const t = encodeURIComponent(state.translation);
  const firstPlus = refString.indexOf("+");
  const normalized = firstPlus > 0
    ? apiSlug(refString.slice(0, firstPlus)) + refString.slice(firstPlus)
    : refString;
  const r = encodeURIComponent(normalized);
  const res = await fetch(`https://bible-api.com/${r}?translation=${t}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bible API error ${res.status}${body ? ": " + body.slice(0, 160) : ""}`);
  }
  return res.json();
}

async function fetchVerses(refString) {
  const tr = state.translation;
  if (tr === "valera") return fetchGetBible(refString);
  if (tr === "amp") return fetchAMP(refString, ampBibleId(), ampName());
  if (tr.startsWith("ab:")) {
    const id = tr.slice(3);
    const reg = abRegistry().find(x => x.id === id);
    return fetchAMP(refString, id, reg ? reg.name : "API.bible");
  }
  return fetchBibleApi(refString);
}

/* ---------- data helpers ---------- */
function bookEra(book) { return ERA_BY_ID[book.era]; }

function findBook(query) {
  const raw = query.toLowerCase().replace(/[.]/g, "").trim();
  if (!raw) return null;
  const q = stripAccents(raw);
  if (BOOK_BY_SLUG[raw]) return BOOK_BY_SLUG[raw];
  const aliases = {
    "psalm": "psalms", "salmo": "psalms", "salmos": "psalms",
    "song of songs": "song-of-solomon", "song of solomon": "song-of-solomon",
    "cantares": "song-of-solomon", "cantar de los cantares": "song-of-solomon",
    "revelations": "revelation", "apocalipsis": "revelation"
  };
  if (aliases[q] && BOOK_BY_SLUG[aliases[q]]) return BOOK_BY_SLUG[aliases[q]];
  // English names, then Spanish names (accent-insensitive), prefix first
  const names = (b) => LANG === "es" && ES_NAMES[b.slug] ? [b.name, ES_NAMES[b.slug]] : [b.name];
  let hits = BOOKS.filter(b => names(b).some(n => stripAccents(n.toLowerCase()).startsWith(q)));
  if (!hits.length) hits = BOOKS.filter(b => names(b).some(n => stripAccents(n.toLowerCase()).includes(q)));
  return hits[0] || null;
}

/* "John 3:16", "1 John 4:8-10", "genesis 1", "juan 3:16" -> {book, chapter?, verse?, endVerse?} */
function parseReference(text) {
  const clean = text.trim().replace(/\s+/g, " ");
  const m = clean.match(/^((?:(?:1|2|3|i{1,3})\s+)?[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+)?)\s*(?:(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?)?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const out = { book };
  if (m[2]) out.chapter = Math.min(parseInt(m[2], 10), book.chapters);
  if (m[3]) out.verse = parseInt(m[3], 10);
  if (m[4]) out.endVerse = parseInt(m[4], 10);
  return out;
}

/* ---------- routing ---------- */
function navigate(bookSlug, chapter, verse) {
  const b = BOOK_BY_SLUG[bookSlug] || BOOKS[0];
  const ch = Math.max(1, Math.min(chapter || 1, b.chapters));
  let h = `#/${b.slug}/${ch}`;
  if (verse) h += `?v=${verse}`;
  if (location.hash === h) renderFromHash();
  else location.hash = h;
}

function renderFromHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) { showWelcome(); return; }
  const [path, qs] = raw.split("?");
  const [slug, chStr] = path.split("/");
  const vMatch = qs && qs.match(/v=(\d+)/);
  const book = BOOK_BY_SLUG[slug];
  if (!book) { showWelcome(); return; }
  loadChapter(book, parseInt(chStr, 10) || 1, vMatch ? parseInt(vMatch[1], 10) : null);
}

/* ---------- sidebar ---------- */
function buildSidebar() {
  const ot = $("#otList"), nt = $("#ntList");
  ot.innerHTML = ""; nt.innerHTML = "";
  for (const b of BOOKS) {
    const wrap = document.createElement("div");
    wrap.className = "book-item";
    wrap.dataset.slug = b.slug;
    wrap.dataset.name = stripAccents(bookName(b).toLowerCase());

    const btn = document.createElement("button");
    btn.className = "book-btn";
    btn.innerHTML = `<span class="book-name">${esc(bookName(b))}</span><span class="book-ch">${b.chapters}</span>`;
    btn.title = `${bookName(b)} — ${b.chapters} ${t("chapters")}`;
    btn.addEventListener("click", () => {
      const grid = wrap.querySelector(".chapter-grid");
      const open = grid.classList.toggle("open");
      wrap.classList.toggle("open", open);
    });

    const grid = document.createElement("div");
    grid.className = "chapter-grid";
    for (let c = 1; c <= b.chapters; c++) {
      const cb = document.createElement("button");
      cb.textContent = c;
      cb.addEventListener("click", (e) => { e.stopPropagation(); navigate(b.slug, c); });
      grid.appendChild(cb);
    }

    wrap.appendChild(btn); wrap.appendChild(grid);
    (b.testament === "OT" ? ot : nt).appendChild(wrap);
  }
}

function markActiveBook() {
  document.querySelectorAll(".book-item").forEach(el => el.classList.toggle("active", state.book && el.dataset.slug === state.book.slug));
}

$("#bookFilter").addEventListener("input", (e) => {
  const q = stripAccents(e.target.value.toLowerCase().trim());
  document.querySelectorAll(".book-item").forEach(el => {
    const show = !q || el.dataset.name.includes(q);
    el.style.display = show ? "" : "none";
    if (q && show) el.querySelector(".chapter-grid").classList.add("open");
  });
});

/* ---------- reference box + suggestions ---------- */
const refInput = $("#refInput"), refSuggest = $("#refSuggest");

refInput.addEventListener("input", () => {
  const q = stripAccents(refInput.value.trim().toLowerCase());
  if (!q) { refSuggest.hidden = true; return; }
  const hits = BOOKS.filter(b => stripAccents(bookName(b).toLowerCase()).includes(q)).slice(0, 8);
  refSuggest.innerHTML = "";
  if (!hits.length) { refSuggest.hidden = true; return; }
  for (const b of hits) {
    const era = eraInfo(bookEra(b));
    const el = document.createElement("button");
    el.className = "sug-item";
    el.innerHTML = `<strong>${esc(bookName(b))}</strong><span>${b.chapters} ${t("chapters")} · ${esc(era.name)}</span>`;
    el.addEventListener("click", () => { refSuggest.hidden = true; refInput.value = ""; navigate(b.slug, 1); });
    refSuggest.appendChild(el);
  }
  refSuggest.hidden = false;
});

refInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const parsed = parseReference(refInput.value);
    refSuggest.hidden = true;
    if (parsed) {
      refInput.value = "";
      navigate(parsed.book.slug, parsed.chapter || 1, parsed.verse);
    } else if (findBook(refInput.value)) {
      navigate(findBook(refInput.value).slug, 1);
      refInput.value = "";
    }
  } else if (e.key === "Escape") { refSuggest.hidden = true; }
});
document.addEventListener("click", (e) => { if (!e.target.closest(".refbox")) refSuggest.hidden = true; });

/* ---------- reader ---------- */
function showWelcome() {
  $("#chapterView").hidden = true;
  $("#welcomeView").hidden = false;
  state.book = null;
  markActiveBook();
  renderTimeline(null);
  loadDailyVerse();
}

async function loadChapter(book, chapter, verse) {
  state.book = book; state.chapter = chapter; state.selectedVerse = verse;
  $("#welcomeView").hidden = true;
  $("#chapterView").hidden = false;
  markActiveBook();
  renderChapterChrome(book, chapter);
  renderEraStrip(book);
  renderContext(book, verse);
  renderTimeline(book.era);
  localStorage.setItem("ll-last", `#/${book.slug}/${chapter}${verse ? "?v=" + verse : ""}`);

  const versesEl = $("#verses");
  versesEl.innerHTML = `<p class="loading">${esc(t("loading", { book: bookName(book), ch: chapter, trans: translationName(state.translation) }))}</p>`;
  try {
    const data = await fetchVerses(`${book.slug}+${chapter}`);
    renderVerses(data, verse);
    const credit = $("#translationCredit");
    credit.textContent = data.translation_name + (data.translation_note ? ` — ${data.translation_note}` : "");
  } catch (err) {
    versesEl.innerHTML = "";
    const box = document.createElement("div");
    box.className = "error-box";
    box.innerHTML = `<p><strong>${esc(t("err_title"))}</strong><br>${esc(err.message)}</p>
      <p class="muted">${esc(t("err_body"))}</p>
      <button class="cta" id="retryBtn">${esc(t("retry"))}</button>`;
    versesEl.appendChild(box);
    box.querySelector("#retryBtn").addEventListener("click", () => loadChapter(book, chapter, verse));
  }
}

function renderChapterChrome(book, chapter) {
  $("#chapterTitle").textContent = `${bookName(book)} ${chapter}`;
  const info = bookInfo(book);
  $("#chapterSub").textContent = `${book.testament === "OT" ? t("ot") : t("nt")} · ${book.chapters} ${t("chapters")} · ${t("written")}: ${info.date}`;
  $("#prevCh").textContent = t("prev");
  const nextExists = chapter < book.chapters;
  const i = BOOKS.indexOf(book);
  $("#nextCh").disabled = !nextExists && i >= BOOKS.length - 1;
  $("#nextCh").textContent = nextExists ? t("next") : (i < BOOKS.length - 1 ? `${bookName(BOOKS[i + 1])} ›` : t("next"));
}

$("#prevCh").addEventListener("click", () => {
  if (state.book && state.chapter > 1) navigate(state.book.slug, state.chapter - 1);
});
$("#nextCh").addEventListener("click", () => {
  if (!state.book) return;
  if (state.chapter < state.book.chapters) navigate(state.book.slug, state.chapter + 1);
  else {
    const i = BOOKS.indexOf(state.book);
    if (i < BOOKS.length - 1) navigate(BOOKS[i + 1].slug, 1);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (!state.book) return;
  if (e.key === "ArrowLeft") $("#prevCh").click();
  if (e.key === "ArrowRight") $("#nextCh").click();
});

document.querySelectorAll("[data-goto]").forEach(b =>
  b.addEventListener("click", () => { const [s, c] = b.dataset.goto.split("/"); navigate(s, parseInt(c, 10)); }));

function renderEraStrip(book) {
  const era = eraInfo(bookEra(book));
  const el = $("#eraStrip");
  el.innerHTML = "";
  const chip = document.createElement("button");
  chip.className = "era-chip";
  chip.innerHTML = `<span class="era-dot"></span> ${esc(era.name)} <span class="era-dates">· ${esc(era.dates)}</span>`;
  chip.title = t("tab_timeline");
  chip.addEventListener("click", () => switchTab("timeline"));
  el.appendChild(chip);
}

function renderVerses(data, focusVerse) {
  const versesEl = $("#verses");
  versesEl.innerHTML = "";
  for (const v of (data.verses || [])) {
    const p = document.createElement("p");
    p.className = "v";
    if (focusVerse && v.verse === focusVerse) p.classList.add("selected");
    const sup = document.createElement("sup");
    sup.textContent = v.verse;
    sup.addEventListener("click", () => {
      const sel = p.classList.contains("selected");
      versesEl.querySelectorAll(".v.selected").forEach(x => x.classList.remove("selected"));
      if (!sel) {
        p.classList.add("selected");
        history.replaceState(null, "", `#/${state.book.slug}/${state.chapter}?v=${v.verse}`);
        renderSelectedVerse(v);
      } else {
        history.replaceState(null, "", `#/${state.book.slug}/${state.chapter}`);
        renderSelectedVerse(null);
      }
    });
    const span = document.createElement("span");
    span.textContent = " " + v.text.trim();   // whitespace trimmed only; wording untouched
    p.appendChild(sup); p.appendChild(span);
    versesEl.appendChild(p);
  }
  if (focusVerse) {
    const target = versesEl.querySelector(".v.selected");
    if (target) setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }
}

/* ---------- context tab ---------- */
function kvRefParts(ref) {
  const m = ref.match(/^(\d+):(\d+)(?:[-–](\d+))?$/);
  return m ? { c: parseInt(m[1], 10), v: parseInt(m[2], 10) } : null;
}

function renderContext(book, focusVerse) {
  const box = $("#contextContent");
  $("#contextEmpty").hidden = true;
  box.innerHTML = "";
  const info = bookInfo(book);
  const era = eraInfo(bookEra(book));
  const nm = bookName(book);

  const head = document.createElement("div");
  head.className = "ctx-head";
  head.innerHTML = `
    <h3>${esc(nm)}</h3>
    <button class="era-chip small" id="ctxEraBtn"><span class="era-dot"></span> ${esc(era.name)} <span class="era-dates">· ${esc(era.dates)}</span></button>
    <dl class="ctx-facts">
      <div><dt>${esc(t("ctx_author"))}</dt><dd>${esc(info.author)}</dd></div>
      <div><dt>${esc(t("ctx_date"))}</dt><dd>${esc(info.date)}</dd></div>
      <div><dt>${esc(t("ctx_setting"))}</dt><dd>${esc(info.setting)}</dd></div>
      <div><dt>${esc(t("ctx_purpose"))}</dt><dd>${esc(info.purpose)}</dd></div>
    </dl>`;
  box.appendChild(head);
  head.querySelector("#ctxEraBtn").addEventListener("click", () => switchTab("timeline"));

  if (focusVerse) {
    renderSelectedVerse({ verse: focusVerse, book_name: nm, chapter: state.chapter });
  }

  const themes = document.createElement("div");
  themes.className = "ctx-block";
  themes.innerHTML = `<h4>${esc(t("ctx_themes"))}</h4><div class="tagrow">` + info.themes.map(x => `<span class="tag">${esc(x)}</span>`).join("") + `</div>`;
  box.appendChild(themes);

  const key = document.createElement("div");
  key.className = "ctx-block";
  key.innerHTML = `<h4>${esc(t("ctx_key"))}</h4>`;
  const ul = document.createElement("ul");
  ul.className = "key-list";
  for (const [ref, note] of info.key) {
    const parts = kvRefParts(ref.replace(/–.*/, ""));
    const li = document.createElement("li");
    const a = document.createElement("button");
    a.className = "key-ref";
    a.textContent = `${nm} ${ref}`;
    a.addEventListener("click", () => navigate(book.slug, parts ? parts.c : 1, parts ? parts.v : null));
    li.appendChild(a);
    const n = document.createElement("span");
    n.className = "key-note"; n.textContent = " — " + note;
    li.appendChild(n);
    ul.appendChild(li);
  }
  key.appendChild(ul);
  box.appendChild(key);

  const ol = document.createElement("div");
  ol.className = "ctx-block";
  ol.innerHTML = `<h4>${esc(t("ctx_outline"))}</h4>` +
    `<ul class="outline-list">` + info.outline.map(([label, ch]) =>
      `<li><span class="outline-ch">${esc(ch)}</span><span>${esc(label)}</span></li>`).join("") + `</ul>`;
  box.appendChild(ol);

  const note = document.createElement("div");
  note.className = "ctx-block note-block";
  note.innerHTML = `<h4>${esc(t("ctx_notes"))} <span class="study-tag">${esc(t("study_tag"))}</span></h4><p>${esc(info.note)}</p>`;
  box.appendChild(note);
}

function renderSelectedVerse(v) {
  let el = $("#selVerseBlock");
  if (el) el.remove();
  if (!v) return;
  const host = $("#contextContent");
  el = document.createElement("div");
  el.id = "selVerseBlock";
  el.className = "sel-verse";
  const refLabel = `${bookName(state.book)} ${state.chapter}:${v.verse}`;
  el.innerHTML = `<h4>${esc(t("sel_title"))}</h4><p class="muted" id="selVerseText">${esc(t("sel_loading", { ref: refLabel }))}</p>`;
  host.insertBefore(el, host.children[1] || null);
  fetchVerses(`${state.book.slug}+${state.chapter}:${v.verse}`).then(data => {
    const txt = $("#selVerseText");
    if (!txt) return;
    const verse = data.verses && data.verses[0];
    txt.innerHTML = `&#8220;${esc(verse ? verse.text.trim() : "")}&#8221; <span class="ref">— ${esc(data.reference)} (${esc(data.translation_name)})</span>`;
  }).catch(() => {
    const txt = $("#selVerseText");
    if (txt) txt.textContent = t("sel_error");
  });
}

/* ---------- timeline tab ---------- */
function renderTimeline(activeEraId) {
  const host = $("#timelineContent");
  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "timeline";
  for (const eraRaw of ERAS) {
    const era = eraInfo(eraRaw);
    const card = document.createElement("section");
    card.className = "era-card" + (era.id === activeEraId ? " current" : "");
    const booksHere = BOOKS.filter(b => b.era === era.id);
    card.innerHTML = `
      <h4>${esc(era.name)}</h4>
      <p class="era-span">${esc(era.span)} · <span class="era-dates">${esc(era.dates)}</span></p>
      <p>${esc(era.summary)}</p>
      <details>
        <summary>${esc(t("era_events"))}</summary>
        <ul>${era.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      </details>
      ${booksHere.length ? `<div class="era-books"><span class="era-books-label">${esc(t("era_books"))}</span>` +
        booksHere.map(b => `<button class="book-chip" data-slug="${esc(b.slug)}">${esc(bookName(b))}</button>`).join("") + `</div>`
        : `<p class="muted small">${esc(t("era_nobooks"))}</p>`}`;
    wrap.appendChild(card);
  }
  host.appendChild(wrap);
  wrap.querySelectorAll(".book-chip").forEach(c => c.addEventListener("click", () => navigate(c.dataset.slug, 1)));
  const cur = wrap.querySelector(".era-card.current");
  if (cur) setTimeout(() => cur.scrollIntoView({ block: "nearest" }), 80);
}

/* ---------- study tabs ---------- */
function switchTab(name) {
  document.querySelectorAll(".study-tab").forEach(t2 => t2.classList.toggle("active", t2.dataset.tab === name));
  document.querySelectorAll(".study-pane").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
}
document.querySelectorAll(".study-tab").forEach(t2 => t2.addEventListener("click", () => switchTab(t2.dataset.tab)));

/* ---------- study assistant ----------
   Rule one: this assistant never invents content.
   It can (a) fetch and quote real Scripture, (b) quote the built-in study notes,
   (c) say it doesn't know. Every block is labelled with its source. */

const STOPWORDS = new Set(("a an and are as at be been bible book books but by can did do does for from has have how i in is it its me of on or tell that the thee thou thy to was what when where which who whom why will with would ye you la las los el un una que quien quienes cuando donde como por para con del al y o es son fue eran sobre acerca de cual cuales este esta esto ese esa eso me te se lo le les mi tu su sus mas muy ya no si").split(" "));

const chatLog = $("#chatLog"), chatForm = $("#chatForm"), chatInput = $("#chatInput");

function chatPush(role, html) {
  const el = document.createElement("div");
  el.className = "chat-msg " + role;
  el.innerHTML = html;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function block(label, cls, innerHtml) {
  return `<div class="a-block ${cls}"><div class="a-label">${esc(label)}</div>${innerHtml}</div>`;
}

function openBtn(slug, ch, v) {
  return `<button class="open-btn" data-slug="${esc(slug)}" data-ch="${ch}"${v ? ` data-v="${v}"` : ""}>${esc(t("a_open"))}</button>`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest(".open-btn");
  if (b) navigate(b.dataset.slug, parseInt(b.dataset.ch, 10), b.dataset.v ? parseInt(b.dataset.v, 10) : null);
});

function queryTokens(q) {
  return stripAccents(q).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function bookNamesAll(b) {
  const names = [b.name];
  if (ES_NAMES[b.slug]) names.push(ES_NAMES[b.slug]);
  return names;
}

function detectBookIn(q) {
  const ql = " " + stripAccents(q).toLowerCase().replace(/[^a-z0-9\s]/g, " ") + " ";
  const sorted = BOOKS.slice().sort((a, b) =>
    Math.max(...bookNamesAll(b).map(n => n.length)) - Math.max(...bookNamesAll(a).map(n => n.length)));
  for (const b of sorted) {
    for (const n of bookNamesAll(b)) {
      if (ql.includes(" " + stripAccents(n.toLowerCase()) + " ")) return b;
    }
  }
  const qc = ql.replace(/\s+/g, "");
  for (const b of sorted) {
    for (const n of bookNamesAll(b)) {
      if (qc.includes(stripAccents(n.toLowerCase()).replace(/\s+/g, ""))) return b;
    }
  }
  return null;
}

const INTENT = {
  author: /\b(who wrote|authored|written by|penned|quien escribio|autor de|escribio el libro)\b/i,
  date: /\b(when|what date|what year|dated|cuando se escribio|en que año|que fecha|fecha de)\b/i,
  setting: /\b(where|setting|location|takes place|donde se situa|lugar|escenario|ambientacion)\b/i,
  themes: /\b(theme|about|summary|purpose|temas?|de que trata|acerca de|resumen|proposito|mensaje principal)\b/i,
  keyverses: /\b(key verse|key verses|important verse|famous verse|versiculos? clave|versiculo importante|versiculos importantes)\b/i,
  count: /\b(how many chapters|cuantos capitulos tiene|cuantos capitulos hay)\b/i,
  timeline: /\b(timeline|eras|periods|history of the bible|bible history|cronologia|linea de tiempo|historia de la biblia)\b/i,
  context: /\b(context|background|history of|historical|contexto|trasfondo|historia de|historico)\b/i
};

const ASPECT_LABEL = () => ({
  author: t("ctx_author"), date: t("ctx_date"), setting: t("ctx_setting"),
  themes: t("ctx_themes"), keyverses: t("ctx_key"), count: t("chapters"),
  context: t("tab_context")
});

function bookFactBlocks(book, intent) {
  const info = bookInfo(book);
  const era = eraInfo(bookEra(book));
  const nm = bookName(book);
  const L = ASPECT_LABEL();
  const label = (what) => t("a_note", { book: nm, what });
  let out = "";
  if (intent.author) out += block(label(L.author), "study",
    `<p>${esc(info.author)}</p><p class="muted small">${openBtn(book.slug, 1)}</p>`);
  if (intent.date) out += block(label(L.date), "study",
    `<p>${esc(info.date)}</p><p class="muted small">${esc(t("a_datecaveat"))} ${openBtn(book.slug, 1)}</p>`);
  if (intent.setting) out += block(label(L.setting), "study",
    `<p>${esc(info.setting)}</p><p class="muted small">${openBtn(book.slug, 1)}</p>`);
  if (intent.themes) out += block(label(L.themes), "study",
    `<p><strong>${esc(t("ctx_purpose"))}:</strong> ${esc(info.purpose)}</p>
     <p><strong>${esc(t("ctx_themes"))}:</strong> ${info.themes.map(x => `<span class="tag">${esc(x)}</span>`).join(" ")}</p>
     <p class="muted small">${openBtn(book.slug, 1)}</p>`);
  if (intent.keyverses) out += block(label(L.keyverses), "study",
    `<ul class="key-list">${info.key.map(([r, n]) => {
      const p = kvRefParts(r.replace(/–.*/, ""));
      return `<li><button class="key-ref" data-slug="${esc(book.slug)}" data-ch="${p ? p.c : 1}"${p ? ` data-v="${p.v}"` : ""}>${esc(nm)} ${esc(r)}</button><span class="key-note"> — ${esc(n)}</span></li>`;
    }).join("")}</ul>`);
  if (intent.count) out += block(label(L.count), "study",
    `<p>${t("a_count", { book: nm, n: book.chapters })}</p>`);
  if (intent.context || (!out && book)) {
    out += block(label(L.context), "study",
      `<p><strong>${esc(t("ctx_author"))}:</strong> ${esc(info.author)}<br>
       <strong>${esc(t("ctx_date"))}:</strong> ${esc(info.date)}<br>
       <strong>${esc(t("ctx_setting"))}:</strong> ${esc(info.setting)}<br>
       <strong>${esc(t("tab_timeline"))}:</strong> ${esc(era.name)} (${esc(era.dates)})</p>
       <p>${esc(info.note)}</p>
       <p class="muted small">${openBtn(book.slug, 1)}</p>`);
  }
  return out;
}

function timelineHtml() {
  const items = ERAS.map(eRaw => {
    const e = eraInfo(eRaw);
    return `<li><strong>${esc(e.name)}</strong> <span class="era-dates">(${esc(e.dates)})</span> — ${esc(e.span)}</li>`;
  }).join("");
  return block(t("a_timeline"), "study",
    `<ul class="timeline-list">${items}</ul>
     <p class="muted small">${LANG === "es" ? "Abre la pestaña" : "Open the"} <strong>${esc(t("tab_timeline"))}</strong> ${LANG === "es" ? "para ver cada era con más detalle y sus libros." : "for a fuller description of each era and its books."}</p>`);
}

function searchNotesHtml(q) {
  const toks = queryTokens(q);
  if (!toks.length) return "";
  const scored = BOOKS.map(b => {
    const info = bookInfo(b);
    const strong = stripAccents((bookName(b) + " " + info.themes.join(" ")).toLowerCase());
    const weak = stripAccents((info.author + " " + info.date + " " + info.setting + " " + info.purpose + " " + info.note + " " + info.outline.map(o => o[0]).join(" ") + " " + info.key.map(k => k[1]).join(" ")).toLowerCase());
    let s = 0;
    for (const tk of toks) {
      if (strong.includes(tk)) s += 3;
      else if (weak.includes(tk)) s += 1;
    }
    return { b, s };
  }).filter(x => x.s > 0).sort((a, b2) => b2.s - a.s).slice(0, 3);

  if (!scored.length) return "";
  const lis = scored.map(({ b }) => {
    const era = eraInfo(bookEra(b));
    const info = bookInfo(b);
    return `<li><button class="key-ref" data-slug="${esc(b.slug)}" data-ch="1">${esc(bookName(b))}</button>
      <span class="key-note"> — ${esc(info.purpose)}</span>
      <span class="era-mini">(${esc(era.name)}, ${esc(era.dates)})</span></li>`;
  }).join("");
  return block(t("a_matches"), "study", `<ul class="key-list">${lis}</ul>`);
}

async function answerQuestion(rawQ) {
  const q = rawQ.trim();
  if (!q) return;
  chatPush("user", esc(q));

  const thinking = chatPush("assistant", `<span class="thinking">${esc(t("a_thinking"))}</span>`);
  try {
    let html = "";

    // 1) explicit reference?
    const parsed = parseReference(q.replace(/^(what does|what is|show me|read|quote|que dice|que significa|muestrame|lee|cita)\s+/i, ""));
    if (parsed && (q.match(/\d/) || parsed.chapter)) {
      const refStr = parsed.chapter
        ? (parsed.verse ? `${parsed.book.slug}+${parsed.chapter}:${parsed.verse}${parsed.endVerse ? "-" + parsed.endVerse : ""}` : `${parsed.book.slug}+${parsed.chapter}`)
        : `${parsed.book.slug}+1`;
      const data = await fetchVerses(refStr);
      const first = (data.verses || [])[0];
      const vHtml = (data.verses || []).map(v => `<p class="a-verse"><sup>${v.verse}</sup> ${esc(v.text.trim())}</p>`).join("");
      html += block(t("a_scripture", { trans: data.translation_name, ref: data.reference }), "scripture",
        vHtml + `<div class="a-actions">${openBtn(parsed.book.slug, first ? first.chapter : (parsed.chapter || 1), parsed.verse)}</div>`);
      if (/context|background|history|meaning|contexto|historia|significado/i.test(q)) html += bookFactBlocks(parsed.book, { context: true });
      else if (/who wrote|author|quien escribio|autor/i.test(q)) html += bookFactBlocks(parsed.book, { author: true });
      else if (/when|date|cuando|fecha/i.test(q)) html += bookFactBlocks(parsed.book, { date: true });
      else if (/where|setting|donde|lugar|escenario/i.test(q)) html += bookFactBlocks(parsed.book, { setting: true });
      else if (/theme|about|purpose|summary|temas|trata|resumen|proposito/i.test(q)) html += bookFactBlocks(parsed.book, { themes: true });
      else if (parsed.chapter && !parsed.verse) html += bookFactBlocks(parsed.book, { context: true });
    }

    // 2) timeline question?
    if (!html && INTENT.timeline.test(q)) {
      html += timelineHtml();
    }

    // 3) a book + an intent?
    if (!html) {
      const book = detectBookIn(q);
      const intents = {
        author: INTENT.author.test(q), date: INTENT.date.test(q), setting: INTENT.setting.test(q),
        themes: INTENT.themes.test(q), keyverses: INTENT.keyverses.test(q), count: INTENT.count.test(q),
        context: INTENT.context.test(q)
      };
      if (book && Object.values(intents).some(Boolean)) {
        // if a chapter number follows the book name, quote that chapter first
        const nameRe = bookNamesAll(book).map(n => stripAccents(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        const chM = stripAccents(q).match(new RegExp("(?:^|\\s)(?:" + nameRe + ")\\s+(\\d{1,3})(?=\\s|$|:)", "i"));
        if (chM && INTENT.context.test(q)) {
          const ch = parseInt(chM[1], 10);
          if (ch >= 1 && ch <= book.chapters) {
            const data = await fetchVerses(`${book.slug}+${ch}`);
            const vHtml = (data.verses || []).map(v => `<p class="a-verse"><sup>${v.verse}</sup> ${esc(v.text.trim())}</p>`).join("");
            html += block(t("a_scripture", { trans: data.translation_name, ref: data.reference }), "scripture",
              vHtml + `<div class="a-actions">${openBtn(book.slug, ch)}</div>`);
          }
        }
        html += bookFactBlocks(book, intents);
      } else if (book && /^(hi|hello|hey|hola|buenas)\b/i.test(q)) {
        html += block(LANG === "es" ? "Asistente" : "Assistant", "study", LANG === "es"
          ? `<p>¡Hola! Pregúntame por cualquier libro — por ejemplo <em>"contexto de Génesis 1"</em>, <em>"¿quién escribió Isaías?"</em> — o pega una referencia como <em>Juan 3:16</em> y citaré el texto exacto.</p>`
          : `<p>Hello! Ask me about any book — for example <em>"context of Genesis 1"</em>, <em>"who wrote Isaiah"</em> — or paste a reference like <em>John 3:16</em> and I'll quote the exact text.</p>`);
      } else if (book) {
        html += bookFactBlocks(book, { context: true });
      }
    }

    // 4) keyword search across notes
    if (!html) html += searchNotesHtml(q);

    // 5) honest fallback
    if (!html) html += block(LANG === "es" ? "Asistente" : "Assistant", "study", t("a_fallback"));

    thinking.innerHTML = html;
    chatLog.scrollTop = chatLog.scrollHeight;
  } catch (err) {
    thinking.innerHTML = block(LANG === "es" ? "Asistente" : "Assistant", "study",
      `<p><strong>${LANG === "es" ? "No pude contactar el servicio del texto bíblico." : "I couldn't reach the Bible text service."}</strong> ${esc(err.message)}</p>
       <p class="muted">${LANG === "es" ? "Se necesita conexión a internet para citar la Escritura. Las notas de estudio siguen funcionando: pregunta por un libro." : "An internet connection is needed to quote Scripture. Study notes still work — try asking about a book."}</p>`);
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = chatInput.value.trim();
  chatInput.value = "";
  answerQuestion(q);
});

function buildSugs() {
  const sugs = $("#chatSugs");
  sugs.innerHTML = "";
  t("sugs").split("|").forEach(s => {
    const txt = s.trim();
    const b = document.createElement("button");
    b.className = "sug-chip";
    b.textContent = txt;
    b.addEventListener("click", () => answerQuestion(txt));
    sugs.appendChild(b);
  });
}

/* ---------- daily verse ---------- */
async function loadDailyVerse() {
  const bq = $("#dailyVerse"), ref = $("#dailyRef");
  try {
    if (usesPool()) {
      // sources without a random endpoint: draw from the study dataset's key verses (still fetched live)
      const book = BOOKS[Math.floor(Math.random() * BOOKS.length)];
      const kref = bookInfo(book).key[Math.floor(Math.random() * bookInfo(book).key.length)][0].replace(/–.*/, "");
      const parts = kvRefParts(kref);
      const data = await fetchVerses(`${book.slug}+${parts.c}:${parts.v}`);
      const v = data.verses[0];
      bq.textContent = "“" + v.text.trim() + "”";
      ref.innerHTML = "";
      const btn = document.createElement("button");
      btn.className = "key-ref";
      btn.textContent = `${bookName(book)} ${parts.c}:${parts.v}`;
      btn.addEventListener("click", () => navigate(book.slug, parts.c, parts.v));
      ref.appendChild(btn);
      const note = document.createElement("span");
      note.className = "muted small";
      note.textContent = "  ·  " + data.translation_name;
      ref.appendChild(note);
      return;
    }
    const res = await fetch(`https://bible-api.com/data/${encodeURIComponent(state.translation)}/random`);
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    const rv = data.random_verse;
    bq.textContent = "“" + rv.text.trim() + "”";
    ref.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "key-ref";
    const book = findBook(rv.book) ;
    btn.textContent = `${rv.book} ${rv.chapter}:${rv.verse}`;
    btn.addEventListener("click", () => book && navigate(book.slug, rv.chapter, rv.verse));
    ref.appendChild(btn);
    const note = document.createElement("span");
    note.className = "muted small";
    note.textContent = "  ·  " + data.translation.name;
    ref.appendChild(note);
  } catch {
    bq.textContent = LANG === "es" ? "Aquí se necesita conexión a internet para cargar un versículo." : "An internet connection is needed to load a verse here.";
    ref.textContent = "";
  }
}

/* ---------- theme ---------- */
const themeBtn = $("#themeBtn");
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  themeBtn.innerHTML = dark ? "&#9728;" : "&#9790;";
  localStorage.setItem("ll-theme", dark ? "dark" : "light");
}
themeBtn.addEventListener("click", () => applyTheme(!document.documentElement.classList.contains("dark")));
applyTheme(localStorage.getItem("ll-theme") === "dark");

/* ---------- translations dropdown ---------- */
async function populateTranslations() {
  const sel = $("#translationSel");
  sel.innerHTML = "";
  for (const t2 of TRANSLATIONS) {
    const o = document.createElement("option");
    o.value = t2.identifier;
    o.textContent = t2.name;
    sel.appendChild(o);
  }
  {
    const o = document.createElement("option");
    o.value = "valera";
    o.textContent = "Reina-Valera 1909 (Español)";
    sel.appendChild(o);
  }
  if (ampEnabled()) {
    const o = document.createElement("option");
    o.value = "amp";
    o.textContent = ampName() + " (AMP)";
    sel.appendChild(o);
  }
  for (const entry of abRegistry().filter(x => x.kind === "spa")) {
    const o = document.createElement("option");
    o.value = "ab:" + entry.id;
    o.textContent = entry.name + " (Español)";
    sel.appendChild(o);
  }
  const valid = ["valera", "amp"].concat(TRANSLATIONS.map(x => x.identifier))
    .concat(abRegistry().filter(x => x.kind === "spa").map(x => "ab:" + x.id));
  if (!valid.includes(state.translation)) state.translation = "kjv";
  sel.value = state.translation;
  sel.onchange = () => {
    state.translation = sel.value;
    localStorage.setItem("ll-translation", sel.value);
    if (state.book) loadChapter(state.book, state.chapter, state.selectedVerse);
    else loadDailyVerse();
  };
}

/* ---------- AMP / Spanish-by-key settings panel ---------- */
const ampBtn = $("#ampBtn"), ampPanel = $("#ampPanel"), ampKeyInput = $("#ampKey"),
      ampSaveBtn = $("#ampSave"), ampRemoveBtn = $("#ampRemove"), ampStatusEl = $("#ampStatus");

function refreshAmpUI() {
  const on = ampEnabled();
  ampBtn.classList.toggle("on", on);
  ampBtn.title = t("amp_title");
  ampRemoveBtn.hidden = !on;
  if (on) ampStatusEl.textContent = `${ampName()} ${t("amp_status_on")}`;
}
ampBtn.addEventListener("click", () => { ampPanel.hidden = !ampPanel.hidden; });
document.addEventListener("click", (e) => { if (!e.target.closest(".amp-wrap")) ampPanel.hidden = true; });

ampSaveBtn.addEventListener("click", async () => {
  const key = ampKeyInput.value.trim();
  if (!key) { ampStatusEl.textContent = t("amp_nopaste"); return; }
  ampStatusEl.textContent = t("amp_checking");
  localStorage.setItem(AMP_KEY_LS, key);
  try {
    const amp = await resolveAmpBible();
    localStorage.setItem(AMP_ID_LS, amp.id);
    localStorage.setItem(AMP_NAME_LS, amp.name || "Amplified Bible");
    abRegistryUpsert([{ id: amp.id, name: amp.name || "Amplified Bible", kind: "amp" }]);
    let spaCount = 0;
    try {
      const spa = await discoverSpanishEditions();
      spaCount = spa.length;
      abRegistryUpsert(spa);
    } catch { /* Spanish discovery is best-effort */ }
    ampStatusEl.textContent = `${amp.name} + ${spaCount} ${LANG === "es" ? "versiones en español" : "Spanish versions"} ${t("amp_status_on")}`;
    refreshAmpUI();
    await populateTranslations();
    ampChapterCache.clear();
    if (state.book) loadChapter(state.book, state.chapter, state.selectedVerse);
    else loadDailyVerse();
  } catch (err) {
    localStorage.removeItem(AMP_KEY_LS);
    ampStatusEl.textContent = err.message;
    refreshAmpUI();
  }
});

ampRemoveBtn.addEventListener("click", () => {
  [AMP_KEY_LS, AMP_ID_LS, AMP_NAME_LS].forEach(k => localStorage.removeItem(k));
  abRegistryRemoveAll();
  ampKeyInput.value = "";
  ampChapterCache.clear();
  refreshAmpUI();
  ampStatusEl.textContent = t("amp_removed");
  populateTranslations().then(() => {
    if (state.translation === "amp" || state.translation.startsWith("ab:")) {
      state.translation = "kjv";
      localStorage.setItem("ll-translation", "kjv");
      $("#translationSel").value = "kjv";
      if (state.book) loadChapter(state.book, state.chapter, state.selectedVerse);
      else loadDailyVerse();
    }
  });
});
refreshAmpUI();

/* ---------- language switch ---------- */
function applyLang() {
  document.documentElement.lang = LANG;
  localStorage.setItem("ll-lang", LANG);
  const lb = $("#langBtn");
  lb.textContent = LANG === "es" ? "EN" : "ES";
  lb.title = t("lang_title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  buildSidebar();
  buildSugs();
  markActiveBook();
  if (state.book) {
    renderChapterChrome(state.book, state.chapter);
    renderEraStrip(state.book);
    renderContext(state.book, state.selectedVerse);
    renderTimeline(state.book.era);
  } else {
    renderTimeline(null);
  }
  refreshAmpUI();
}
$("#langBtn").addEventListener("click", () => {
  LANG = LANG === "es" ? "en" : "es";
  applyLang();
});

/* ---------- boot ---------- */
window.addEventListener("hashchange", renderFromHash);

(async function init() {
  buildSidebar();
  applyLang();
  chatPush("assistant", block(LANG === "es" ? "Asistente" : "Assistant", "study", t("greet")));
  await populateTranslations();
  const last = localStorage.getItem("ll-last");
  if (location.hash) renderFromHash();
  else if (last) location.hash = last;
  else showWelcome();
})();
