# Unihockey Stars – Game Design

Arcade-Unihockeyspiel (Floorball) im Stil von Hockey All Stars, kombiniert mit
einem Vereinsmanager mit Ligasystem. Sprache im Spiel: Deutsch (Schweizer
Schreibweise, «ss» statt «ß»). Zielgruppe: Kinder ab ca. 10 Jahren und
Erwachsene.

Dieses Dokument hält alle Regeln fest und wird während der Entwicklung
aktuell gehalten. Abschnitt «Entscheide» am Schluss enthält alles, was beim
Bauen konkret festgelegt wurde.

---

## Technik

- Three.js per Import-Map von einem CDN mit fester Version (`three@0.170.0`,
  jsDelivr), reines JavaScript mit ES-Modulen, kein Build-Schritt → läuft
  direkt auf GitHub Pages.
- Spiellogik und Physik laufen in 2D auf der Feldebene (x = Längsachse,
  y = Querachse, dazu eine Höhe z nur für den Ball). Three.js zeichnet daraus
  die 3D-Darstellung. Die Spiellogik kennt weder DOM noch Three.js und lässt
  sich deshalb auch in Node testen (`tools/simtest.mjs`).
- Läuft auf dem Handy (Querformat, Touch) und am PC (Tastatur).
- Grafikqualität Niedrig/Mittel/Hoch in den Einstellungen.
- Module: `match/`, `ai/`, `render/`, `league/`, `club/`, `economy/`, `ui/`,
  `save/`. Alle Spielwerte in `js/config.js`.

## Grafik

- Ansicht schräg von oben (leicht 3D), Kamera folgt dem Ball weich.
- Möglichst realistischer Look: Unihockeyhalle mit Hallenboden, Linien,
  Banden mit Werbeflächen, Tribünen mit Publikum, Licht und Schatten.
- Spielerfiguren in 3D mit Animationen (laufen, schiessen, passen, fallen,
  jubeln). Selbst gebaute Modelle oder freie CC0-Modelle (z. B. Quaternius)
  als glTF; Lizenz in `CREDITS.md`.
- Schläger jedes Spielers gut sichtbar (Schaft + Kelle) in der gewählten
  Farbe.
- Trikots in Vereinsfarben mit Nummer, Goalie mit Ausrüstung.

## Grundregeln

- Grossfeld 40 × 20 m mit Banden rundherum (Ecken abgerundet), Torraum,
  Mittelkreis, Tore wie im echten Unihockey.
- Pro Team 5 Feldspieler + 1 Goalie auf dem Feld.
- Kader: 3 Linien à 5 Feldspieler + 2 Goalies + 3 Ersatz = 20 Spieler.
- Spielzeit: 3 Drittel à 20:00 Spielzeit. Ein Drittel dauert real 3 Minuten,
  ein ganzes Spiel also 9 Minuten. Die Spieluhr zeigt die Unihockey-Zeit
  (20:00 → 0:00) und läuft entsprechend schneller. Pause zwischen den
  Dritteln mit Statistik.
- Unentschieden: Verlängerung 5:00 Spielzeit mit Sudden Death, danach
  Penaltyschiessen (je 3 Schützen, dann einzeln weiter).
- Punkte: Sieg 3, Sieg nach Verlängerung/Penalty 2, Niederlage nach
  Verlängerung/Penalty 1, Niederlage 0.
- Echte Unihockey-Regeln: kein Bodycheck. Fouls (Stockschlag, hoher Stock,
  Behinderung, Halten) geben eine 2-Minuten-Strafe (Spielzeit) mit
  Powerplay/Boxplay. Feldspieler dürfen nicht in den Torraum.

## Steuerung

- Man steuert einen Feldspieler. Mit einer Taste wechselt man zum Spieler,
  der am nächsten zum Ball ist. Die übrigen Spieler steuert der Computer.
- Der eigene Goalie kann per Taste übernommen werden. Einstellung «Goalie
  automatisch übernehmen bei Schuss aufs eigene Tor» (an/aus). Beim
  Penaltyschiessen steuert man Schütze und Goalie selbst.
- PC: Pfeiltasten/WASD = laufen, Leertaste = Schuss (halten = aufladen:
  härter, aber ungenauer), X = Pass, C = Bandenpass, Shift = Sprint (kostet
  Ausdauer), Y = Spieler wechseln (ursprünglich E), G = Goalie übernehmen, Q = Linienwechsel,
  P = Pause.
- Handy: virtueller Joystick links, Tasten Schuss/Pass/Bande/Sprint rechts,
  Tasten Spieler-Wechsel/Goalie/Linie oben.
- Direktschuss, wenn der Ball beim Annehmen sofort geschossen wird.
- 3 Schwierigkeitsstufen (Leicht / Mittel / Schwer): KI-Stärke, Spieltempo
  und Verletzungshäufigkeit.

---

## Etappe 1 – Spielbarer Match

Halle, Feld mit Banden und Ballphysik (Ball prallt realistisch an der Bande
ab), 6 gegen 6, Steuerung wie oben, Gegner-KI (Angriff, Verteidigung,
Positionsspiel), Goalie-KI, Schuss aufladen, Pass, Bandenpass, Spieluhr mit
3 Dritteln, Spielstand. Linienwechsel: 3 Linien, Ausdauerbalken pro Spieler.
Müde Spieler werden langsamer und schiessen ungenauer. Die KI wechselt
selbst, beim eigenen Team per Taste oder «Auto-Wechsel».

## Etappe 2 – Regeln, Verletzungen, Torjubel

- Strafen mit Schiedsrichter-Anzeige, Strafbank, Countdown,
  Powerplay/Boxplay.
- Verletzungen durch Zweikämpfe und Müdigkeit. Je müder der Spieler und je
  härter der Zweikampf, desto höher das Risiko und desto schwerer die
  Verletzung. Schweregrade: leicht = 1–2 Spiele, mittel = 3–5 Spiele,
  schwer = 6–10 Spiele Pause. Der Spieler verlässt das Feld, Meldung mit
  Schweregrad und Ausfalldauer. Verletzte fehlen bis zur Genesung im Kader.
- Verlängerung und Penaltyschiessen.
- Nach jedem Tor: kurze Wiederholung (Zeitlupe der letzten 3 Sekunden,
  andere Kamerawinkel), danach der Jubel des Torschützen.
- Jubel: mindestens 8 Animationen (z. B. Faust, Knierutscher, Schläger
  hochhalten, Flieger, Tänzchen, Herz, Sprung, Team-Kreis). Jedem Spieler
  kann ein eigener Jubel zugeordnet werden.

## Etappe 3 – Eigener Verein

- Vereins-Editor: Vereinsname, Kürzel, Vereinsfarben (Trikot heim/auswärts),
  Logo-Editor aus Formen (Schild, Kreis, Raute …), Farben, Symbolen (Stern,
  Blitz, Tier-Silhouetten …) und Initialen. Logo als JSON gespeichert und
  überall angezeigt (Menü, Tabelle, Mittelkreis, Trikot, Banden).
- Schläger: Farbe frei wählbar (Schaft und Kelle getrennt), Auslage
  links/rechts pro Spieler (beeinflusst den Schusswinkel).
- Spieler: Name, Nummer, Alter, Position (Center, Flügel, Verteidiger,
  Goalie), Werte Tempo, Schuss, Pass, Ausdauer, Zweikampf, Technik (Goalie:
  Reflexe, Stellungsspiel), Jubel. Namen und Nummern änderbar.
- Linien-Aufstellung per Drag & Drop.
- Training zwischen den Spielen: Schwerpunkt wählen, Spieler verbessern sich
  langsam. Zu hartes Training erhöht das Verletzungsrisiko.

## Etappe 4 – Ligen und Saison

- 5 Ligen (Liga 1 = oberste bis Liga 5), je 8 Teams = 40 Teams. Die 39
  Gegner haben erfundene Namen und automatisch erzeugte Logos, keine echten
  Vereine. Start in Liga 5.
- Saison: Hin- und Rückrunde = 14 Spiele. Andere Spiele werden anhand der
  Teamstärke simuliert. Tabelle mit Punkten, Toren, Tordifferenz.
- Playoffs in allen Ligen: die ersten 4 nach der Qualifikation (Halbfinal
  1–4 und 2–3, dann Final, je Best-of-3). Heimvorteil für das besser
  klassierte Team. Liga 1: Sieger = Schweizer Meister; Liga 2–5: Ligameister.
- Auf-/Abstieg zwischen benachbarten Ligen: Playoff-Sieger der unteren Liga
  steigt direkt auf, Letzter der Qualifikation der oberen Liga steigt direkt
  ab. Barrage: Playoff-Finalverlierer unten gegen Zweitletzten oben,
  Best-of-3, Sieger spielt nächste Saison oben. Liga 1 ohne Aufstieg, Liga 5
  ohne Abstieg.
- Ablauf am Saisonende: zuerst Playoffs, danach alle Barragen. Spiele ohne
  eigene Beteiligung werden simuliert; Übersicht als Turnierbaum.
- Cup: K.-o.-Turnier mit allen 40 Teams parallel zur Meisterschaft (Teams
  aus oberen Ligen steigen später ein).
- Saisonziel vom Vorstand je nach Liga, Bewertung am Saisonende.
- Saisonende-Bildschirm: Schlusstabellen, Meister aller Ligen,
  Auf-/Absteiger, Torschützenliste, bester Spieler, dann neue Saison.
  Spieler altern: junge verbessern sich, ältere werden schwächer oder treten
  zurück.

## Etappe 5 – Geld, Halle, Transfers

- Einnahmen: Zuschauer (Liga, Erfolg, Hallengrösse), Sponsoren, Cup- und
  Playoff-Prämien. Ausgaben: Löhne, Ausbau.
- Halle ausbauen (Tribünen, Anzeigetafel, Garderobe → bessere Regeneration),
  im Spiel sichtbar.
- Sponsoren wählen; Logos auf den Banden.
- Transfermarkt: kaufen/verkaufen, Preise nach Stärke und Alter.
- Nachwuchs: Junioren liefern jede Saison junge Spieler.
- Physiotherapeut (ausbaubar): verkürzt Ausfallzeiten.

## Etappe 6 – Speichern mit Code, Ton, Feinschliff

- Automatisch lokal speichern (localStorage) nach jedem Spiel und jeder
  Änderung.
- Online-Speichern mit Code wie bei «Netzroller» (Supabase, gleiches Projekt,
  eigene Tabelle und Funktionen): Code wie `UH-7K2P-QX9M` (ohne 0/O, 1/I),
  im Menü angezeigt mit «Code kopieren»; auf anderem Gerät «Spielstand
  laden» → Code einfügen. Tabelle `savegames (code, data jsonb,
  updated_at)`, RLS aktiv, kein direkter Tabellenzugriff, nur zwei
  RPC-Funktionen (security definer). Nur Publishable/Anon-Key im Code. Bei
  zwei Geräten gewinnt der neuere Stand, vorher Warnung. Fallback:
  Export/Import als JSON-Datei. Netzroller-Ordner nur lesen.
- Ton mit Web Audio: Schuss, Pfosten, Pfiff, Torsirene, Publikum (lauter bei
  Chancen und Toren).
- Menüs: Hauptmenü, Freundschaftsspiel, Karriere, Verein, Liga,
  Einstellungen (Schwierigkeit, Grafikqualität, Ton, Steuerung,
  Goalie-Automatik).
- Kurze Anleitung im Spiel. README.md mit Anleitung für GitHub Pages.

---

## Entscheide

Konkrete Festlegungen während des Baus (Werte stehen in `js/config.js`).

### Feld und Koordinaten
- Feldmitte = (0, 0). x läuft von −20 bis +20 (Länge), y von −10 bis +10.
  In Three.js wird (x, y, Höhe) zu (x, Höhe, −y): die Kamera steht auf der
  Seite y < 0, die Spielerbänke stehen auf der gegenüberliegenden Seite.
- Bandenecken mit 2.5 m Radius, Bandenhöhe 0.5 m.
- Torlinie 3.5 m vor der Endbande, Tor 1.60 × 1.15 m, 0.65 m tief.
- Torraum 4 × 5 m (hinten bündig mit dem Tornetz, 2.85 m vor der Bande),
  Goalieraum 1 × 2.5 m, Mittelkreis 3 m Radius. Bully-Punkte: Mitte, auf der
  Mittellinie und auf der verlängerten Torlinie je 1.5 m vor der Längsbande.
- Feldspieler werden aus dem Torraum hinausgeschoben, der Goalie bleibt im
  Torraum.

### Ablauf
- Seitenwechsel nach jedem Drittel.
- Spieluhr läuft nur im laufenden Spiel (steht bei Tor, Bully, Pause).
- Ball über die Bande → Bully am nächsten Bully-Punkt.
- Bully: Ball fällt, Gewinner nach Technik der beiden Center (mit Zufall),
  der Ball rollt zum Verteidiger des Gewinners.
- Etappe 1: Unentschieden bleibt Unentschieden (Verlängerung/Penalty folgen
  in Etappe 2).

### Steuerung im Detail
- Ballführung: Wer den Ball erobert, steuert der Mensch automatisch (beim
  eigenen Team). E wechselt zum Mitspieler, der dem Ball am nächsten ist.
- Schuss: Leertaste halten lädt auf (Balken), Loslassen schiesst. Mit
  Richtungstaste quer zum Tor zielt man in die entsprechende Torecke.
- Ohne Ball: Leertaste oder X in Ballnähe = Stockeinsatz (Ball stehlen).
- Direktschuss: Leertaste kurz vor der Ballannahme drücken → Schuss direkt
  bei der Annahme, etwas härter.
- Pass/Bandenpass: geht an den Mitspieler in Laufrichtung (sonst Blickrichtung).
  Der Bandenpass wird über die nähere Längsbande gespielt.
- Goalie: G übernimmt bzw. gibt ab. Ohne Eingabe stellt sich der
  übernommene Goalie selbst richtig hin. Mit Sprint hechtet er (grössere
  Reichweite). Hält er den Ball, wirft er ihn mit X/Leertaste ab.
- Linienwechsel (Q): Die neue Linie kommt bei der Spielerbank aufs Feld.
  Führt ein Spieler der alten Linie gerade den Ball, wird er erst nach der
  Ballabgabe ersetzt.

### Ausdauer und Wechsel
- Ausdauer sinkt auf dem Feld (Sprint ×2.6), erholt sich auf der Bank.
- Müde Spieler: bis 28 % langsamer, Schüsse und Pässe ungenauer.
- KI und «Auto-Wechsel» wechseln, wenn die Linie im Schnitt unter 45 % fällt
  und keine Gefahr vor dem eigenen Tor besteht.

### Schwierigkeit
- Leicht / Mittel / Schwer verändern Geschick der Gegner-KI (Entscheide,
  Zielgenauigkeit, Zweikampf, Reaktion und Reichweite des Goalies) und das
  Spieltempo. Die eigenen Mitspieler spielen immer auf mittlerem Niveau.
- Abstimmung mit einem einfachen Bot («zum Tor laufen und schiessen», je 30
  Drittel): Leicht ca. 2.7 : 0.9, Mittel 1.6 : 1.4, Schwer 1.3 : 2.1 Tore pro
  Drittel. KI gegen KI: ca. 5–8 Tore und 35 Schüsse pro Spiel.

### Zweikampf und Ballbesitz
- Ballannahme (Wunsch nach Etappe 6): Radius um die Kelle 0,6 m (vorher 0,5).
  Zusätzlich «Körpernähe»: Rollt ein langsamer Ball (relativ unter 7 m/s)
  näher als 0,72 m an einer Stelle 0,2 m vor dem Spieler vorbei (z. B. auf der
  Rückhandseite), wird er ebenfalls angenommen – Kellen-Kandidaten haben
  Vorrang.
- Die KI hält den Ball mindestens ~0.7 s, bevor sie passt (ausser unter
  starkem Druck), damit es Ballbesitz und Spielaufbau gibt.
- Stockeinsatz der KI: alle ~0.5 s ein Versuch. Von vorne (Verteidiger im
  Laufweg) 2.4-mal so erfolgreich, von hinten nur 0.6-mal.
- Der Ballführer kann Verteidiger nicht wegschieben (kein Bodycheck).
- Nach Ballverlust springt der Ball in 45 % der Fälle frei weg, sonst hat ihn
  der Verteidiger direkt.

### Grafik
- Figuren 1.04-mal grösser als echt (auf Wunsch leicht verkleinert) (besser erkennbar), Ball etwas grösser.
- Spieler auf der Bank stehen bei Mittel/Hoch sichtbar hinter der Bande.
- Grafik Niedrig: keine Echtzeitschatten (Schattenflecken), weniger Publikum,
  keine Bankspieler, keine Kantenglättung.
- Publikum springt bei Torchancen und Toren.

### Etappe 2: Strafen
- Fouls entstehen beim Stockeinsatz (Mensch und KI): von hinten 2.8-mal, bei
  Müdigkeit, schwacher Zweikampfstärke und missglücktem Einsatz häufiger.
  Arten: Stockschlag, Halten (von hinten), hoher Stock (beim harten Schuss mit
  Gegner direkt daneben), Behinderung (Körperkontakt mit einem Passempfänger).
- Vorteil: Hat das gefoulte Team den Ball, läuft das Spiel weiter (Anzeige
  «✋ Vorteil», Schiedsrichter hebt den Arm). Pfiff, sobald das foulende Team
  den Ball berührt (spätestens nach 6 s). Trifft das gefoulte Team während des
  Vorteils, entfällt die Strafe.
- 2-Minuten-Strafe (Spielzeit, läuft nur bei laufender Uhr). Der Spieler geht
  in die Strafbank (zwischen den Spielerbänken), seine Position bleibt leer
  (4 gegen 5). Höchstens 2 Spieler gleichzeitig weniger; eine dritte Strafe
  wartet. Ein Powerplay-Tor beendet die Strafe mit der kürzesten Restzeit.
- Bully nach einer Strafe am Bully-Punkt beim Foulort.
- KI-Formation bei Unterzahl: 4 Spieler = Box (2 Verteidiger, 2 Flügel),
  3 Spieler = Dreieck.
- Zwei Schiedsrichter (nur Optik) laufen an den Längsseiten mit.
- Etwa 4–5 Strafen pro Spiel, ~1 Powerplay-Tor.

### Etappe 2: Verletzungen
- Risiko bei jedem Zweikampf (Stockeinsatz) und bei harten Zusammenstössen
  (ab 4.5 m/s): Grundrisiko × Härte × (1 + 2.5 × Müdigkeit²) × Schwierigkeit.
  Zusätzlich beim Sprint mit fast leerer Ausdauer.
- Schweregrad je nach Härte, Müdigkeit und Zufall: leicht 1–2, mittel 3–5,
  schwer 6–10 Spiele. Der Spieler stürzt, humpelt zur Bank, der beste freie
  Ersatz (zuerst die 3 Ersatzspieler, passende Position) übernimmt seinen
  Platz in allen Linien. Goalies verletzen sich nicht.
- Verletzungen der Freundschaftsspiel-Teams werden lokal gespeichert und nach
  jedem Spiel um eins heruntergezählt. Verletzte fehlen in der Aufstellung.
- Etwa 0.3–0.5 Verletzungen pro Spiel (Mittel).

### Etappe 2: Verlängerung und Penaltys
- Unentschieden nach 60 Minuten: Pause, dann Verlängerung 5:00 (45 s real),
  Sudden Death, Seitenwechsel. Danach Penaltyschiessen.
- Penaltyschiessen aufs rechte Tor, Schütze startet an der Mittellinie mit
  dem Ball, 8 s Zeit, kein Nachschuss (Versuch endet, sobald der Goalie den
  Ball berührt). Reihenfolge nach Schuss + Technik. Je 3, dann einzeln bis
  zur Entscheidung; vorzeitig entschieden, wenn uneinholbar.
- Der Mensch schiesst selbst und hält selbst (Goalie stellt sich ohne Eingabe
  von allein). KI-Schütze täuscht seitlich an und zielt in die freie Ecke.
- Sieger nach Penaltys erhält ein Tor mehr im Resultat («n.P.»). Punkte:
  Sieg 3, Sieg n.V./n.P. 2, Niederlage n.V./n.P. 1 (gespeichert im Resultat
  für Etappe 4).

### Etappe 2: Wiederholung und Jubel
- Nach einem Tor läuft das Spiel 1.1 s weiter, dann Wiederholung der letzten
  3 s (+0.7 s nach dem Tor) in halber Geschwindigkeit: erste Hälfte tiefe
  Seitenkamera, zweite Hälfte hinter dem Tor. Danach 4 s Jubel des
  Torschützen mit naher Kamera. Beides mit Taste oder Tippen überspringbar.
- 10 Jubel: Faust, Knierutscher, Schläger hochhalten, Flieger, Tänzchen, Herz,
  Sprung, Team-Kreis, Bogenschütze, Salutieren. Mitspieler kommen gratulieren
  (beim Team-Kreis eng im Kreis). Zuordnung pro Spieler im Menü
  «Freundschaftsspiel → Jubel zuordnen» (gespeichert).

### Etappe 3: Eigener Verein
- Der eigene Verein wird beim ersten Start erzeugt («UHC Mein Verein», Stärke
  wie die Freundschaftsgegner) und lokal gespeichert (`unihockey-stars.club`),
  automatisch nach jeder Änderung und nach jedem Spiel. Eigene Spieler-IDs ab
  100001.
- Menü «Mein Verein» mit Tabs Verein, Logo, Spieler, Aufstellung, Training.
- Trikots: Heim und Auswärts (Trikot, Akzent, Hose, Stulpen, Nummer, Goalie).
  Der Gast zieht das Auswärtstrikot an, wenn die Trikotfarben zu ähnlich sind.
  Auch die Freundschaftsgegner haben jetzt Heim- und Auswärtstrikots und Logos.
- Logo-JSON `{ shape, bg, border, symbol, symbolColor, initials, textColor }`.
  5 Formen, 13 Symbole (u. a. Wolf, Adler, Bär, Steinbock, Fuchs, Berg),
  bis 3 Initialen. Angezeigt im Menü, bei der Teamwahl, im Mittelkreis (Logo
  des Heimteams), auf der Brust jedes Trikots und auf den Banden (beide Teams).
  Tabelle folgt in Etappe 4.
- Spieler: Vor-/Nachname, Nummer (1–99, eindeutig), Position (Center, Flügel,
  Verteidiger; Goalie fest), Auslage, Schaft- und Kellenfarbe, Haut- und
  Haarfarbe, Frisur (kurz, lang, Locken, Irokese, Glatze), Jubel. Alter und
  Werte nur über Training/Alterung veränderbar. Alle Spieler (auch Gegner)
  haben ein zufälliges, individuelles Aussehen.
- Lieblingsspieler (★, einer pro Verein, Pascals Idee): goldener, leicht
  leuchtender Schläger (abschaltbar) und ★ in der Ausdaueranzeige.
- Auslage: Zielt der Schuss mehr als ~25° auf die Kellenseite, ist es ein
  Rückhandschuss: Streuung ×1.4, Tempo ×0.88.
- Aufstellung per Drag & Drop (Pointer-Events, funktioniert mit Finger und
  Maus): Tausch zwischen beliebigen Plätzen der 3 Linien, 2 Goalies, 3 Ersatz.
  Goalies nur auf Goalie-Plätze. ⚠ zeigt Spieler auf fremder Position.
- Training nach jedem Spiel des eigenen Vereins: Schwerpunkt (Ausgeglichen,
  Tempo, Schuss, Pass, Ausdauer, Zweikampf, Technik, Goalies) und Intensität
  (Locker ×0.55 ohne Risiko, Normal 0.6 % Verletzungsrisiko pro Spieler, Hart
  ×1.6 mit 3 %). Fortschritt sammelt sich pro Wert bis zum nächsten Punkt;
  junge Spieler lernen schneller, hohe Werte steigen langsamer. Bericht auf
  dem Schlussbildschirm und im Tab Training.

### Namen
- Gibt es einen Nachnamen im gleichen Team (bzw. in der gleichen Liste)
  mehrfach, wird die Vornamen-Initiale vorangestellt («A. Meier»,
  «D. Meier»); bei gleicher Initiale der ganze Vorname (Pascals Wunsch).
  In Listen über mehrere Teams (Torschützen) immer mit Initiale.

### Etappe 4: Ligen und Saison
- Ligawelt: 40 Teams, 5 Ligen à 8. Eigener Verein startet in Liga 5,
  Alpenblitz und Seewölfe in Liga 3, die übrigen 37 Teams haben erfundene
  Maskottchen-Namen, Zufallstrikots und Zufallslogos. Grundstärke (Spielerwert
  der 1. Linie): Liga 1 ≈ 74, 2 ≈ 68, 3 ≈ 62, 4 ≈ 56, 5 ≈ 51 (±4 pro Team).
  Alle Kader werden mit ganzer Spielerliste gespeichert (~300 KB).
- Saison: Kreisverfahren-Spielplan mit Hin- und Rückrunde (14 Runden). Jede
  Runde: eigenes Spiel live oder simuliert, alle anderen Spiele simuliert.
- Simulation: Teamstärke aus den drei Linien (45/33/22 %) und dem Goalie,
  Tore poisson-verteilt (Grundwert 2.9, Stärkeverhältnis hoch 3, Heimvorteil
  7 %). Unentschieden: 55 % Tor in der Verlängerung, sonst Penaltys. Schnitt
  ca. 5.6 Tore pro Spiel, ~15 % Entscheidungen n.V./n.P. Torschützen und
  Assists gewichtet nach Schuss/Pass und Linie.
- Tabelle: Punkte (3/2/1/0), Tordifferenz, erzielte Tore. Markierung:
  Rang 1–4 Playoffs, Rang 7 Barrage (nicht in Liga 1), Rang 8 Abstieg (nicht
  in Liga 5).
- Cup: 7 Runden, nach den Ligarunden 1, 3, 5, 7, 9, 11, 13. Liga 4+5 starten
  in der 1. Runde, Liga 3 in der 2., Liga 2 in der 3., Liga 1 im Achtelfinal
  (immer 16 Teams pro Runde bis zum Achtelfinal). Einzelspiele, das tiefer
  klassierte Team hat Heimrecht. Zählt nicht für die Torschützenliste.
- Playoffs nach Runde 14, alle Ligen parallel: Halbfinal 1–4 und 2–3, Final,
  je Best-of-3, Spiel 1 und 3 beim Besserklassierten. Danach Barragen
  (Rang 7 oben gegen Finalverlierer unten, Best-of-3, oberes Team mit
  Heimvorteil). Auf-/Abstieg wird erst beim Start der neuen Saison angewendet.
- Saisonziel nach Stärkerang im eigenen Feld: Rang 1–2 Aufstieg (Liga 1:
  Meister), 3–4 Playoffs, 5–6 Barrage vermeiden (Liga 5: mindestens Rang 6),
  7–8 Klassenerhalt. Bewertung: erreicht / übertroffen / verpasst.
- Verletzungen heilen in der Karriere pro Spieltag (auch ohne eigenes Spiel).
  Training und Bilanz nach jedem eigenen Spiel (auch simuliert).
- Saisonwechsel: alle Spieler +1 Jahr. Entwicklung bis 21 +1..+3, bis 24
  0..+2, bis 28 −1..+1, bis 31 −2..0, danach −3..−1 pro Wert. Rücktritt ab 33
  (25 %), ab 35 (60 %), ab 37 sicher; Ersatz durch einen 17–19-jährigen
  Junior auf derselben Position. KI-Teams werden halb an das Niveau ihrer
  neuen Liga angeglichen. Sommerpause: alle wieder gesund.
- Karriere wird nach jedem Spieltag gespeichert (`unihockey-stars.career`).

### Etappe 5: Geld, Halle, Transfers
- Nur in der Karriere. Startkapital 50'000 Fr. Werte in `js/league/finance.js`.
- Zuschauer pro Heimspiel: Grundnachfrage je Liga (Liga 5: 300 … Liga 1:
  1600) × Tabellenplatz (Rang 1 +25 %, je Rang −6 %) × Playoffs/Barrage 1.5 ×
  Cup (1.1 + 25 % pro Liga Unterschied zum Gegner) × Hallenausbau (+15 % pro
  Tribünenstufe), höchstens Kapazität (600 / 1200 / 2500 / 4500 / 8000).
  Eintritt 8 bis 18 Fr. je Liga, Anzeigetafel +6 % pro Stufe.
- Sponsoren: jede Saison 7 Angebote (Betrag je Liga, + Siegprämie), 3 Plätze +
  1 pro Anzeigetafel-Stufe. Bezahlt pro Qualifikationsrunde (1/14). Die
  Gewählten erscheinen bei Heimspielen auf den Banden.
- Sponsorenverträge für 1, 2 oder 3 Saisons (Wunsch nach Etappe 6): pro Saison
  100 % / 95 % / 90 % des Angebots, Siegprämie gleich. Längere Verträge sind
  sicheres Geld (auch nach einem Abstieg), entgehen aber höheren Angeboten nach
  einem Aufstieg. Laufende Verträge belegen ihren Platz auch in den folgenden
  Saisons; ihre Sponsoren erscheinen nicht nochmals unter den Angeboten.
  Auflösen geht nur in der Saison der Unterschrift. Alte Spielstände: bisherige
  Sponsoren gelten als 1-Jahres-Verträge.
- Löhne pro Runde nach Stärke: 0.1 × (Stärke − 30)^2.2 (mind. 40 Fr.).
- Prämien (× Ligafaktor 1 / 1.2 / 1.6 / 2.5 / 4 für Liga 5…1): Cupsiege je
  Runde, Playoff-Halbfinal/-Final, Meistertitel, Aufstieg, Saisonziel.
- Ausbau sofort wirksam, mit Unterhalt pro Runde:
  Tribünen (4 Stufen, 40k–600k): mehr Plätze, sichtbar mehr Ränge;
  Anzeigetafel (3 Stufen): mehr Einnahmen und Sponsorenplätze, grössere Tafel,
  ab Stufe 2 Videowürfel über dem Feld; Garderobe (3): +15 % Erholung pro Stufe
  auf der Bank und in den Drittelspausen; Physiotherapie (3): Verletzungen
  15 % kürzer pro Stufe; Nachwuchsabteilung (3): 2 + Stufe Junioren, besseres
  Niveau.
- Halle im Spiel: Tribünenreihen und Publikum je nach Ausbau und Auslastung;
  Gegnerhallen je nach Liga (Liga 1 gross, Liga 5 klein). Zuschauerzahl beim
  Anpfiff.
- Transfermarkt: 18 Spieler aus Teams der eigenen Liga ±1, alle zwei Runden
  teilweise neu. Wert = 1000 × 1.13^(Stärke − 40) × Altersfaktor (bis 21 ×1.45,
  bis 25 ×1.2, bis 29 ×1, bis 32 ×0.6, älter ×0.35); Kaufpreis Wert × 1.1–1.4,
  Verkauf Wert × 0.85. Kader 20 bis 26 Spieler; Zukäufe und Junioren kommen in
  die Reserve (auch per Drag & Drop einsetzbar). Beim Verkauf eines
  Stammspielers rückt der beste passende Reservespieler nach.
- Nachwuchs: Junioren (16–17 Jahre) zum Hochziehen; nicht hochgezogene gehen
  am Saisonende.
- Schlechte Finanzen: Konto im Minus → kein Kauf und kein Ausbau.

### Etappe 6: Speichern mit Code, Ton, Feinschliff
- Netzroller hat kein Online-Speichern per Kurzcode (dort ist der «Code» ein
  langer Text-Export, Supabase dient der Weltrangliste). Übernommen wurde das
  Muster: REST-Aufrufe ohne Bibliothek, nur Publishable Key im Code,
  RPC-Funktionen mit security definer, RLS ohne Policy, nur die Prüfsumme des
  Geheimnisses in der Datenbank, «Kopieren» per Zwischenablage.
- Supabase: gleiches Projekt wie Netzroller, eigene Tabelle `uh_savegames`
  (`code` = SHA-256 des Codes, `data` jsonb, `updated_at`) und genau zwei
  öffentliche Funktionen: `uh_load_game(code, nur_meta)` und
  `uh_save_game(code, daten, bekannter_stand, erzwingen)`. Spielstand bis 3 MB
  (tatsächlich ~80 KB gepackt). Höchstens eine Speicherung pro 2 Sekunden und
  Code.
- Code `UH-XXXX-XXXX` aus 32 Zeichen (2–9, A–Z ohne I und O), zufällig mit
  `crypto.getRandomValues`. Eingabe tolerant (Kleinbuchstaben, Leerzeichen,
  ohne Striche).
- Gespeichert wird ein Paket aus Verein, Karriere und Freundschaftsteams.
  Automatisch lokal nach jeder Änderung; mit Code zusätzlich online, 4 s nach
  einer Änderung, aber nie während eines laufenden Spiels. Ohne Internet wird
  später nochmals versucht.
- Zwei Geräte: Jedes Gerät merkt sich den Serverstand des letzten Abgleichs.
  Ist der Server neuer (beim Start geprüft und beim Speichern von der
  Datenbank gemeldet), erscheint eine Warnung mit beiden Zeitpunkten; der
  neuere Stand ist hervorgehoben. «Stand vom anderen Gerät laden» oder «Diesen
  Stand behalten» (überschreibt).
- Fallback: Export/Import als JSON-Datei.
- Ton: Web Audio, synthetisch. Publikum als gefiltertes Rauschen, Lautstärke
  folgt der Aufregung (Ball nahe am Tor, Schuss, Tor) plus Jubel bei Toren,
  Pfosten und Paraden. Im Hauptmenü-Demo nur leises Publikum. Ton startet nach
  der ersten Berührung/Taste.
- Einstellungen: Ton an/aus, Lautstärke (leise/mittel/laut), Touch-Tasten
  klein/normal/gross, Linkshänder-Anordnung (Joystick rechts).

### claude.ai-Artifact
- Gleicher Code wie GitHub Pages; Erkennung über `window.claude.use`.
- Online-Speichern im Artifact über das Claude-Konto des Spielers (privater
  Bereich in der Artifact-Datenbank), kein Code nötig. Gleiche Konfliktwarnung
  («neuerer Stand gewinnt»). Ohne Anmeldung oder Schreibrecht nur lokal plus
  Datei-Export über die Download-Freigabe.
- Bestätigungen überall mit eigenem Dialog statt `confirm()`.

### Zu zweit online (Wunsch nach Etappe 6)
- Freundschaftsspiel zu zweit, jedes auf seinem eigenen Gerät. Wählbar:
  **gegeneinander** (jedes steuert ein Team) oder **miteinander** im selben Team
  gegen den Computer (mit Schwierigkeit).
- Verbindung wie beim Netzroller: auf GitHub Pages direkt von Gerät zu Gerät
  (WebRTC über PeerJS 1.5.5, öffentlicher Vermittlungsserver, STUN von Google
  und Cloudflare), im claude.ai-Artifact über den Live-Raum der Plattform
  (Fähigkeit `room`). Beitreten mit 4-stelligem Code (ohne 0/o/1/l/i) oder
  Einladungslink `?zu-zweit=CODE`.
- Der Gastgeber stellt in der Lobby Spielart, Teams und Schwierigkeit ein. Zur
  Auswahl stehen sein Verein, der Verein des Gasts (wird beim Beitreten
  übertragen) und die zwei Standardteams. Gegeneinander spielt der Gastgeber
  von links nach rechts.
- Der Gastgeber rechnet das ganze Spiel; der Gast schickt nur seine Eingaben
  (Richtung, gehaltene Tasten und Zähler je Taste, damit kein Tastendruck
  verloren geht) und bekommt rund 20 Schnappschüsse pro Sekunde (Positionen,
  Animationen, Ball, Uhr, Strafen, die letzten Ereignisse für Ton und
  Meldungen; in Pausen Statistik, Tore und Resultat). Der Gast zeigt das Spiel
  0,12 s verzögert und weich zwischen zwei Schnappschüssen. Ein Schnappschuss
  ist höchstens rund 1,5 KB gross (Grenze im Live-Raum 4 KB).
- Zu zweit im selben Team: Jeder steuert einen eigenen Spieler; nie beide
  denselben. Der Ballführer geht an den, der den Pass gespielt hat, sonst an
  den Näheren. Beim Bully bekommt der Gastgeber den Bullyspieler, der Gast den
  nächsten Mitspieler. Den Goalie kann nur einer übernehmen. Im
  Penaltyschiessen sind die beiden abwechselnd Schütze bzw. Goalie.
- Markierung: eigener Spieler gelber Ring und Pfeil, Mitspieler blauer Ring,
  der vom anderen Menschen gesteuerte Gegner roter Ring.
- Verbindung stabiler: Beide Geräte schicken jede Sekunde einen Herzschlag
  (vorher hielt der Gast eine ruhige Lobby nach 3,5 s für tot und verband sich
  ständig neu). Neu erst nach 5 s ohne Daten. Staut sich die Leitung, wird kein
  veralteter Zustand eingereiht, sondern der neueste nachgeschickt. Zurück aus
  dem Hintergrund wird sofort neu verbunden. Während einer Online-Sitzung
  bleibt der Bildschirm an (Wake Lock, wo der Browser es kann).
- Online läuft das Spiel ohne Pause weiter (Menü nur zum Verlassen). Die
  Drittelspause beendet der Gastgeber; der Gast sieht dieselbe Statistik und
  wartet. Ohne Daten seit 2,5 s erscheint ein Hinweis; die Verbindung baut sich
  selbst wieder auf.
- Online-Spiele zählen nicht für den Verein (keine Verletzungen, kein Training,
  keine Bilanz).

### Spielerwahl, Linienwechsel, Handy-Tasten (Wunsch nach Etappe 6)
- Automatische Spielerwahl (Einstellung «Spielerwahl», Standard an): Hat das
  eigene Team den Ball nicht, steuert man automatisch den Feldspieler am
  nächsten beim Ball (Wechsel erst, wenn ein anderer 1,2 m näher ist, höchstens
  alle 0,35 s). Bei einem eigenen Pass wechselt die Steuerung gleich zum
  Empfänger. «Wechsel» (Y bzw. Taste) wählt einen anderen Spieler; danach wird
  2,5 s nicht automatisch zurückgewechselt. Als Goalie, beim Aufladen und im
  Penaltyschiessen nie automatisch.
- Fliegender Linienwechsel im Spiel: Die Spieler gehen gestaffelt raus (alle
  0,8 s einer, höchstens 2 gleichzeitig unterwegs, wer am nächsten bei der Bank
  ist zuerst; Ballführer und Gestürzte warten). Der Neue betritt das Feld erst,
  wenn der Alte über der Bande ist – nie mehr als 5 Feldspieler. Zur Bank
  laufen sie mit 6 m/s. Bei einem Unterbruch (Bully) wird sofort fertig
  gewechselt.
- Handy: Joystick fest unten links (verschiebt sich nicht mehr zum Daumen; der
  Daumen kann irgendwo in der linken Zone liegen, die Richtung zählt ab der
  Joystick-Mitte), «Wechsel» direkt darüber. Rechts unten Pass (Ecke) und
  links daneben Schuss (beide gleich gross), darüber Bande (am Rand) und Sprint
  (Linkshänder gespiegelt). Maus-Modus am PC: Joystick 150 px vom rechten
  Rand und 60 px vom unteren, «Wechsel» links daneben (über der Taste lenkt die
  Maus nicht).
  Oben neu eine Vollbild-Taste (⛶), wo der Browser Vollbild kann (iPhone-Safari
  nicht; dort «Zum Home-Bildschirm»).

### Steuerung am PC (Wunsch nach Etappe 6)
- Bewegung wahlweise mit Tastatur oder Maus (Einstellung «Bewegung (PC)»).
  Maus: Joystick fest unten rechts und immer sichtbar; die Mausposition
  relativ zu seiner Mitte bestimmt Richtung und Tempo, ohne Klick (tote Zone
  in der Mitte = stehen bleiben, voller Ausschlag am Rand). Verlässt die Maus
  das Fenster, bleibt der Spieler stehen. Die Handy-Tasten bleiben am PC
  ausgeblendet. Die
  Tastatur-Bewegung funktioniert im Maus-Modus weiterhin.
- Pass neu mit Alt (links und rechts/AltGr), X bleibt als Ersatz. Alt wird im
  Spiel abgefangen, damit der Browser nicht die Menüleiste öffnet.
- Spielerwechsel neu mit Y statt E (erkannt über den aufgedruckten Buchstaben,
  damit es auf QWERTZ- und QWERTY-Tastaturen gleich funktioniert).
