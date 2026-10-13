// Start from a scope of works: the scope is attached or pasted, the server lists
// the tasks in it that need a SWMS, and a picked task fills in the form.
(() => {
  const S = window.SiteReady;
  const { api, esc } = S;
  const $ = (id) => document.getElementById(id);

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
  }

  // A package's high risk construction work, in the words the list and the report share.
  const hrcwOf = (flag) => (flag && window.SiteReadyHrcw ? window.SiteReadyHrcw.hrcwSummary(flag) : null);
  const hrcwText = (summary) => `<strong>${esc(summary.heading)}.</strong> ${summary.lines.map((line) => esc(/[.]$/.test(line) ? line : `${line}.`)).join(' ')}`;

  // A file can also be dragged onto the panel. Dropping it anywhere on the panel is caught,
  // so the browser does not open the file in place of SiteReady.
  let dropped = null;
  const drop = $('scope-drop');
  const panel = $('scope-panel');
  const ACCEPTED = /\.(docx|pdf|txt)$/i;
  ['dragenter', 'dragover'].forEach((type) => panel.addEventListener(type, (event) => {
    if (!event.dataTransfer || ![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    drop.classList.add('over');
  }));
  ['dragleave', 'dragend'].forEach((type) => panel.addEventListener(type, (event) => {
    if (!panel.contains(event.relatedTarget)) drop.classList.remove('over');
  }));
  panel.addEventListener('drop', (event) => {
    if (!event.dataTransfer || !event.dataTransfer.files.length) return;
    event.preventDefault();
    drop.classList.remove('over');
    const file = event.dataTransfer.files[0];
    $('scope-error').textContent = '';
    if (!ACCEPTED.test(file.name)) {
      $('scope-error').textContent = 'Drop a Word (.docx), PDF or text file.';
      return;
    }
    dropped = file;
    $('scope-file').value = '';
    $('scope-drop-note').textContent = `${file.name} is attached. Press "Find the tasks that need a SWMS" to read it.`;
    $('scope-file-clear').classList.remove('hidden');
  });
  $('scope-file').addEventListener('change', () => {
    dropped = null;
    $('scope-drop-note').textContent = 'or drag the file here';
    $('scope-file-clear').classList.toggle('hidden', !$('scope-file').files.length);
  });
  // A wrong file is taken off, with the tasks read from it.
  $('scope-file-clear').addEventListener('click', () => {
    dropped = null;
    $('scope-file').value = '';
    $('scope-drop-note').textContent = 'or drag the file here';
    $('scope-file-clear').classList.add('hidden');
    $('scope-error').textContent = '';
    $('scope-results').innerHTML = '';
  });

  $('scope-read').addEventListener('click', async () => {
    const button = $('scope-read');
    $('scope-error').textContent = '';
    const file = dropped || $('scope-file').files[0];
    const text = $('scope-text').value.trim();
    if (!file && !text) {
      $('scope-error').textContent = 'Attach the scope or paste it first.';
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      $('scope-error').textContent = 'The file is too large. Attach the scope only, or paste it.';
      return;
    }
    // A new scope starts a new project: the one in progress is closed first, with the user's OK.
    if (project && !closeProject(`You have a project in progress (${project.items.filter((item) => item.status === 'ready').length} of ${project.items.length} SWMS ready). Reading a new scope closes it, and SWMS you have not downloaded or saved will need preparing again. Read the new scope?`)) return;
    // The chime when the reading is finished may only play after a press on the page: set it up now.
    if (window.SiteReadyProgress) window.SiteReadyProgress.unlockAudio();
    button.disabled = true;
    try {
      const state = (document.querySelector('input[name="state"]:checked') || {}).value || '';
      const body = file ? { file: { name: file.name, data: await readFile(file) }, state } : { text, state };
      // Owner decision, 7 October 2026: reading a scope needs an account, and the AI reads every
      // scope. Signed out, the scope is kept and read once the user signs in.
      if (!S.signedIn || !S.signedIn()) { await askToSignIn(body); return; }
      await readScope(body);
    } catch (error) {
      $('scope-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const TYPE_TASKS = 'Or write the tasks in the Task box below.';

  // Owner decision, 7 October 2026: SiteReady's keyword quick read is no longer used on this page.
  // When the AI is off or fails, the page says so and the user tries again later or types the tasks.
  async function readScope(body) {
    if (!(await aiOn())) {
      $('scope-results').innerHTML = `<p class="note">The AI reading of scopes is not switched on just now. Try again later. ${TYPE_TASKS}</p>`;
      return;
    }
    await readWithAi(body);
  }

  // A scope given before signing in waits in this browser until the user signs in, even when the
  // sign-in link opens in a new tab. It is kept in IndexedDB, which holds a large file.
  let waiting = null;
  function keptScope(mode, use) {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const open = indexedDB.open('siteready', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('kept');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const tx = open.result.transaction('kept', mode);
          const request = use(tx.objectStore('kept'));
          tx.oncomplete = () => resolve(request.result === undefined ? null : request.result);
          tx.onerror = () => resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }
  const keepScope = (body) => keptScope('readwrite', (store) => store.put(body, 'scope'));
  const takeScope = async () => {
    const body = waiting || await keptScope('readonly', (store) => store.get('scope'));
    waiting = null;
    if (body) await keptScope('readwrite', (store) => store.delete('scope'));
    return body;
  };

  async function askToSignIn(body) {
    if (S.accountsOn && !S.accountsOn()) {
      $('scope-results').innerHTML = `<p class="note">Reading a scope needs an account, and accounts are not switched on here. Write the tasks in the Task box below.</p>`;
      return;
    }
    waiting = body;
    await keepScope(body);
    $('scope-results').innerHTML = `<p class="note">Sign in, or start the free trial, to have the AI read this scope. It reads every word, including tables and appendices. Once you are signed in, the reading starts on its own. For one task, write the work in the Task box below instead.</p>
      <div class="actions"><button type="button" data-open="signin">Sign in or start free trial</button></div>`;
  }

  // Called by account.js once the user is signed in: a scope given while signed out is read now, and a
  // reading still running when the page was left or reloaded is picked up again.
  S.onSignedIn = async () => {
    const body = await takeScope();
    if (!body) { await resumeReading(); return; }
    $('scope-panel').open = true;
    $('scope-error').textContent = '';
    $('scope-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      await readScope(body);
    } catch (error) {
      $('scope-error').textContent = error.message;
    }
  };

  // The AI reading (Claude Opus 5.5 with the owner's brief), for signed-in accounts when it is
  // switched on. It reads every word, so it takes a few minutes; the page asks for it until done.
  let aiStatus = false;
  async function aiOn() {
    if (!S.signedIn || !S.signedIn() || !S.call) return false;
    // Asked again until it is on, so "try again later" works without reloading the page.
    if (!aiStatus) {
      try { aiStatus = Boolean((await (await fetch(api('/api/scope/ai'))).json()).enabled); } catch { aiStatus = false; }
    }
    return aiStatus;
  }
  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  // A reading still running is kept in this browser by its id, so the page picks it up again when the
  // user comes back after it was closed or reloaded (a phone often reloads a page left in the background).
  const READING_KEY = 'siteready-scope-reading';
  const keepReading = (value) => { try { if (value) localStorage.setItem(READING_KEY, JSON.stringify(value)); else localStorage.removeItem(READING_KEY); } catch { /* not kept */ } };
  const keptReading = () => { try { return JSON.parse(localStorage.getItem(READING_KEY) || 'null'); } catch { return null; } };
  let running = false;
  async function resumeReading() {
    const kept = keptReading();
    if (!kept || !kept.id || running || !S.signedIn || !S.signedIn() || !S.call) return;
    $('scope-panel').open = true;
    $('scope-error').textContent = '';
    $('scope-read').disabled = true;
    try {
      await readWithAi({ state: kept.state || '' }, kept.id);
    } catch (error) {
      keepReading(null);
      // A reading that is gone (or another account's) is forgotten without a word; its bar goes too.
      if (error.status === 404) $('scope-results').innerHTML = '';
      else $('scope-error').textContent = error.message;
    } finally {
      $('scope-read').disabled = false;
    }
  }

  // The bar shown while the AI reads (read-progress.js): its stage and time from the server.
  const LEAD = 'The AI is reading every word of the scope, including tables and appendices.';
  function progressBar(reading) {
    const RP = window.SiteReadyProgress;
    if (!RP) return null;
    const tracker = RP.track({ what: 'scope', lead: LEAD, steps: ['reading every word of the scope', 'matching each work package to SiteReady\'s job steps'] });
    tracker.update(reading.progress);
    $('scope-results').innerHTML = tracker.html();
    return tracker;
  }

  async function readWithAi(body, resumeId) {
    running = true;
    let tracker = null;
    try {
      let reading;
      if (resumeId) {
        reading = await S.call('GET', `/api/scope/ai/${encodeURIComponent(resumeId)}?state=${encodeURIComponent(body.state || '')}`);
      } else {
        $('scope-results').innerHTML = `<p class="note" aria-live="polite">${LEAD} This usually takes a few minutes. You can leave this page open and come back.</p>`;
        reading = await S.call('POST', '/api/scope/ai', body);
      }
      // Kept from before and already read: shown at once, with no bar and no message.
      const waited = Boolean(resumeId) || reading.status === 'reading';
      if (reading.status === 'reading') {
        keepReading({ id: reading.id, state: body.state || '' });
        tracker = progressBar(reading);
      }
      const started = Date.now();
      while (reading.status === 'reading') {
        if (Date.now() - started > 20 * 60 * 1000) throw new Error(`The AI reading is taking too long. Try again later. ${TYPE_TASKS}`);
        await wait(10000);
        // The state picked on the form names the high risk construction work in each package.
        reading = await S.call('GET', `/api/scope/ai/${encodeURIComponent(reading.id)}?state=${encodeURIComponent(body.state || '')}`);
        if (tracker && reading.status === 'reading') tracker.update(reading.progress);
      }
      keepReading(null);
      if (reading.status !== 'done') {
        if (tracker) tracker.fail();
        $('scope-results').innerHTML = `${tracker ? tracker.html() : ''}<p class="note">${esc(reading.error || 'The AI reading failed. Try again later.')} ${TYPE_TASKS}</p>`;
        return;
      }
      if (tracker) tracker.finish();
      showPackages(reading, null, waited);
    } catch (error) {
      // The bar stops where it was; the error shows as before. Refused at the start (a trial ended),
      // the "reading" note goes.
      if (tracker) { tracker.fail(); $('scope-results').innerHTML = tracker.html(); } else $('scope-results').innerHTML = '';
      throw error;
    } finally {
      running = false;
    }
  }

  // The AI's work packages, chosen once (owner testing, 13 October 2026: "I selected the swms I
  // wanted form the ai read, then this page pops up and ask me to select again"). Each ticked package
  // becomes one SWMS in the project straight away, with its scope review answers. Duties (supervision,
  // records, tickets) are listed apart, as they need no SWMS. Cranage is ticked only where our company
  // runs the crane or the scope gives us the cranage (item 9).
  let aiReading = null;
  let choice = null;
  const C = () => window.SiteReadyScopeChoice;
  // Each package's high risk construction work, worked out on the server by the SWMS's own rules.
  const flagsOf = (reading) => new Map((reading.highRisk || []).map((item) => [item.package, item]));
  // Unanswered until the user answers: no crane company is assumed (messy-user test, 14 October 2026).
  const craneNow = () => (document.querySelector('input[name="crane"]:checked') || {}).value || '';
  const slingingNow = () => (document.querySelector('input[name="slinging"]:checked') || {}).value || '';
  const CRANE_CHOICES = [['none', 'No crane'], ['company', 'A crane company'], ['own', 'Our company']];
  // D258: with a crane company, who slings the loads and directs the crane.
  const SLINGING_CHOICES = [['crane', 'Crane company\'s dogman'], ['ours', 'Our crew']];

  function packageCard(pack, index) {
    const flags = flagsOf(aiReading.reading);
    const cranage = C().isCranage(pack.name);
    const offer = cranage ? C().cranageOffer(choice.crane, choice.clause) : null;
    const on = choice.ticked.has(pack.name);
    const full = !offer || offer.full || on;
    const summary = full ? hrcwOf(flags.get(pack.name)) : null;
    const mapped = (aiReading.reading.packages || []).find((item) => item.package === pack.name);
    const count = `${pack.rows.length} ${pack.rows.length === 1 ? 'activity' : 'activities'}`;
    // Asked once, on the first cranage package.
    const first = cranage && C().packagesOf(aiReading.reading).work.findIndex((item) => C().isCranage(item.name)) === index;
    const slinging = first && choice.crane === 'company' ? `<fieldset class="scope-others scope-slinging"><legend>Who slings the loads and directs the crane?</legend>${SLINGING_CHOICES.map(([value, label]) => `<label><input type="radio" name="scope-slinging" value="${value}" ${choice.slinging === value ? 'checked' : ''}> ${label}</label>`).join(' ')}</fieldset>` : '';
    const question = first ? `<fieldset class="scope-others scope-crane"><legend>Is a crane used, and who operates it?</legend>${CRANE_CHOICES.map(([value, label]) => `<label><input type="radio" name="scope-crane" value="${value}" ${choice.crane === value ? 'checked' : ''}> ${label}</label>`).join(' ')}</fieldset>${slinging}` : '';
    const name = offer && !offer.full ? `${esc(C().CRANAGE_TICK)}</strong> <span class="meta">(${esc(pack.name)}: ${count})</span>` : `${esc(pack.name)}</strong> <span class="meta">(${count})</span>`;
    const others = full ? ((mapped && mapped.byOthers) || []).map((entry, j) => {
      const yes = (choice.answers[pack.name] || {})[entry.step] === 'yes';
      return `<fieldset class="scope-others"><legend>Scope review: ${esc(entry.step.toLowerCase())} by others</legend><p class="meta">${esc(entry.says)}${entry.clause ? ` (${esc(entry.clause)})` : ''} Do you need this in your SWMS?</p><label><input type="radio" name="others-${index}-${j}" data-others="${index}" data-step="${esc(entry.step)}" value="no" ${yes ? '' : 'checked'}> No, leave it out</label> <label><input type="radio" name="others-${index}-${j}" data-others="${index}" data-step="${esc(entry.step)}" value="yes" ${yes ? 'checked' : ''}> Yes, our crew does some of it</label></fieldset>`;
    }).join('') : '';
    const clauses = full ? `<button type="button" class="small secondary" data-scope-clauses="${index}" aria-expanded="false">Show scope clauses</button><div class="scope-clauses hidden" id="scope-clauses-${index}">${pack.rows.map((row) => `<p><strong>${esc(row.activity)}</strong>${row.clause ? ` <span class="meta">${esc(row.clause)}${row.matrixColumn ? `, ${esc(row.matrixColumn)}` : ''}</span>` : ''}</p>${(row.quotes || []).map((quote) => `<blockquote>${esc(quote)}</blockquote>`).join('')}`).join('')}</div>` : '';
    return `<div class="scope-package${on ? '' : ' off'}" id="scope-package-${index}">${question}
      <label class="scope-package-tick"><input type="checkbox" data-package="${index}" ${on ? 'checked' : ''}> <strong>${name}</label>
      ${offer && offer.note ? `<p class="meta scope-crane-note">${esc(offer.note)}</p>` : ''}
      ${summary ? `<span class="scope-hrcw scope-hrcw-${summary.status}">${hrcwText(summary)}</span>` : ''}
      ${full ? `<span class="meta scope-package-list">${pack.rows.map((row) => esc(row.activity)).join('; ')}</span>` : ''}
      ${others}${clauses}</div>`;
  }

  function prepareButton() {
    const count = choice.ticked.size;
    return count === 1 ? 'Prepare this SWMS' : `Prepare these ${count} SWMS`;
  }

  // kept: the choice made before, when the user comes back to change it. waited: the user waited for
  // the reading, so a message says it is finished.
  function showPackages(reading, kept = null, waited = false) {
    aiReading = reading;
    const { work, duties } = C().packagesOf(reading.reading);
    const checks = reading.checks || {};
    const warn = checks.passed === false ? `<p class="note">Some of the AI's quotes could not be matched word for word to the document (${(checks.quotesNotFound || []).length + (checks.quotesShortened || []).length}). Check those tasks against the scope.</p>` : '';
    const conflicts = reading.reading.conflicts || [];
    const flags = flagsOf(reading.reading);
    const note = flags.size && window.SiteReadyHrcw ? ` ${esc(window.SiteReadyHrcw.HRCW_NOTE)}` : '';
    const clause = C().craneClause(reading.reading);
    const crane = kept ? kept.crane : craneNow();
    const offer = C().cranageOffer(crane, clause);
    choice = {
      crane,
      slinging: kept ? kept.slinging || '' : slingingNow(),
      clause,
      answers: kept ? { ...kept.answers } : {},
      ticked: new Set(kept ? kept.chosen : work.filter((pack) => !C().isCranage(pack.name) || offer.ticked).map((pack) => pack.name)),
    };
    $('scope-results').innerHTML = `${warn}<p class="meta" style="margin-top:10px">The AI found ${work.reduce((sum, pack) => sum + pack.rows.length, 0)} activities in ${work.length} work packages${duties.length ? `, and ${duties.length} ${duties.length === 1 ? 'duty' : 'duties'}` : ''}. Each ticked package becomes one SWMS. Untick any you do not need, then press the Prepare button at the bottom.${note}</p>
      <div class="scope-packages">${work.map((pack, index) => packageCard(pack, index)).join('')}</div>
      ${duties.length ? `<details class="scope-duties"><summary>${duties.length} ${duties.length === 1 ? 'duty' : 'duties'} in the scope: no SWMS needed</summary><ul>${duties.map((row) => `<li>${esc(row.activity)}</li>`).join('')}</ul></details>` : ''}
      ${conflicts.length ? `<details class="scope-conflicts"><summary>${conflicts.length} possible ${conflicts.length === 1 ? 'conflict' : 'conflicts'} in the scope</summary><ul>${conflicts.map((item) => `<li><strong>${esc(item.clauseA)} and ${esc(item.clauseB)}</strong> (${esc(item.confidence)} confidence): ${esc(item.why)}</li>`).join('')}</ul><button type="button" class="small secondary" id="conflict-open">Show the conflicts in full</button></details>` : ''}
      <div class="actions scope-go"><button type="button" id="scope-confirm">${prepareButton()}</button></div>
      <p class="error" id="scope-choice-error" role="alert"></p>
      <p class="meta">Fill in the site details once. SiteReady then takes you through each SWMS in turn, and you can download them all together.</p>
      <div class="actions"><button type="button" class="secondary" data-scope-report>Scope review report (Word)</button></div>
      <p class="error" id="scope-report-error"></p>`;
    // After a wait, a message says the reading is finished (with a chime), then any conflicts show.
    // Coming back to change the choice shows neither again.
    if (kept) return;
    if (waited && window.SiteReadyProgress) announceRead(work, () => showConflicts(conflicts));
    else showConflicts(conflicts);
  }

  // Owner, 13 October 2026: a message pops up with a chime when the AI has finished, and its button
  // takes the user to the work packages to choose from.
  function announceRead(packages, after) {
    const any = packages.length > 0;
    window.SiteReadyProgress.announce({
      heading: 'The scope has been read',
      text: any ? 'The AI has finished reading the scope. Choose the SWMS you need.' : 'The AI has finished reading the scope. It found no work packages in it.',
      button: any ? 'Choose the SWMS' : 'Show the result',
      tab: 'scope read',
      go: () => {
        const list = document.querySelector('.scope-packages') || $('scope-results');
        if (list && list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const first = document.querySelector('[data-package]');
        if (first && first.focus) first.focus({ preventScroll: true });
      },
      after,
    });
  }

  // Ticks, the crane answer and the scope review answers are kept as they change. A new crane
  // answer redraws the cranage package, ticked or not as that answer offers it.
  $('scope-results').addEventListener('change', (event) => {
    if (!choice || !aiReading) return;
    const { work } = C().packagesOf(aiReading.reading);
    const target = event.target;
    if (target.name === 'scope-slinging') {
      choice.slinging = target.value;
    } else if (target.name === 'scope-crane') {
      choice.crane = target.value;
      const ticked = C().cranageOffer(choice.crane, choice.clause).ticked;
      work.forEach((pack, index) => {
        if (!C().isCranage(pack.name)) return;
        if (ticked) choice.ticked.add(pack.name); else choice.ticked.delete(pack.name);
        redrawCard(work, index, 'input[name="scope-crane"]:checked');
      });
    } else if (target.dataset && target.dataset.package !== undefined) {
      const index = Number(target.dataset.package);
      const pack = work[index];
      if (target.checked) choice.ticked.add(pack.name); else choice.ticked.delete(pack.name);
      // The cranage tick opens the package in full once it is wanted.
      if (C().isCranage(pack.name)) redrawCard(work, index, `[data-package="${index}"]`); else $(`scope-package-${index}`).classList.toggle('off', !target.checked);
    } else if (target.dataset && target.dataset.others !== undefined) {
      const pack = work[Number(target.dataset.others)];
      choice.answers[pack.name] = { ...(choice.answers[pack.name] || {}), [target.dataset.step]: target.value };
    } else return;
    $('scope-choice-error').textContent = '';
    $('scope-confirm').textContent = prepareButton();
  });
  function redrawCard(work, index, focus) {
    const card = $(`scope-package-${index}`);
    card.outerHTML = packageCard(work[index], index);
    const back = document.querySelector(`#scope-package-${index} ${focus}`);
    if (back) back.focus();
  }

  // Conflicts in the scope open a pop-up. It is not modal, so the tasks can still be used.
  function showConflicts(conflicts) {
    const old = $('conflict-dialog');
    if (old) old.remove();
    const html = window.SiteReadyConflicts ? window.SiteReadyConflicts.conflictDialog(conflicts) : '';
    if (!html) return;
    document.body.insertAdjacentHTML('beforeend', html);
    const dialog = $('conflict-dialog');
    if (typeof dialog.show === 'function') dialog.show(); else dialog.setAttribute('open', '');
    $('conflict-dialog-title').focus();
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeConflicts(); });
  }
  function closeConflicts() {
    const dialog = $('conflict-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    const back = $('conflict-open') || $('scope-confirm');
    if (back) back.focus();
  }
  async function downloadReport(button) {
    if (!aiReading) return;
    const error = $('scope-report-error');
    if (error) error.textContent = '';
    button.disabled = true;
    try {
      await S.download(`/api/scope/ai/${encodeURIComponent(aiReading.id)}/report.docx?state=${encodeURIComponent(aiReading.state || '')}`, 'Scope-review-report.docx');
    } catch (problem) {
      if (error) error.textContent = problem.message; else alert(problem.message);
    } finally {
      button.disabled = false;
    }
  }
  // The packages ticked go straight into the project as its SWMS, one each.
  function confirmPackages() {
    const { work } = C().packagesOf(aiReading.reading);
    const chosen = work.filter((pack) => choice.ticked.has(pack.name)).map((pack) => pack.name);
    if (!chosen.length) { $('scope-choice-error').textContent = 'Tick at least one work package.'; return; }
    $('scope-choice-error').textContent = '';
    // Who runs the crane is asked on the list only where there is cranage; it then holds for every SWMS.
    const crane = work.some((pack) => C().isCranage(pack.name)) ? choice.crane : '';
    const slinging = crane === 'company' ? choice.slinging || '' : '';
    const items = C().projectItems(aiReading.reading, chosen, { answers: choice.answers, crane, slinging });
    startProject(items, { readingId: aiReading.id, state: aiReading.state || '', chosen, answers: choice.answers, crane, slinging });
  }

  $('scope-results').addEventListener('click', (event) => {
    if (event.target.closest('#scope-confirm')) { confirmPackages(); return; }
    const clauses = event.target.closest('[data-scope-clauses]');
    if (clauses) {
      const box = $(`scope-clauses-${clauses.dataset.scopeClauses}`);
      const open = box.classList.toggle('hidden') === false;
      clauses.textContent = open ? 'Hide scope clauses' : 'Show scope clauses';
      clauses.setAttribute('aria-expanded', String(open));
    }
  });

  // The scope task's name goes once the task is replaced with the user's own.
  $('task').addEventListener('input', () => {
    const taskEl = $('task');
    if (taskEl.dataset.preset && !taskEl.value.trim()) $('task-from').classList.add('hidden');
  });

  function useTask(item, label = '') {
    const taskEl = $('task');
    // One sentence to a line, so the task can be read and checked.
    const text = item.task.replace(/([.;])\s+(?=[A-Z(])/g, '$1\n');
    taskEl.value = text;
    const from = $('task-from');
    if (from) {
      from.textContent = label || `From the scope: ${item.title}`;
      from.classList.remove('hidden');
    }
    // A new task starts from SiteReady's steps, order, controls and PPE again, as a new SWMS.
    if (S.newSwms) S.newSwms();
    taskEl.dispatchEvent(new Event('input', { bubbles: true }));
    taskEl.dataset.preset = text;
    $('task-trade').value = item.trade || '';
    // The pick list shows the trade and task that match a SWMS from the scope; the task keeps the scope's words.
    if (S.showPick) S.showPick(item.pick || null);
    // Who runs the crane, as answered on the scope's list of work packages.
    // Unanswered there, the start form asks it where the task names a crane.
    document.querySelectorAll('input[name="crane"], input[name="slinging"]').forEach((input) => { input.checked = false; });
    const crane = item.crane && document.querySelector(`input[name="crane"][value="${item.crane}"]`);
    if (crane) crane.checked = true;
    const slinging = item.slinging && document.querySelector(`input[name="slinging"][value="${item.slinging}"]`);
    if (slinging) slinging.checked = true;
    if (crane) crane.dispatchEvent(new Event('change', { bubbles: true }));
    // The scope reader's steps for this task are ticked when the task is used as it stands.
    window.siteReadyScopeTask = { task: text, kinds: item.kinds || null, leaveOut: item.leaveOut || null, unmatched: item.unmatched || null, scope: item.scopeTask || null };
    document.querySelectorAll('input[name="fallRisk"]').forEach((input) => { input.checked = input.value === item.fallRisk; });
    document.querySelector('input[name="fallRisk"]').dispatchEvent(new Event('change', { bubbles: true }));
    // In a project, openItem moves the page once the project box is drawn.
    if (!label) $('start').scrollIntoView({ behavior: 'smooth', block: 'start' });
    taskEl.focus({ preventScroll: true });
  }

  // A project: every task from the scope, each prepared in turn with the same site details.
  const PROJECT_KEY = 'siteready.project';
  let project = null;
  const saveProject = () => { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); } catch { /* not kept */ } };
  try { project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); } catch { project = null; }

  // from: the reading and the choice the project was made from, so the choice can be changed.
  // Changed, the SWMS already started for packages still chosen are kept as they are.
  function startProject(items, from) {
    const same = project && project.from && project.from.readingId === from.readingId;
    if (same) {
      const dropped = project.items.filter((item) => item.body && !from.chosen.includes(item.title));
      if (dropped.length && !confirm(`Take out ${dropped.map((item) => item.title).join(', ')}? What you prepared for ${dropped.length === 1 ? 'it' : 'them'} will be lost.`)) return;
      items = items.map((item) => project.items.find((old) => old.title === item.title && old.body) || item);
    } else if (project && project.items.some((item) => item.body) && !confirm('Start a new project? The SWMS prepared in the current project will be cleared.')) return;
    // Owner, 13 October 2026 (D239): the SWMS chosen are prepared in one go. The site details are
    // asked once, then one page holds each SWMS's own questions (project-go.js), and one button
    // prepares them all. Answers kept from before stay.
    const before = same ? project : null;
    project = { current: 0, items, from, stage: items.every((item) => item.body) ? 'review' : 'questions', shared: (before && before.shared) || { crane: from.crane || '', site: null, designs: {}, emergency: {} } };
    saveProject();
    // The list has done its job; closing it keeps the page short.
    $('scope-panel').open = false;
    renderProject();
    requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
  }

  // The SWMS form (task, questions and draft) shows only while one SWMS is open to check. On the
  // one-go page and the review list it is out of the way.
  function showSingle(on) {
    ['start', 'facts', 'result', 'check-bar'].forEach((id) => { const el = $(id); if (el && !on) el.classList.add('hidden'); });
    if (on) $('start').classList.remove('hidden');
  }

  // Back to the list of work packages, with the choice as it was made.
  async function changeChoice() {
    const from = project && project.from;
    if (!from) return;
    $('project-error').textContent = '';
    try {
      const reading = aiReading && aiReading.id === from.readingId ? aiReading
        : await S.call('GET', `/api/scope/ai/${encodeURIComponent(from.readingId)}?state=${encodeURIComponent(from.state || '')}`);
      if (!reading || reading.status !== 'done') throw new Error('The scope reading could not be opened again. Read the scope again to change the SWMS chosen.');
      $('scope-panel').open = true;
      showPackages(reading, from);
      $('scope-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = document.querySelector('[data-package]');
      if (first) first.focus({ preventScroll: true });
    } catch (error) {
      $('project-error').textContent = error.message;
    }
  }

  function openItem(index) {
    if (!project || !project.items[index]) return;
    project.current = index;
    // From the one-go page or the review list, a SWMS opens to be checked (D240).
    if (project.stage) project.stage = 'check';
    project.items[index].checked = true;
    showSingle(true);
    // Answers to the emergency questions given in another SWMS of the project fill the same questions here.
    const shared = (project.shared && project.shared.emergency) || {};
    if (project.items[index].body && Object.keys(shared).length) project.items[index].body = { ...project.items[index].body, emergency: { ...shared, ...(project.items[index].body.emergency || {}) } };
    saveProject();
    // The last SWMS's preview goes, so it is not mistaken for this one.
    const result = document.getElementById('result');
    result.classList.add('hidden');
    result.innerHTML = '';
    // The last task's questions go too; this task's come once its start details are in.
    document.getElementById('facts').classList.add('hidden');
    const item = project.items[index];
    useTask(item, `SWMS ${index + 1} of ${project.items.length}: ${item.title}`);
    renderProject();
    // Owner decision, 7 October 2026: the page goes to the task, just under the Project SWMS list,
    // not to the top of the details. Its first line says which SWMS is open.
    requestAnimationFrame(() => $('start').scrollIntoView({ block: 'start' }));
    // A SWMS prepared before comes back as it was left: its answers, steps and the user's changes.
    // Once saved, its changes save as its next revision.
    if (item.body) {
      // To check it, the draft is shown as it will print, with Change this step on each step.
      S.fillForm(item.body).then((ok) => {
        if (item.swmsId) S.editing = { id: item.swmsId, title: item.title };
        if (ok && project.stage === 'check' && S.prepare) {
          S.prepare({ scroll: false }).then(() => {
            const bar = $('check-bar');
            if (bar && !bar.classList.contains('hidden')) bar.scrollIntoView({ block: 'start' });
            if (S.markStage) S.markStage('draft');
          });
        }
      });
      return;
    }
    // With the site details already filled in, go straight to this SWMS's questions.
    const start = $('start');
    if (index > 0 && start.checkValidity() && document.querySelector('input[name="fallRisk"]:checked')) start.requestSubmit($('continue'));
  }

  // Closing a project also clears its task from the form, so nothing of it is left in the way.
  function closeProject(question) {
    if (!confirm(question)) return false;
    project = null;
    try { localStorage.removeItem(PROJECT_KEY); } catch { /* nothing kept */ }
    window.siteReadyScopeTask = null;
    showSingle(true);
    const taskEl = $('task');
    taskEl.value = '';
    delete taskEl.dataset.preset;
    taskEl.dispatchEvent(new Event('input', { bubbles: true }));
    renderProject();
    return true;
  }

  function renderProject() {
    const panel = $('project-panel');
    const now = $('project-now');
    const bar = $('check-bar');
    if (!project) { panel.classList.add('hidden'); now.classList.add('hidden'); if (bar) bar.classList.add('hidden'); return; }
    // The one-go page and the review list (project-go.js).
    if ((project.stage === 'questions' || project.stage === 'review') && window.SiteReadyProjectGo) {
      now.classList.add('hidden');
      showSingle(false);
      window.SiteReadyProjectGo.render(panel, project, projectHooks);
      panel.classList.remove('hidden');
      return;
    }
    // A SWMS open to check: a bar above its draft says which one, and goes back to the list.
    if (bar) {
      const checking = project.stage === 'check' && project.items[project.current];
      const nextToCheck = checking ? project.items.findIndex((other, index) => index > project.current && !other.checked) : -1;
      bar.innerHTML = checking ? `<p><strong>Checking SWMS ${project.current + 1} of ${project.items.length}: ${esc(project.items[project.current].title)}.</strong> Read each step as it will print. To change a step's wording, press Change this step on it. When it is right, go back to the list.</p>
        <div class="actions"><button type="button" class="secondary" data-project-review>Back to the list of SWMS</button>${nextToCheck >= 0 ? `<button type="button" class="secondary" data-project-open="${nextToCheck}">Check SWMS ${nextToCheck + 1}: ${esc(project.items[nextToCheck].title)}</button>` : ''}</div>` : '';
      bar.classList.toggle('hidden', !checking);
    }
    // While one SWMS is checked, the project box is short: the list is one press away.
    if (project.stage === 'check') {
      const ready = project.items.filter((item) => item.status === 'ready').length;
      now.classList.add('hidden');
      panel.innerHTML = `<div class="project-head"><h2>Project SWMS</h2></div>
        <p class="meta">Checking SWMS ${project.current + 1} of ${project.items.length}. ${ready} of ${project.items.length} ready to download.</p>
        <div class="actions"><button type="button" class="secondary" data-project-review>Back to the list of SWMS</button></div>
        <p class="error" id="project-error"></p>`;
      panel.classList.remove('hidden');
      return;
    }
    const ready = project.items.filter((item) => item.status === 'ready').length;
    const label = { ready: 'Ready', needs: 'Needs answers', tick: 'Needs your step or a SWMS named', write: 'Needs your step', todo: 'To do' };
    const current = project.items[project.current];
    // The SWMS being prepared is named right above its task, at the top of the task box.
    now.innerHTML = current ? `Now preparing SWMS ${project.current + 1} of ${project.items.length}: <strong>${esc(current.title)}</strong>. Check the task below and press Continue. When it is ready, a button under it opens the next one.` : '';
    now.classList.toggle('hidden', !current);
    panel.innerHTML = `<div class="project-head"><h2>Project SWMS</h2><button type="button" class="small secondary" id="project-fresh">Start fresh</button></div>
      <p class="meta">${ready} of ${project.items.length} ready. Site details stay filled in from one SWMS to the next. You can also open any SWMS in the list.</p>
      ${project.from ? '<div class="actions" style="margin-top:0"><button type="button" class="small secondary" id="project-change">Change the SWMS chosen</button></div>' : ''}
      <ul class="project-list">${project.items.map((item, index) => `<li class="${index === project.current ? 'current' : ''}"><span>${index + 1}. ${esc(item.title)}</span><span><span class="project-status ${item.status === 'ready' ? 'ready' : ['needs', 'tick', 'write'].includes(item.status) ? 'needs' : ''}">${label[item.status]}</span> ${index === project.current ? '<span class="project-status">(open below)</span>' : `<button type="button" class="small secondary" data-project-open="${index}">Open</button>`}</span></li>`).join('')}</ul>
      ${project.items.map((item, index) => (item.status === 'needs' && (item.needs || []).length ? `<p class="note">SWMS ${index + 1}, ${esc(item.title)}, still needs before download: ${esc(item.needs.join('; '))}. ${index === project.current ? '<button type="button" class="link" data-gate-list>See what is needed</button>' : `<button type="button" class="link" data-project-open="${index}">Open it</button>`}</p>` : '')).join('')}
      ${project.items.map((item, index) => (item.status === 'write' ? `<p class="note">SWMS ${index + 1}, ${esc(item.title)}, waits for your own step for the work SiteReady has no job steps for. Write it with "Write a step for this" above its draft to add this SWMS to the download. ${index === project.current ? '<button type="button" class="link" data-cover-jump>Go to it</button>' : `<button type="button" class="link" data-project-open="${index}">Open it</button>`}</p>` : '')).join('')}
      ${project.items.map((item, index) => (item.status === 'tick' ? `<p class="note">SWMS ${index + 1}, ${esc(item.title)}, has work SiteReady has no job steps for. Above its draft, write your own step for it, or say which SWMS covers it, to add this SWMS to the download. ${index === project.current ? '<button type="button" class="link" data-cover-jump>Go to it</button>' : `<button type="button" class="link" data-project-open="${index}">Open it</button>`}</p>` : '')).join('')}
      <div id="project-download">${ready ? (S.canDownload && S.canDownload() ? `${S.confirmBlock('project')}<div class="actions"><button type="button" id="project-zip">Download ${ready} SWMS (Word and PDF, one zip)</button></div>${S.signedIn && S.signedIn() ? '<p class="meta">Downloading saves each SWMS under My SWMS, so every copy printed has a record and a revision.</p>' : ''}` : '<p class="note">Sign in, or start the free trial, to download the project\'s SWMS together.</p>') : ''}</div>
      <p class="error" id="project-error"></p>
      <p class="meta" id="project-status" role="status"></p>
      <div class="actions"><button type="button" class="small secondary" id="project-close">Close project</button></div>`;
    panel.classList.remove('hidden');
  }

  // A draft that names work SiteReady has no job steps for is ready once the box above it is
  // ticked (owner decision D184), or the user has written a step for each part.
  // One with site questions or blanks still to answer (goal 2) needs answers first.
  const statusOf = (item) => {
    if (item.kind !== 'draft' || (item.needs || []).length) return 'needs';
    // Work that is all the task's work (D211) needs the user's own step, not the tick.
    if ((item.notCoveredMain || []).some((part) => !(item.notCoveredWritten || []).includes(part))) return 'write';
    const ticked = [...(item.body.notCoveredConfirmed || []), ...(item.notCoveredWritten || [])];
    return (item.notCovered || []).every((part) => ticked.includes(part)) ? 'ready' : 'tick';
  };
  // The project's other SWMS, by title, for saying which one covers work this SWMS has no steps for.
  S.projectOthers = () => (project ? project.items.filter((_item, index) => index !== project.current).map((item) => item.title) : []);
  S.onCoverTick = (confirmed) => {
    const item = project && project.items[project.current];
    if (!item || !item.body || $('task').value.trim() !== item.body.task.trim()) return;
    item.body = { ...item.body, notCoveredConfirmed: confirmed };
    item.status = statusOf(item);
    saveProject();
    renderProject();
  };

  // An answer to an emergency question fills the same question in the project's other SWMS (D239).
  function shareEmergency(answers) {
    if (!project || !answers || typeof answers !== 'object') return;
    project.shared = project.shared || { site: null, designs: {}, emergency: {} };
    const given = Object.fromEntries(Object.entries(answers).filter(([, value]) => typeof value === 'string' && value.trim()));
    project.shared.emergency = { ...(project.shared.emergency || {}), ...given };
  }

  // As the user answers under the draft (app.js), the SWMS in the project takes the answers that print
  // as given, and what it still needs. A change that needs the draft prepared again waits for it.
  S.onAnswers = ({ task, needs, answers, stale }) => {
    const item = project && project.items[project.current];
    const same = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    if (stale || !item || !item.body || item.kind !== 'draft' || same(task) !== same(item.body.task)) return;
    const before = JSON.stringify([item.needs, item.status]);
    item.body = { ...item.body, ...answers };
    shareEmergency(answers.emergency);
    item.needs = needs;
    item.status = statusOf(item);
    saveProject();
    if (JSON.stringify([item.needs, item.status]) !== before) renderProject();
  };

  // Each prepared draft is kept against its task; the result gets a Next SWMS button.
  S.onDraft = (draft, body) => {
    if (!project) return;
    const item = project.items[project.current];
    // The task box has one sentence to a line (useTask), so spacing is not compared.
    const same = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    if (!item || same(body.task) !== same(item.task)) return;
    item.body = body;
    item.kind = draft.kind;
    shareEmergency(body.emergency);
    // The one-go page shows the answers as last given here (project-go.js).
    if (project.stage) { item.facts = { ...(body.facts || {}) }; item.goTask = body.task; }
    item.notCovered = draft.notCovered || [];
    item.notCoveredWritten = draft.notCoveredWritten || [];
    item.notCoveredMain = draft.notCoveredMain || [];
    // What is left to answer before download (goal 2): the site questions and blanks, or, for a SWMS
    // not finished, the answers it still needs.
    item.needs = draft.kind === 'stand-down'
      ? ((draft.missingHelp || []).map((gap) => gap.label).length ? (draft.missingHelp || []).map((gap) => gap.label) : (draft.missing || []))
      : [...new Set((draft.gate || []).filter((gap) => gap.kind !== 'cover').map((gap) => gap.label))];
    item.status = statusOf(item);
    saveProject();
    renderProject();
    const box = document.getElementById('result-actions');
    // Checking a SWMS from the review list: under its draft, back to the list (D240).
    if (project.stage === 'check') {
      if (box) box.insertAdjacentHTML('afterbegin', `<div class="actions" style="margin-bottom:12px"><button type="button" data-project-review>Back to the list of SWMS</button></div>${draft.kind !== 'draft' ? '<p class="meta">This SWMS is not finished. Fix the answers listed above, then press Prepare the statement again.</p>' : ''}`);
      return;
    }
    const next = project.items.findIndex((other, index) => index > project.current && other.status !== 'ready');
    if (!box || next < 0) return;
    // A SWMS not finished keeps the user on it: the next one is a small link under its list, never
    // the big button (messy-user testing, 13 October 2026).
    if (draft.kind !== 'draft') box.insertAdjacentHTML('beforeend', `<p class="meta project-leave">This SWMS is not finished. <button type="button" class="link" data-project-open="${next}">Leave it unfinished for now and open SWMS ${next + 1}</button></p>`);
    else box.insertAdjacentHTML('afterbegin', `<div class="actions" style="margin-bottom:12px"><button type="button" data-project-open="${next}">Next SWMS: ${esc(project.items[next].title)}</button></div>`);
  };

  document.addEventListener('click', async (event) => {
    const report = event.target.closest('[data-scope-report]');
    if (report) { downloadReport(report); return; }
    if (event.target.closest('[data-conflict-close]')) { closeConflicts(); return; }
    if (event.target.closest('#conflict-open')) { showConflicts(aiReading.reading.conflicts || []); return; }
    if (event.target.closest('#project-change')) { changeChoice(); return; }
    const open = event.target.closest('[data-project-open]');
    if (open) { openItem(Number(open.dataset.projectOpen)); return; }
    if (event.target.closest('[data-project-review]')) { backToReview(); return; }
    if (event.target.closest('#project-close, #project-fresh')) {
      closeProject('Close this project and start fresh? SWMS you have not downloaded or saved will need preparing again.');
      return;
    }
    if (event.target.closest('#project-zip')) {
      $('project-error').textContent = '';
      const confirmed = $('project-confirm') && $('project-confirm').checked;
      const name = $('project-name') && $('project-name').value.trim();
      if (!confirmed || !name) { $('project-error').textContent = 'Tick the box and enter your name first.'; return; }
      const button = event.target.closest('#project-zip');
      button.disabled = true;
      try {
        // The SWMS open now, if it was saved or downloaded on its own, is that saved SWMS.
        const open = project.items[project.current];
        if (open && !open.swmsId && S.editing && S.editing.id) open.swmsId = S.editing.id;
        const ready = project.items.filter((item) => item.status === 'ready' && item.body);
        const swms = ready.map((item) => ({ ...item.body, swmsTitle: item.title, swmsId: item.swmsId || undefined }));
        const site = S.siteId ? S.siteId() : '';
        // Word and PDF of each, in one zip (D240).
        const result = await S.download('/api/project.zip', 'SiteReady-project-SWMS.zip', { swms, siteId: site || undefined, reviewConfirmed: true, reviewedBy: name, pdf: true });
        // Each SWMS is saved as a record when the project is downloaded; later changes save as its next revision.
        for (const saved of (result && result.items) || []) if (ready[saved.index]) ready[saved.index].swmsId = saved.id;
        saveProject();
        if (result && result.items && result.items.length) {
          project.downloaded = new Date().toISOString();
          saveProject();
          renderProject();
          $('project-status').textContent = `Saved ${result.items.length} SWMS under My SWMS, each as its own revision, and downloaded them as Word and PDF in one zip. Changes you make to one now save as its next revision.`;
        }
      } catch (error) {
        $('project-error').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }
  });

  // Back to the review list from a SWMS being checked: the list shows what each still needs.
  function backToReview() {
    if (!project) return;
    project.stage = 'review';
    saveProject();
    renderProject();
    requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
    if (S.markStage) S.markStage('review');
  }

  S.renderProject = () => renderProject();
  // The phone's Back button from a SWMS being checked goes back to the list (app.js).
  S.projectReview = () => { if (project && project.stage === 'check') backToReview(); else if (project && project.stage) requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' })); };
  // What the one-go page and the review list (project-go.js) use of the project.
  const projectHooks = {
    save: saveProject,
    render: renderProject,
    open: openItem,
    statusOf,
    useTask,
    close: () => closeProject('Close this project and start fresh? SWMS you have not downloaded or saved will need preparing again.'),
    changeChoice: () => changeChoice(),
  };

  renderProject();
})();
