// From main contractors (Goal 12 stage 6): the SWMS lists the company took up from main contractors on
// SiteLink. "They log into their account and it is all there for them ready, they just need to check
// it." Each list opens the one-go project page (scope.js, project-go.js) with its SWMS listed, the
// builder's site details filled in above, and each marked "Set by {builder}". A detail the company
// changes is allowed, with a warning that names the builder (builder-set.js). The company's own
// details come from its profile. Seeing the lists is free; preparing the SWMS needs a trial or
// subscription (D286).
(() => {
  const S = window.SiteWrite;
  const { esc } = S;
  const $ = (id) => document.getElementById(id);
  const set = () => window.SiteWriteBuilderSet;

  // "Open the SWMS in SiteWrite" on the list page links to /?list={id}; the email's link for reminders
  // of My SWMS uses a hash. Only this page's own part of the address is taken off.
  const params = new URLSearchParams(window.location.search);
  let wanted = params.get('list') || '';
  let wantPanel = Boolean(wanted) || window.location.hash === '#from-builders';
  if (wanted) {
    params.delete('list');
    const rest = params.toString();
    history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  }

  let lists = [];
  let access = true;
  let loading = null;
  let note = '';

  function load() {
    loading = S.call('GET', '/api/from-builders').then((data) => {
      lists = data.lists || [];
      access = data.access !== false;
      return lists.length;
    }, () => lists.length);
    return loading;
  }

  const progressLine = (list) => {
    const p = list.progress || {};
    if (!p.started) return `${p.total === 1 ? 'One SWMS' : `${p.total} SWMS`} on the list. Not started yet.`;
    return `${p.total === 1 ? 'One SWMS' : `${p.total} SWMS`} on the list: ${p.prepared} prepared, ${p.checked} checked.${p.off ? ` ${p.off === 1 ? 'One' : p.off} taken off your list.` : ''}${p.own ? ` ${p.own === 1 ? 'One' : p.own} of your own.` : ''}${p.updatedOn ? ` Last saved on ${p.updatedOn}${p.updatedBy ? ` by ${p.updatedBy}` : ''}.` : ''}`;
  };

  function renderPanel() {
    const box = $('from-builders-list');
    if (!box) return;
    const said = note ? `<p class="warning" role="status">${esc(note)}</p>` : '';
    if (!lists.length) {
      box.innerHTML = `${said}<p class="meta">No lists from main contractors yet. When a main contractor sends you a SWMS list through SiteLink, take it up from the link in its email, and it shows here.</p>`;
      return;
    }
    box.innerHTML = `${said}${access ? '' : '<p class="warning">Your free trial has ended. Subscribe to prepare these SWMS in SiteWrite. Seeing the lists stays free. <button type="button" class="small" data-subscribe>Subscribe</button></p>'}
      <p class="meta">The SWMS main contractors need from your company. Each opens with its SWMS listed and the site details the main contractor set filled in. You check each one, change what you need, and download them.</p>
      <ul class="builder-lists">${lists.map((list) => `<li><div><strong>${esc(list.builder.name)}</strong>${list.builder.verified ? '' : ' <span class="pill">Unverified</span>'}<br>${esc(list.project.name)}, ${esc(list.project.workplace)}
        <span class="meta" style="display:block">For ${esc(list.subcontractor.name)}${list.subcontractor.trade ? ` (${esc(list.subcontractor.trade)})` : ''}.${list.due.shown ? ` Due ${esc(list.due.shown)}${list.due.past ? ', which has passed' : ''}.` : ''}</span>
        <span class="meta" style="display:block">${esc(progressLine(list))}</span></div>
        <button type="button"${access ? '' : ' class="secondary"'} data-list-open="${esc(list.id)}">${list.progress && list.progress.started ? 'Carry on' : 'Open the SWMS'}</button></li>`).join('')}</ul>
      <p class="error" id="from-builders-error" role="alert"></p>`;
  }

  async function open(id, button) {
    const said = $('from-builders-error');
    if (said) said.textContent = '';
    if (button) button.disabled = true;
    try {
      const data = await S.call('GET', `/api/from-builders/${encodeURIComponent(id)}`);
      if (!data.access) { if (said) said.textContent = data.message; return; }
      note = '';
      $('from-builders').classList.add('hidden');
      await S.openBuilderList(data);
    } catch (error) {
      if ($('from-builders-error')) $('from-builders-error').textContent = error.message;
      else { note = error.message; renderPanel(); }
    } finally {
      if (button) button.disabled = false;
    }
  }

  S.builderListsReady = () => loading || Promise.resolve(lists.length);
  S.builderBarLink = () => (lists.length ? `<button type="button" class="link" data-panel="from-builders">From main contractors (${lists.length})</button>` : '');
  S.loadBuilderLists = async () => { await load(); renderPanel(); if (S.renderBar) S.renderBar(); };
  S.builderListsSignedIn = async () => {
    await load();
    if (S.renderBar) S.renderBar();
    renderPanel();
    // The list kept on this device is brought up to date: another device of the company may have
    // saved since. One no longer the company's (released, or withdrawn) goes from this device.
    const local = S.builderListLocal && S.builderListLocal();
    if (local && !lists.some((list) => list.id === local)) {
      const name = S.dropBuilderList();
      note = `The list from ${name} is no longer linked to your company in SiteWrite, so it has gone from this page. If you think this is wrong, contact ${name}.`;
      renderPanel();
      wantPanel = true;
    } else if (local) {
      try {
        const data = await S.call('GET', `/api/from-builders/${encodeURIComponent(local)}`);
        if (data.access) S.syncBuilderList(data);
      } catch { /* the work on this device stays; it is saved when SiteWrite can be reached */ }
    }
    if (wanted) {
      const id = wanted;
      wanted = '';
      wantPanel = false;
      if (S.showPanel) S.showPanel('from-builders');
      await open(id);
      return;
    }
    if (wantPanel && S.showPanel) { wantPanel = false; S.showPanel('from-builders'); }
  };
  S.builderListsSignedOut = () => {
    lists = [];
    note = '';
    renderPanel();
    if (S.dropBuilderList) S.dropBuilderList();
  };

  document.addEventListener('click', (event) => {
    const go = event.target.closest && event.target.closest('[data-list-open]');
    if (go) { open(go.dataset.listOpen, go); return; }
    // "Use {builder}'s": the detail the builder set goes back in its box.
    const use = event.target.closest && event.target.closest('[data-set-by-use]');
    if (use) {
      const info = S.builderInfo && S.builderInfo();
      const field = set() && set().fieldOf(use.dataset.setByUse);
      const given = info && field && info.builderSet[field.key];
      const el = field && $(field.field);
      if (!given || !el) return;
      el.value = given.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.focus();
    }
  });

  // ---- "Set by {builder}" under each detail the builder set ----

  // Where a box's note goes: under the box, or under the box holding it and its list.
  const holderOf = (el) => (el.parentElement && el.parentElement.classList.contains('address-box') ? el.parentElement : el);
  S.drawSetBy = () => {
    const info = S.builderInfo && S.builderInfo();
    const rules = set();
    if (!info || !rules) {
      document.querySelectorAll('.set-by').forEach((el) => el.remove());
      document.body.classList.remove('from-builder');
      return;
    }
    const name = info.builder.name;
    const raw = S.payload ? S.payload() : {};
    // An empty first aid location or site rules box is an answer here: emptied, it is a change.
    const now = { ...raw, firstAidLocation: raw.firstAidLocation || '', siteRules: raw.siteRules || [] };
    for (const field of rules.FIELDS) {
      const el = $(field.field);
      if (!el) continue;
      const id = `set-by-${field.field}`;
      let line = $(id);
      const given = info.builderSet && info.builderSet[field.key];
      if (!given) { if (line) line.remove(); continue; }
      const changed = !rules.same(field, now[field.key], given.value);
      const html = changed
        ? `${esc(rules.changedWarning(name, given.value))} <button type="button" class="link" data-set-by-use="${esc(field.key)}">Use ${esc(name)}'s</button>`
        : `Set by ${esc(name)}${field.key === 'hospital' ? ': the hospital or medical centre arranged for this project' : ''}.`;
      if (!line) {
        line = document.createElement('p');
        line.id = id;
        line.setAttribute('role', 'status');
        holderOf(el).after(line);
      }
      const kind = changed ? 'warning set-by set-by-changed' : 'meta set-by';
      if (line.className !== kind) line.className = kind;
      if (line.innerHTML !== html) line.innerHTML = html;
    }
    // Said once at the top of the list too, with a button to each detail changed.
    const box = $('list-overrides');
    if (box) {
      const changed = rules.overridesOf(info.builderSet, now);
      const html = changed.length ? `<p class="warning"><strong>You changed ${changed.length === 1 ? 'a detail' : `${changed.length} details`} ${esc(name)} set:</strong> ${changed.map((item) => `<button type="button" class="link" data-go-field="${esc(rules.fieldOf(item.key).field)}">${esc(item.label.toLowerCase())}</button>`).join(', ')}. ${esc(name)} will see ${changed.length === 1 ? 'this change' : 'these changes'} when you submit.</p>` : '';
      if (box.innerHTML !== html) box.innerHTML = html;
    }
  };
  // Drawn again each time the list's page is drawn.
  const panel = $('project-panel');
  if (panel && window.MutationObserver) new MutationObserver(() => { if (S.builderInfo && S.builderInfo() && $('list-overrides') && !$('list-overrides').dataset.drawn) { $('list-overrides').dataset.drawn = '1'; S.drawSetBy(); } }).observe(panel, { childList: true });
  if (S.builderInfo && S.builderInfo()) S.drawSetBy();
  // Opened from the list page or a link while signed out: the sign-in box says what it is for.
  if (S.accountReady) {
    S.accountReady.then(() => {
      if (!(wanted || wantPanel) || !S.accountsOn || !S.accountsOn() || (S.signedIn && S.signedIn())) return;
      const box = $('signin');
      const status = $('signin-status');
      if (!box || !status) return;
      box.classList.remove('hidden');
      status.textContent = 'Sign in to see the SWMS lists from main contractors.';
      status.classList.remove('hidden');
      box.scrollIntoView({ block: 'start' });
    });
  }
})();
