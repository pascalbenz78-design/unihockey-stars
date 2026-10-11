// Anzeige während des Spiels: Spielstand, Uhr, Ausdauer der eigenen Linie,
// Meldungen (Tor, Drittel, Wechsel …).

const ROLE_LABEL = { C: 'C', LW: 'FL', RW: 'FR', LD: 'VL', RD: 'VR', G: 'G' };

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
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  setTeams(match) {
    const [a, b] = match.teams;
    this.$('hs-name').textContent = a.data.short;
    this.$('as-name').textContent = b.data.short;
    this.$('hs-sw').style.background = a.data.colors.shirt;
    this.$('as-sw').style.background = b.data.colors.shirt;
    this.$('lineinfo').classList.toggle('hidden', !match.human);
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
    this.$('clock').textContent = match.clockText();
    this.$('period').textContent = `${match.period}. Drittel`;
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.$('msg').className = ''; }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.$('toast').classList.remove('show'); }

    const h = match.human;
    if (!h) return;
    const t = h.team;
    const pend = t.pending.size > 0;
    this.$('linelabel').textContent = pend ? `Wechsel → Linie ${t.nextLine + 1}` : `Linie ${t.activeLine + 1}`;
    this.$('linelabel').classList.toggle('pending', pend);
    t.skaters.forEach((p, i) => {
      const r = this.staminaRows[i];
      r.role.textContent = ROLE_LABEL[p.role];
      r.num.textContent = p.data.number;
      const s = Math.round(p.stamina * 100);
      r.bar.style.width = s + '%';
      r.bar.style.background = s > 60 ? '#3ddc84' : s > 35 ? '#ffc93c' : '#ff5a4f';
      r.row.classList.toggle('ctl', p === h.controlled);
    });
    this.$('goalie-ind').classList.toggle('on', h.controlled.isGoalie);
  }
}
