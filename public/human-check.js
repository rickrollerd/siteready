// The check before a SWMS is downloaded or saved (Goal 12, D286), on the draft, on a saved SWMS and on
// each SWMS of a project:
//   1. SiteReady's own check runs once the list "Before you can download this SWMS" is clear: Builder
//      check on the draft as it prints (no AI). Only must-fix items block; the score and the other
//      findings show for the person to judge.
//   2. Then the parts unlock, and a named person ticks each one as checked (check-parts.js).
//   3. Then their name and role (both required); the date is set by the server; today's sentence is
//      the last tick.
// Each tick holds the fingerprint of its part as it was read. SiteReady checks the draft again as it
// changes, and a part that now prints differently is unticked, with a line saying so. The ticks are
// kept on this device, so a reload or Back keeps them while the parts are unchanged.
(() => {
  const S = window.SiteReady;
  const { esc } = S;
  const $ = (id) => document.getElementById(id);
  const P = () => window.SiteReadyCheckParts;
  const STORE = 'siteready.check';
  const NAME_KEY = 'siteready-reviewer';
  const ROLE_KEY = 'siteready-role';
  const WAIT_MS = 600;
  const KEEP = 40;

  const read = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
  const write = (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ } };
  const kept = () => { try { return JSON.parse(read(STORE) || '{}') || {}; } catch { return {}; } };

  // Each panel by its prefix ('new', 'saved'): what SiteReady's check found, the ticks with their
  // fingerprints, and what the page gives it.
  const panels = {};

  function keep(panel) {
    if (!panel.key) return;
    const all = kept();
    all[panel.key] = { ticks: panel.ticks, ack: panel.ack, at: Date.now() };
    // Only the latest few SWMS are kept.
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
    for (const old of keys.slice(KEEP)) delete all[old];
    write(STORE, JSON.stringify(all));
  }

  // The panel's HTML. verb: what the buttons do ("download or save", "mark it as checked").
  function html(prefix, { verb = 'download or save' } = {}) {
    const parts = P().PARTS;
    const name = read(NAME_KEY);
    const role = read(ROLE_KEY);
    return `<div class="human-check" id="${prefix}-check" data-check-panel="${prefix}">
      <h3>Check it before you ${esc(verb)}</h3>
      <p class="check-step"><strong>1. SiteReady's check</strong></p>
      <div id="${prefix}-check-self" class="check-self" role="status"></div>
      <fieldset id="${prefix}-check-parts" class="check-parts">
        <legend><strong>2. Tick each part once you have read it as it will print</strong></legend>
        ${parts.map((part) => `<label class="check"><input type="checkbox" id="${prefix}-part-${part.id}" data-check-part="${part.id}"><span>${esc(part.label)} <span class="meta">${esc(part.hint)}</span></span></label>`).join('')}
        <p class="warning hidden" id="${prefix}-check-stale" role="alert"></p>
      </fieldset>
      <p class="check-step"><strong>3. Who checked it</strong></p>
      <div class="field">
        <label for="${prefix}-name">Your name (printed on the SWMS)</label>
        <input id="${prefix}-name" type="text" autocomplete="name" maxlength="120" value="${esc(name)}">
      </div>
      <div class="field">
        <label for="${prefix}-role">Your role (printed on the SWMS)</label>
        <input id="${prefix}-role" type="text" autocomplete="organization-title" maxlength="120" placeholder="For example Supervisor or Director" value="${esc(role)}">
      </div>
      <p class="meta">The date is set by SiteReady when you ${esc(verb)}.</p>
      <label class="check"><input type="checkbox" id="${prefix}-confirm"><span>I understand this is a draft. My business will check it against the site, change it where needed, and approve it before it is used. <a href="/terms.html" target="_blank" rel="noopener">Terms of use</a></span></label>
    </div>`;
  }

  // What SiteReady's check says, above the ticks.
  function selfHtml(panel) {
    if (panel.locked) return `<p class="meta">${esc(panel.locked)}</p>`;
    if (panel.error) return `<p class="error">SiteReady could not check the draft just now. ${esc(panel.error)} <button type="button" class="link" data-check-again="${panel.prefix}">Try again</button></p>`;
    const result = panel.result;
    if (panel.pending || !result) return '<p class="meta">SiteReady is checking the draft…</p>';
    if (result.gate && result.gate.length) return '<p class="meta">SiteReady checks the draft once everything listed above is answered.</p>';
    const builder = result.builder;
    if (!builder) return '<p class="meta">SiteReady is checking the draft…</p>';
    const must = builder.mustFix || [];
    const others = builder.findings || [];
    return `<p><strong>${builder.score} out of 100</strong> (${esc(builder.band)}). ${must.length ? '' : 'Nothing must be fixed.'}</p>
      ${must.length ? `<div class="warning check-must"><p><strong>Fix ${must.length === 1 ? 'this' : `these ${must.length}`} before you can tick the parts:</strong></p><ul>${must.map((item) => `<li>${esc(item.message)}</li>`).join('')}</ul><p class="meta">Fix it on the page, and SiteReady checks the draft again.</p></div>` : ''}
      ${others.length ? `<details class="check-findings"><summary>Other findings (${others.length}), for you to judge</summary><ul>${others.map((item) => `<li>${esc(item.message)}</li>`).join('')}</ul></details>` : '<p class="meta">No other findings.</p>'}`;
  }

  const mustFix = (panel) => Boolean(panel.result && panel.result.builder && (panel.result.builder.mustFix || []).length);
  // The parts can be ticked once SiteReady's check is in and found nothing that must be fixed.
  const open = (panel) => Boolean(!panel.locked && !panel.pending && !panel.error && panel.result && panel.result.builder && !(panel.result.gate || []).length && !mustFix(panel));

  function draw(panel) {
    const self = $(`${panel.prefix}-check-self`);
    if (!self) return;
    const html = selfHtml(panel);
    if (self.innerHTML !== html) self.innerHTML = html;
    const unlocked = open(panel);
    for (const part of P().PARTS) {
      const box = $(`${panel.prefix}-part-${part.id}`);
      if (!box) continue;
      box.disabled = !unlocked;
      box.checked = Boolean(panel.ticks[part.id]);
    }
    const fields = $(`${panel.prefix}-check-parts`);
    if (fields) fields.classList.toggle('locked', !unlocked);
    const ack = $(`${panel.prefix}-confirm`);
    if (ack) ack.checked = Boolean(panel.ack);
    const stale = $(`${panel.prefix}-check-stale`);
    if (stale) {
      stale.textContent = panel.note || '';
      stale.classList.toggle('hidden', !panel.note);
    }
  }

  // A new result: each tick whose part now prints differently is cleared, and the page says so.
  function take(panel, result) {
    panel.result = result;
    const now = (result && result.partHashes) || {};
    const cleared = P().staleParts(panel.ticks, now);
    if (cleared.length) {
      for (const id of cleared) delete panel.ticks[id];
      panel.note = P().staleMessage(cleared);
      panel.noteParts = cleared;
      keep(panel);
    }
  }

  function changed(panel) {
    draw(panel);
    if (panel.onChange) panel.onChange();
    // Told only once SiteReady's check is in: while it runs, a check given before stands.
    if (!panel.result || panel.pending || panel.error || panel.locked) return;
    const done = status(panel.prefix).ready;
    if (panel.onDone && done !== panel.done) {
      panel.done = done;
      panel.onDone(done ? value(panel.prefix).check : null, panel.note);
    }
  }

  async function ask(panel) {
    const body = panel.body ? panel.body() : null;
    if (!body) return;
    const sent = JSON.stringify(body);
    if (sent === panel.sent && panel.result && !panel.error) { changed(panel); return; }
    panel.sent = sent;
    panel.pending = true;
    panel.error = '';
    changed(panel);
    const seq = (panel.seq || 0) + 1;
    panel.seq = seq;
    try {
      const result = await S.call('POST', '/api/draft/check', body);
      if (panel.seq !== seq) return;
      panel.pending = false;
      take(panel, result);
    } catch (error) {
      if (panel.seq !== seq) return;
      panel.pending = false;
      panel.sent = '';
      panel.error = error.noSignal || !error.status ? 'Check your signal.' : (error.message || '');
    }
    changed(panel);
  }

  // Called as the page changes: SiteReady's check runs again a moment after the last change.
  function refresh(prefix, { now = false } = {}) {
    const panel = panels[prefix];
    if (!panel || panel.initial) return;
    const locked = panel.lockedBy ? panel.lockedBy() : '';
    if (locked !== panel.locked) { panel.locked = locked; changed(panel); }
    if (locked) return;
    clearTimeout(panel.timer);
    panel.timer = setTimeout(() => ask(panel), now ? 0 : WAIT_MS);
  }

  // Sets up a drawn panel. options: key (which SWMS, for the ticks kept on this device), seed (a
  // check given before, such as a project SWMS's), initial (SiteReady's check already made, for a saved
  // SWMS), body () (what the draft prints from, sent to SiteReady's check), lockedBy () (why the check
  // waits, or ''), onChange () and onDone (check or null, note).
  function bind(prefix, options = {}) {
    const before = panels[prefix];
    const same = before && before.key === options.key;
    const stored = options.key ? kept()[options.key] : null;
    const seed = options.seed && options.seed.partHashes ? { ticks: { ...options.seed.partHashes }, ack: options.seed.ack === true } : null;
    const panel = {
      prefix,
      key: options.key || '',
      ticks: same ? before.ticks : { ...((seed || stored || {}).ticks || {}) },
      ack: same ? before.ack : Boolean((seed || stored || {}).ack),
      note: same ? before.note : '',
      noteParts: same ? before.noteParts : [],
      // A check still running for the panel before is asked again, as its answer goes to that panel.
      result: same && !options.initial && !before.pending ? before.result : null,
      sent: same && !options.initial && !before.pending ? before.sent : '',
      body: options.body || null,
      lockedBy: options.lockedBy || null,
      initial: Boolean(options.initial),
      onChange: options.onChange || null,
      onDone: options.onDone || null,
      done: undefined,
      locked: '',
    };
    if (before) clearTimeout(before.timer);
    panels[prefix] = panel;
    // The name and role: a project SWMS's own check, or as last typed on this device.
    for (const [what, key] of [['name', NAME_KEY], ['role', ROLE_KEY]]) {
      const box = $(`${prefix}-${what}`);
      const given = options.seed && options.seed[what];
      if (box && given) box.value = given;
      else if (box && !box.value) box.value = read(key);
    }
    if (options.initial) take(panel, options.initial);
    listen(prefix);
    changed(panel);
    if (!options.initial) refresh(prefix, { now: true });
    return panel;
  }

  // The ticks, the name, the role and the last box, as the person changes them. Each panel drawn is
  // new, so its boxes are listened to as it is bound.
  function listen(prefix) {
    const now = () => panels[prefix];
    for (const part of P().PARTS) {
      const box = $(`${prefix}-part-${part.id}`);
      if (!box) continue;
      box.addEventListener('change', () => {
        const panel = now();
        if (!panel) return;
        if (box.checked && open(panel)) panel.ticks[part.id] = panel.result.partHashes[part.id];
        else delete panel.ticks[part.id];
        // The line about parts to tick again goes once they are all ticked again.
        if ((panel.noteParts || []).every((id) => panel.ticks[id])) { panel.note = ''; panel.noteParts = []; }
        keep(panel);
        changed(panel);
      });
    }
    const ack = $(`${prefix}-confirm`);
    if (ack) ack.addEventListener('change', () => { const panel = now(); if (!panel) return; panel.ack = ack.checked; keep(panel); changed(panel); });
    // The name and role are kept on this device as they are typed, for the next SWMS and a reload.
    for (const [what, key] of [['name', NAME_KEY], ['role', ROLE_KEY]]) {
      const box = $(`${prefix}-${what}`);
      if (box) box.addEventListener('input', () => { write(key, box.value.replace(/\s+/g, ' ').trim()); const panel = now(); if (panel) changed(panel); });
    }
  }

  const joinWords = (words) => P().joinWords(words);

  // Whether the buttons can go, and if not, what they wait for (said beside them).
  function status(prefix, { verb = '' } = {}) {
    const panel = panels[prefix];
    if (!panel) return { ready: false, why: '' };
    if (panel.locked) return { ready: false, why: '' };
    if (panel.error) return { ready: false, why: 'SiteReady could not check the draft. Press Try again above.' };
    if (panel.pending || !panel.result) return { ready: false, why: 'SiteReady is checking the draft.' };
    if ((panel.result.gate || []).length) return { ready: false, why: '' };
    if (mustFix(panel)) return { ready: false, why: `Fix the must-fix ${panel.result.builder.mustFix.length === 1 ? 'item' : 'items'} SiteReady's check found above.` };
    const parts = P().PARTS;
    const left = parts.filter((part) => !panel.ticks[part.id]);
    const name = ($(`${prefix}-name`) || {}).value || '';
    const role = ($(`${prefix}-role`) || {}).value || '';
    const need = [];
    if (left.length) need.push(left.length === parts.length ? 'tick each part as checked' : left.length === 1 ? `tick ${left[0].label} as checked` : `tick the ${left.length} parts left as checked`);
    if (!name.trim()) need.push('give your name');
    if (!role.trim()) need.push('give your role');
    if (!panel.ack) need.push('tick the last box');
    const what = verb || (panel.initial ? 'mark it as checked' : 'download or save');
    return need.length ? { ready: false, why: `To ${what}, ${joinWords(need)}.` } : { ready: true, why: '' };
  }

  // What the buttons send: { check }. Throws with what is still needed.
  function value(prefix) {
    const panel = panels[prefix];
    const now = status(prefix);
    if (!now.ready) throw new Error(now.why || 'SiteReady\'s check waits for the items listed above.');
    const name = $(`${prefix}-name`).value.replace(/\s+/g, ' ').trim();
    const role = $(`${prefix}-role`).value.replace(/\s+/g, ' ').trim();
    write(NAME_KEY, name);
    write(ROLE_KEY, role);
    return { check: { parts: Object.fromEntries(P().IDS.map((id) => [id, true])), partHashes: { ...panel.ticks }, name, role, ack: true } };
  }

  // A refusal from the server: parts it found changed are unticked, and SiteReady checks again.
  function refused(prefix, error) {
    const panel = panels[prefix];
    if (!panel || !error) return;
    if (Array.isArray(error.stale) && error.stale.length) {
      for (const id of error.stale) delete panel.ticks[id];
      panel.note = P().staleMessage(error.stale);
      panel.noteParts = error.stale;
      panel.sent = '';
      keep(panel);
      if (!panel.initial) refresh(prefix, { now: true });
    }
    if (error.field === 'mustFix') { panel.sent = ''; if (!panel.initial) refresh(prefix, { now: true }); }
    changed(panel);
  }

  // A new SWMS starts with no ticks.
  function forget(prefix) {
    const panel = panels[prefix];
    if (!panel) return;
    if (panel.key) { const all = kept(); delete all[panel.key]; write(STORE, JSON.stringify(all)); }
    delete panels[prefix];
  }

  document.addEventListener('click', (event) => {
    const again = event.target && event.target.closest && event.target.closest('[data-check-again]');
    const panel = again && panels[again.dataset.checkAgain];
    if (panel) { panel.sent = ''; panel.error = ''; refresh(panel.prefix, { now: true }); }
  });

  S.humanCheck = { html, bind, refresh, status, value, refused, forget };
})();
