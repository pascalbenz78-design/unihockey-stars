// Eigener Bestätigungsdialog (statt confirm(), das in manchen Umgebungen –
// z. B. als claude.ai-Artifact – nicht angezeigt wird).

export function ask(text, { ok = 'Ja', cancel = 'Abbrechen' } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">
      <p></p>
      <div class="menu-row"><button type="button" data-r="0">${cancel}</button><button type="button" class="primary" data-r="1">${ok}</button></div>
    </div>`;
    wrap.querySelector('p').textContent = text;
    const done = r => { wrap.remove(); resolve(r); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) { e.stopPropagation(); done(b.dataset.r === '1'); }
    });
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
  });
}
