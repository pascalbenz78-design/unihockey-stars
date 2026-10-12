// Erzeugt die Einstiegsseite für die claude.ai-Artifact-Version aus index.html.
// Artifacts wickeln die Seite selbst in <!doctype html><head>…<body> ein: Die
// Datei enthält deshalb nur Titel, Stylesheet, Import-Map, Skript und Inhalt.
//   node tools/artifact-entry.mjs <Zieldatei>

import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const keep = [
  head.match(/<title>[\s\S]*?<\/title>/)[0],
  head.match(/<link rel="stylesheet"[^>]*>/)[0],
  head.match(/<script type="importmap">[\s\S]*?<\/script>/)[0],
  head.match(/<script type="module"[^>]*><\/script>/)[0],
];
const out = `${keep.join('\n')}\n<style>:root { color-scheme: dark; } html, body { background: #11151c; }</style>\n${body.trim()}\n`;
fs.writeFileSync(process.argv[2], out);
console.log('geschrieben:', process.argv[2], out.length, 'Zeichen');
