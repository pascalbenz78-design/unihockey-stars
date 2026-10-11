// Anzeige während des Spiels: Spielstand, Uhr, Ausdauer der eigenen Linie,
// Strafen mit Countdown, Powerplay/Boxplay, Vorteil, Wiederholung,
// Penaltyschiessen und Meldungen.

import { CONFIG } from '../config.js';

const ROLE_LABEL = { C: 'C', LW: 'FL', RW: 'FR', LD: 'VL', RD: 'VR', G: 'G' };

const mmss = s => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.$ = id => document.getElementById(id);
    this.msgTimer = 0;
    this.toastTimer = 0;
    this.staminaRows = [];
    const st = this.$('stamina');
    for (let i = 0; i < 5; i++) {
      const row = document.createElement('div');
      row.className = 'st-row';
      row.innerHTML = '<span class="st-role"></span><span class="st-num"></span><span class="st-bar"><i></i></span>';
      st.appendChild(row);
      this.staminaRows.push({ row, role: row.children[0], num: row.children[1], bar: row.children[2].firstChild });
    }
    this._pensKey = '';
    this._soKey = '';
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  setTeams(match) {
    const [a, b] = match.teams;
    this.$('hs-name').textContent = a.data.short;
    this.$('as-name').textContent = b.data.short;
    this.$('hs-sw').style.background = a.data.colors.shirt;
    this.$('as-sw').style.background = b.data.colors.shirt;
    this.$('lineinfo').classList.toggle('hidden', !match.human);
    this._pensKey = this._soKey = '';
  }

  message(html, secs = 2, cls = '') {
    const m = this.$('msg');
    m.innerHTML = html;
    m.className = 'show ' + cls;
    this.msgTimer = secs;
  }

  toast(text, secs = 2) {
    const t = this.$('toast');
    t.textContent = text;
    t.classList.add('show');
    this.toastTimer = secs;
  }

  update(match, dt) {
    const [a, b] = match.teams;
    this.$('hs-score').textContent = a.score;
    this.$('as-score').textContent = b.score;
    this.$('clock').textContent = match.shootout ? '–' : match.clockText();
    this.$('period').textContent = match.periodLabel();
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.$('msg').className = ''; }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.$('toast').classList.remove('show'); }

    this.$('replay-badge').classList.toggle('hidden', match.state !== 'replay');
    this.updatePenalties(match);
    this.updateShootout(match);

    const h = match.human;
    const li = this.$('lineinfo');
    li.classList.toggle('hidden', !h || !!match.shootout);
    if (!h || match.shootout) return;
    const t = h.team;
    const pend = t.pending.size > 0;
    this.$('linelabel').textContent = pend ? `Wechsel → Linie ${t.nextLine + 1}` : `Linie ${t.activeLine + 1}`;
    this.$('linelabel').classList.toggle('pending', pend);
    const sk = t.skaters;
    this.staminaRows.forEach((r, i) => {
      const p = sk[i];
      r.row.style.display = p ? '' : 'none';
      if (!p) return;
      r.role.textContent = ROLE_LABEL[p.role];
      r.num.textContent = p.data.number;
      const s = Math.round(p.stamina * 100);
      r.bar.style.width = s + '%';
      r.bar.style.background = s > 60 ? '#3ddc84' : s > 35 ? '#ffc93c' : '#ff5a4f';
      r.row.classList.toggle('ctl', p === h.controlled);
    });
    this.$('goalie-ind').classList.toggle('on', !!h.controlled && h.controlled.isGoalie);
  }

  // Strafen unter dem Spielstand: Team, Nummer, Restzeit; Powerplay/Boxplay; Vorteil
  updatePenalties(m) {
    const parts = [];
    if (!m.shootout) {
      for (const t of m.teams) {
        for (const pen of t.penalties) {
          parts.push(`<span class="pen" style="--c:${t.data.colors.shirt}"><b>${t.data.short}</b> #${pen.player.data.number} ${pen.waiting ? 'wartet' : mmss(pen.remaining)}</span>`);
        }
      }
      const h = m.human;
      if (h) {
        const own = h.team.vacant.size, opp = m.other(h.team).vacant.size;
        if (own < opp) parts.unshift('<span class="pp">POWERPLAY</span>');
        else if (own > opp) parts.unshift('<span class="bp">BOXPLAY</span>');
        else if (own > 0) parts.unshift(`<span class="pp">${5 - own} gegen ${5 - opp}</span>`);
      }
      const pd = m.rules.pending;
      if (pd) parts.push(`<span class="adv">✋ Vorteil ${pd.victim.team.data.short}</span>`);
    }
    const key = parts.join('');
    if (key !== this._pensKey) { this.$('pens').innerHTML = key; this._pensKey = key; }
  }

  updateShootout(m) {
    const el = this.$('so-tally');
    const so = m.shootout;
    el.classList.toggle('hidden', !so);
    if (!so) return;
    const R = CONFIG.shootout.rounds;
    const row = i => {
      const k = so.kicks[i];
      const n = Math.max(R, k.length, so.kicks[i ^ 1].length);
      let dots = '';
      for (let j = 0; j < n; j++) dots += j < k.length ? (k[j] ? '<i class="hit">●</i>' : '<i class="miss">✕</i>') : '<i>○</i>';
      const t = m.teams[i];
      return `<div><b style="color:${t.data.colors.shirt}">${t.data.short}</b>${dots}</div>`;
    };
    const key = JSON.stringify(so.kicks);
    if (key !== this._soKey) { el.innerHTML = row(0) + row(1); this._soKey = key; }
  }
}
