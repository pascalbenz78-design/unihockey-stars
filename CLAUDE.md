# Unihockey Stars – Arbeitsregeln

- Auftrag und alle Regeln: `GAME_DESIGN.md` (immer aktuell halten, Abschnitt «Entscheide»).
- Arbeitsweise: 6 Etappen. Vor jeder Etappe kurzer Plan, nach jeder Etappe
  anhalten, zusammenfassen, Testanleitung (PC und Handy) geben und auf Pascals
  OK warten. Antworten und Code-Kommentare auf Deutsch (Schweizer «ss»).
- Technik: Three.js 0.170.0 per Import-Map (jsDelivr), ES-Module, kein Build.
  Spiellogik in 2D (`js/match`, `js/ai`) ohne DOM/Three.js → in Node testbar.
- Alle Spielwerte in `js/config.js`.
- GitHub: https://github.com/pascalbenz78-design/unihockey-stars, live auf
  https://pascalbenz78-design.github.io/unihockey-stars/ (GitHub Pages, Branch main).

## Stand der Etappen

| Etappe | Inhalt | Stand |
|---|---|---|
| 1 | Spielbarer Match | abgenommen |
| 2 | Regeln, Verletzungen, Torjubel | abgenommen |
| 3 | Eigener Verein | abgenommen |
| 4 | Ligen und Saison | abgenommen |
| 5 | Geld, Halle, Transfers | abgenommen |
| 6 | Speichern mit Code, Ton, Feinschliff | fertig, wartet auf Abnahme |

## Testen

- Lokal starten: `node tools/serve.mjs 8766` → http://localhost:8766
  (in Claude Code: Startkonfiguration «unihockey-stars» im Ordner darüber).
- Logik ohne Grafik:
  - `node tools/simtest.mjs [Spiele] [Schwierigkeit]` – KI gegen KI, Statistik
  - `node tools/humantest.mjs [Schwierigkeit] [Sekunden] [Spiele]` – einfacher
    Mensch-Bot gegen KI (Schwierigkeits-Abstimmung)
  - `node tools/actiontest.mjs` – alle Tasten-Aktionen, Strafe, Verletzung
  - `node tools/careertest.mjs [Saisons]` – ganze Karriere-Saisons (Ligen, Cup, Playoffs, Barrage, Auf-/Abstieg)
- Im Browser (Konsole): `__uh.run(sek, fps, eingabe)` spielt Bilder manuell ab
  (der eingebaute Browser liefert verdeckt keine Animationsbilder),
  `__uh.sim(sek)` rechnet nur die Logik, `__uh.match` ist das laufende Spiel,
  `__uh.app.renderer.debugCam = { pos: [x,y,z], look: [x,y,z] }` für Nahaufnahmen.

## Supabase

- Projekt «netzroller» (cyyvirqzaqqbmjpvgryw), eigene Tabelle `uh_savegames`,
  Funktionen `uh_save_game` / `uh_load_game` (SQL: `docs/supabase.sql`).
  Netzroller-Tabellen nicht anfassen. Testeinträge nach dem Testen löschen:
  `delete from uh_savegames where code = uh_code_hash('UH-…')`.
- Zwei Geräte testen: Tabs über `localhost` und `127.0.0.1` (getrennter Speicher).

## claude.ai-Artifact

- Zusätzlich veröffentlicht als Artifact: https://claude.ai/artifact/Rdqho4svtYukSqNc2h3sxC
  (privat, Teilen über das Share-Menü auf claude.ai).
- Aktualisieren: `node tools/artifact-entry.mjs <scratchpad>/unihockey-stars.html`, dann mit dem
  Artifact-Tool `url` + `file_path` dieser Datei + `root` = Repo + alle Dateien aus `css/` und `js/`
  als `files` veröffentlichen (Capabilities bleiben: db, user, downloads).
- Im Artifact sind fremde Server (Supabase), `confirm()` und direkte Downloads gesperrt:
  Spielstand dort im Claude-Konto (`js/save/cloud.js`, db unter `data/users/<id>/`, gzip und
  in Teile à 180'000 Zeichen), Bestätigungen über `js/ui/dialog.js`, Export über die
  Download-Freigabe.
