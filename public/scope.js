// Start from a scope of works: the scope is attached or pasted, the server lists
// the tasks in it that need a SWMS, and a picked task fills in the form.
(() => {
  const S = window.SiteReady;
  const { api, esc } = S;
  const $ = (id) => document.getElementById(id);
  let found = [];

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
  }

  // Tasks the user has added. With none added, the project takes every task.
  let added = new Set();

  function projectButton() {
    const count = added.size || found.length;
    return `Prepare a SWMS for ${added.size ? `the ${count} added ${count === 1 ? 'task' : 'tasks'}` : `every task (${count})`}`;
  }

  function show(data) {
    found = data.tasks || [];
    added = new Set();
    const note = data.note ? `<p class="note">${esc(data.note)}</p>` : '';
    $('scope-results').innerHTML = note + (found.length
      ? `<p class="meta" style="margin-top:10px">${found.length} ${found.length === 1 ? 'task' : 'tasks'} found. Tasks marked high risk construction work need a SWMS by law; most builders ask for one for every task. Check each one against the scope before you rely on it. Add the tasks you need, then press the button at the bottom.</p>` + found.map((item, index) => `
        <div class="scope-task" data-card="${index}">
          <h3>${esc(item.title)}${item.needsSwms ? ' <span class="tag-risk">High risk</span>' : ''}</h3>
          <p>${esc(item.task)}</p>
          ${(item.highRisk || []).length ? `<p class="meta">High risk construction work: ${esc(item.highRisk.join('; '))}</p>` : ''}
          ${(item.byOthers || []).map((entry, j) => `<fieldset class="scope-others"><legend>Scope review: ${esc(entry.step.toLowerCase())} by others</legend><p class="meta">${esc(entry.says)}${entry.clause ? ` (${esc(entry.clause)})` : ''} Do you need this in your SWMS?</p><label><input type="radio" name="others-${index}-${j}" value="no" checked> No, leave it out</label> <label><input type="radio" name="others-${index}-${j}" value="yes"> Yes, our crew does some of it</label></fieldset>`).join('')}
          ${(item.unmatched || []).length ? `<p class="meta">No job steps in the library for: ${esc(item.unmatched.join('; '))}. Pick the steps for these under Job steps, or describe them in the task.</p>` : ''}
          ${item.clauses ? `<button type="button" class="small secondary" data-scope-clauses="${index}" aria-expanded="false">Show scope clauses</button><div class="scope-clauses hidden" id="scope-clauses-${index}">${item.clauses.map((row) => `<p><strong>${esc(row.activity)}</strong>${row.clause ? ` <span class="meta">${esc(row.clause)}${row.matrixColumn ? `, ${esc(row.matrixColumn)}` : ''}</span>` : ''}</p>${row.quotes.map((quote) => `<blockquote>${esc(quote)}</blockquote>`).join('')}`).join('')}</div>` : `<details><summary>From the scope (${item.lines.length} ${item.lines.length === 1 ? 'line' : 'lines'})</summary><ul>${item.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>`}
          <button type="button" class="small" data-scope-task="${index}" aria-pressed="false">Add this task</button>
        </div>`).join('') + `<div class="actions scope-go"><button type="button" id="project-start">${projectButton()}</button></div><p class="meta">Fill in the site details once. SiteReady then takes you through each SWMS in turn, and you can download them all together.</p>`
      : (note ? '' : '<p class="note">No site work that needs a SWMS was found. If the scope does include site work, paste the part that describes it.</p>'));
  }

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
    found = [];
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

  // Called by account.js once the user is signed in: a scope given while signed out is read now.
  S.onSignedIn = async () => {
    const body = await takeScope();
    if (!body) return;
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
  async function readWithAi(body) {
    $('scope-results').innerHTML = '<p class="note" aria-live="polite">The AI is reading every word of the scope, including tables and appendices. This usually takes a few minutes. You can leave this page open and come back.</p>';
    let reading = await S.call('POST', '/api/scope/ai', body);
    const started = Date.now();
    while (reading.status === 'reading') {
      if (Date.now() - started > 20 * 60 * 1000) throw new Error(`The AI reading is taking too long. Try again later. ${TYPE_TASKS}`);
      await wait(10000);
      reading = await S.call('GET', `/api/scope/ai/${encodeURIComponent(reading.id)}`);
    }
    if (reading.status !== 'done') {
      $('scope-results').innerHTML = `<p class="note">${esc(reading.error || 'The AI reading failed. Try again later.')} ${TYPE_TASKS}</p>`;
      return;
    }
    showPackages(reading);
  }

  // The AI's work packages, for the user to confirm before any task is listed. A package of
  // duties only (supervision, records, meetings) needs no SWMS, so it starts unticked.
  let aiReading = null;
  function packagesOf(reading) {
    const groups = new Map();
    for (const row of reading.activities) {
      const name = row.package || 'Other work';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(row);
    }
    return [...groups.entries()].map(([name, rows]) => ({ name, rows, work: rows.some((row) => row.type !== 'Duty') }));
  }
  function showPackages(reading) {
    aiReading = reading;
    const packages = packagesOf(reading.reading);
    const checks = reading.checks || {};
    const warn = checks.passed === false ? `<p class="note">Some of the AI's quotes could not be matched word for word to the document (${(checks.quotesNotFound || []).length + (checks.quotesShortened || []).length}). Check those tasks against the scope.</p>` : '';
    const conflicts = reading.reading.conflicts || [];
    $('scope-results').innerHTML = `${warn}<p class="meta" style="margin-top:10px">The AI found ${reading.reading.activities.length} activities in ${packages.length} work packages. Each package you confirm becomes one SWMS. Untick any package that is not yours, then confirm.</p>
      <div class="scope-packages">${packages.map((pack, index) => `<label class="scope-package"><input type="checkbox" data-package="${index}" ${pack.work ? 'checked' : ''}> <strong>${esc(pack.name)}</strong> <span class="meta">(${pack.rows.length} ${pack.rows.length === 1 ? 'activity' : 'activities'}${pack.work ? '' : ', duties only: no SWMS needed'})</span><span class="meta scope-package-list">${pack.rows.map((row) => esc(row.activity)).join('; ')}</span></label>`).join('')}</div>
      ${conflicts.length ? `<details class="scope-conflicts"><summary>${conflicts.length} possible ${conflicts.length === 1 ? 'conflict' : 'conflicts'} in the scope</summary><ul>${conflicts.map((item) => `<li><strong>${esc(item.clauseA)} and ${esc(item.clauseB)}</strong> (${esc(item.confidence)} confidence): ${esc(item.why)}</li>`).join('')}</ul><button type="button" class="small secondary" id="conflict-open">Show the conflicts in full</button></details>` : ''}
      <div class="actions"><button type="button" id="scope-confirm">Confirm these work packages</button> <button type="button" class="secondary" data-scope-report>Scope review report (Word)</button></div>
      <p class="error" id="scope-report-error"></p>`;
    showConflicts(conflicts);
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
      await S.download(`/api/scope/ai/${encodeURIComponent(aiReading.id)}/report.docx`, 'Scope-review-report.docx');
    } catch (problem) {
      if (error) error.textContent = problem.message; else alert(problem.message);
    } finally {
      button.disabled = false;
    }
  }
  function confirmPackages() {
    const packages = packagesOf(aiReading.reading);
    const ticked = [...document.querySelectorAll('[data-package]')].filter((box) => box.checked).map((box) => packages[Number(box.dataset.package)]);
    if (!ticked.length) { $('scope-error').textContent = 'Tick at least one work package.'; return; }
    $('scope-error').textContent = '';
    // The job steps the AI chose from the library for each package; the rule engine still adds high risk work.
    const steps = new Map((aiReading.reading.packages || []).map((item) => [item.package, item]));
    show({
      tasks: ticked.map((pack) => {
        const rows = pack.rows.filter((row) => row.type !== 'Duty');
        const use = rows.length ? rows : pack.rows;
        const chosen = steps.get(pack.name);
        return {
          kinds: chosen ? chosen.groups : null,
          unmatched: chosen ? chosen.unmatched : [],
          byOthers: chosen ? (chosen.byOthers || []) : [],
          title: pack.name,
          // Conditions and plant stay in the task, so "near roads" or "energised switchboards" reach the high risk check.
          task: window.SiteReadyScopeTask.packageTask(use),
          lines: [],
          clauses: use.map((row) => ({ activity: row.activity, clause: row.clause, quotes: row.quotes, matrixColumn: row.matrixColumn })),
          needsSwms: false,
        };
      }),
    });
  }

  $('scope-results').addEventListener('click', (event) => {
    if (event.target.closest('#project-start')) { startProject(); return; }
    if (event.target.closest('#scope-confirm')) { confirmPackages(); return; }
    const clauses = event.target.closest('[data-scope-clauses]');
    if (clauses) {
      const box = $(`scope-clauses-${clauses.dataset.scopeClauses}`);
      const open = box.classList.toggle('hidden') === false;
      clauses.textContent = open ? 'Hide scope clauses' : 'Show scope clauses';
      clauses.setAttribute('aria-expanded', String(open));
      return;
    }
    // Adding a task marks it and stays on the list, so the next one can be added.
    const button = event.target.closest('[data-scope-task]');
    if (!button) return;
    const index = Number(button.dataset.scopeTask);
    if (!found[index]) return;
    if (added.has(index)) added.delete(index); else added.add(index);
    const on = added.has(index);
    button.textContent = on ? 'Added ✓' : 'Add this task';
    button.classList.toggle('added', on);
    button.setAttribute('aria-pressed', String(on));
    button.closest('.scope-task').classList.toggle('added', on);
    $('project-start').textContent = projectButton();
  });

  // The scope task's name goes once the task is replaced with the user's own.
  $('task').addEventListener('input', () => {
    const taskEl = $('task');
    if (taskEl.dataset.preset && !taskEl.value.trim()) $('task-from').classList.add('hidden');
  });

  // The user's answers on work the scope gives to others: Yes adds that step's group, No leaves the step out.
  function withAnswers(item, index) {
    if (!(item.byOthers || []).length) return item;
    const kinds = [...(item.kinds || [])];
    const leaveOut = [];
    item.byOthers.forEach((entry, j) => {
      const picked = document.querySelector(`input[name="others-${index}-${j}"]:checked`);
      if (picked && picked.value === 'yes') { if (!kinds.includes(entry.group)) kinds.push(entry.group); } else leaveOut.push(entry.step);
    });
    return { ...item, kinds, leaveOut };
  }

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
    // The scope reader's steps for this task are ticked when the task is used as it stands.
    window.siteReadyScopeTask = { task: text, kinds: item.kinds || null, leaveOut: item.leaveOut || null, unmatched: item.unmatched || null };
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

  function startProject() {
    if (project && project.items.some((item) => item.body) && !confirm('Start a new project? The SWMS prepared in the current project will be cleared.')) return;
    const chosen = found.map((item, index) => withAnswers(item, index)).filter((_item, index) => !added.size || added.has(index));
    project = { current: 0, items: chosen.map((item) => ({ title: item.title, task: item.task, trade: item.trade || '', kinds: item.kinds || null, leaveOut: item.leaveOut || null, unmatched: item.unmatched || null, fallRisk: item.fallRisk || '', body: null, status: 'todo' })) };
    saveProject();
    // The task list has done its job; closing it keeps the page short.
    $('scope-panel').open = false;
    openItem(0);
  }

  function openItem(index) {
    if (!project || !project.items[index]) return;
    project.current = index;
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
      S.fillForm(item.body).then(() => { if (item.swmsId) S.editing = { id: item.swmsId, title: item.title }; });
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
    if (!project) { panel.classList.add('hidden'); now.classList.add('hidden'); return; }
    const ready = project.items.filter((item) => item.status === 'ready').length;
    const label = { ready: 'Ready', needs: 'Needs answers', tick: 'Needs a tick', todo: 'To do' };
    const current = project.items[project.current];
    // The SWMS being prepared is named right above its task, at the top of the task box.
    now.innerHTML = current ? `Now preparing SWMS ${project.current + 1} of ${project.items.length}: <strong>${esc(current.title)}</strong>. Check the task below and press Continue. When it is ready, a button under it opens the next one.` : '';
    now.classList.toggle('hidden', !current);
    panel.innerHTML = `<div class="project-head"><h2>Project SWMS</h2><button type="button" class="small secondary" id="project-fresh">Start fresh</button></div>
      <p class="meta">${ready} of ${project.items.length} ready. Site details stay filled in from one SWMS to the next. You can also open any SWMS in the list.</p>
      <ul class="project-list">${project.items.map((item, index) => `<li class="${index === project.current ? 'current' : ''}"><span>${index + 1}. ${esc(item.title)}</span><span><span class="project-status ${item.status === 'ready' ? 'ready' : ['needs', 'tick'].includes(item.status) ? 'needs' : ''}">${label[item.status]}</span> ${index === project.current ? '<span class="project-status">(open below)</span>' : `<button type="button" class="small secondary" data-project-open="${index}">Open</button>`}</span></li>`).join('')}</ul>
      <div id="project-download">${ready ? (S.canDownload && S.canDownload() ? `${S.confirmBlock('project')}<div class="actions"><button type="button" id="project-zip">Download ${ready} SWMS (Word, one zip)</button></div>${S.signedIn && S.signedIn() ? '<p class="meta">Downloading saves each SWMS under My SWMS, so every copy printed has a record and a revision.</p>' : ''}` : '<p class="note">Sign in, or start the free trial, to download the project\'s SWMS together.</p>') : ''}</div>
      <p class="error" id="project-error"></p>
      <p class="meta" id="project-status" role="status"></p>
      <div class="actions"><button type="button" class="small secondary" id="project-close">Close project</button></div>`;
    panel.classList.remove('hidden');
  }

  // A draft that names work SiteReady has no job steps for is ready once the box above it is
  // ticked (owner decision D184).
  const statusOf = (item) => {
    if (item.kind !== 'draft') return 'needs';
    const ticked = item.body.notCoveredConfirmed || [];
    return (item.notCovered || []).every((part) => ticked.includes(part)) ? 'ready' : 'tick';
  };
  S.onCoverTick = (confirmed) => {
    const item = project && project.items[project.current];
    if (!item || !item.body || $('task').value.trim() !== item.body.task.trim()) return;
    item.body = { ...item.body, notCoveredConfirmed: confirmed };
    item.status = statusOf(item);
    saveProject();
    renderProject();
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
    item.notCovered = draft.notCovered || [];
    item.status = statusOf(item);
    saveProject();
    renderProject();
    const next = project.items.findIndex((other, index) => index > project.current && other.status !== 'ready');
    const box = document.getElementById('result-actions');
    if (box && next >= 0) box.insertAdjacentHTML('afterbegin', `<div class="actions" style="margin-bottom:12px"><button type="button" data-project-open="${next}">Next SWMS: ${esc(project.items[next].title)}</button></div>`);
  };

  document.addEventListener('click', async (event) => {
    const report = event.target.closest('[data-scope-report]');
    if (report) { downloadReport(report); return; }
    if (event.target.closest('[data-conflict-close]')) { closeConflicts(); return; }
    if (event.target.closest('#conflict-open')) { showConflicts(aiReading.reading.conflicts || []); return; }
    const open = event.target.closest('[data-project-open]');
    if (open) { openItem(Number(open.dataset.projectOpen)); return; }
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
        const result = await S.download('/api/project.zip', 'SiteReady-project-SWMS.zip', { swms, siteId: site || undefined, reviewConfirmed: true, reviewedBy: name });
        // Each SWMS is saved as a record when the project is downloaded; later changes save as its next revision.
        for (const saved of (result && result.items) || []) if (ready[saved.index]) ready[saved.index].swmsId = saved.id;
        saveProject();
        if (result && result.items && result.items.length) $('project-status').textContent = `Saved ${result.items.length} SWMS under My SWMS and downloaded them. Changes you make to one now save as its next revision.`;
      } catch (error) {
        $('project-error').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }
  });

  renderProject();
})();
