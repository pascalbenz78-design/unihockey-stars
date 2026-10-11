# Unihockey Stars

Arcade-Unihockeyspiel (Floorball) im Browser mit 3D-Grafik (Three.js) –
später mit Vereinsmanager und Ligasystem. Läuft am PC (Tastatur) und auf dem
Handy (Querformat, Touch). Kein Build-Schritt nötig.

## Lokal spielen

Die Module brauchen einen kleinen Webserver (ein Doppelklick auf
`index.html` reicht nicht):

```bash
node tools/serve.mjs 8766
```

Dann im Browser http://localhost:8766 öffnen. Im gleichen WLAN geht es auch
auf dem Handy über die IP-Adresse des PCs, z. B. `http://192.168.1.20:8766`.

## Steuerung (PC)

| Taste | Aktion |
|---|---|
| WASD / Pfeiltasten | laufen |
| Leertaste | Schuss (halten = aufladen) |
| X | Pass |
| C | Bandenpass |
| Shift | Sprint |
| E | Spieler wechseln |
| G | Goalie übernehmen |
| Q | Linienwechsel |
| P | Pause |

Wiederholung und Jubel nach einem Tor lassen sich mit einer Taste oder durch Tippen überspringen.

## Veröffentlichen auf GitHub Pages

Live: https://pascalbenz78-design.github.io/unihockey-stars/

Kurzfassung (ausführliche Anleitung folgt in Etappe 6):

1. Repository auf GitHub anlegen und den Ordner hochladen (`git push`).
2. Auf GitHub: *Settings → Pages → Build and deployment → Source: Deploy from
   a branch*, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten läuft das Spiel unter
   `https://<benutzername>.github.io/<repository>/`.

Mehr zu Regeln und Aufbau: [GAME_DESIGN.md](GAME_DESIGN.md), Lizenzen:
[CREDITS.md](CREDITS.md).
