let audioEl = null; // zentrales Audio-Element fuer alle Plattformen
let audioCtx = null; // Web Audio Kontext (fuer iOS/Volume/Fade)
let gainNode = null; // Gain fuer Volume/Fade
let mediaElementSource = null; // MediaElementSource fuer das zentrale Audio
let currentAudio = null;
let volumeLevel = 1.0;
let fadeIntervalId = null;
let nowPlaying = { title: "", duration: 0, category: null };
let nowPlayingEls = { box: null, title: null, eta: null, elapsed: null, bar: null, progress: null, chartWrap: null, chart: null, drop: null };
let nowPlayingId = null; // ID des laufenden Songs (fuer die Hervorhebung im Raster)
const NOW_PLAYING_WARNING_THRESHOLD = 10; // Sekunden
let songPlayCounts = {};
let zoomLevel = 0.9;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.2;
const ZOOM_STEP = 0.05;
let zoomEls = { level: null, inBtn: null, outBtn: null };
let infoEls = { panel: null, toggle: null };
let searchTerm = "";
let searchEls = { input: null, count: null };
let headerEls = { block: null, toggle: null };

const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);

const categories = {
  ass_angriff: { title: "Ass/Angriff", color: "bg-blue-600", baseHSL: [217, 83, 57], items: [] }, // Tailwind blue-600
  block: { title: "Block", color: "bg-pink-600", baseHSL: [336, 81, 62], items: [] }, // Tailwind pink-600
  gegner: { title: "Gegner", color: "bg-red-600", baseHSL: [0, 72, 52], items: [] }, // Tailwind red-600
  sonstiges: { title: "Sonstiges 1", color: "bg-green-600", baseHSL: [142, 71, 45], items: [] }, // Tailwind green-600
  noch_mehr: { title: "Sonstiges 2", color: "bg-green-600", baseHSL: [142, 71, 45], items: [] }, // Tailwind green-600
  noch_mehr2: { title: "Sonstiges 3", color: "bg-green-600", baseHSL: [142, 71, 45], items: [] }, // Tailwind green-600
  spass: { title: "Spaß & Extras", color: "bg-purple-600", baseHSL: [271, 81, 56], items: [] }, // Tailwind purple-600
};

const specialTracks = {
  timeout: null,
  walkon: null,
  pauses: [],
};

const remoteCategories = ["ass_angriff", "block", "spass", "sonstiges", "noch_mehr", "noch_mehr2"];

const rtcState = {
  pc: null,
  channel: null,
  offerCandidates: [],
  status: "disconnected",
  ui: {},
  scanner: { stream: null, frameReq: null, video: null, canvas: null, ctx: null },
};

// Dateinamen mit Umlauten/Akzenten koennen je nach Geraet zusammengesetzt (NFC) oder zerlegt (NFD)
// geliefert werden (iPad/iCloud oft zerlegt). Alle IDs werden deshalb einheitlich zusammengesetzt.
function nfc(value) {
  return String(value).normalize("NFC");
}

function cleanName(filename) {
  return filename
    .replace(/_BLOCK/i, "")
    .replace(/_HIT/i, "")
    .replace(/_ACE/i, "")
    .replace(/_OPP/i, "")
    .replace(/_FUN/i, "")
    .replace(/_TIMEOUT/i, "")
    .replace(/_WALKON/i, "")
    .replace(/_PAUSE\d*/i, "")
    .replace(/\.(mp3|flac|wav|ogg)$/i, "")
    .trim();
}

// Kennung fuer Spezial-Songs (Timeout, Walk-On, Pausen) in waveforms.json
function specialId(fileName) {
  return "special_music/" + nfc(fileName);
}

function getSpecialTracks() {
  return [specialTracks.timeout, specialTracks.walkon, ...specialTracks.pauses].filter(Boolean);
}

function revokeAllSongUrls() {
  const urls = [];
  Object.values(categories).forEach((cat) => cat.items.forEach((song) => urls.push(song.url)));
  [specialTracks.timeout, specialTracks.walkon, ...specialTracks.pauses].forEach((track) => {
    if (track && track.url) urls.push(track.url);
  });
  urls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      /* ignorieren */
    }
  });
}

function resetCategories() {
  revokeAllSongUrls();
  Object.values(categories).forEach((cat) => {
    cat.items = [];
  });
  specialTracks.timeout = null;
  specialTracks.walkon = null;
  specialTracks.pauses = [];
}

function handleFiles(fileList) {
  // Laufenden Song vor dem Freigeben der alten Dateiverweise sauber beenden
  if (currentAudio) stopAudio(true);
  loadPlayCounts();
  resetCategories();
  const files = Array.from(fileList || []);
  let toggle = 0;

  const marksFiles = [];
  let wavesFile = null;
  waveforms = {};
  wavesUsable = false;

  files.forEach((file) => {
    if (file.name.toLowerCase() === WAVEFORMS_FILENAME) {
      wavesFile = file;
      return;
    }
    if (MARKS_FILE_PATTERN.test(file.name)) {
      marksFiles.push(file);
      return;
    }
    const relPath = file.webkitRelativePath || file.name;
    const isAudio =
      (file.type && file.type.startsWith("audio/")) ||
      /\.(mp3|flac|wav|ogg)$/i.test(file.name);
    if (!isAudio) return;

    const inSpecial = /(^|[\\/])special_music[\\/]/i.test(relPath);
    const upper = file.name.toUpperCase();

    if (inSpecial) {
      let key = null;
      if (upper.includes("_TIMEOUT")) key = "timeout";
      else if (upper.includes("_WALKON")) key = "walkon";
      else if (/_PAUSE\d+/i.test(upper)) key = "pause";

      if (key === "pause") {
        const match = upper.match(/_PAUSE(\d+)/);
        const number = match ? parseInt(match[1], 10) : specialTracks.pauses.length + 1;
        specialTracks.pauses.push({
          id: specialId(file.name),
          size: file.size,
          name: file.name,
          display: cleanName(file.name),
          number,
          url: URL.createObjectURL(file),
        });
      } else if (key) {
        specialTracks[key] = {
          id: specialId(file.name),
          size: file.size,
          name: file.name,
          display: cleanName(file.name),
          url: URL.createObjectURL(file),
        };
      }
      return; // Spezial-Songs nicht in Kategorien einsortieren
    }

    let key;
    if (upper.includes("_HIT") || upper.includes("_ACE")) key = "ass_angriff";
    else if (upper.includes("_BLOCK")) key = "block";
    else if (upper.includes("_OPP")) key = "gegner";
    else if (upper.includes("_FUN")) key = "spass";
    else {
      const miscKeys = ["sonstiges", "noch_mehr", "noch_mehr2"];
      key = miscKeys[toggle % miscKeys.length];
      toggle += 1;
    }

    categories[key].items.push({
      id: nfc(file.name), // stabile ID fuer Counter/Storage (einheitlich zusammengesetzt)
      name: file.name,
      display: cleanName(file.name),
      category: key,
      size: file.size, // fuer die Zuordnung der Kurve (waveforms.json)
      url: URL.createObjectURL(file),
    });
  });

  renderCategories();
  updateSpecialButtons();
  collapseHeader();
  sendSongsListToRemote();
  resetPageScroll();
  if (marksFiles.length) loadNewestMarksFile(marksFiles);

  // Kurven zuordnen und bei fehlenden Kurven kurz darauf hinweisen
  const finishWaves = () => {
    const { total, missing, names } = applyWaveforms();
    if (wavesUsable && missing) renderCategories(); // kleines Symbol an Songs ohne Kurve
    setTimeout(() => announceWaveforms(!!wavesFile, total, missing, names), 3500);
  };
  if (wavesFile) {
    loadWaveformsFile(wavesFile)
      .catch((err) => {
        console.error("waveforms.json unlesbar:", err);
        showToast("Die Datei waveforms.json konnte nicht gelesen werden.");
      })
      .then(finishWaves);
  } else {
    finishWaves();
  }
}

// Nach Dateiauswahl/Layoutwechsel kann Safari die Seite nach oben/unten verschoben lassen.
function resetPageScroll() {
  const reset = () => window.scrollTo(0, 0);
  reset();
  setTimeout(reset, 150);
  setTimeout(reset, 500);
}

function getAudioElement() {
  if (audioEl) return audioEl;
  const existing = document.getElementById("dj-audio");
  if (existing) {
    audioEl = existing;
  } else {
    const el = document.createElement("audio");
    el.id = "dj-audio";
    el.setAttribute("playsinline", "true");
    el.preload = "none";
    el.className = "hidden";
    document.body.appendChild(el);
    audioEl = el;
  }
  audioEl.setAttribute("playsinline", "true");
  return audioEl;
}

function ensureAudioGraph() {
  const el = getAudioElement();
  if (!el || typeof AudioContext === "undefined") return null;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!gainNode) {
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volumeLevel;
  }
  if (!mediaElementSource) {
    mediaElementSource = audioCtx.createMediaElementSource(el);
    mediaElementSource.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

// ---------------------------------------------------------------------------
// Markierungen: "Top-Stimmung" und "Mitklatschen"
// Gespeichert lokal im Browser (localStorage) und als Datei markierungen.json,
// die beim Laden des Musikordners automatisch eingelesen wird.
// ---------------------------------------------------------------------------
const MARK_GROUPS = {
  top: { label: "Top-Stimmung", short: "Top", symbol: "★" },
  clap: { label: "Mitklatschen", short: "Klatschen", symbol: "👏" },
  // Sonderlied: nie per Zufall, steht ganz oben in seiner Spalte, nur von Hand zu spielen
  special: { label: "Sonderlied", short: "Sonder", symbol: "\uD83C\uDFC6" },
  // Nur zum Merken (kein Zufall-Button):
  slow: { label: "Langer Aufbau", short: "Aufbau", symbol: "\u23F3" }, // Drop kommt spaet
  quiet: { label: "Zu leise", short: "Leise", symbol: "\uD83D\uDD08" }, // Lautstaerke nacharbeiten
};
const MARKS_KEY = "songMarks";
const MARKS_FILENAME = "markierungen.json";
const MARKS_FILE_PATTERN = /^markierungen.*\.json$/i; // auch "markierungen 2.json" usw.
const LONG_PRESS_MS = 600;
function emptyMarks() {
  const result = {};
  Object.keys(MARK_GROUPS).forEach((group) => {
    result[group] = new Set();
  });
  return result;
}

let marks = emptyMarks();
let marksDirty = false;
let marksTab = "all";
let marksSearch = "";

function loadMarks() {
  try {
    const raw = localStorage.getItem(MARKS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.keys(MARK_GROUPS).forEach((group) => {
      marks[group] = new Set((Array.isArray(data[group]) ? data[group] : []).filter((x) => typeof x === "string").map(nfc));
    });
    marksDirty = !!data.dirty;
    dropFixes = sanitizeFixes(data.dropFixes);
    pendingMarkChanges = Number(data.pendingMarks) || 0;
    pendingFixIds = new Set((Array.isArray(data.pendingFixes) ? data.pendingFixes : []).map(nfc));
  } catch (e) {
    console.warn("Konnte Markierungen nicht laden:", e);
  }
}

function saveMarks() {
  try {
    const stored = { dirty: marksDirty, dropFixes, pendingMarks: pendingMarkChanges, pendingFixes: [...pendingFixIds] };
    Object.keys(MARK_GROUPS).forEach((group) => {
      stored[group] = [...marks[group]];
    });
    localStorage.setItem(MARKS_KEY, JSON.stringify(stored));
  } catch (e) {
    console.warn("Konnte Markierungen nicht speichern:", e);
  }
}

function marksToJson() {
  const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b, "de"));
  const out = { version: 1, saved: new Date().toISOString() };
  Object.keys(MARK_GROUPS).forEach((group) => {
    out[group] = sorted(marks[group]);
  });
  out.dropFixes = sortedFixes();
  return JSON.stringify(out, null, 2);
}

function applyMarksData(data, mode) {
  if (!data || typeof data !== "object") throw new Error("Ungueltige Markierungsdatei");
  const clean = (list) => (Array.isArray(list) ? list.filter((x) => typeof x === "string").map(nfc) : []);
  Object.keys(MARK_GROUPS).forEach((group) => {
    const ids = clean(data[group]);
    if (mode === "merge") ids.forEach((id) => marks[group].add(id));
    else marks[group] = new Set(ids);
  });
  const fixes = sanitizeFixes(data.dropFixes);
  if (mode === "merge") Object.assign(dropFixes, fixes);
  else dropFixes = fixes;
}

// ---- Drop-Zeiten: Korrektur und Vorschlaege fuer "Langer Aufbau" ------------
const LONG_BUILDUP_S = 10; // erster Drop ab so vielen Sekunden = Langer Aufbau
const DROP_FIX_KEEP_GAP_S = 8; // spaetere erkannte Drops muessen so weit hinter einer Korrektur liegen
const DROP_PREVIEW_LEAD_S = 6; // Vorhoeren beginnt so viele Sekunden vor dem Drop
const DROP_FILTERS = [
  ["all", "Alle"],
  ["fixed", "Korrigiert"],
  ["long", `Aufbau ab ${LONG_BUILDUP_S} s`],
  ["none", "Ohne Drop"],
];
let pendingMarkChanges = 0; // Aenderungen an Markierungen seit dem letzten Sichern
let pendingFixIds = new Set(); // Songs mit Drop-Korrektur seit dem letzten Sichern
let dropFixes = {}; // Song-ID -> korrigierte Zeit in Sekunden, oder null = "kein Drop"
let dropFilter = "all";
let dropFixListener = null; // vom offenen Langdruck-Menue gesetzt, wird nach jeder Korrektur aufgerufen

function sanitizeFixes(source) {
  const result = {};
  if (source && typeof source === "object") {
    Object.entries(source).forEach(([id, value]) => {
      if (value === null || (typeof value === "number" && isFinite(value) && value >= 0)) result[nfc(id)] = value;
    });
  }
  return result;
}

function sortedFixes() {
  const out = {};
  Object.keys(dropFixes)
    .sort((a, b) => a.localeCompare(b, "de"))
    .forEach((id) => {
      out[id] = dropFixes[id];
    });
  return out;
}

function fixesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Erkannte Drops, ggf. durch die Korrektur des Nutzers ersetzt
function effectiveDrops(songId, wave) {
  const detected = wave && Array.isArray(wave.drops) ? wave.drops : [];
  if (!Object.prototype.hasOwnProperty.call(dropFixes, songId)) return detected;
  const fix = dropFixes[songId];
  if (fix === null) return [];
  return [[fix, 1], ...detected.filter((drop) => drop[0] > fix + DROP_FIX_KEEP_GAP_S)];
}

function firstDropTime(song) {
  if (!song || !song.wave) return null;
  const drops = effectiveDrops(song.id, song.wave);
  return drops.length ? drops[0][0] : null;
}

function formatDropTime(seconds) {
  if (seconds === null || seconds === undefined) return "kein Drop";
  return `${seconds.toFixed(1).replace(".", ",")} s`;
}

function setDropFix(id, value) {
  if (value === undefined) delete dropFixes[id];
  else dropFixes[id] = value;
  marksDirty = true;
  pendingFixIds.add(id);
  saveMarks();
  updateMarksStatus();
  if (nowPlayingId === id) currentWave = lookupWave(id); // laufender Song uebernimmt die Korrektur sofort
  renderMarksPanel();
  if (dropFixListener) dropFixListener(id);
  noteUnsavedChange();
}

// Spielt den Song ab einigen Sekunden vor dem Drop an (zaehlt nicht als Wiedergabe).
// Safari kann beim Springen in manchen Dateien (vor allem FLAC) die Wiedergabe abbrechen:
// Der Sprung erfolgt deshalb erst, wenn die Wiedergabe laeuft, und ein Aufpasser startet den Song
// bei Abbruch ohne Sprung von vorn.
function previewDrop(song) {
  playAudio(song.url, song.display, null, song.id);
  const first = firstDropTime(song);
  const start = Math.max(0, (first === null ? 0 : first) - DROP_PREVIEW_LEAD_S);
  if (start <= 0) return; // kein Sprung noetig

  const el = audioEl;
  el.addEventListener(
    "playing",
    () => {
      try {
        el.currentTime = start;
      } catch (err) {
        /* ignorieren, der Aufpasser faengt es ab */
      }
    },
    { once: true }
  );
  setTimeout(() => {
    // Nur eingreifen, wenn die Vorschau tot ist und nichts anderes laeuft
    const dead = nowPlayingId === null && (el.paused || el.ended);
    if (!dead) return;
    playAudio(song.url, song.display, null, song.id);
    showToast("Der Sprung zum Drop klappt bei diesem Song hier nicht, er startet von vorn.", "info");
  }, 1500);
}

function longBuildupSuggestions(songs) {
  return songs
    .filter((song) => song.wave && !marks.slow.has(song.id))
    .map((song) => ({ song, drop: firstDropTime(song) }))
    .filter((item) => item.drop !== null && item.drop >= LONG_BUILDUP_S)
    .sort((a, b) => a.drop - b.drop);
}

function acceptLongBuildup(ids) {
  ids.forEach((id) => marks.slow.add(id));
  marksDirty = true;
  pendingMarkChanges += ids.length;
  saveMarks();
  refreshAllSongMarks();
  updateMarksStatus();
  renderMarksPanel();
  noteUnsavedChange();
}

function makePreviewButtonFor(song, title, action) {
  const play = document.createElement("button");
  play.className = "mark-play";
  play.textContent = "▶";
  play.title = title;
  if (song) play.addEventListener("click", () => action(song));
  else play.disabled = true;
  return play;
}

function makePreviewButton(song, title) {
  return makePreviewButtonFor(song, title, previewDrop);
}

function makeNameCell(song) {
  const name = document.createElement("span");
  name.className = "marks-name";
  name.textContent = song.display;
  if (categories[song.category]) {
    const note = document.createElement("span");
    note.className = "marks-note";
    note.textContent = ` ${categories[song.category].title}`;
    name.appendChild(note);
  }
  return name;
}

// Vorschlaege oben im Reiter "Langer Aufbau"
function renderLongBuildupSuggestions(list, songs) {
  const items = longBuildupSuggestions(songs);
  if (!items.length) return;
  const head = document.createElement("div");
  head.className = "marks-sub";
  const title = document.createElement("span");
  title.textContent = `Vorschläge: erster Drop ab ${LONG_BUILDUP_S} s (${items.length})`;
  const all = document.createElement("button");
  all.className = "mark-toggle on";
  all.textContent = `Alle übernehmen (${items.length})`;
  all.addEventListener("click", () => acceptLongBuildup(items.map((item) => item.song.id)));
  head.append(title, all);
  list.appendChild(head);

  items.forEach(({ song, drop }) => {
    const row = document.createElement("div");
    row.className = "marks-row suggestion";
    const name = makeNameCell(song);
    const time = document.createElement("span");
    time.className = "marks-note";
    time.textContent = ` Drop bei ${formatDropTime(drop)}`;
    name.appendChild(time);
    const accept = document.createElement("button");
    accept.className = "mark-toggle";
    accept.textContent = `${MARK_GROUPS.slow.symbol} Übernehmen`;
    accept.addEventListener("click", () => acceptLongBuildup([song.id]));
    const controls = document.createElement("span");
    controls.className = "marks-controls";
    controls.appendChild(accept);
    row.append(makePreviewButton(song, "Ab kurz vor dem Drop anspielen (zählt nicht mit)"), name, controls);
    list.appendChild(row);
  });

  const marked = document.createElement("div");
  marked.className = "marks-sub";
  marked.textContent = `Markiert (${marks.slow.size})`;
  list.appendChild(marked);
}

// Eingabefeld, "Kein Drop" und "Original" fuer die Drop-Zeit eines Songs (Reiter Drops und Menue)
function buildDropControls(song) {
  const hasFix = Object.prototype.hasOwnProperty.call(dropFixes, song.id);
  const first = firstDropTime(song);

  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.1";
  input.min = "0";
  input.inputMode = "decimal";
  input.className = "drop-input";
  input.value = first === null ? "" : first.toFixed(1);
  input.placeholder = "–";
  input.title = "Drop-Zeit in Sekunden";
  input.addEventListener("change", () => {
    const value = parseFloat(String(input.value).replace(",", "."));
    if (!isFinite(value) || value < 0) {
      renderMarksPanel();
      if (dropFixListener) dropFixListener(song.id);
      return;
    }
    setDropFix(song.id, Math.round(value * 10) / 10);
  });

  const unit = document.createElement("span");
  unit.className = "marks-note";
  unit.textContent = "s";

  const none = document.createElement("button");
  none.className = "mark-toggle" + (hasFix && dropFixes[song.id] === null ? " on" : "");
  none.textContent = "Kein Drop";
  none.title = "Für diesen Song keinen Countdown anzeigen";
  none.addEventListener("click", () => setDropFix(song.id, hasFix && dropFixes[song.id] === null ? undefined : null));

  const nodes = [input, unit, none];
  if (hasFix) {
    const reset = document.createElement("button");
    reset.className = "mark-remove";
    reset.textContent = "↺ Original";
    reset.title = "Korrektur entfernen, erkannten Wert verwenden";
    reset.addEventListener("click", () => setDropFix(song.id, undefined));
    nodes.push(reset);
  }
  return nodes;
}

// ---- Pegel: Vorschlaege fuer "Zu leise" ------------------------------------
const QUIET_SUGGEST_DB = 3; // so viel unter dem Median gilt als Vorschlag fuer "Zu leise"
const LOUD_NOTE_DB = 3; // so viel ueber dem Median wird als "auffaellig laut" genannt

function levelStats(songs) {
  const levels = songs
    .filter((song) => song.wave && typeof song.wave.level === "number")
    .map((song) => song.wave.level)
    .sort((a, b) => a - b);
  if (!levels.length) return null;
  const middle = Math.floor(levels.length / 2);
  const median = levels.length % 2 ? levels[middle] : (levels[middle - 1] + levels[middle]) / 2;
  return { median, count: levels.length };
}

function levelOffset(song, stats) {
  if (!stats || !song || !song.wave || typeof song.wave.level !== "number") return null;
  return song.wave.level - stats.median;
}

function formatDb(value) {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded < 0 ? "−" : rounded > 0 ? "+" : "";
  return `${sign}${Math.abs(rounded).toFixed(1).replace(".", ",")} dB`;
}

// Kurzer Hinweis hinter dem Songnamen: Abstand zum Median (nur bei Auffaelligkeit oder im Reiter "Zu leise")
function levelNote(song, stats) {
  const offset = levelOffset(song, stats);
  if (offset === null) return "";
  if (marksTab !== "quiet" && Math.abs(offset) < 2) return "";
  return ` · Pegel ${formatDb(offset)}`;
}

function previewSong(song) {
  playAudio(song.url, song.display, null, song.id);
}

function acceptSuggestions(group, ids) {
  ids.forEach((id) => marks[group].add(id));
  marksDirty = true;
  pendingMarkChanges += ids.length;
  saveMarks();
  refreshAllSongMarks();
  updateMarksStatus();
  renderMarksPanel();
  noteUnsavedChange();
}

// Vorschlaege oben im Reiter "Zu leise"
function renderQuietSuggestions(list, songs) {
  const stats = levelStats(songs);
  if (!stats) {
    const info = document.createElement("div");
    info.className = "marks-sub";
    info.textContent = "Keine Pegelwerte vorhanden. Für Vorschläge die Song-Analyse einmal neu ausführen (Info → Dateien).";
    list.appendChild(info);
    return;
  }

  const items = songs
    .map((song) => ({ song, offset: levelOffset(song, stats) }))
    .filter((item) => item.offset !== null && item.offset <= -QUIET_SUGGEST_DB && !marks.quiet.has(item.song.id))
    .sort((a, b) => a.offset - b.offset);

  const head = document.createElement("div");
  head.className = "marks-sub";
  const title = document.createElement("span");
  title.textContent = items.length
    ? `Vorschläge: mindestens ${QUIET_SUGGEST_DB} dB leiser als der Median (${items.length})`
    : `Keine neuen Vorschläge (Median-Pegel ${formatDb(stats.median).replace(" dB", "")} dB)`;
  head.appendChild(title);
  if (items.length) {
    const all = document.createElement("button");
    all.className = "mark-toggle on";
    all.textContent = `Alle übernehmen (${items.length})`;
    all.addEventListener("click", () => acceptSuggestions("quiet", items.map((item) => item.song.id)));
    head.appendChild(all);
  }
  list.appendChild(head);

  items.forEach(({ song, offset }) => {
    const row = document.createElement("div");
    row.className = "marks-row suggestion";
    const name = makeNameCell(song);
    const note = document.createElement("span");
    note.className = "marks-note";
    note.textContent = ` Pegel ${formatDb(offset)}`;
    name.appendChild(note);
    const accept = document.createElement("button");
    accept.className = "mark-toggle";
    accept.textContent = `${MARK_GROUPS.quiet.symbol} Übernehmen`;
    accept.addEventListener("click", () => acceptSuggestions("quiet", [song.id]));
    const controls = document.createElement("span");
    controls.className = "marks-controls";
    controls.appendChild(accept);
    row.append(makePreviewButtonFor(song, "Anhören (zählt nicht mit)", previewSong), name, controls);
    list.appendChild(row);
  });

  // Auffaellig laute Songs nur zur Information (es gibt keine Markierung "Zu laut")
  const loud = songs
    .map((song) => ({ song, offset: levelOffset(song, stats) }))
    .filter((item) => item.offset !== null && item.offset >= LOUD_NOTE_DB)
    .sort((a, b) => b.offset - a.offset);
  const loudInfo = document.createElement("div");
  loudInfo.className = "marks-sub";
  loudInfo.textContent = loud.length
    ? `Auffällig laut (ab +${LOUD_NOTE_DB} dB): ${loud.map((item) => `${item.song.display} ${formatDb(item.offset)}`).join(", ")}`
    : `Auffällig laute Songs (ab +${LOUD_NOTE_DB} dB): keine`;
  loudInfo.style.color = "#9ca3af";
  list.appendChild(loudInfo);

  const marked = document.createElement("div");
  marked.className = "marks-sub";
  marked.textContent = `Markiert (${marks.quiet.size})`;
  list.appendChild(marked);
}

function renderDropFilter() {
  const box = document.getElementById("marks-filter");
  if (!box) return;
  box.classList.toggle("hidden", marksTab !== "drops");
  if (marksTab !== "drops") return;
  box.innerHTML = "";
  DROP_FILTERS.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.classList.toggle("active", dropFilter === key);
    button.addEventListener("click", () => {
      dropFilter = key;
      renderMarksPanel();
    });
    box.appendChild(button);
  });
}

// Reiter "Drops": erkannte Drop-Zeit pro Song ansehen und korrigieren
function renderDropsTab(list, songs) {
  const withWave = songs.filter((song) => song.wave);
  const withoutWave = songs.length - withWave.length;
  const term = marksSearch.trim().toLowerCase();

  if (withoutWave > 0) {
    const info = document.createElement("div");
    info.className = "marks-sub";
    const missingNames = songs.filter((song) => !song.wave).map((song) => song.display);
    const shown = missingNames.slice(0, 6).join(", ") + (missingNames.length > 6 ? " …" : "");
    info.textContent = `${withoutWave} Songs ohne Kurve sind hier nicht aufgeführt: ${shown}. Song-Analyse nötig, siehe Info → Dateien.`;
    list.appendChild(info);
  }

  const rows = withWave
    .filter((song) => !term || song.display.toLowerCase().includes(term))
    .filter((song) => {
      const first = firstDropTime(song);
      if (dropFilter === "fixed") return Object.prototype.hasOwnProperty.call(dropFixes, song.id);
      if (dropFilter === "long") return first !== null && first >= LONG_BUILDUP_S;
      if (dropFilter === "none") return first === null;
      return true;
    })
    .sort(compareByDisplay);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "marks-empty";
    empty.textContent = withWave.length
      ? "Keine Songs für diese Auswahl."
      : "Noch keine Kurven geladen. Song-Analyse ausführen (Info → Dateien) und die Songs neu laden.";
    list.appendChild(empty);
    return;
  }

  rows.forEach((song) => {
    const hasFix = Object.prototype.hasOwnProperty.call(dropFixes, song.id);
    const detectedFirst = song.wave.drops.length ? song.wave.drops[0][0] : null;
    const first = firstDropTime(song);

    const row = document.createElement("div");
    row.className = "marks-row" + (hasFix ? " drop-fixed" : "");
    const name = makeNameCell(song);
    const detected = document.createElement("span");
    detected.className = "marks-note";
    detected.textContent =
      (hasFix ? ` korrigiert, erkannt: ${formatDropTime(detectedFirst)}` : ` erkannt: ${formatDropTime(detectedFirst)}`) +
      (pendingFixIds.has(song.id) ? " · ungesichert" : "");
    name.appendChild(detected);

    const controls = document.createElement("span");
    controls.className = "marks-controls";
    controls.append(...buildDropControls(song));
    row.append(makePreviewButton(song, `Ab ${DROP_PREVIEW_LEAD_S} Sekunden vor dem Drop anspielen (zählt nicht mit)`), name, controls);
    list.appendChild(row);
  });
}

// ---- Sicherheitsnetz: letzter Stand + Erinnerung ---------------------------
const MARKS_BACKUP_KEY = "songMarksBackup";
const MARKS_HINT_COOLDOWN_MS = 5 * 60 * 1000;
const MARKS_HINT_MIN_CHANGES = 3;
let marksUnsavedChanges = 0;
let marksHintShownAt = 0;
let marksHintTimer = null;

function marksCount(source = marks) {
  return Object.values(source).reduce((sum, set) => sum + set.size, 0);
}

function marksFromData(data) {
  const result = emptyMarks();
  Object.keys(MARK_GROUPS).forEach((group) => {
    if (data && Array.isArray(data[group])) {
      data[group].filter((x) => typeof x === "string").forEach((id) => result[group].add(nfc(id)));
    }
  });
  return result;
}

function marksEqual(a, b) {
  return Object.keys(MARK_GROUPS).every(
    (group) => a[group].size === b[group].size && [...a[group]].every((id) => b[group].has(id))
  );
}

function readMarksBackup() {
  try {
    const raw = localStorage.getItem(MARKS_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Merkt sich den aktuellen Stand (ein Platz), bevor er durch Zuruecksetzen/Einlesen ersetzt wird
function takeMarksBackup() {
  if (marksCount() === 0 && Object.keys(dropFixes).length === 0) return;
  try {
    const data = { savedAt: new Date().toISOString(), dropFixes };
    Object.keys(MARK_GROUPS).forEach((group) => {
      data[group] = [...marks[group]];
    });
    localStorage.setItem(MARKS_BACKUP_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Konnte Sicherheitskopie nicht speichern:", e);
  }
  updateRestoreButton();
}

function updateRestoreButton() {
  const btn = document.getElementById("marks-restore");
  const info = document.getElementById("marks-restore-info");
  if (!btn) return;
  const backup = readMarksBackup();
  btn.classList.toggle("hidden", !backup);
  if (info) info.classList.toggle("hidden", !backup);
  if (!backup) return;
  const count = marksCount(marksFromData(backup));
  const when = new Date(backup.savedAt);
  const time = isNaN(when)
    ? ""
    : when.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (info) info.textContent = `${count} Markierungen, Stand ${time}`;
}

function restoreMarksBackup() {
  const backup = readMarksBackup();
  if (!backup) return;
  const restored = marksFromData(backup);
  const restoredFixes = sanitizeFixes(backup.dropFixes);
  takeMarksBackup(); // aktueller Stand wird zur neuen Sicherheitskopie, so ist es umkehrbar
  marks = restored;
  dropFixes = restoredFixes;
  marksDirty = true;
  afterMarksChangedBulk();
  showToast(`Letzter Stand wiederhergestellt: ${marksCount()} Markierungen.`, "info");
}

function hideMarksHint() {
  clearTimeout(marksHintTimer);
  const hint = document.getElementById("marks-hint");
  if (hint) hint.classList.remove("marks-hint-visible");
}

function showMarksHint() {
  marksHintShownAt = Date.now();
  let hint = document.getElementById("marks-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "marks-hint";
    hint.className = "marks-hint";
    hint.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = "Markierungen noch nicht gesichert";
    const save = document.createElement("button");
    save.textContent = "Sichern";
    save.addEventListener("click", () => {
      hideMarksHint();
      exportMarks();
    });
    const close = document.createElement("button");
    close.textContent = "\u2715";
    close.setAttribute("aria-label", "Hinweis schließen");
    close.addEventListener("click", hideMarksHint);
    hint.append(text, save, close);
    document.body.appendChild(hint);
  }
  const anchor = document.getElementById("marks-toggle");
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    hint.style.top = `${rect.bottom + 8}px`;
    hint.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  }
  hint.classList.add("marks-hint-visible");
  clearTimeout(marksHintTimer);
  marksHintTimer = setTimeout(hideMarksHint, 9000);
}

function maybeShowMarksHint(force = false) {
  if (!marksDirty) return;
  if (!force && Date.now() - marksHintShownAt < MARKS_HINT_COOLDOWN_MS) return;
  const panel = document.getElementById("marks-panel");
  if (panel && !panel.classList.contains("hidden")) return; // Verwaltung offen: Sichern ist dort sichtbar
  if (document.getElementById("mark-menu")) return; // erst nach dem Menue
  showMarksHint();
}

function noteUnsavedChange() {
  marksUnsavedChanges += 1;
  if (marksUnsavedChanges >= MARKS_HINT_MIN_CHANGES) maybeShowMarksHint();
}

function getAllSongs() {
  return Object.values(categories).flatMap((cat) => cat.items);
}

function compareByDisplay(a, b) {
  return a.display.localeCompare(b.display, "de", { sensitivity: "base" });
}

function createMarksEl(id) {
  const symbols = Object.entries(MARK_GROUPS)
    .filter(([group]) => marks[group].has(id))
    .map(([, def]) => def.symbol);
  if (!symbols.length) return null;
  const el = document.createElement("span");
  el.className = "song-marks";
  el.setAttribute("aria-hidden", "true");
  el.textContent = symbols.join(" ");
  return el;
}

function updateSongMarks(id) {
  document.querySelectorAll(".song-button").forEach((btn) => {
    if (btn.dataset.songId !== id) return;
    const old = btn.querySelector(".song-marks");
    if (old) old.remove();
    const el = createMarksEl(id);
    if (el) btn.insertBefore(el, btn.querySelector(".song-count"));
  });
}

function refreshAllSongMarks() {
  const ids = new Set(getAllSongs().map((song) => song.id));
  ids.forEach(updateSongMarks);
}

function toggleMark(group, id) {
  if (marks[group].has(id)) marks[group].delete(id);
  else marks[group].add(id);
  marksDirty = true;
  pendingMarkChanges += 1;
  saveMarks();
  updateSongMarks(id);
  if (group === "special") {
    const song = getAllSongs().find((item) => item.id === id);
    if (song) renderSingleCategory(song.category); // Sonderlied nach oben bzw. zurueck
  }
  updateMarksStatus();
  renderMarksPanel();
  noteUnsavedChange();
}

function updateMarksStatus() {
  if (!marksDirty) {
    marksUnsavedChanges = 0;
    hideMarksHint();
    if (pendingMarkChanges || pendingFixIds.size) {
      pendingMarkChanges = 0;
      pendingFixIds.clear();
      saveMarks();
    }
  }
  updateRestoreButton();
  const dot = document.getElementById("marks-dirty");
  if (dot) dot.classList.toggle("hidden", !marksDirty);
  const status = document.getElementById("marks-status");
  if (status) {
    const parts = [];
    if (pendingMarkChanges) parts.push(`${pendingMarkChanges} an Markierungen`);
    if (pendingFixIds.size) parts.push(`${pendingFixIds.size} Drop-Korrektur${pendingFixIds.size === 1 ? "" : "en"}`);
    status.textContent = marksDirty
      ? `Änderungen noch nicht gesichert${parts.length ? ": " + parts.join(", ") : ""}`
      : "Gesichert / aus Datei geladen";
    status.classList.toggle("marks-status-dirty", marksDirty);
  }
}

// ---- Menue bei langem Druck auf einen Song --------------------------------
function closeMarkMenu() {
  const menu = document.getElementById("mark-menu");
  if (menu) menu.remove();
  dropFixListener = null;
  document.removeEventListener("pointerdown", onMarkMenuOutside, true);
  if (menu && marksUnsavedChanges >= MARKS_HINT_MIN_CHANGES) maybeShowMarksHint();
}

function onMarkMenuOutside(event) {
  const menu = document.getElementById("mark-menu");
  if (menu && !menu.contains(event.target)) closeMarkMenu();
}

function placeMarkMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 170) top = Math.max(60, rect.top - height - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function openMarkMenu(song, anchor) {
  closeMarkMenu();
  const menu = document.createElement("div");
  menu.id = "mark-menu";
  menu.className = "mark-menu";

  const title = document.createElement("div");
  title.className = "mark-menu-title";
  title.textContent = song.display;
  menu.appendChild(title);

  Object.entries(MARK_GROUPS).forEach(([group, def]) => {
    const btn = document.createElement("button");
    btn.className = "mark-menu-btn";
    const refresh = () => {
      const on = marks[group].has(song.id);
      btn.classList.toggle("on", on);
      btn.textContent = `${def.symbol} ${def.label}${on ? "  ✓" : ""}`;
    };
    refresh();
    btn.addEventListener("click", () => {
      toggleMark(group, song.id);
      refresh();
    });
    menu.appendChild(btn);
  });

  // Drop-Zeit direkt im Menue korrigieren
  const dropBox = document.createElement("div");
  dropBox.className = "mark-menu-drop";
  const renderDropBox = () => {
    dropBox.innerHTML = "";
    if (!song.wave) {
      const note = document.createElement("span");
      note.className = "marks-note";
      note.textContent = "Keine Kurve vorhanden, Drop-Zeit nicht verfügbar";
      dropBox.appendChild(note);
      return;
    }
    const detectedFirst = song.wave.drops.length ? song.wave.drops[0][0] : null;
    const label = document.createElement("div");
    label.className = "mark-menu-label";
    label.textContent = `Drop-Zeit (erkannt: ${formatDropTime(detectedFirst)})`;
    const row = document.createElement("div");
    row.className = "mark-menu-droprow";
    row.append(
      makePreviewButton(song, `Ab ${DROP_PREVIEW_LEAD_S} Sekunden vor dem Drop anspielen (zählt nicht mit)`),
      ...buildDropControls(song)
    );
    dropBox.append(label, row);
  };
  renderDropBox();
  dropFixListener = (id) => {
    if (id !== song.id || !document.body.contains(menu)) return;
    renderDropBox();
    placeMarkMenu(menu, anchor);
  };
  menu.appendChild(dropBox);

  const done = document.createElement("button");
  done.className = "mark-menu-done";
  done.textContent = "Fertig";
  done.addEventListener("click", closeMarkMenu);
  menu.appendChild(done);

  document.body.appendChild(menu);
  placeMarkMenu(menu, anchor);
  setTimeout(() => document.addEventListener("pointerdown", onMarkMenuOutside, true), 0);
}

// ---- Verwaltungsfenster ----------------------------------------------------
function toggleMarksPanel() {
  const panel = document.getElementById("marks-panel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    updateMarksStatus();
    renderMarksPanel();
  }
}

function makeMarkToggle(group, id) {
  const def = MARK_GROUPS[group];
  const btn = document.createElement("button");
  btn.className = "mark-toggle" + (marks[group].has(id) ? " on" : "");
  btn.textContent = `${def.symbol} ${def.short}`;
  btn.title = `${def.label} ${marks[group].has(id) ? "entfernen" : "hinzufügen"}`;
  btn.addEventListener("click", () => toggleMark(group, id));
  return btn;
}

function renderMarksPanel() {
  const panel = document.getElementById("marks-panel");
  if (!panel || panel.classList.contains("hidden")) return;
  const list = document.getElementById("marks-list");
  const scroll = list.scrollTop;
  list.innerHTML = "";

  const songs = getAllSongs();
  const byId = new Map(songs.map((song) => [song.id, song]));
  const levelInfo = levelStats(songs);

  document.querySelectorAll("#marks-tabs [data-tab]").forEach((tab) => {
    const key = tab.dataset.tab;
    if (key === "all") {
      tab.textContent = `Alle Songs (${songs.length})`;
    } else if (key === "drops") {
      const fixed = Object.keys(dropFixes).length;
      tab.textContent = fixed ? `Drops (${fixed} korrigiert)` : "Drops";
    } else {
      tab.textContent = `${MARK_GROUPS[key].symbol} ${MARK_GROUPS[key].label} (${marks[key].size})`;
    }
    tab.classList.toggle("active", key === marksTab);
  });
  const searchInput = document.getElementById("marks-search");
  if (searchInput) searchInput.classList.toggle("hidden", marksTab !== "all" && marksTab !== "drops");
  renderDropFilter();
  if (marksTab === "drops") {
    renderDropsTab(list, songs);
    list.scrollTop = scroll;
    return;
  }
  if (marksTab === "slow") renderLongBuildupSuggestions(list, songs);
  if (marksTab === "quiet") renderQuietSuggestions(list, songs);

  let rows;
  if (marksTab === "all") {
    const term = marksSearch.trim().toLowerCase();
    rows = songs
      .filter((song) => !term || song.display.toLowerCase().includes(term))
      .map((song) => ({ id: song.id, display: song.display, song }));
  } else {
    rows = [...marks[marksTab]].map((id) => {
      const song = byId.get(id);
      return { id, display: song ? song.display : cleanName(id), song: song || null };
    });
  }
  rows.sort(compareByDisplay);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "marks-empty";
    if (marksTab === "all") {
      empty.textContent = songs.length
        ? "Keine Songs gefunden."
        : "Noch keine Songs geladen. Zuerst „Songs laden“.";
    } else {
      empty.textContent =
        "Noch keine Songs in dieser Gruppe. Im Reiter „Alle Songs“ markieren oder einen Song im Pult lange drücken.";
    }
    list.appendChild(empty);
  }

  rows.forEach((row) => {
    const el = document.createElement("div");
    el.className = "marks-row" + (row.song ? "" : " missing");

    const play = document.createElement("button");
    play.className = "mark-play";
    play.textContent = "▶";
    play.title = "Kurz anspielen (zählt nicht mit)";
    if (row.song) {
      play.addEventListener("click", () => playAudio(row.song.url, row.song.display, null, null));
    } else {
      play.disabled = true;
    }

    const name = document.createElement("span");
    name.className = "marks-name";
    name.textContent = row.display;
    const note = document.createElement("span");
    note.className = "marks-note";
    if (!row.song) {
      note.textContent = " nicht geladen";
      name.appendChild(note);
    } else if (categories[row.song.category]) {
      // Kategorie als Hinweis, damit gleichnamige Songs unterscheidbar sind
      note.textContent = ` ${categories[row.song.category].title}${wavesUsable && !row.song.wave ? " · keine Kurve" : ""}${levelNote(row.song, levelInfo)}`;
      name.appendChild(note);
    }

    const controls = document.createElement("span");
    controls.className = "marks-controls";
    Object.keys(MARK_GROUPS).forEach((group) => controls.append(makeMarkToggle(group, row.id)));
    if (marksTab !== "all") {
      // In den Gruppen-Reitern zusaetzlich: Song aus dieser Gruppe entfernen
      const remove = document.createElement("button");
      remove.className = "mark-remove";
      remove.textContent = "✕ Entfernen";
      remove.addEventListener("click", () => toggleMark(marksTab, row.id));
      controls.append(remove);
    }

    el.append(play, name, controls);
    list.appendChild(el);
  });
  list.scrollTop = scroll;
}

// ---- Sichern / Laden / Zuruecksetzen ---------------------------------------
async function exportMarks() {
  const file = new File([marksToJson()], MARKS_FILENAME, { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      marksDirty = false;
      saveMarks();
      updateMarksStatus();
      showToast("In Dateien in den Musikordner sichern, dann ist alles gespeichert.", "info");
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return; // abgebrochen: weiterhin "nicht gesichert"
    console.warn("Teilen nicht moeglich, lade als Datei herunter:", err);
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = MARKS_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  marksDirty = false;
  saveMarks();
  updateMarksStatus();
  showToast("Datei heruntergeladen. In den Musikordner legen.", "info");
}

function afterMarksChangedBulk() {
  saveMarks();
  refreshAllSongMarks();
  renderCategories();
  updateMarksStatus();
  renderMarksPanel();
}

function markSummary() {
  const parts = Object.entries(MARK_GROUPS)
    .filter(([group]) => marks[group].size > 0)
    .map(([group, def]) => `${marks[group].size} ${def.label}`);
  return parts.length ? parts.join(", ") : "keine";
}

function importMarksFromText(text, source, extraInfo = "") {
  let data;
  try {
    data = JSON.parse(text);
    if (!marksDirty && (!marksEqual(marks, marksFromData(data)) || !fixesEqual(sortedFixes(), sanitizeFixes(data.dropFixes)))) takeMarksBackup();
    applyMarksData(data, marksDirty ? "merge" : "replace");
  } catch (err) {
    console.error("Markierungsdatei unlesbar:", err);
    showToast("Markierungsdatei konnte nicht gelesen werden.");
    return;
  }
  const merged = marksDirty;
  if (!merged) marksDirty = false;
  afterMarksChangedBulk();
  showToast(
    `Markierungen ${source}: ${markSummary()}` +
      extraInfo +
      (merged ? " (mit deinen ungesicherten Änderungen zusammengeführt)" : ""),
    "info"
  );
}

// Liest alle gefundenen Markierungsdateien und uebernimmt die zuletzt gesicherte
// (Zeitstempel in der Datei, ersatzweise Aenderungsdatum der Datei).
function loadNewestMarksFile(files) {
  Promise.all(
    files.map((file) =>
      file
        .text()
        .then((text) => {
          const data = JSON.parse(text);
          const saved = Date.parse(data && data.saved) || file.lastModified || 0;
          return { text, saved, name: file.name };
        })
        .catch(() => null)
    )
  )
    .then((entries) => {
      const valid = entries.filter(Boolean);
      if (!valid.length) {
        showToast("Markierungsdatei konnte nicht gelesen werden.");
        return;
      }
      valid.sort((a, b) => b.saved - a.saved);
      const info = valid.length > 1 ? ` (neueste von ${valid.length} Dateien: ${valid[0].name})` : "";
      importMarksFromText(valid[0].text, "geladen", info);
    })
    .catch((err) => {
      console.error(err);
      showToast("Markierungsdatei konnte nicht gelesen werden.");
    });
}

function loadMarksFromFile(file) {
  file
    .text()
    .then((text) => importMarksFromText(text, "geladen"))
    .catch((err) => {
      console.error(err);
      showToast("Markierungsdatei konnte nicht gelesen werden.");
    });
}

function resetMarks() {
  if (!Object.values(marks).some((set) => set.size > 0)) return;
  if (!confirm("Alle Markierungen löschen? (Der letzte Stand lässt sich wiederherstellen.)")) return;
  takeMarksBackup();
  marks = emptyMarks();
  marksDirty = true;
  afterMarksChangedBulk();
}

function initMarksUI() {
  const bind = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  };
  bind("marks-toggle", toggleMarksPanel);
  bind("marks-close", toggleMarksPanel);
  bind("marks-export", exportMarks);
  bind("marks-reset", resetMarks);
  bind("marks-restore", restoreMarksBackup);
  bind("marks-import", () => document.getElementById("marks-file")?.click());

  const fileInput = document.getElementById("marks-file");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (file) loadMarksFromFile(file);
    });
  }
  document.querySelectorAll("#marks-tabs [data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      marksTab = tab.dataset.tab;
      renderMarksPanel();
    });
  });
  const search = document.getElementById("marks-search");
  if (search) {
    search.addEventListener("input", () => {
      marksSearch = search.value;
      renderMarksPanel();
    });
  }
  updateMarksStatus();
  if (marksDirty) setTimeout(() => maybeShowMarksHint(true), 2500);
  // Browser bitten, die lokalen Daten nicht bei Speicherknappheit zu loeschen
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

// Zaehlgruppen: Farbe/Rahmen (Heatmap) richten sich nach dem Vergleich innerhalb der Gruppe
const COUNT_GROUPS = [
  ["ass_angriff", "block", "sonstiges", "noch_mehr", "noch_mehr2"], // Eigene Punkte
  ["gegner"], // Gegnerpunkte
  ["spass"], // Lustig
];

function countGroupOf(key) {
  return COUNT_GROUPS.find((group) => group.includes(key)) || [key];
}

// Sonderlieder stehen ganz oben in ihrer Spalte
function orderedItems(cat) {
  return [...cat.items.filter((song) => marks.special.has(song.id)), ...cat.items.filter((song) => !marks.special.has(song.id))];
}

function getCountRange(cat) {
  let min = Infinity;
  let max = -Infinity;
  const key = Object.keys(categories).find((k) => categories[k] === cat);
  countGroupOf(key).forEach((groupKey) => {
    const groupCat = categories[groupKey];
    if (!groupCat) return;
    groupCat.items.forEach((song) => {
      if (marks.special.has(song.id)) return; // Sonderlieder verzerren die Heatmap nicht
      const count = songPlayCounts[song.id] || 0;
      if (count < min) min = count;
      if (count > max) max = count;
    });
  });
  return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
}

function updatePlayingHighlight() {
  document.querySelectorAll(".song-button").forEach((btn) => {
    const playing = nowPlayingId !== null && btn.dataset.songId === nowPlayingId;
    btn.classList.toggle("is-playing", playing);
    if (!playing) {
      const badge = btn.querySelector(".drop-badge");
      if (badge && !badge.classList.contains("hidden")) {
        badge.className = "drop-badge hidden";
        badge.textContent = "";
      }
    }
  });
}

function buildSongButton(song, cat, range) {
  const btn = document.createElement("button");
  btn.className = "song-button";

  const count = songPlayCounts[song.id] || 0;
  const isSpecial = marks.special.has(song.id);
  if (isSpecial) btn.classList.add("song-special");
  if (cat.baseHSL && !isSpecial) {
    // Heatmap: selten gespielte Songs leuchten kraeftig, oft gespielte werden blasser.
    // Songs mit dem niedrigsten Zaehler der Spalte bekommen zusaetzlich einen hellen Rahmen.
    const spread = range.max - range.min;
    const used = spread > 0 ? (count - range.min) / spread : 0; // 0 = selten, 1 = am haeufigsten
    const fresh = 1 - used;
    const [h, s, l] = cat.baseHSL;
    btn.style.backgroundColor = `hsl(${h}, ${Math.round(15 + fresh * (s * 0.9 - 15))}%, ${Math.round(17 + fresh * 25)}%)`;
    btn.style.borderColor = `hsl(${h}, ${Math.round(15 + fresh * s * 0.8)}%, ${Math.round(24 + fresh * 32)}%)`;
    btn.style.borderLeftColor = `hsl(${h}, ${s}%, ${l}%)`;
    if (spread > 0 && count === range.min) {
      btn.style.boxShadow = `0 0 0 1px hsl(${h}, 83%, 65%), 0 2px 4px rgba(0, 0, 0, 0.3)`;
    } else {
      btn.style.opacity = (0.55 + fresh * 0.45).toFixed(2);
    }
  }

  if (matchesSearch(song)) {
    btn.classList.add("search-hit");
  }

  btn.dataset.songId = song.id;
  if (song.id === nowPlayingId) btn.classList.add("is-playing");

  const eq = document.createElement("span");
  eq.className = "eq";
  eq.setAttribute("aria-hidden", "true");
  eq.innerHTML = "<i></i><i></i><i></i>";

  const name = document.createElement("span");
  name.className = "song-name";
  name.textContent = song.display;
  const badge = document.createElement("span");
  badge.className = "song-count";
  badge.textContent = count.toString();
  const markEl = createMarksEl(song.id);
  const parts = [eq, name];
  if (wavesUsable && !song.wave) {
    const noWave = document.createElement("span");
    noWave.className = "song-nowave";
    noWave.textContent = "\u2248";
    noWave.title = "Keine Kurve – Song-Analyse ausführen";
    parts.push(noWave);
  }
  if (markEl) parts.push(markEl);
  parts.push(badge);
  btn.append(...parts);
  const dropBadge = document.createElement("span");
  dropBadge.className = "drop-badge hidden";
  dropBadge.dataset.base = "drop-badge";
  btn.appendChild(dropBadge);

  // Langer Druck oeffnet das Markierungs-Menue; der folgende Klick spielt dann nicht ab
  let pressTimer = null;
  let longPressed = false;
  const cancelPress = () => clearTimeout(pressTimer);
  btn.addEventListener("pointerdown", () => {
    longPressed = false;
    cancelPress();
    pressTimer = setTimeout(() => {
      longPressed = true;
      openMarkMenu(song, btn);
    }, LONG_PRESS_MS);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((type) =>
    btn.addEventListener(type, cancelPress)
  );
  btn.addEventListener("contextmenu", (event) => event.preventDefault());

  btn.addEventListener("click", () => {
    if (longPressed) {
      longPressed = false;
      return;
    }
    playAudio(song.url, song.display, song.category, song.id);
    clearSearch();
  });
  return btn;
}

function renderCategories() {
  const grid = document.getElementById("categories-grid");
  grid.innerHTML = "";
  let totalMatches = 0;
  Object.entries(categories).forEach(([key, cat]) => {
    const col = document.createElement("div");
    col.classList.add("category-col");
    col.setAttribute("data-category", key);

    const head = document.createElement("div");
    head.className = "category-head";
    if (cat.baseHSL) {
      const [h, s, l] = cat.baseHSL;
      head.style.borderBottomColor = `hsl(${h}, ${s}%, ${l}%)`;
    }
    const title = document.createElement("span");
    title.className = "category-title";
    title.textContent = cat.title;
    const total = document.createElement("span");
    total.className = "category-total";
    total.textContent = cat.items.length.toString();
    head.append(title, total);

    const container = document.createElement("div");
    container.className = "flex flex-col space-y-2 category-list";
    container.id = `col-${key}`;
    container.dataset.category = key;

    col.append(head, container);
    grid.appendChild(col);

    const range = getCountRange(cat);
    orderedItems(cat).forEach((song) => {
      if (matchesSearch(song)) totalMatches += 1;
      container.appendChild(buildSongButton(song, cat, range));
    });
  });
  updateSearchCount(totalMatches);
}

function resumeAudioContext() {
  if (!audioCtx || audioCtx.state === "running") return Promise.resolve();
  return audioCtx.resume().catch((err) => {
    console.warn("Konnte AudioContext nicht fortsetzen:", err);
  });
}

let toastTimer = null;
function showToast(message, type = "error") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("toast-info", type === "info");
  toast.classList.add("toast-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("toast-visible"), 4000);
}

function handlePlaybackFailure(err, displayTitle) {
  if (err && err.name === "AbortError") return; // schnelles Weiterschalten, kein echter Fehler
  console.error("Audio-Wiedergabe fehlgeschlagen:", err);
  clearNowPlaying();
  const name = displayTitle ? `\u201E${displayTitle}\u201C` : "Song";
  if (err && err.name === "NotAllowedError") {
    showToast(`${name} konnte nicht starten (Wiedergabe blockiert). Bitte nochmal tippen.`);
  } else {
    showToast(`${name} konnte nicht abgespielt werden.`);
  }
}

// ---------------------------------------------------------------------------
// Kurven und Drop-Countdown
// Daten kommen aus waveforms.json (erzeugt mit tools/analyse.html) im Musikordner.
// ---------------------------------------------------------------------------
const WAVEFORMS_FILENAME = "waveforms.json";
const DROP_NEAR_S = 5; // ab so vielen Sekunden vor dem Drop erscheint der Countdown
const DROP_WARN_S = 3; // ab hier groesser und rot
const DROP_FLASH_S = 1.2; // so lange bleibt "DROP!" stehen
let waveforms = {};
let wavesUsable = false; // waveforms.json wurde gefunden und gelesen
let currentWave = null;
let nowPlayingTimer = null;

function decodeCurve(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function loadWaveformsFile(file) {
  return file.text().then((text) => {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || typeof data.songs !== "object") {
      throw new Error("Unbekanntes Format");
    }
    waveforms = {};
    Object.entries(data.songs).forEach(([name, entry]) => {
      if (!entry || typeof entry.curve !== "string") return;
      waveforms[nfc(name)] = {
        size: entry.size,
        duration: entry.duration,
        curve: decodeCurve(entry.curve),
        drops: Array.isArray(entry.drops) ? entry.drops : [],
        level: typeof entry.level === "number" ? entry.level : null,
        integrated: typeof entry.integrated === "number" ? entry.integrated : null,
      };
    });
    wavesUsable = true;
  });
}

// Ordnet jedem Song seine Kurve zu (nur wenn Dateiname und Groesse passen)
function applyWaveforms() {
  const songs = getAllSongs();
  const names = [];
  songs.forEach((song) => {
    const wave = waveforms[song.id];
    song.wave = wave && wave.size === song.size ? wave : null;
    if (!song.wave) names.push(song.display);
  });
  getSpecialTracks().forEach((track) => {
    const wave = waveforms[track.id];
    track.wave = wave && wave.size === track.size ? wave : null;
  });
  return { total: songs.length, missing: names.length, names };
}

function announceWaveforms(hasFile, total, missing, names = []) {
  if (!total || !missing) return;
  const list = names.length && names.length <= 3 ? ` (${names.join(", ")})` : "";
  showToast(
    hasFile
      ? `${missing} von ${total} Songs haben noch keine Kurve${list}. Bitte die Song-Analyse ausführen (Info → Dateien).`
      : "Keine Kurven gefunden (waveforms.json fehlt im Ordner). Bitte die Song-Analyse ausführen (Info → Dateien).",
    "info"
  );
}

function lookupWave(songId) {
  if (!songId) return null;
  const song = getAllSongs().find((item) => item.id === songId) || getSpecialTracks().find((track) => track.id === songId);
  return song && song.wave ? { ...song.wave, drops: effectiveDrops(songId, song.wave) } : null;
}

// text: volle Anzeige in Now Playing, shortText: kurze Anzeige im Song-Button
function setDropState(state, text, shortText = text) {
  const apply = (el, active, label) => {
    const base = el.dataset.base || "drop-badge";
    el.className = active ? `${base} ${state}` : `${base} hidden`;
    el.textContent = active ? label : "";
  };
  if (nowPlayingEls.drop) apply(nowPlayingEls.drop, !!state, text);
  // Alle Schilder durchgehen: nur am laufenden Song-Button darf eines sichtbar sein
  document.querySelectorAll(".song-button .drop-badge").forEach((el) => {
    const playing = !!el.closest(".song-button.is-playing");
    apply(el, !!state && playing, shortText);
  });
}

function drawNowPlayingChart(currentTime) {
  const { chart } = nowPlayingEls;
  if (!chart || !currentWave) return;
  const cssWidth = chart.clientWidth;
  const cssHeight = chart.clientHeight;
  if (!cssWidth || !cssHeight) return;
  const ratio = window.devicePixelRatio || 1;
  if (chart.width !== Math.round(cssWidth * ratio) || chart.height !== Math.round(cssHeight * ratio)) {
    chart.width = Math.round(cssWidth * ratio);
    chart.height = Math.round(cssHeight * ratio);
  }
  const ctx = chart.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const curve = currentWave.curve;
  const duration = currentWave.duration || (audioEl && audioEl.duration) || curve.length / 2;
  const progress = Math.max(0, Math.min(1, currentTime / duration));
  const barWidth = cssWidth / curve.length;
  for (let i = 0; i < curve.length; i += 1) {
    const height = Math.max(2, (curve[i] / 255) * (cssHeight - 6));
    ctx.fillStyle = (i + 0.5) / curve.length <= progress ? "#60a5fa" : "#4b5563";
    ctx.fillRect(i * barWidth + 0.5, cssHeight - height, Math.max(1, barWidth - 1), height);
  }

  // Drops: der naechste (erste noch kommende) kraeftig, die uebrigen dezent
  let nextMarked = false;
  currentWave.drops.forEach((drop) => {
    const x = Math.round((drop[0] / duration) * cssWidth);
    const upcoming = drop[0] > currentTime;
    const isNext = upcoming && !nextMarked;
    if (isNext) nextMarked = true;
    ctx.fillStyle = isNext ? "#fbbf24" : upcoming ? "#92400e" : "rgba(146, 64, 14, 0.5)";
    ctx.fillRect(x - 1, 0, 2, cssHeight);
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 4, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
  });

  // Abspiel-Strich
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(progress * cssWidth) - 1, 0, 2, cssHeight);
}

function tickNowPlaying() {
  if (!currentWave || !audioEl) return;
  const time = audioEl.currentTime || 0;
  drawNowPlayingChart(time);
  // Countdown nur fuer den ersten Drop des Songs
  const first = currentWave.drops[0];
  if (!first) {
    setDropState(null, "");
    return;
  }
  const remaining = first[0] - time;
  if (remaining > DROP_NEAR_S) setDropState(null, "");
  else if (remaining > DROP_WARN_S) setDropState("near", `Drop in ${Math.ceil(remaining)}`, `▼${Math.ceil(remaining)}`);
  else if (remaining > 0) setDropState("warn", `Drop in ${Math.ceil(remaining)}`, `▼${Math.ceil(remaining)}`);
  else if (remaining > -DROP_FLASH_S) setDropState("now", "DROP!");
  else setDropState(null, "");
}

function stopNowPlayingTicker() {
  clearInterval(nowPlayingTimer);
  nowPlayingTimer = null;
  setDropState(null, "");
}

function startNowPlayingTicker() {
  stopNowPlayingTicker();
  const hasWave = !!currentWave;
  const { chartWrap, progress } = nowPlayingEls;
  if (chartWrap) chartWrap.classList.toggle("hidden", !hasWave);
  if (progress) progress.classList.toggle("hidden", hasWave);
  if (!hasWave) return;
  tickNowPlaying();
  nowPlayingTimer = setInterval(tickNowPlaying, 100);
}

function playAudio(file, displayTitle = "", categoryKey = null, songId = null) {
  const el = getAudioElement();
  if (!el) return;

  if (fadeIntervalId) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }

  ensureAudioGraph();
  el.pause();
  el.currentTime = 0;
  el.src = file;

  if (gainNode) {
    gainNode.gain.value = volumeLevel;
  } else {
    const targetVolume = volumeLevel;
    try {
      el.volume = targetVolume;
    } catch (err) {
      console.warn("Konnte Lautstaerke nicht setzen:", err);
    }
  }

  currentAudio = el;
  nowPlaying.category = categoryKey || null;
  nowPlayingId = songId || null;
  currentWave = lookupWave(songId);
  if (categoryKey) rememberPlayed(songId); // Vorhoeren (ohne Kategorie) zaehlt nicht als gespielt
  incrementPlayCount(songId || displayTitle || file, categoryKey);
  updatePlayingHighlight();
  showNowPlaying(displayTitle);
  startNowPlayingTicker();
  resumeAudioContext();
  el.onloadedmetadata = () => {
    updateNowPlayingDuration(el);
    sendNowPlayingStatus({ title: displayTitle, category: categoryKey, duration: el.duration || 0 });
  };
  el.ontimeupdate = () => updateNowPlayingEta(el);
  el.onended = () => clearNowPlaying();
  el.onerror = () => handlePlaybackFailure(el.error, displayTitle);
  const playPromise = el.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch((err) => {
      // einmal erneut versuchen: nach einer iOS-Unterbrechung klappt es oft erst nach dem Fortsetzen
      if (err && err.name === "NotAllowedError" && audioCtx && audioCtx.state !== "running") {
        resumeAudioContext()
          .then(() => el.play())
          .catch((retryErr) => handlePlaybackFailure(retryErr, displayTitle));
      } else {
        handlePlaybackFailure(err, displayTitle);
      }
    });
  }
  sendNowPlayingStatus({ title: displayTitle, category: categoryKey });
}

function stopAudio(forceImmediate = false) {
  const el = getAudioElement();
  if (!el || !currentAudio) return;

  if (fadeIntervalId) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }

  const fadeOutTime = 1000;
  const fadeSteps = 30;
  const fadeInterval = fadeOutTime / fadeSteps;
  const canGainFade = !!gainNode;
  const shouldFade = !forceImmediate;

  sendNowPlayingStatus({ title: "", category: null, duration: 0, stopped: true });

  if (shouldFade && canGainFade) {
    const startGain = gainNode.gain.value || volumeLevel || 1;
    const gainStep = startGain / fadeSteps;
    fadeIntervalId = setInterval(() => {
      const next = gainNode.gain.value - gainStep;
      if (next > 0.001) {
        gainNode.gain.value = next;
      } else {
        clearInterval(fadeIntervalId);
        fadeIntervalId = null;
        gainNode.gain.value = 0.001; // leises Ende, kein Hochspringen
        el.pause();
        el.currentTime = 0;
        currentAudio = null;
      }
    }, fadeInterval);
  } else if (shouldFade && !IS_IOS) {
    const initialVolume = el.volume > 0 ? el.volume : volumeLevel || 1;
    const volumeStep = initialVolume / fadeSteps;
    fadeIntervalId = setInterval(() => {
      if (el.volume > volumeStep + 0.001) {
        el.volume -= volumeStep;
      } else {
        clearInterval(fadeIntervalId);
        fadeIntervalId = null;
        el.volume = 0.001; // leises Ende, dann Stopp
        el.pause();
        el.currentTime = 0;
        currentAudio = null;
      }
    }, fadeInterval);
  } else {
    el.pause();
    el.currentTime = 0;
    currentAudio = null;
  }
  clearNowPlaying();
}

function setVolume(value) {
  const numeric = Math.min(1, Math.max(0, parseFloat(value) || 0));
  volumeLevel = numeric;

  const el = getAudioElement();
  if (!el) return;

  ensureAudioGraph();

  if (gainNode) {
    gainNode.gain.value = volumeLevel;
    return;
  }

  try {
    el.volume = volumeLevel;
  } catch (err) {
    console.warn("Konnte Lautstaerke nicht setzen:", err);
  }
}

function updateSpecialButtons() {
  const map = [
    { id: "btn-timeout", key: "timeout", fallback: "Timeout", prefix: "" },
    { id: "btn-walkon", key: "walkon", fallback: "Walk-On", prefix: "", fixed: true }, // Beschriftung bleibt immer "Walk-On"
  ];

  map.forEach(({ id, key, fallback, prefix, fixed }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const track = specialTracks[key];
    if (!fixed && track && track.display) {
      btn.textContent = prefix ? `${prefix}${track.display}` : track.display;
    } else {
      btn.textContent = fallback;
    }
  });

  renderPauseButtons();
}

function showNowPlaying(title = "") {
  const { box, title: t, eta } = nowPlayingEls;
  nowPlaying.title = title || "Playing";
  if (t) t.textContent = nowPlaying.title;
  if (eta) eta.textContent = "--:--";
  if (nowPlayingEls.elapsed) nowPlayingEls.elapsed.textContent = "0:00";
  if (nowPlayingEls.bar) nowPlayingEls.bar.style.width = "100%";
  if (box) box.classList.remove("hidden");
}

function updateNowPlayingDuration(el) {
  nowPlaying.duration = el && isFinite(el.duration) ? el.duration : 0;
  updateNowPlayingEta(el);
}

function updateNowPlayingEta(el) {
  const { eta } = nowPlayingEls;
  if (!eta || !el) return;
  const remaining = (el.duration || 0) - (el.currentTime || 0);
  eta.textContent = formatTime(remaining);
  if (nowPlayingEls.elapsed) nowPlayingEls.elapsed.textContent = formatTime(el.currentTime || 0);
  toggleNowPlayingWarning(remaining);
  const { bar } = nowPlayingEls;
  if (bar) {
    const ratio = el.duration > 0 && isFinite(el.duration) ? remaining / el.duration : 0;
    bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }
}

function clearNowPlaying() {
  const { box, eta, bar } = nowPlayingEls;
  nowPlaying = { title: "", duration: 0, category: null };
  nowPlayingId = null;
  currentWave = null;
  stopNowPlayingTicker();
  updatePlayingHighlight();
  if (bar) bar.style.width = "0";
  if (eta) eta.textContent = "--:--";
  if (nowPlayingEls.elapsed) nowPlayingEls.elapsed.textContent = "0:00";
  if (box) box.classList.add("hidden");
  toggleNowPlayingWarning(Infinity);
  sendNowPlayingStatus({ title: "", category: null, duration: 0, stopped: true });
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function syncAfterReturn() {
  if (document.visibilityState !== "visible") return;
  resumeAudioContext();
  // Wurde die Wiedergabe vom System gestoppt, soll die Anzeige nicht weiter "laeuft" zeigen
  if (nowPlaying.title && audioEl && audioEl.paused && !fadeIntervalId) {
    clearNowPlaying();
  }
}

document.addEventListener("visibilitychange", syncAfterReturn);
window.addEventListener("pageshow", syncAfterReturn);

document.addEventListener("DOMContentLoaded", () => {
  loadMarks();
  initMarksUI();
  initInfoUI();
  audioEl = getAudioElement();
  if (audioEl) {
    audioEl.preload = "none";
    audioEl.setAttribute("playsinline", "true");
  }
  nowPlayingEls = {
    box: document.getElementById("now-playing"),
    title: document.getElementById("now-playing-title"),
    eta: document.getElementById("now-playing-eta"),
    elapsed: document.getElementById("now-playing-elapsed"),
    bar: document.getElementById("now-playing-bar"),
    progress: document.querySelector("#now-playing .np-progress"),
    chartWrap: document.getElementById("np-chart-wrap"),
    chart: document.getElementById("np-chart"),
    drop: document.getElementById("np-drop"),
  };
  headerEls = {
    block: document.getElementById("header-block"),
    toggle: document.getElementById("toggle-header"),
  };
  initVersionInfo();
  infoEls = {
    panel: document.getElementById("info-panel"),
    toggle: document.getElementById("info-toggle"),
  };
  zoomEls = {
    level: document.getElementById("zoom-level"),
    inBtn: document.getElementById("zoom-in"),
    outBtn: document.getElementById("zoom-out"),
    resetBtn: document.getElementById("reset-counts"),
  };
  searchEls = {
    input: document.getElementById("search-input"),
    count: document.getElementById("search-count"),
  };
  rtcState.ui = {
    panel: document.getElementById("pairing-panel"),
    toggle: document.getElementById("pairing-toggle"),
    status: document.getElementById("pairing-status"),
    offerText: document.getElementById("player-offer-text"),
    answerText: document.getElementById("player-answer-text"),
    offerQr: document.getElementById("player-offer-qr"),
    log: document.getElementById("pairing-log"),
    createOfferBtn: document.getElementById("create-offer-btn"),
    refreshOfferBtn: document.getElementById("refresh-offer-btn"),
    applyAnswerBtn: document.getElementById("apply-answer-btn"),
    scanAnswerBtn: document.getElementById("scan-answer-btn"),
    stopScanBtn: document.getElementById("stop-scan-btn"),
    closeBtn: document.getElementById("pairing-close-btn"),
  };
  rtcState.scanner.video = document.getElementById("answer-video");
  rtcState.scanner.canvas = document.getElementById("answer-canvas");
  if (rtcState.scanner.canvas) {
    rtcState.scanner.ctx = rtcState.scanner.canvas.getContext("2d");
  }
  initZoomControls();
  initSearchControls();
  initPairingUI();

  const fileInput = document.getElementById("filepicker");
  const loadButton = document.getElementById("load-songs-btn");
  const btnTimeout = document.getElementById("btn-timeout");
  const btnWalkon = document.getElementById("btn-walkon");

  if (loadButton && fileInput) {
    loadButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
  }
  if (headerEls.toggle) {
    headerEls.toggle.addEventListener("click", toggleHeaderVisibility);
  }

  const bindSpecial = (btn, key, label) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const track = specialTracks[key];
      if (track && track.url) {
        playAudio(track.url, track.display || label, null, track.id);
      } else {
        alert(`Kein ${label}-Track geladen.`);
      }
    });
  };

  bindSpecial(btnTimeout, "timeout", "Timeout");
  bindSpecial(btnWalkon, "walkon", "Walk-On");

  loadPausePlayed();
  updateSpecialButtons();
  loadPlayCounts();
});

function toggleNowPlayingWarning(remainingSeconds) {
  const { box } = nowPlayingEls;
  if (!box) return;
  if (remainingSeconds <= NOW_PLAYING_WARNING_THRESHOLD) {
    box.classList.add("now-playing-warning");
  } else {
    box.classList.remove("now-playing-warning");
  }
}

function incrementPlayCount(id, categoryKey) {
  if (!categoryKey) return;
  songPlayCounts[id] = (songPlayCounts[id] || 0) + 1;
  savePlayCounts();
  renderSingleCategory(categoryKey);
}

function savePlayCounts() {
  try {
    localStorage.setItem("songPlayCounts", JSON.stringify(songPlayCounts));
  } catch (e) {
    console.warn("Konnte songPlayCounts nicht speichern:", e);
  }
}

function loadPlayCounts() {
  try {
    const data = localStorage.getItem("songPlayCounts");
    if (data) {
      songPlayCounts = {};
      Object.entries(JSON.parse(data)).forEach(([id, count]) => {
        const key = nfc(id); // aeltere Zaehler mit zerlegten Namen zusammenfuehren
        songPlayCounts[key] = (songPlayCounts[key] || 0) + (Number(count) || 0);
      });
    }
  } catch (e) {
    console.warn("Konnte songPlayCounts nicht laden:", e);
  }
}

function renderSingleCategory(key) {
  // Alle Spalten der Zaehlgruppe neu zeichnen, da sich die Vergleichswerte aendern
  countGroupOf(key).forEach((groupKey) => {
    const cat = categories[groupKey];
    const container = document.querySelector(`#col-${groupKey}`);
    if (!cat || !container) return;
    container.innerHTML = "";
    const range = getCountRange(cat);
    orderedItems(cat).forEach((song) => {
      container.appendChild(buildSongButton(song, cat, range));
    });
  });
  updateSearchCount(countSearchHits());
}

function initZoomControls() {
  const { level, inBtn, outBtn, resetBtn } = zoomEls;
  const applyZoom = () => {
    document.documentElement.style.fontSize = `${16 * zoomLevel}px`;
    updateNowPlayingWidth();
    if (level) level.textContent = `${Math.round(zoomLevel * 100)}%`;
  };
  applyZoom();
  if (inBtn) {
    inBtn.addEventListener("click", () => {
      zoomLevel = Math.min(ZOOM_MAX, parseFloat((zoomLevel + ZOOM_STEP).toFixed(2)));
      applyZoom();
    });
  }
  if (outBtn) {
    outBtn.addEventListener("click", () => {
      zoomLevel = Math.max(ZOOM_MIN, parseFloat((zoomLevel - ZOOM_STEP).toFixed(2)));
      applyZoom();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetPlayCounts();
    });
  }
}

function resetPlayCounts() {
  resetPausePlayed();
  songPlayCounts = {};
  savePlayCounts();
  renderCategories();
}

function collapseHeader() {
  if (!headerEls.block) return;
  headerEls.block.classList.add("header-hidden");
  headerEls.block.style.display = "none";
  if (headerEls.toggle) {
    headerEls.toggle.textContent = "Kopf ein";
    headerEls.toggle.dataset.collapsed = "true";
  }
  document.body.classList.add("header-collapsed");
}

function toggleHeaderVisibility() {
  if (!headerEls.block) return;
  const hidden = headerEls.block.classList.toggle("header-hidden");
  headerEls.block.style.display = hidden ? "none" : "";
  if (headerEls.toggle) {
    headerEls.toggle.textContent = hidden ? "Kopf ein" : "Kopf aus";
    headerEls.toggle.dataset.collapsed = hidden ? "true" : "false";
  }
  document.body.classList.toggle("header-collapsed", hidden);
}

// Pausen-Songs als drehbare Walzen: wischen waehlt, Tippen auf den mittleren Eintrag spielt ab
const PAUSE_BUTTONS_MAX = 4; // bis zu so vielen Songs bleiben normale Knoepfe, darueber gibt es zwei Walzen

function updateWheelLook(scroller) {
  const items = scroller.querySelectorAll(".wheel-item");
  if (!items.length) return;
  const center = scroller.scrollTop + scroller.clientHeight / 2;
  items.forEach((item) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const dist = (itemCenter - center) / item.offsetHeight; // 0 = Mitte
    const abs = Math.min(Math.abs(dist), 2);
    item.style.transform = `perspective(300px) rotateX(${(-dist * 38).toFixed(1)}deg) scale(${(1 - abs * 0.12).toFixed(3)})`;
    item.style.opacity = Math.max(0.25, 1 - abs * 0.45).toFixed(2);
    item.classList.toggle("is-center", abs < 0.5);
  });
}

// Bereits gespielte Pausen-Songs (bleibt nach App-Neustart erhalten, Reset-Knopf setzt zurueck)
let pausePlayed = new Set();

function loadPausePlayed() {
  try {
    const data = JSON.parse(localStorage.getItem("pausePlayed") || "[]");
    pausePlayed = new Set(Array.isArray(data) ? data.map(nfc) : []);
  } catch (err) {
    pausePlayed = new Set();
  }
}

function savePausePlayed() {
  try {
    localStorage.setItem("pausePlayed", JSON.stringify([...pausePlayed]));
  } catch (err) {
    console.warn("Konnte Pausen-Markierung nicht speichern:", err);
  }
}

function refreshPauseMarks() {
  document.querySelectorAll("[data-pause-id]").forEach((el) => {
    el.classList.toggle("is-played", pausePlayed.has(el.dataset.pauseId));
  });
}

function resetPausePlayed() {
  pausePlayed = new Set();
  savePausePlayed();
  refreshPauseMarks();
}

// Spielt einen Pausen-Song, markiert ihn als gespielt und dreht die Walze zum naechsten ungespielten
function playPauseTrack(track, label) {
  playAudio(track.url, label, null, track.id);
  if (!track.id) return;
  pausePlayed.add(track.id);
  const all = (specialTracks.pauses || []).map((item) => item.id);
  if (all.length && all.every((id) => pausePlayed.has(id))) {
    // alle einmal gespielt: neue Runde, der gerade gespielte bleibt markiert
    pausePlayed = new Set([track.id]);
  }
  savePausePlayed();
  refreshPauseMarks();
  document.querySelectorAll(".pause-wheel").forEach((wheel) => {
    if (wheel.advanceFrom) wheel.advanceFrom(track.id);
  });
}

const WHEEL_COPIES = 9; // Liste wird mehrfach hintereinander gebaut, so wirkt die Walze endlos

function buildPauseWheel(tracks, startIndex) {
  const wheel = document.createElement("div");
  wheel.className = "pause-wheel";
  const scroller = document.createElement("div");
  scroller.className = "wheel-scroll";
  const band = document.createElement("div");
  band.className = "wheel-band";
  band.setAttribute("aria-hidden", "true");

  const count = tracks.length;
  const items = [];
  for (let copy = 0; copy < WHEEL_COPIES; copy += 1) {
    tracks.forEach((track, i) => {
      const name = track.display || `Pause ${track.number || startIndex + i + 1}`;
      const label = `Pause: ${name}`;
      const item = document.createElement("button");
      item.className = "wheel-item";
      item.textContent = name;
      item.title = label;
      item.dataset.pauseId = track.id || "";
      item.classList.toggle("is-played", pausePlayed.has(track.id));
      item.addEventListener("click", () => {
        if (item.classList.contains("is-center")) {
          playPauseTrack(track, label);
        } else {
          scroller.scrollTo({ top: centerTop(item), behavior: "smooth" });
        }
      });
      scroller.appendChild(item);
      items.push(item);
    });
  }

  wheel.append(scroller, band);

  // Nach dem Abspielen zum naechsten noch nicht gespielten Song dieser Walze drehen
  wheel.advanceFrom = (playedId) => {
    const from = tracks.findIndex((track) => track.id === playedId);
    if (from === -1 || count < 2) return;
    let target = (from + 1) % count;
    for (let k = 1; k < count; k += 1) {
      const j = (from + k) % count;
      if (!pausePlayed.has(tracks[j].id)) {
        target = j;
        break;
      }
    }
    let best = null;
    items.forEach((item, index) => {
      if (index % count !== target) return;
      const distance = Math.abs(centerTop(item) - scroller.scrollTop);
      if (!best || distance < best.distance) best = { item, distance };
    });
    if (best) setTimeout(() => scroller.scrollTo({ top: centerTop(best.item), behavior: "smooth" }), 250);
  };

  const centerTop = (item) => item.offsetTop - (scroller.clientHeight - item.offsetHeight) / 2;
  const copyHeight = () => (count ? items[count].offsetTop - items[0].offsetTop : 0);

  // Springt unmerklich in die mittlere Kopie zurueck (gleicher Inhalt, daher kein sichtbarer Sprung)
  const recenter = (onlyIfNearEdge) => {
    const h = copyHeight();
    if (!h) return;
    const base = Math.floor((scroller.scrollTop - centerTop(items[0])) / h + 1e-6);
    const mid = Math.floor(WHEEL_COPIES / 2);
    if (base === mid) return;
    if (onlyIfNearEdge && base >= 1 && base <= WHEEL_COPIES - 3) return;
    scroller.scrollTop -= (base - mid) * h;
  };

  let placed = false;
  const layout = () => {
    if (!items.length || !items[0].offsetHeight) return;
    const pad = Math.max(0, (scroller.clientHeight - items[0].offsetHeight) / 2);
    scroller.style.paddingTop = `${pad}px`;
    scroller.style.paddingBottom = `${pad}px`;
    if (!placed) {
      placed = true;
      scroller.style.scrollSnapType = "none";
      const firstFree = Math.max(0, tracks.findIndex((track) => !pausePlayed.has(track.id)));
      scroller.scrollTop = centerTop(items[Math.floor(WHEEL_COPIES / 2) * count + firstFree]);
      requestAnimationFrame(() => (scroller.style.scrollSnapType = ""));
    }
    updateWheelLook(scroller);
  };
  let frame = null;
  let idle = null;
  scroller.addEventListener("scroll", () => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = null;
        updateWheelLook(scroller);
      });
    }
    recenter(true);
    clearTimeout(idle);
    idle = setTimeout(() => recenter(false), 120);
  });
  if (window.ResizeObserver) new ResizeObserver(layout).observe(wheel);
  setTimeout(layout, 0);
  return wheel;
}

function renderPauseButtons() {
  const container = document.getElementById("pause-buttons");
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(specialTracks.pauses) || specialTracks.pauses.length === 0) return;

  const sorted = [...specialTracks.pauses].sort((a, b) => (a.number || 0) - (b.number || 0));

  if (sorted.length <= PAUSE_BUTTONS_MAX) {
    container.style.gridTemplateColumns = "";
    sorted.forEach((track, idx) => {
      const label = `Pause: ${track.display || `Pause ${track.number || idx + 1}`}`;
      const btn = document.createElement("button");
      btn.className = "pause-button bg-[#2b3445] hover:bg-[#364156] rounded-xl text-base leading-tight px-2 py-2 w-full";
      btn.textContent = label;
      btn.dataset.pauseId = track.id || "";
      btn.classList.toggle("is-played", pausePlayed.has(track.id));
      btn.addEventListener("click", () => playPauseTrack(track, label));
      container.appendChild(btn);
    });
    return;
  }

  const half = Math.ceil(sorted.length / 2);
  container.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  container.appendChild(buildPauseWheel(sorted.slice(0, half), 0));
  container.appendChild(buildPauseWheel(sorted.slice(half), half));
}

function initCategoryScrollSync() {
  const miscKeys = new Set(["sonstiges", "noch_mehr", "noch_mehr2"]);
  let isSyncing = false;
  const miscLists = Array.from(document.querySelectorAll(".category-list")).filter((el) =>
    miscKeys.has(el.dataset.category)
  );

  miscLists.forEach((el) => {
    el.onscroll = null;
    el.addEventListener("scroll", () => {
      if (isSyncing) return;
      isSyncing = true;
      const target = el.scrollTop;
      miscLists.forEach((other) => {
        if (other !== el) {
          other.scrollTop = target;
        }
      });
      isSyncing = false;
    });
  });
}

function initSearchControls() {
  const { input } = searchEls;
  if (!input) return;
  input.addEventListener("input", (e) => setSearchTerm(e.target.value));
  setSearchTerm("");
}

function setSearchTerm(value) {
  const normalized = (value || "").trim().toLowerCase();
  searchTerm = normalized;
  renderCategories();
}

function matchesSearch(song) {
  if (!searchTerm) return false;
  const haystack = `${song.display || ""} ${song.name || ""}`.toLowerCase();
  return haystack.includes(searchTerm);
}

function countSearchHits() {
  if (!searchTerm) return 0;
  let hits = 0;
  Object.values(categories).forEach((cat) => {
    cat.items.forEach((song) => {
      if (matchesSearch(song)) hits += 1;
    });
  });
  return hits;
}

function updateSearchCount(count) {
  const el = searchEls.count;
  if (!el) return;
  const value = searchTerm ? count : 0;
  el.textContent = `${value} Treffer`;
}

function clearSearch() {
  if (!searchTerm) return;
  searchTerm = "";
  if (searchEls.input) {
    searchEls.input.value = "";
  }
  renderCategories();
}

// Now Playing so breit wie moeglich, ohne die obere Leiste zu verdraengen
const NP_MIN_REM = 18;
const NP_MAX_REM = 30;

function updateNowPlayingWidth() {
  const bar = document.getElementById("top-bar");
  if (!bar) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  // natuerliche Breite der Leiste (der dehnbare Abstandshalter zaehlt dabei 0)
  const previousRight = bar.style.right;
  const previousWidth = bar.style.width;
  bar.style.right = "auto";
  bar.style.width = "max-content";
  const natural = bar.offsetWidth;
  bar.style.right = previousRight;
  bar.style.width = previousWidth;
  const available = window.innerWidth - natural - 1.5 * rem; // Raender links/rechts und Abstand
  const width = Math.max(NP_MIN_REM * rem, Math.min(NP_MAX_REM * rem, available));
  document.documentElement.style.setProperty("--np-width", `${Math.round(width)}px`);
}

function updateBottomBarHeight() {
  const bar = document.querySelector(".bottom-bar");
  if (bar) document.documentElement.style.setProperty("--bottom-bar-h", `${bar.offsetHeight}px`);
}

function initInfoUI() {
  const tabs = document.querySelectorAll("#info-tabs [data-info-tab]");
  const sections = document.querySelectorAll("[data-info-section]");
  const body = document.querySelector(".info-body");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((other) => other.classList.toggle("active", other === tab));
      sections.forEach((section) =>
        section.classList.toggle("hidden", section.dataset.infoSection !== tab.dataset.infoTab)
      );
      if (body) body.scrollTop = 0;
    });
  });
  const close = document.getElementById("info-close");
  if (close) close.addEventListener("click", toggleInfo);

  // Fenster sollen immer ueber der unteren Leiste enden, auch wenn sich deren Hoehe aendert
  updateBottomBarHeight();
  updateNowPlayingWidth();
  window.addEventListener("resize", updateNowPlayingWidth);
  window.addEventListener("load", updateNowPlayingWidth);
  setTimeout(updateNowPlayingWidth, 400);
  window.addEventListener("resize", updateBottomBarHeight);
  const bar = document.querySelector(".bottom-bar");
  if (bar && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(updateBottomBarHeight).observe(bar);
  }
}

// Info- und Versionsfeld: immer nur eines offen, ein Tipp daneben schliesst es
const SIDE_PANELS = [
  { panel: "info-panel", toggle: "info-toggle" },
  { panel: "version-panel", toggle: "version-toggle" },
];

function closeSidePanels(exceptPanelId = null) {
  SIDE_PANELS.forEach(({ panel }) => {
    if (panel === exceptPanelId) return;
    const el = document.getElementById(panel);
    if (el) el.classList.add("hidden");
  });
}

function toggleSidePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  closeSidePanels(panelId);
  panel.classList.toggle("hidden");
}

function toggleInfo() {
  toggleSidePanel("info-panel");
}

function toggleVersion() {
  toggleSidePanel("version-panel");
}

// Tipp ausserhalb des offenen Feldes (zum Beispiel auf einen Song) schliesst es; der Tipp selbst funktioniert weiter
document.addEventListener(
  "pointerdown",
  (event) => {
    SIDE_PANELS.forEach(({ panel, toggle }) => {
      const panelEl = document.getElementById(panel);
      if (!panelEl || panelEl.classList.contains("hidden")) return;
      if (panelEl.contains(event.target)) return;
      const toggleEl = document.getElementById(toggle);
      if (toggleEl && toggleEl.contains(event.target)) return; // der Button schaltet selbst um
      panelEl.classList.add("hidden");
    });
  },
  true
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidePanels();
});

function renderChangelog() {
  const box = document.getElementById("version-changelog");
  if (!box || typeof APP_CHANGELOG === "undefined") return;
  box.innerHTML = "";
  APP_CHANGELOG.forEach((entry, index) => {
    const details = document.createElement("details");
    details.open = index === 0;
    const summary = document.createElement("summary");
    summary.className = "cursor-pointer font-semibold";
    summary.textContent = `v${entry.version} (${entry.date})`;
    const list = document.createElement("ul");
    list.className = "list-disc list-inside space-y-1 mt-1";
    entry.changes.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
    details.append(summary, list);
    box.appendChild(details);
  });
}

function initVersionInfo() {
  const version = typeof APP_VERSION !== "undefined" ? APP_VERSION : "?";
  const build = typeof APP_BUILD !== "undefined" ? APP_BUILD : "?";
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("version-toggle", `v${version}`);
  set("version-number", version);
  set("version-build", build);
  renderChangelog();
  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => set("version-cache", keys.join(", ") || "-"))
      .catch(() => set("version-cache", "-"));
  } else {
    set("version-cache", "-");
  }
}

// ---------------------------------------------------------------------------
// Zufallsauswahl: selten gespielte Songs werden klar bevorzugt
// ---------------------------------------------------------------------------
const RECENT_SONG_LIMIT = 4; // so viele zuletzt gespielte Songs werden uebersprungen
const RANDOM_WEIGHT_POWER = 4; // je hoeher, desto staerker die Bevorzugung
const recentSongIds = [];

function rememberPlayed(id) {
  if (!id) return;
  const index = recentSongIds.indexOf(id);
  if (index !== -1) recentSongIds.splice(index, 1);
  recentSongIds.push(id);
  while (recentSongIds.length > RECENT_SONG_LIMIT) recentSongIds.shift();
}

// Waehlt einen Song aus der Liste:
// 1. Zuletzt gespielte Songs werden uebersprungen (sofern genug andere da sind).
// 2. Das Gewicht richtet sich nach dem Abstand zum am seltensten gespielten Song der Auswahl:
//    gleich oft wie der seltenste = Gewicht 1, einmal oefter = 1/16, zweimal = 1/81 usw.
//    Dadurch bleibt die Bevorzugung auch dann scharf, wenn alle Songs schon oft liefen.
function pickWeightedSong(songs) {
  songs = songs.filter((song) => !marks.special.has(song.id)); // Sonderlieder nie per Zufall
  if (!songs.length) return null;
  const skip = Math.min(RECENT_SONG_LIMIT, songs.length - 1);
  const recent = skip > 0 ? recentSongIds.slice(-skip) : [];
  let candidates = songs.filter((song) => !recent.includes(song.id));
  if (!candidates.length) candidates = songs;

  const counts = candidates.map((song) => songPlayCounts[song.id] || 0);
  const minCount = Math.min(...counts);
  const weights = counts.map((count) =>
    Math.max(0.0005, 1 / Math.pow(1 + (count - minCount), RANDOM_WEIGHT_POWER))
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function playRandomTrack() {
  const candidateCategories = ["ass_angriff", "block", "sonstiges", "noch_mehr", "noch_mehr2"];
  const songs = candidateCategories.flatMap((key) => (categories[key] ? categories[key].items : []));
  const chosen = pickWeightedSong(songs);
  if (!chosen) {
    alert("Keine Songs in den zufaelligen Kategorien geladen.");
    return;
  }
  playAudio(chosen.url, chosen.display, chosen.category, chosen.id);
}

// Zufaelliger Song aus einer Markierungs-Gruppe ("top" oder "clap")
function playRandomMarked(group) {
  const def = MARK_GROUPS[group];
  if (!def) return;
  const songs = getAllSongs().filter((song) => marks[group].has(song.id));
  const chosen = pickWeightedSong(songs);
  if (!chosen) {
    showToast(`Noch keine geladenen Songs in „${def.label}“ markiert.`);
    return;
  }
  playAudio(chosen.url, chosen.display, chosen.category, chosen.id);
}

function playRandomOpponentTrack() {
  const cat = categories["gegner"];
  const chosen = pickWeightedSong(cat && Array.isArray(cat.items) ? cat.items : []);
  if (!chosen) {
    alert("Keine Songs in der Gegner-Kategorie geladen.");
    return;
  }
  playAudio(chosen.url, chosen.display, "gegner", chosen.id);
}

// -----------------------------
// WebRTC Remote-Control (Player)
// -----------------------------

function initPairingUI() {
  const { toggle, panel, createOfferBtn, refreshOfferBtn, applyAnswerBtn, scanAnswerBtn, stopScanBtn, closeBtn } = rtcState.ui;
  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) {
        panel.scrollTop = 0;
      }
    });
  }
  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  }
  if (createOfferBtn) createOfferBtn.addEventListener("click", startPlayerOffer);
  if (refreshOfferBtn) refreshOfferBtn.addEventListener("click", () => {
    cleanupPlayerRTC();
    resetPairingUI();
    startPlayerOffer();
  });
  if (applyAnswerBtn) applyAnswerBtn.addEventListener("click", applyAnswerFromInput);
  if (scanAnswerBtn) scanAnswerBtn.addEventListener("click", startAnswerScan);
  if (stopScanBtn) stopScanBtn.addEventListener("click", stopAnswerScan);
}

function resetPairingUI() {
  const { offerText, answerText, offerQr, log, status } = rtcState.ui;
  if (offerText) offerText.value = "";
  if (answerText) answerText.value = "";
  if (offerQr) offerQr.innerHTML = "";
  if (log) log.textContent = "";
  if (status) status.textContent = "Getrennt";
}

function updatePairingStatus(text) {
  if (rtcState.ui.status) {
    rtcState.ui.status.textContent = text;
  }
}

function logPairing(message) {
  const el = rtcState.ui.log;
  if (!el) return;
  const ts = new Date().toLocaleTimeString();
  el.textContent = `[${ts}] ${message}\n${el.textContent}`.slice(0, 2000);
}

function cleanupPlayerRTC() {
  if (rtcState.channel) {
    try {
      rtcState.channel.close();
    } catch (e) {
      console.warn("Channel close failed", e);
    }
  }
  if (rtcState.pc) {
    try {
      rtcState.pc.close();
    } catch (e) {
      console.warn("PC close failed", e);
    }
  }
  rtcState.pc = null;
  rtcState.channel = null;
  rtcState.offerCandidates = [];
  rtcState.status = "disconnected";
  stopAnswerScan();
  updatePairingStatus("Getrennt");
}

async function startPlayerOffer() {
  try {
    cleanupPlayerRTC();
    updatePairingStatus("Verbinde...");
    logPairing("Erzeuge Offer...");
    const pc = new RTCPeerConnection({ iceServers: [] });
    rtcState.pc = pc;
    rtcState.offerCandidates = [];
    const channel = pc.createDataChannel("remote");
    rtcState.channel = channel;
    wireDataChannel(channel);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        rtcState.offerCandidates.push(ev.candidate);
      }
    };
    pc.oniceconnectionstatechange = () => {
      logPairing(`ICE: ${pc.iceConnectionState}`);
    };
    pc.onconnectionstatechange = () => {
      logPairing(`Connection: ${pc.connectionState}`);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        updatePairingStatus("Getrennt");
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceComplete(pc);
    const payload = {
      type: "offer",
      sdp: pc.localDescription.sdp,
      ice: rtcState.offerCandidates,
    };
    const encoded = encodeSignalPayload(payload);
    renderOfferQr(encoded);
    if (rtcState.ui.offerText) rtcState.ui.offerText.value = encoded;
    updatePairingStatus("Offer bereit");
    logPairing("Offer bereit. QR/Text an Remote senden.");
  } catch (err) {
    console.error(err);
    logPairing(`Fehler beim Offer: ${err.message || err}`);
    updatePairingStatus("Fehler");
  }
}

function renderOfferQr(text) {
  const target = rtcState.ui.offerQr;
  if (!target) return;
  target.innerHTML = "";
  if (typeof QRCode === "undefined") {
    target.textContent = "QR-Bibliothek fehlt.";
    return;
  }
  new QRCode(target, {
    text,
    width: 160,
    height: 160,
    correctLevel: QRCode.CorrectLevel.L,
  });
}

async function applyAnswerFromInput() {
  try {
    if (!rtcState.pc) {
      logPairing("Kein aktiver Offer. Bitte neu starten.");
      return;
    }
    const text = (rtcState.ui.answerText?.value || "").trim();
    if (!text) {
      logPairing("Keine Answer im Feld gefunden.");
      return;
    }
    const payload = decodeSignalPayload(text);
    if (!payload || payload.type !== "answer" || !payload.sdp) {
      logPairing("Ungültige Answer.");
      return;
    }
    await rtcState.pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp }));
    if (Array.isArray(payload.ice)) {
      for (const cand of payload.ice) {
        try {
          await rtcState.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn("Konnte ICE-Kandidat nicht setzen:", err);
        }
      }
    }
    updatePairingStatus("Answer gesetzt");
    logPairing("Answer übernommen. Warte auf DataChannel...");
  } catch (err) {
    console.error(err);
    logPairing(`Fehler beim Anwenden der Answer: ${err.message || err}`);
    updatePairingStatus("Fehler");
  }
}

function wireDataChannel(channel) {
  if (!channel) return;
  channel.onopen = () => {
    rtcState.status = "connected";
    updatePairingStatus("Verbunden");
    logPairing("Remote verbunden.");
    unlockAudioForRemote();
    sendSongsListToRemote();
  };
  channel.onclose = () => {
    rtcState.status = "disconnected";
    updatePairingStatus("Getrennt");
    logPairing("Remote getrennt.");
  };
  channel.onerror = (err) => logPairing(`Channel-Fehler: ${err?.message || err}`);
  channel.onmessage = handleRemoteMessage;
}

function handleRemoteMessage(event) {
  let msg = null;
  try {
    msg = JSON.parse(event.data);
  } catch (err) {
    console.warn("Ungültige Nachricht", err);
    return;
  }
  if (!msg) return;
  if (msg.type === "command") {
    handleRemoteCommand(msg.command, msg.payload || {});
  }
}

function handleRemoteCommand(command, payload) {
  switch (command) {
    case "play": {
      const ok = playSongFromRemote(payload);
      if (!ok) logPairing("Song nicht gefunden.");
      break;
    }
    case "stop":
      stopAudio();
      break;
    case "randomStandard":
      playRandomTrack();
      break;
    case "randomOpponent":
      playRandomOpponentTrack();
      break;
    case "special":
      handleSpecialFromRemote(payload);
      break;
    case "volume":
      handleRemoteVolume(payload);
      break;
    case "requestSongs":
      sendSongsListToRemote();
      break;
    default:
      logPairing(`Unbekannter Command: ${command}`);
  }
  sendAck(command);
}

function playSongFromRemote(payload) {
  if (!payload) return false;
  const { id, category } = payload;
  if (!id || !category) return false;
  const song = findSongById(category, id);
  if (!song) return false;
  playAudio(song.url, song.display, category, song.id);
  return true;
}

function findSongById(categoryKey, songId) {
  const cat = categories[categoryKey];
  if (!cat || !Array.isArray(cat.items)) return null;
  return cat.items.find((song) => song.id === songId || song.name === songId) || null;
}

function handleSpecialFromRemote(payload) {
  if (!payload || !payload.type) return;
  if (payload.type === "timeout" && specialTracks.timeout) {
    playAudio(specialTracks.timeout.url, specialTracks.timeout.display || "Timeout", null, specialTracks.timeout.id);
    return;
  }
  if (payload.type === "walkon" && specialTracks.walkon) {
    playAudio(specialTracks.walkon.url, specialTracks.walkon.display || "Walk-On", null, specialTracks.walkon.id);
    return;
  }
  if (payload.type === "pause") {
    const id = payload.id;
    const target = specialTracks.pauses.find(
      (p) => p.number === Number(id) || p.display === id || p.name === id || (typeof id === "string" && id && p.display === id)
    );
    if (target) {
      const label = target.display || `Pause ${target.number || ""}`;
      playPauseTrack(target, label);
    }
  }
}

function handleRemoteVolume(payload) {
  if (!payload || typeof payload.value === "undefined") return;
  let val = Number(payload.value);
  if (val > 1) {
    val = val / 100;
  }
  val = Math.min(1, Math.max(0, val));
  setVolume(val);
}

function sendChannelMessage(obj) {
  if (!rtcState.channel || rtcState.channel.readyState !== "open") return;
  try {
    rtcState.channel.send(JSON.stringify(obj));
  } catch (err) {
    console.warn("Konnte Nachricht nicht senden:", err);
  }
}

function sendAck(command) {
  sendChannelMessage({ type: "ack", command });
}

function sendSongsListToRemote() {
  if (!rtcState.channel || rtcState.channel.readyState !== "open") return;
  const payload = buildSongsListPayload();
  sendChannelMessage({ type: "songsList", data: payload });
}

function buildSongsListPayload() {
  const songs = [];
  remoteCategories.forEach((key) => {
    const cat = categories[key];
    if (!cat || !Array.isArray(cat.items)) return;
    cat.items.forEach((song) => {
      songs.push({ id: song.id, display: song.display, category: key });
    });
  });
  const specials = {
    timeout: specialTracks.timeout
      ? { id: specialTracks.timeout.name, display: specialTracks.timeout.display || "Timeout" }
      : null,
    walkon: specialTracks.walkon
      ? { id: specialTracks.walkon.name, display: specialTracks.walkon.display || "Walk-On" }
      : null,
    pauses: Array.isArray(specialTracks.pauses)
      ? specialTracks.pauses.map((p) => ({
          id: p.number || p.name,
          display: p.display || `Pause ${p.number || ""}`,
          number: p.number || null,
        }))
      : [],
  };
  return { songs, specials };
}

function sendNowPlayingStatus(data) {
  if (!rtcState.channel || rtcState.channel.readyState !== "open") return;
  const payload = {
    title: data?.title || "",
    category: data?.category || null,
    duration: data?.duration || 0,
    stopped: !!data?.stopped,
  };
  sendChannelMessage({ type: "nowPlaying", data: payload });
}

function encodeSignalPayload(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSignalPayload(str) {
  const clean = (str || "").trim();
  const json = decodeURIComponent(escape(atob(clean)));
  return JSON.parse(json);
}

function waitForIceComplete(pc) {
  return new Promise((resolve) => {
    if (!pc || pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const checkState = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", checkState);
  });
}

function unlockAudioForRemote() {
  const el = getAudioElement();
  if (!el) return;
  ensureAudioGraph();
  resumeAudioContext();
  // Versuch, Autoplay-Sperre zu loesen: kurz stumm spielen/pause
  try {
    const prevMuted = el.muted;
    el.muted = true;
    el.play().then(() => {
      el.pause();
      el.muted = prevMuted;
      if (gainNode) gainNode.gain.value = volumeLevel;
    }).catch(() => {
      el.muted = prevMuted;
    });
  } catch (err) {
    console.warn("Unlock fehlgeschlagen", err);
  }
}

async function startAnswerScan() {
  const { video, canvas } = rtcState.scanner;
  const { scanAnswerBtn, stopScanBtn } = rtcState.ui;
  if (!video || !canvas) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    rtcState.scanner.stream = stream;
    video.srcObject = stream;
    await video.play();
    video.classList.remove("hidden");
    canvas.classList.add("hidden");
    if (scanAnswerBtn) scanAnswerBtn.classList.add("hidden");
    if (stopScanBtn) stopScanBtn.classList.remove("hidden");
    tickAnswerScan();
    logPairing("Scanner gestartet.");
  } catch (err) {
    console.error(err);
    logPairing("Kamera/Scanner nicht verfügbar.");
  }
}

function tickAnswerScan() {
  const { video, canvas, ctx } = rtcState.scanner;
  if (!video || !canvas || !ctx) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== "undefined") {
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (code && code.data) {
        stopAnswerScan();
        if (rtcState.ui.answerText) rtcState.ui.answerText.value = code.data;
        logPairing("Answer-QR gelesen. Bitte anwenden.");
        return;
      }
    }
  }
  rtcState.scanner.frameReq = requestAnimationFrame(tickAnswerScan);
}

function stopAnswerScan() {
  const { stream, frameReq, video } = rtcState.scanner;
  const { scanAnswerBtn, stopScanBtn } = rtcState.ui;
  if (frameReq) cancelAnimationFrame(frameReq);
  rtcState.scanner.frameReq = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  rtcState.scanner.stream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.classList.add("hidden");
  }
  if (scanAnswerBtn) scanAnswerBtn.classList.remove("hidden");
  if (stopScanBtn) stopScanBtn.classList.add("hidden");
}
