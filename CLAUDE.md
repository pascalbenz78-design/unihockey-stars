# Unihockey Stars – Arbeitsregeln

- Auftrag und alle Regeln: `GAME_DESIGN.md` (immer aktuell halten, Abschnitt «Entscheide»).
- Arbeitsweise: 6 Etappen. Vor jeder Etappe kurzer Plan, nach jeder Etappe
  anhalten, zusammenfassen, Testanleitung (PC und Handy) geben und auf Pascals
  OK warten. Antworten und Code-Kommentare auf Deutsch (Schweizer «ss»).
- Technik: Three.js 0.170.0 per Import-Map (jsDelivr), ES-Module, kein Build.
  Spiellogik in 2D (`js/match`, `js/ai`) ohne DOM/Three.js → in Node testbar.
- Alle Spielwerte in `js/config.js`.

## Stand der Etappen

| Etappe | Inhalt | Stand |
|---|---|---|
| 1 | Spielbarer Match | fertig, wartet auf Abnahme |
| 2 | Regeln, Verletzungen, Torjubel | offen |
| 3 | Eigener Verein | offen |
| 4 | Ligen und Saison | offen |
| 5 | Geld, Halle, Transfers | offen |
| 6 | Speichern mit Code, Ton, Feinschliff | offen |

## Testen

- Lokal starten: `node tools/serve.mjs 8766` → http://localhost:8766
  (in Claude Code: Startkonfiguration «unihockey-stars» im Ordner darüber).
- Logik ohne Grafik:
  - `node tools/simtest.mjs [Spiele] [Schwierigkeit]` – KI gegen KI, Statistik
  - `node tools/humantest.mjs [Schwierigkeit] [Sekunden] [Spiele]` – einfacher
    Mensch-Bot gegen KI (Schwierigkeits-Abstimmung)
  - `node tools/actiontest.mjs` – alle Tasten-Aktionen einmal
- Im Browser (Konsole): `__uh.run(sek, fps, eingabe)` spielt Bilder manuell ab
  (der eingebaute Browser liefert verdeckt keine Animationsbilder),
  `__uh.sim(sek)` rechnet nur die Logik, `__uh.match` ist das laufende Spiel,
  `__uh.app.renderer.debugCam = { pos: [x,y,z], look: [x,y,z] }` für Nahaufnahmen.
