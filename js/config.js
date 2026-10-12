// Alle Spielwerte an einem Ort. Längen in Metern, Zeiten in Sekunden (real),
// Geschwindigkeiten in m/s. Spielerwerte (Tempo, Schuss …) gehen von 1 bis 99.

export const CONFIG = {
  version: '1.1.0',

  field: {
    length: 40,
    width: 20,
    cornerRadius: 2.5,
    boardHeight: 0.5,
    goalLineDist: 3.5,      // Torlinie ab Endbande
    goalWidth: 1.6,
    goalHeight: 1.15,
    goalDepth: 0.65,
    postRadius: 0.045,
    creaseDepth: 4,         // Torraum in Längsrichtung
    creaseWidth: 5,
    creaseFromEnd: 2.85,    // hinterer Rand des Torraums ab Endbande
    goalieAreaDepth: 1,
    goalieAreaWidth: 2.5,
    centerCircleRadius: 3,
    faceoffBoardDist: 1.5,  // Bully-Punkte ab Längsbande
    benchX: 6,              // Mitte der Spielerbank (Heim −, Gast +)
    benchLength: 7,
  },

  time: {
    periods: 3,
    periodGameSeconds: 1200, // 20:00
    periodRealSeconds: 180,  // dauert real 3 Minuten
    goalPause: 3.2,          // Jubel bis zum Bully (ohne Wiederholung)
    goalLive: 1.1,           // nach dem Tor kurz live weiter, dann Wiederholung
    replaySeconds: 3,        // Länge der Wiederholung vor dem Tor
    replayAfter: 0.7,        // so viel nach dem Tor wird noch gezeigt
    replaySpeed: 0.5,        // Zeitlupe
    celebration: 4,          // Jubel des Torschützen
    penaltyPause: 2.6,       // Unterbruch bei Strafe
    otGameSeconds: 300,      // Verlängerung 5:00 (Sudden Death)
    otRealSeconds: 45,
    faceoffDelay: 1.3,
    outOfPlayPause: 1.2,
  },

  physics: {
    tickRate: 60,
    ballRadius: 0.036,
    ballDrag: 0.55,          // exponentielle Bremsung pro Sekunde
    ballRollDecel: 0.6,      // zusätzliche Rollreibung m/s²
    gravity: 9.81,
    floorBounce: 0.35,
    boardRestitution: 0.72,
    boardFriction: 0.88,
    postRestitution: 0.65,
    netRestitution: 0.12,
    maxSubstep: 0.05,        // Ball bewegt sich pro Teilschritt höchstens so weit
  },

  player: {
    radius: 0.36,
    maxSpeed: 6.0,           // bei Tempo 99, frisch
    minSpeedFactor: 0.78,    // Tempo 1
    sprintFactor: 1.33,
    accel: 15,
    carryFactor: 0.9,        // mit Ball etwas langsamer
    turnRate: 10,            // rad/s für die Blickrichtung
    stickOffset: 0.55,       // Kellenposition vor dem Körper
    stickSide: 0.22,         // seitlich zur Auslage
    controlRadius: 0.5,      // Ballannahme-Radius um die Kelle
    receiveSpeed: 18,        // bis zu dieser Ballgeschwindigkeit sichere Annahme (Technik 99)
    blockChance: 0.28,       // schneller Ball in Reichweite eines Feldspielers
    pickupCooldown: 0.28,    // nach Schuss/Pass kein Selbst-Aufnehmen
  },

  duel: {
    stealRange: 0.85,        // Abstand Gegnerkelle ↔ Ball
    aiStealChance: 0.1,      // Erfolgschance pro Stockeinsatz der KI (vor Skill/Zweikampf)
    frontFactor: 2.4,        // Stockeinsatz von vorne
    behindFactor: 0.6,       // von hinten
    humanStealChance: 0.3,   // pro Stockeinsatz
    stealCooldown: 0.55,
    loseBallChance: 0.45,    // bei Ballverlust springt der Ball weg (sonst direkt erobert)
  },

  shot: {
    minSpeed: 13,
    maxSpeed: 29,
    chargeTime: 0.9,         // bis voll aufgeladen
    autoRelease: 1.6,
    baseSpread: 0.035,       // rad
    chargeSpread: 0.07,      // zusätzlich bei voller Ladung
    fatigueSpread: 0.08,     // zusätzlich bei leerer Ausdauer
    skillSpread: 0.06,       // zusätzlich bei Schuss 1
    maxLift: 3.3,            // vertikale Startgeschwindigkeit
    backhandAngle: 0.45,     // rad: Ziel so weit auf der Kellenseite = Rückhandschuss
    backhandSpread: 1.4,
    backhandPower: 0.88,
    oneTimerWindow: 0.45,
    oneTimerBonus: 1.15,
  },

  pass: {
    minSpeed: 8,
    maxSpeed: 17,
    spread: 0.05,
    bankExtra: 1.3,          // Bandenpass schneller wegen Energieverlust
    leadFactor: 0.85,
  },

  // Fliegender Linienwechsel: der Neue kommt erst, wenn der Alte über der Bande ist
  lineChange: {
    stagger: 0.8,            // Sekunden zwischen zwei Spielern, die rausgehen
    maxOut: 2,               // höchstens so viele gleichzeitig unterwegs zur Bank
    exitSpeed: 6,            // Laufen zur Bank (m/s)
  },

  // Automatische Spielerwahl: gesteuert wird der Spieler am nächsten beim Ball
  autoSwitch: {
    margin: 1.2,             // erst wechseln, wenn ein anderer so viel näher ist (m)
    minGap: 0.35,            // Sekunden zwischen zwei automatischen Wechseln
    manualHold: 2.5,         // nach «Wechsel» so lange nicht automatisch zurückwechseln
  },

  stamina: {
    drainPerSec: 1 / 80,
    sprintFactor: 2.6,
    idleFactor: 0.35,        // beim Stehen
    recoverBench: 1 / 32,
    tiredSpeedLoss: 0.28,    // bei Ausdauer 0
    autoChangeBelow: 0.45,
    ausdauerEffect: 0.5,     // Ausdauer 99 halbiert den Verbrauch fast
  },

  goalie: {
    speed: 4.2,
    lineOffset: 0.55,        // Grundposition vor der Torlinie
    angleDepth: 0.6,         // wie weit er bei Winkeln herauskommt
    bodyReach: 0.42,
    diveReach: 0.5,          // zusätzliche Reichweite (Reflexe 99)
    humanDiveBonus: 0.25,
    reactionMax: 0.26,       // Reflexe 1
    reactionMin: 0.07,       // Reflexe 99
    baseSave: 0.86,
    speedPenFrom: 15,        // ab diesem Schusstempo wird es schwieriger
    catchChance: 0.55,
    holdMin: 0.8,
    holdMax: 1.8,
    maxHold: 3.0,
  },

  ai: {
    decisionInterval: 0.22,
    shootRange: 12,
    goodShotRange: 8,
    passPressure: 1.3,
    minHold: 0.7,            // so lange hält die KI den Ball mindestens (ausser bei starkem Druck)
    teammateSkill: 0.8,      // eigene Mitspieler
  },

  rules: {
    penaltyGameSeconds: 120, // 2-Minuten-Strafe
    maxPenalized: 2,         // höchstens 2 Spieler gleichzeitig weniger
    foulBase: 0.0024,         // Foulchance pro Stockeinsatz (vor Faktoren)
    foulBehind: 2.8,         // von hinten
    foulFront: 0.5,          // von vorne
    foulTired: 1.3,          // + bei leerer Ausdauer
    foulMiss: 1.7,           // missglückter Stockeinsatz
    foulHuman: 1.0,          // Faktor für den vom Menschen gesteuerten Spieler
    highStick: 0.03,         // hoher Stock beim Schuss, wenn Gegner direkt vor einem steht
    interference: 0.06,      // Behinderung pro Sekunde Körperkontakt mit einem Passempfänger
    advantageMax: 6,         // so lange läuft der Vorteil höchstens (Sekunden real)
    fallChance: 0.35,        // gefoulter Spieler stürzt
    injuryBase: 0.0005,      // Verletzungsrisiko pro Zweikampf bei Härte 1
    injuryTired: 2.5,        // Müdigkeit erhöht das Risiko stark
    collisionSpeed: 4.5,     // ab dieser Aufprallgeschwindigkeit zählt ein Zusammenprall als Zweikampf
    fatigueInjury: 0.002,    // pro Sekunde Sprint mit fast leerer Ausdauer
    injuryGames: { leicht: [1, 2], mittel: [3, 5], schwer: [6, 10] },
  },

  shootout: {
    rounds: 3,
    attemptTime: 8,          // Sekunden real pro Penalty
    readyTime: 1.4,
    resultTime: 1.8,
  },

  points: { win: 3, winOT: 2, lossOT: 1, loss: 0 },

  difficulty: {
    leicht: { label: 'Leicht', skill: 0.55, tempo: 0.88, goalie: 0.85, injury: 0.5 },
    mittel: { label: 'Mittel', skill: 0.8,  tempo: 1.0,  goalie: 1.18, injury: 1.0 },
    schwer: { label: 'Schwer', skill: 1.0,  tempo: 1.1,  goalie: 1.42, injury: 1.4 },
  },

  graphics: {
    niedrig: { label: 'Niedrig', pixelRatio: 1,   shadows: 0,    crowd: 350,  bench: false, antialias: false },
    mittel:  { label: 'Mittel',  pixelRatio: 1.5, shadows: 1024, crowd: 1100, bench: true,  antialias: true },
    hoch:    { label: 'Hoch',    pixelRatio: 2,   shadows: 2048, crowd: 2400, bench: true,  antialias: true },
  },

  camera: {
    height: 10.5,
    distance: 15,
    fov: 42,
    follow: 3.2,             // je höher, desto schneller folgt die Kamera
    lookAhead: 0.25,         // Sekunden Ballgeschwindigkeit voraus
    maxX: 13,
  },

  // Online-Speichern (Supabase-Projekt «netzroller», eigene Tabelle uh_savegames).
  // Der Publishable Key darf öffentlich sein: Die Schutzregeln liegen in der Datenbank (docs/supabase.sql).
  // Leer lassen = nur lokales Speichern und Datei-Export.
  online: {
    url: 'https://cyyvirqzaqqbmjpvgryw.supabase.co',
    key: 'sb_publishable_JZ4sX5C-LR5D8FUTkc5Knw_98R7wtof',
  },

  defaults: {
    difficulty: 'mittel',
    graphics: 'mittel',
    autoChange: false,
    autoGoalie: false,
    autoSwitch: true,
    sound: true,
    volume: 0.7,
    touchSize: 'normal',
    moveInput: 'tastatur',   // PC: Bewegung mit «tastatur» oder «maus» (Joystick wie am Handy)
    lefty: false,
  },
};

// Spielerwert 1..99 → 0..1
export const rating = v => Math.max(0, Math.min(1, (v - 1) / 98));
