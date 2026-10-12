# Unihockey Stars

Arcade-Unihockeyspiel (Floorball) im Browser mit 3D-Grafik (Three.js) und
Vereinsmanager: eigener Verein, 5 Ligen, Cup, Playoffs, Auf-/Abstieg, Geld,
Halle, Transfers und Nachwuchs. Läuft am PC (Tastatur) und auf dem Handy
(Querformat, Touch). Kein Build-Schritt nötig.

**Spielen:** https://pascalbenz78-design.github.io/unihockey-stars/

## Steuerung (PC)

| Taste | Aktion |
|---|---|
| WASD / Pfeiltasten | laufen (oder mit der Maus, siehe unten) |
| Leertaste | Schuss (halten = aufladen) |
| Alt (oder X) | Pass |
| C | Bandenpass |
| Shift | Sprint · als Goalie: Hechtsprung |
| Y | Spieler wechseln |
| G | Goalie übernehmen |
| Q | Linienwechsel |
| P / Esc | Pause |

Bewegung mit der Maus: Einstellungen → «Bewegung (PC): Maus». Dann im Spielfeld die
Maustaste gedrückt halten und in die gewünschte Richtung ziehen (wie der Joystick am
Handy); loslassen = stehen bleiben. Schuss, Pass usw. bleiben auf der Tastatur.

Auf dem Handy: Joystick links (Daumen irgendwo hinlegen), rechts Schuss, Pass,
Bande, Sprint, oben Wechsel, Goalie, Linie, Pause. In den Einstellungen lassen
sich die Tasten vergrössern und für Linkshänder spiegeln. Wiederholung und
Jubel nach einem Tor lassen sich mit einer Taste oder durch Tippen überspringen.

## Spielstand

- Wird automatisch im Browser gespeichert (nach jedem Spiel und jeder Änderung).
- **Weiterspielen auf einem anderen Gerät:** Hauptmenü → «Spielstand» →
  «Online speichern und Code erhalten». Der Code (z. B. `UH-7K2P-QX9M`) steht
  dann im Menü, mit «Code kopieren». Auf dem anderen Gerät: «Spielstand» → Code
  eingeben → «Spielstand laden». Danach speichern beide Geräte unter demselben
  Code. Wurde inzwischen auf einem anderen Gerät gespeichert, kommt eine
  Warnung; der neuere Stand gewinnt.
- **Ohne Internet:** «Als Datei speichern» und auf dem anderen Gerät «Datei laden».

## Lokal spielen

Die Module brauchen einen kleinen Webserver (ein Doppelklick auf
`index.html` reicht nicht):

```bash
node tools/serve.mjs 8766
```

Dann im Browser http://localhost:8766 öffnen. Im gleichen WLAN geht es auch
auf dem Handy über die IP-Adresse des PCs, z. B. `http://192.168.1.20:8766`.

## Auf GitHub Pages veröffentlichen

1. Auf https://github.com ein neues Repository anlegen, z. B. `unihockey-stars`
   (öffentlich, ohne README).
2. Im Projektordner:
   ```bash
   git remote add origin https://github.com/<benutzername>/unihockey-stars.git
   ```
   ```bash
   git push -u origin main
   ```
3. Auf GitHub im Repository: **Settings → Pages**. Bei *Build and deployment*
   als *Source* «Deploy from a branch» wählen, Branch `main`, Ordner `/ (root)`,
   **Save**.
4. Nach ein bis zwei Minuten läuft das Spiel unter
   `https://<benutzername>.github.io/unihockey-stars/`. Den Stand des
   Veröffentlichens zeigt der Reiter **Actions**.
5. Änderungen später einfach committen und mit `git push` hochladen – die
   Seite aktualisiert sich automatisch. Auf dem Handy evtl. neu laden
   (Seite nach unten ziehen), damit der Browser die neue Version holt.

## Online-Speichern einrichten (Supabase)

Für dieses Projekt ist es bereits eingerichtet (Supabase-Projekt «netzroller»,
eigene Tabelle `uh_savegames`). Für ein eigenes Supabase-Projekt:

1. Auf https://supabase.com anmelden und ein Projekt anlegen (oder ein
   bestehendes verwenden – die Unihockey-Tabelle stört andere Tabellen nicht).
2. Im Dashboard **SQL Editor → New query**, den Inhalt von
   [`docs/supabase.sql`](docs/supabase.sql) einfügen und **Run** drücken. Das
   legt an:
   - Tabelle `uh_savegames` (`code`, `data` jsonb, `updated_at`) mit aktivem
     RLS und ohne Policy → kein direkter Zugriff. In `code` steht nur die
     SHA-256-Prüfsumme des Codes.
   - Zwei Funktionen `uh_save_game` und `uh_load_game` (security definer), die
     den Code verlangen. Nur sie sind öffentlich aufrufbar.
3. **Project Settings → API Keys**: die *Project URL* und den *Publishable key*
   (`sb_publishable_…`) kopieren und in [`js/config.js`](js/config.js) bei
   `online` eintragen. Nur dieser öffentliche Schlüssel gehört in den Code,
   niemals der *secret key*.
4. Der Supabase-Sicherheitsberater meldet danach zwei Hinweise
   («RLS ohne Policy» und «anon darf SECURITY-DEFINER-Funktion ausführen»).
   Beides ist Absicht: Der Schutz ist der Code, den jede Funktion verlangt.

## Entwicklung

- Regeln und alle Entscheide: [GAME_DESIGN.md](GAME_DESIGN.md)
- Lizenzen: [CREDITS.md](CREDITS.md)
- Tests ohne Grafik: `node tools/simtest.mjs`, `node tools/humantest.mjs`,
  `node tools/actiontest.mjs`, `node tools/careertest.mjs`
- Alle Spielwerte stehen in `js/config.js`.
