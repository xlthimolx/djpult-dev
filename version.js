// Zentrale Versionsnummer (wird von der Seite UND vom Service Worker genutzt).
// MAJOR.MINOR: MAJOR bei grossen Aenderungen/neuen Features, MINOR bei kleineren Anpassungen.
// Bei jeder Aenderung: APP_VERSION/APP_BUILD hochzaehlen UND oben in APP_CHANGELOG einen Eintrag ergaenzen.
// -> neuer Cache, und das Pult zeigt auf dem Geraet, welche Version mit welchen Aenderungen laeuft.
const APP_VERSION = "4.27";
const APP_BUILD = "2026-10-08";

// Neueste Version zuerst.
const APP_CHANGELOG = [
  {
    version: "4.27",
    date: "2026-10-10",
    changes: ["Fehler behoben: In der Drop-Verwaltung überlagerten sich korrigierte Songs (Reiter Korrigiert und Ohne Drop)."],
  },
  {
    version: "4.26",
    date: "2026-10-08",
    changes: ["Passwort korrigiert (Zahlendreher)."],
  },
  {
    version: "4.25",
    date: "2026-10-08",
    changes: ["Anmeldebildschirm: Vereinsname korrigiert, Ordnername „Diesen Ordner Laden“ in der Kurzanleitung."],
  },
  {
    version: "4.24",
    date: "2026-10-08",
    changes: ["Anmeldebildschirm mit Kurzbeschreibung, Kurzanleitung, Kontakthinweis und Version."],
  },
  {
    version: "4.23",
    date: "2026-10-08",
    changes: ["Passwortabfrage beim Öffnen der App (gilt, solange die App offen ist)."],
  },
  {
    version: "4.22",
    date: "2026-10-08",
    changes: ["Die Kategorie „Lustig“ heißt jetzt „Spaß & Extras“."],
  },
  {
    version: "4.21",
    date: "2026-10-08",
    changes: ["Neue Markierung „Sonderlied“ 🏆: nie per Zufall, ganz oben in der Spalte, größer und golden."],
  },
  {
    version: "4.20",
    date: "2026-10-08",
    changes: ["Überschrift „Pausensongs“ über den Pausen-Walzen."],
  },
  {
    version: "4.19",
    date: "2026-10-08",
    changes: ["Fehler behoben: Vor gespielten Pausen-Songs standen falsche Zeichen statt des Häkchens."],
  },
  {
    version: "4.18",
    date: "2026-10-08",
    changes: ["Pausen-Songs: gespielte sind mit ✓ markiert und durchgestrichen, die Walze dreht zum nächsten ungespielten. Reset setzt die Markierung zurück."],
  },
  {
    version: "4.17",
    date: "2026-10-07",
    changes: ["Timeout, Walk-On und Pausen-Songs zeigen jetzt auch Kurve und Drop-Anzeige (Song-Analyse einmal neu ausführen)."],
  },
  {
    version: "4.16",
    date: "2026-10-07",
    changes: ["Der blaue Button heißt immer „Walk-On“, nicht mehr wie der Song."],
  },
  {
    version: "4.15",
    date: "2026-10-07",
    changes: ["Pausen-Walzen drehen endlos: nach dem letzten Song kommt wieder der erste."],
  },
  {
    version: "4.14",
    date: "2026-10-07",
    changes: ["Pausen: bis 4 Songs normale Knöpfe, ab 5 Songs immer zwei Walzen."],
  },
  {
    version: "4.13",
    date: "2026-10-07",
    changes: ["Pausen-Songs als drehbare Walzen: wischen zum Auswählen, Tippen auf den mittleren Eintrag spielt ab (ab 6 Songs zwei Walzen)."],
  },
  {
    version: "4.12",
    date: "2026-10-07",
    changes: [
      "Zähler und Farbmarkierung vergleichen jetzt pro Gruppe: Eigene Punkte (Ass/Angriff, Block, Sonstiges 1–3), Gegner und Lustig getrennt.",
    ],
  },
  {
    version: "4.11",
    date: "2026-10-06",
    changes: ["Info- und Versionsfeld schließen sich beim Tippen daneben (zum Beispiel auf einen Song); es ist immer nur eines offen."],
  },
  {
    version: "4.10",
    date: "2026-10-06",
    changes: ["Zufall: Vorhören in der Verwaltung zählt nicht mehr als zuletzt gespielt; Anleitung erklärt die Sperre der letzten 4 Songs."],
  },
  {
    version: "4.9",
    date: "2026-10-06",
    changes: ["Anleitung und Analyse-Werkzeug nennen jetzt den Ordner „Diesen Ordner Laden“."],
  },
  {
    version: "4.8",
    date: "2026-10-06",
    changes: ["Fix: Das Drop-Schild am Song-Button bleibt nicht mehr stehen, wenn ein Song aus einer anderen Kategorie gestartet wird."],
  },
  {
    version: "4.7",
    date: "2026-10-06",
    changes: [
      "Song-Analyse misst jetzt auch den Pegel jedes Songs (nach dem Update einmal neu ausführen).",
      "Reiter Zu leise: Vorschläge für Songs ab 3 dB unter dem Median, mit Abstand in dB und Anhören.",
    ],
  },
  {
    version: "4.6",
    date: "2026-10-06",
    changes: [
      "Fix: Songs mit Umlauten oder Akzenten (zum Beispiel Mädchen auf dem Pferd, Sarà perché ti amo) bekommen jetzt ihre Kurve; Markierungen und Zähler gelten geräteübergreifend.",
    ],
  },
  {
    version: "4.5",
    date: "2026-10-06",
    changes: ["Fix: Anhören ab dem Drop bricht bei manchen Songs (FLAC auf dem iPad) nicht mehr ab; notfalls startet der Song von vorn."],
  },
  {
    version: "4.4",
    date: "2026-10-06",
    changes: ["Langdruck-Menü am Song: Drop-Zeit direkt korrigieren, „Kein Drop“ wählen und ab dem Drop anhören."],
  },
  {
    version: "4.3",
    date: "2026-10-06",
    changes: [
      "Songs ohne Kurve sind mit einem kleinen ≈ markiert; Hinweis und Drops-Reiter nennen die Songs beim Namen.",
      "Verwaltung zeigt, was noch ungesichert ist (Markierungen und Drop-Korrekturen).",
    ],
  },
  {
    version: "4.2",
    date: "2026-10-06",
    changes: [
      "Verwaltung: neuer Reiter Drops mit erkannter Drop-Zeit pro Song, Anhören ab kurz vor dem Drop und manueller Korrektur.",
      "Reiter Langer Aufbau zeigt Vorschläge (erster Drop ab 10 s) zum Übernehmen.",
      "Korrekturen werden mit den Markierungen in markierungen.json gesichert.",
    ],
  },
  {
    version: "4.1",
    date: "2026-10-06",
    changes: ["Now Playing ist breiter (nutzt den freien Platz der oberen Leiste), die Kurve ist dadurch besser lesbar."],
  },
  {
    version: "4.0",
    date: "2026-10-06",
    changes: [
      "Neu: Lautstärkekurve des laufenden Songs in Now Playing, mit Markierung des Drops.",
      "Neu: Drop-Countdown (Drop in 5 … 3 rot, DROP!) im Now Playing und am laufenden Song-Button.",
      "Neu: Song-Analyse als Werkzeug (tools/analyse.html), erzeugt waveforms.json im Musikordner.",
      "Hinweis beim Laden, wenn Songs noch keine Kurve haben.",
    ],
  },
  {
    version: "3.9",
    date: "2026-10-06",
    changes: ["Now Playing zeigt links die Restzeit und rechts die bereits gespielte Zeit."],
  },
  {
    version: "3.8",
    date: "2026-10-06",
    changes: [
      "Info-Feld neu: größer, in Reiter gegliedert (Start, Bedienung, Dateien, Markierungen, Remote und App), mit allen vier Markierungen.",
      "Info-, Versions- und Markierungsfenster enden immer über der unteren Leiste.",
    ],
  },
  {
    version: "3.7",
    date: "2026-10-06",
    changes: [
      "Erinnerung ans Sichern: kleiner Hinweis nach ein paar Änderungen und beim Start, wenn noch etwas ungesichert ist.",
      "Letzter Stand wiederherstellbar (vor Zurücksetzen und vor dem Einlesen einer anderen Datei).",
    ],
  },
  {
    version: "3.6",
    date: "2026-10-06",
    changes: [
      "Zwei neue Markierungen ohne Button: Langer Aufbau (Drop kommt spät) und Zu leise (Lautstärke nacharbeiten).",
      "Beide stehen im Menü beim langen Druck, in der Verwaltung als Reiter und in der markierungen.json.",
    ],
  },
  {
    version: "3.5",
    date: "2026-10-06",
    changes: ["Stop-Button größer und mit Symbol; Eigene Punkte und Gegnerpunkte etwas schmaler."],
  },
  {
    version: "3.4",
    date: "2026-10-06",
    changes: [
      "Sichern erzeugt keine zusätzliche Textdatei mehr.",
      "Beim Laden wird bei mehreren Markierungsdateien (markierungen 2.json …) automatisch die neueste genommen.",
    ],
  },
  {
    version: "3.3",
    date: "2026-10-06",
    changes: [
      "Zufall schärfer: Songs mit den wenigsten Wiedergaben werden klar bevorzugt, oft gespielte kommen deutlich seltener.",
      "Die zuletzt gespielten Songs werden beim Zufall übersprungen (gilt für alle vier Zufall-Buttons).",
    ],
  },
  {
    version: "3.2",
    date: "2026-10-06",
    changes: [
      "Neu: Zufall-Buttons Top-Stimmung und Mitklatschen in der unteren Leiste.",
      "Untere Leiste neu aufgeteilt (Pause-Buttons, Eigene/Gegnerpunkte und Stop etwas schmaler).",
    ],
  },
  {
    version: "3.1",
    date: "2026-10-06",
    changes: ["Markierungen: In den Gruppen-Reitern stehen jetzt beide Schalter (Top und Klatschen) plus Entfernen."],
  },
  {
    version: "3.0",
    date: "2026-10-06",
    changes: [
      "Neu: Markierungen Top-Stimmung und Mitklatschen (lange auf einen Song drücken oder über den Button Markierungen).",
      "Verwaltungsfenster mit Suche, Anhören, Entfernen und Verschieben zwischen den Gruppen.",
      "Sichern als markierungen.json in den Musikordner; wird beim Laden der Songs automatisch eingelesen.",
    ],
  },
  {
    version: "2.7",
    date: "2026-10-06",
    changes: [
      "Heatmap deutlicher: selten gespielte Songs leuchten, oft gespielte werden blasser; Song mit den wenigsten Wiedergaben hat einen hellen Rahmen.",
    ],
  },
  {
    version: "2.6",
    date: "2026-10-06",
    changes: [
      "Zufall-Buttons umbenannt: Eigene Punkte (Stimmungslieder) und Gegnerpunkte (Durchatmen).",
    ],
  },
  {
    version: "2.5",
    date: "2026-10-05",
    changes: ["Remote-Seite hat oben einen Button zurück zum DJ-Pult."],
  },
  {
    version: "2.4",
    date: "2026-10-05",
    changes: [
      "Stabilität: Audio wird nach einer iPad-Unterbrechung (Sperren, Geführter Zugriff) wieder fortgesetzt.",
      "Sichtbare Meldung, wenn ein Song nicht abgespielt werden kann.",
      "Beim erneuten Laden werden alte Dateiverweise freigegeben (weniger Speicher).",
    ],
  },
  {
    version: "2.3",
    date: "2026-10-05",
    changes: ["Neues App-Symbol für den Home-Bildschirm (Wappen mit Soundwave-Hintergrund)."],
  },
  {
    version: "2.2",
    date: "2026-10-05",
    changes: [
      "Laufender Song ist im Raster hervorgehoben (Rahmen, Leuchten, Equalizer).",
      "Now Playing zeigt einen Fortschrittsbalken der Restzeit.",
      "Kopfleiste aufgeräumt: eine geschlossene Leiste, Reset dezenter.",
      "Leichte Animationen (Drücken, Info-Felder); abschaltbar über die Systemeinstellung Bewegung reduzieren.",
    ],
  },
  {
    version: "2.1",
    date: "2026-10-05",
    changes: [
      "Fix iPad-Safari: Kopfleiste verdeckt nach dem Laden der Songs nicht mehr die erste Reihe.",
    ],
  },
  {
    version: "2.0",
    date: "2026-10-05",
    changes: [
      "Neues Design: dezente Farben, Emojis entfernt, mehr Platz für Songtitel.",
      "Spalten mit Farblinie und Songanzahl, grüne Spalten heißen Sonstiges 1–3.",
      "Play-Zähler als kleine Zahl im Button; Heatmap-Logik unverändert.",
    ],
  },
  {
    version: "1.5",
    date: "2026-10-05",
    changes: [
      "App-Installation verbessert: vollständiges Manifest, neue Symbole (auch 512 px, abgerundet).",
      "Info-Feld erklärt, wie man die App installiert.",
    ],
  },
  {
    version: "1.4",
    date: "2026-10-05",
    changes: [
      "Versions-Feld zeigt jetzt die Änderungen jeder Version.",
      "Info-Feld ist eine ausführliche Bedienungsanleitung.",
    ],
  },
  {
    version: "1.3",
    date: "2026-10-05",
    changes: [
      "iPad: Vollbild-Start vom Home-Bildschirm, Symbol, kein versehentliches Zoomen.",
      "Aufgeräumt: altes docs-Verzeichnis und Debug-Ausgaben entfernt.",
    ],
  },
  {
    version: "1.2",
    date: "2026-10-05",
    changes: ["Fix: Updates kommen zuverlässig an (kein veralteter Cache mehr)."],
  },
  {
    version: "1.1",
    date: "2026-10-05",
    changes: [
      "Neu: Versionsanzeige neben dem Info-Button.",
      "Offline-Cache nur noch für App-Dateien, Updates im Hintergrund.",
    ],
  },
  {
    version: "1.0",
    date: "2025-12-19",
    changes: [
      "Ausgangsstand: Kategorien, Suche, Zufall, Play-Zähler mit Heatmap, Remote per WebRTC.",
    ],
  },
];
