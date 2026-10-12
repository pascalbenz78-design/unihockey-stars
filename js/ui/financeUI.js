// Karriere-Bildschirme für Etappe 5: Finanzen, Halle (Ausbau), Sponsoren,
// Transfermarkt (kaufen/verkaufen) und Nachwuchs.

import {
  FACILITIES, CAPACITY, chf, wageOf, valueOf, wageBill, sponsorSlots, build, signSponsor, dropSponsor, contractAmount, SPONSOR_YEARS, marketEntries,
  buyPlayer, sellPlayer, promoteJunior, slotOf, MAX_ROSTER, MIN_ROSTER,
} from '../league/finance.js';
import { overall } from '../club/training.js';
import { seasonLabel } from '../league/career.js';
import { ask } from './dialog.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POS = { C: 'Center', F: 'Flügel', D: 'Verteidiger', G: 'Goalie' };
const CAT = {
  tickets: 'Zuschauer', sponsors: 'Sponsoren', premiums: 'Prämien', sales: 'Spielerverkäufe',
  wages: 'Löhne', upkeep: 'Unterhalt', build: 'Ausbau', buys: 'Spielerkäufe',
};

export class FinanceUI {
  constructor(app, careerUI) {
    this.app = app;
    this.cui = careerUI;
    this.posFilter = 'alle';
    this.marketTab = 'kaufen';
  }

  get c() { return this.app.career; }
  get f() { return this.c.finance; }
  get club() { return this.app.club; }

  nav(active) {
    const tabs = { carFinance: 'Finanzen', carHall: 'Halle', carSponsors: 'Sponsoren', carMarket: 'Transfers', carYouth: 'Nachwuchs' };
    return `<div class="tabs">${Object.entries(tabs).map(([k, v]) =>
      `<button class="tab ${active === k ? 'sel' : ''}" data-act="${k}">${v}</button>`).join('')}</div>
      <p class="balance">Kontostand: <b class="${this.f.balance < 0 ? 'neg' : ''}">${chf(this.f.balance)}</b> · Löhne pro Runde: ${chf(wageBill(this.club))}</p>`;
  }

  show(html) { this.cui.show(html + this.cui.back()); }

  // ------------------------------------------------------------ Finanzen

  finance() {
    const s = this.f.season;
    const inc = ['tickets', 'sponsors', 'premiums', 'sales'], exp = ['wages', 'upkeep', 'build', 'buys'];
    const sum = keys => keys.reduce((a, k) => a + (s[k] || 0), 0);
    const rows = (keys, sign) => keys.map(k => `<tr><td>${CAT[k]}</td><td class="num ${sign}">${sign === 'neg' ? '−' : '+'}${chf(s[k] || 0)}</td></tr>`).join('');
    const diff = sum(inc) - sum(exp);
    const ledger = this.f.ledger.slice(0, 18).map(e =>
      `<tr><td>${esc(e.label)}</td><td class="num ${e.amount < 0 ? 'neg' : 'pos'}">${e.amount < 0 ? '−' : '+'}${chf(Math.abs(e.amount))}</td></tr>`).join('');
    this.show(`<h2>Finanzen ${seasonLabel(this.c)}</h2>${this.nav('carFinance')}
      ${this.f.balance < 0 ? '<p class="injured">⚠ Das Konto ist im Minus: keine Käufe und kein Ausbau, bis wieder Geld da ist.</p>' : ''}
      <div class="two-col">
        <div><h3>Saisonbilanz</h3><table class="tab fin">
          <tr><th colspan="2">Einnahmen</th></tr>${rows(inc, 'pos')}
          <tr><th colspan="2">Ausgaben</th></tr>${rows(exp, 'neg')}
          <tr class="total"><td>Ergebnis</td><td class="num ${diff < 0 ? 'neg' : 'pos'}">${diff < 0 ? '−' : '+'}${chf(Math.abs(diff))}</td></tr></table>
          <p class="hint">Zuschauer nur bei Heimspielen. Sponsoren und Löhne pro Qualifikationsrunde. Prämien für Cuprunden, Playoffs, Meistertitel, Aufstieg und erreichtes Saisonziel.</p></div>
        <div><h3>Letzte Buchungen</h3><table class="tab fin">${ledger || '<tr><td class="hint">noch keine</td></tr>'}</table></div>
      </div>`);
  }

  // ------------------------------------------------------------ Halle

  hall() {
    const fac = this.f.facilities;
    const cards = Object.entries(FACILITIES).map(([k, d]) => {
      const l = fac[k];
      const next = l < d.max ? d.costs[l] : null;
      return `<div class="fac">
        <h3>${d.label} <span class="lvl" title="Stufe ${l} von ${d.max}">${Array.from({ length: d.max }, (_, i) => `<i class="${i < l ? 'on' : ''}">★</i>`).join('')}</span></h3>
        <p>${d.effect(l)}</p>
        ${next != null ? `<p class="hint">Nächste Stufe: ${d.effect(l + 1)}</p>
          <button class="${this.f.balance >= next ? 'primary' : ''}" data-act="carBuild" data-val="${k}" ${this.f.balance >= next ? '' : 'disabled'}>Ausbauen für ${chf(next)}</button>`
        : '<p class="hint">Höchste Stufe erreicht</p>'}</div>`;
    }).join('');
    this.show(`<h2>Halle und Staff</h2>${this.nav('carHall')}
      <p class="hint">Der Ausbau ist im Spiel sichtbar: mehr Tribünenreihen, mehr Publikum, grössere Anzeigetafel (ab Stufe 2 mit Videowürfel).
      Unterhalt fällt pro Runde an. Aktuell ${CAPACITY[fac.stands].toLocaleString('de-CH')} Plätze.</p>
      <div class="facs">${cards}</div>`);
  }

  // ------------------------------------------------------------ Sponsoren

  sponsors() {
    const f = this.f;
    const c = this.c;
    const yearLabel = s => { const y = c.year + (s - c.season); return `${y}/${String((y + 1) % 100).padStart(2, '0')}`; };
    const left = s => s.until - c.season + 1;
    const contracts = f.sponsors.map(s => {
      const canDrop = (s.signed ?? c.season) === c.season;
      return `<div class="sponsor sel">
        <span class="sp-logo" style="background:${s.bg};color:${s.fg}">${esc(s.name)}</span>
        <span>${chf(s.amount)} pro Saison<br><small>+ ${chf(s.winBonus)} pro Sieg</small></span>
        <em>✓ Vertrag ${s.years || 1} ${(s.years || 1) > 1 ? 'Jahre' : 'Jahr'} · bis ${yearLabel(s.until ?? c.season)}${left(s) > 1 ? ` (noch ${left(s)} Saisons)` : ' (letzte Saison)'}</em>
        ${canDrop ? `<button data-act="carSponsorDrop" data-val="${s.id}">Vertrag auflösen</button>` : ''}</div>`;
    }).join('');
    const taken = new Set(f.sponsors.map(s => s.id));
    const cards = f.offers.filter(o => !taken.has(o.id)).map(o => `
      <div class="sponsor">
        <span class="sp-logo" style="background:${o.bg};color:${o.fg}">${esc(o.name)}</span>
        <small>+ ${chf(o.winBonus)} pro Sieg</small>
        <div class="sp-years">${Object.keys(SPONSOR_YEARS).map(y => `<button data-act="carSponsor" data-val="${o.id}:${y}">
          <b>${y} ${y > 1 ? 'Jahre' : 'Jahr'}</b><span>${chf(contractAmount(o, y))}</span><small>pro Saison</small></button>`).join('')}</div>
      </div>`).join('');
    const total = f.sponsors.reduce((a, s) => a + s.amount, 0);
    this.show(`<h2>Sponsoren ${seasonLabel(c)}</h2>${this.nav('carSponsors')}
      <p>${f.sponsors.length} von ${sponsorSlots(c)} Plätzen belegt · zusammen ${chf(total)} pro Saison.
      <span class="hint">Verträge gibt es für 1, 2 oder 3 Saisons: Längere Verträge bringen etwas weniger pro Saison, dafür ist das Geld sicher – auch nach einem Abstieg. Aufgelöst werden kann nur in der Saison der Unterschrift. Die Logos erscheinen bei Heimspielen auf den Banden. Mehr Plätze gibt es mit einer besseren Anzeigetafel.</span></p>
      ${contracts ? `<h3>Unter Vertrag</h3><div class="sponsors">${contracts}</div>` : ''}
      <h3>Angebote</h3><div class="sponsors">${cards || '<p class="hint">Keine weiteren Angebote in dieser Saison.</p>'}</div>`);
  }

  // ------------------------------------------------------------ Transfers

  market(tab = this.marketTab) {
    this.marketTab = tab;
    const club = this.club;
    const tabs = `<div class="tabs sub"><button class="tab ${tab === 'kaufen' ? 'sel' : ''}" data-act="carMarket" data-val="kaufen">Kaufen</button>
      <button class="tab ${tab === 'verkaufen' ? 'sel' : ''}" data-act="carMarket" data-val="verkaufen">Verkaufen</button></div>`;
    const filt = `<div class="opts">${['alle', 'C', 'F', 'D', 'G'].map(k =>
      `<button class="opt ${this.posFilter === k ? 'sel' : ''}" data-act="carPos" data-val="${k}">${k === 'alle' ? 'Alle' : POS[k]}</button>`).join('')}</div>`;
    let body;
    if (tab === 'kaufen') {
      const list = marketEntries(this.c).filter(m => this.posFilter === 'alle' || m.p.pos === this.posFilter)
        .sort((a, b) => overall(b.p) - overall(a.p));
      body = `${filt}<table class="tab market"><tr><th>Spieler</th><th>Pos.</th><th>Alter</th><th>Stärke</th><th>Team</th><th>Lohn/Runde</th><th>Preis</th><th></th></tr>
        ${list.map(m => `<tr><td><b>${esc(m.p.firstName)} ${esc(m.p.lastName)}</b></td><td>${POS[m.p.pos]}</td><td>${m.p.age}</td>
          <td><span class="ovr">${overall(m.p)}</span></td><td>${this.cui.tname(m.team, true)}</td><td>${chf(wageOf(m.p))}</td><td>${chf(m.price)}</td>
          <td><button class="${this.f.balance >= m.price ? 'primary' : ''}" data-act="carBuy" data-val="${m.pid}" ${this.f.balance >= m.price ? '' : 'disabled'}>Kaufen</button></td></tr>`).join('')}</table>
        <p class="hint">Der Markt ändert sich alle zwei Runden. Gekaufte Spieler kommen in die Reserve – in «Mein Verein → Aufstellung» einsetzen. Kader: ${club.players.length}/${MAX_ROSTER}.</p>`;
    } else {
      const list = [...club.players].filter(p => this.posFilter === 'alle' || p.pos === this.posFilter)
        .sort((a, b) => overall(b) - overall(a));
      const where = id => { const s = slotOf(club, id); return !s ? '' : s[0] === 'L' ? `Linie ${+s[1] + 1}` : s[0] === 'G' ? (s === 'G0' ? 'Stammgoalie' : 'Ersatzgoalie') : s[0] === 'S' ? 'Ersatz' : 'Reserve'; };
      body = `${filt}<table class="tab market"><tr><th>Spieler</th><th>Pos.</th><th>Alter</th><th>Stärke</th><th>Platz</th><th>Lohn/Runde</th><th>Erlös</th><th></th></tr>
        ${list.map(p => `<tr><td><b>${club.favorite === p.id ? '★ ' : ''}${esc(p.firstName)} ${esc(p.lastName)}</b></td><td>${POS[p.pos]}</td><td>${p.age}</td>
          <td><span class="ovr">${overall(p)}</span></td><td>${where(p.id)}</td><td>${chf(wageOf(p))}</td><td>${chf(Math.round(valueOf(p) * 0.85 / 500) * 500)}</td>
          <td><button data-act="carSell" data-val="${p.id}">Verkaufen</button></td></tr>`).join('')}</table>
        <p class="hint">Mindestens ${MIN_ROSTER} Spieler. Wer auf einem Platz in der Aufstellung steht, wird durch den besten Spieler aus der Reserve ersetzt.</p>`;
    }
    this.show(`<h2>Transfermarkt</h2>${this.nav('carMarket')}${tabs}${body}`);
  }

  // ------------------------------------------------------------ Nachwuchs

  youth() {
    const js = this.f.juniors;
    const cards = js.map(p => `<tr><td><b>${esc(p.firstName)} ${esc(p.lastName)}</b></td><td>${POS[p.pos]}</td><td>${p.age}</td>
      <td><span class="ovr">${overall(p)}</span></td><td>${chf(wageOf(p))}</td>
      <td><button class="primary" data-act="carPromote" data-val="${p.id}">Hochziehen</button></td></tr>`).join('');
    this.show(`<h2>Nachwuchs</h2>${this.nav('carYouth')}
      <p class="hint">Die Junioren-Abteilung liefert jede Saison neue Talente. Junge Spieler verbessern sich jedes Jahr deutlich.
      Wer nicht bis Saisonende hochgezogen wird, wechselt zu einem anderen Verein. Bessere Nachwuchsabteilung (Halle) = mehr und bessere Junioren.</p>
      ${js.length ? `<table class="tab market"><tr><th>Junior</th><th>Pos.</th><th>Alter</th><th>Stärke</th><th>Lohn/Runde</th><th></th></tr>${cards}</table>`
        : '<p>Keine Junioren mehr in dieser Saison.</p>'}`);
  }

  // ------------------------------------------------------------ Ereignisse

  result(r, okMsg) {
    if (r.ok) { if (okMsg) this.app.hud.toast(okMsg, 2.5); this.app.saveCareer(); }
    else this.app.hud.toast(r.msg, 3);
  }

  onAction(act, val) {
    switch (act) {
      case 'carFinance': this.finance(); return true;
      case 'carHall': this.hall(); return true;
      case 'carSponsors': this.sponsors(); return true;
      case 'carMarket': this.market(val || undefined); return true;
      case 'carYouth': this.youth(); return true;
      case 'carPos': this.posFilter = val; this.market(); return true;
      case 'carBuild': this.result(build(this.c, val), `${FACILITIES[val].label} ausgebaut`); this.hall(); return true;
      case 'carSponsor': { const [id, y] = val.split(':'); this.result(signSponsor(this.c, id, +y)); this.sponsors(); return true; }
      case 'carSponsorDrop': this.result(dropSponsor(this.c, val)); this.sponsors(); return true;
      case 'carBuy': {
        const r = buyPlayer(this.c, this.club, +val, () => this.c.nextId++);
        this.result(r, r.ok ? `${r.p.firstName} ${r.p.lastName} gekauft – er ist in der Reserve` : '');
        this.market(); return true;
      }
      case 'carSell': {
        const p = this.club.players.find(x => x.id === +val);
        if (!p) return true;
        ask(`${p.firstName} ${p.lastName} wirklich verkaufen?`, { ok: 'Verkaufen' }).then(ok => {
          if (!ok) return;
          const r = sellPlayer(this.c, this.club, +val);
          this.result(r, r.ok ? `Verkauft an ${r.team.name} für ${chf(r.price)}` : '');
          this.market();
        });
        return true;
      }
      case 'carPromote': {
        const r = promoteJunior(this.c, this.club, +val);
        this.result(r, r.ok ? `${r.p.firstName} ${r.p.lastName} ist jetzt in der Reserve (#${r.p.number})` : '');
        this.youth(); return true;
      }
      default: return false;
    }
  }
}
