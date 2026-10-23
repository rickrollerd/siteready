// Start from a scope of works: the scope is attached or pasted, the server lists
// the tasks in it that need a SWMS, and a picked task fills in the form.
(() => {
  const S = window.SiteWrite;
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
  const hrcwOf = (flag) => (flag && window.SiteWriteHrcw ? window.SiteWriteHrcw.hrcwSummary(flag) : null);
  const hrcwText = (summary) => `<strong>${esc(summary.heading)}.</strong> ${summary.lines.map((line) => esc(/[.]$/.test(line) ? line : `${line}.`)).join(' ')}`;

  // A file can also be dragged onto the panel. Dropping it anywhere on the panel is caught,
  // so the browser does not open the file in place of SiteWrite.
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
      notScope = file.name;
      $('scope-error').textContent = notScopeText();
      return;
    }
    notScope = '';
    dropped = file;
    $('scope-file').value = '';
    $('scope-drop-note').textContent = `${file.name} is attached. Press "Find the tasks that need a SWMS" to read it.`;
    $('scope-file-clear').classList.remove('hidden');
  });
  // A picture chosen for the scope (messy round 4, run 7: a PNG got no message) is said plainly and taken off.
  const NOT_A_SCOPE = 'SiteWrite reads a scope from a Word file (.docx), a PDF or a text file. A photo or picture of a scope cannot be read: attach the document, or paste its words in the box above.';
  // The picture taken off is named, here and again if Find is pressed with nothing else attached (messy
  // round 8, run 3: the photo went with no word, and Find then said only "Attach the scope or paste it first").
  let notScope = '';
  const notScopeText = () => (notScope ? `${notScope} was taken off: it is not a Word file, a PDF or a text file. ${NOT_A_SCOPE}` : NOT_A_SCOPE);
  $('scope-file').addEventListener('change', () => {
    dropped = null;
    $('scope-error').textContent = '';
    const file = $('scope-file').files[0];
    notScope = '';
    if (file && !ACCEPTED.test(file.name)) {
      notScope = file.name;
      $('scope-file').value = '';
      $('scope-error').textContent = notScopeText();
    }
    $('scope-drop-note').textContent = 'or drag the file here';
    $('scope-file-clear').classList.toggle('hidden', !$('scope-file').files.length);
  });
  S.scopeDropped = () => Boolean(dropped);
  // A wrong file is taken off, with the tasks read from it.
  $('scope-file-clear').addEventListener('click', () => {
    dropped = null;
    $('scope-file').value = '';
    $('scope-drop-note').textContent = 'or drag the file here';
    $('scope-file-clear').classList.add('hidden');
    $('scope-error').textContent = '';
    $('scope-results').innerHTML = '';
    // Taken off, the reading of it is not brought back on the next visit either, nor the scope kept for sign-in.
    if ((keptReading() || {}).done) keepReading(null);
    if (waiting ? Boolean(waiting.file) : keptShown) forgetKept();
  });

  $('scope-read').addEventListener('click', async () => {
    const button = $('scope-read');
    $('scope-error').textContent = '';
    // A file kept on this device for sign-in, named under the file box, is read as if attached.
    const keptFile = !dropped && !$('scope-file').files[0] && keptShown && waiting && waiting.file ? waiting : null;
    const file = dropped || $('scope-file').files[0];
    const text = $('scope-text').value.trim();
    if (!file && !text && !keptFile) {
      $('scope-error').textContent = notScope ? notScopeText() : 'Attach the scope or paste it first.';
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      $('scope-error').textContent = 'The file is too large. Attach the scope only, or paste it.';
      return;
    }
    // A new scope starts a new project: the one in progress is closed first, with the user's OK.
    if (project && !closeProject(`You have a project in progress (${project.items.filter((item) => item.status === 'ready').length} of ${project.items.length} SWMS ready). Reading a new scope closes it, and SWMS you have not downloaded or saved will need preparing again. Read the new scope?`)) return;
    // The chime when the reading is finished may only play after a press on the page: set it up now.
    if (window.SiteWriteProgress) window.SiteWriteProgress.unlockAudio();
    button.disabled = true;
    try {
      const state = (document.querySelector('input[name="state"]:checked') || {}).value || '';
      const body = file ? { file: { name: file.name, data: await readFile(file) }, state } : keptFile && !text ? { file: keptFile.file, state } : { text, state };
      // Owner decision, 7 October 2026: reading a scope needs an account, and the AI reads every
      // scope. Signed out, the scope is kept and read once the user signs in.
      if (!S.signedIn || !S.signedIn()) { await askToSignIn(body); return; }
      // Read now: nothing is kept for a later sign-in.
      if (waiting || keptShown) forgetKept();
      // A new scope read: the finished reading kept from before is done with.
      if ((keptReading() || {}).done) keepReading(null);
      await readScope(body);
    } catch (error) {
      $('scope-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const TYPE_TASKS = 'Or write the tasks in the Task box below.';

  // Owner decision, 7 October 2026: SiteWrite's keyword quick read is no longer used on this page.
  // When the AI is off or fails, the page says so and the user tries again later or types the tasks.
  async function readScope(body) {
    // Nothing is read from an empty box (messy round 12, run 5).
    if (!body || (!(body.file && body.file.data) && !String(body.text || '').trim())) return;
    if (!(await aiOn())) {
      $('scope-results').innerHTML = `<p class="note">The AI reading of scopes is not switched on just now. Try again later. ${TYPE_TASKS}</p>`;
      return;
    }
    await readWithAi(body);
  }

  // A scope given before signing in waits in this browser until the user signs in, even when the
  // sign-in link opens in a new tab. It is kept in IndexedDB, which holds a large file.
  let waiting = null;
  // A scope kept while the app was called SiteReady (owner D299) is still found under its old name.
  function keptScope(mode, use, name = 'sitewrite') {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const open = indexedDB.open(name, 1);
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
  // Looked for only where the browser can say which stores it has, so no empty old store is made.
  const oldStoreThere = async () => {
    try { return Boolean(window.indexedDB && indexedDB.databases) && (await indexedDB.databases()).some((item) => item.name === 'siteready'); } catch { return false; }
  };
  const takeScope = async () => {
    let body = waiting || await keptScope('readonly', (store) => store.get('scope'));
    if (body) await keptScope('readwrite', (store) => store.delete('scope'));
    else if (await oldStoreThere()) {
      body = await keptScope('readonly', (store) => store.get('scope'), 'siteready');
      try { indexedDB.deleteDatabase('siteready'); } catch { /* left as it is */ }
    }
    waiting = null;
    return body;
  };

  // A scope kept for sign-in is shown in its box when the page is opened again, so the box does not look
  // empty while the scope is still to be read (messy round 8, run 3: after Back the box looked empty, yet the
  // reading used the file once he signed in). A file kept is named under the file box; words pasted go back
  // in the box itself.
  let keptShown = false;
  // Set once the user types in or clears the scope box on this page: the box as they left it is what counts.
  let boxTouched = false;
  const attachedName = () => (dropped ? dropped.name : (($('scope-file').files || [])[0] || {}).name) || '';
  function putBack(body, signedIn) {
    if (!body || boxTouched) return;
    if (body.file && body.file.name) {
      if (attachedName()) return;
      keptShown = true;
      $('scope-drop-note').textContent = `${body.file.name} is kept on this device. ${signedIn ? 'Press "Find the tasks that need a SWMS" to read it.' : 'It is read once you sign in.'}`;
      $('scope-file-clear').classList.remove('hidden');
    } else if (typeof body.text === 'string' && !$('scope-text').value.trim()) {
      $('scope-text').value = body.text;
      keptShown = true;
      $('scope-drop-note').textContent = signedIn ? 'or drag the file here' : 'The scope pasted below is kept on this device. It is read once you sign in.';
    }
  }
  // The scope kept for sign-in is read only while it is still in the scope box: the same words in the box, or
  // the same file attached or named there (messy round 12, run 5: the box was cleared and the lines moved to
  // the Task box, yet a paid reading of them started on its own at sign-in).
  function inBox(body) {
    if (!body) return null;
    if (body.file && body.file.name) return keptShown || attachedName() === body.file.name ? body : null;
    const now = $('scope-text').value.trim();
    return now && typeof body.text === 'string' && now === body.text.trim() ? body : null;
  }
  // The scope kept for sign-in is forgotten, and the promise to read it once signed in goes with it.
  function forgetKept() {
    const promised = waiting || keptShown;
    waiting = null;
    keptShown = false;
    keptScope('readwrite', (store) => store.delete('scope'));
    if (!attachedName()) { $('scope-drop-note').textContent = 'or drag the file here'; $('scope-file-clear').classList.add('hidden'); }
    if (promised && /once you are signed in, the reading starts on its own/i.test($('scope-results').textContent || $('scope-results').innerHTML)) $('scope-results').innerHTML = '';
  }
  setTimeout(async () => {
    if (S.accountReady) await S.accountReady;
    if (S.signedIn && S.signedIn()) return;
    const body = await keptScope('readonly', (store) => store.get('scope'));
    if (!body) return;
    waiting = waiting || body;
    putBack(body, false);
  }, 0);
  // The words kept follow the box as it is typed in: cleared, the scope kept is forgotten; changed, the
  // new words are what is read once the user signs in.
  $('scope-text').addEventListener('input', async () => {
    boxTouched = true;
    const text = $('scope-text').value.trim();
    const body = waiting || await keptScope('readonly', (store) => store.get('scope'));
    if (!body || (body.file && body.file.name)) return;
    if (!text) { forgetKept(); return; }
    waiting = { ...body, text };
    keepScope(waiting);
  });

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

  // Called by account.js once the user is signed in (justSignedIn), and when a page opens already signed in:
  // a scope given while signed out is read at sign-in if it is still in the scope box, and never from an
  // empty or cleared box. A page opened again (a reload or Back) puts the scope back in its box for Find,
  // and reads nothing new. A reading still running when the page was left or reloaded is picked up again.
  S.onSignedIn = async ({ justSignedIn = false } = {}) => {
    const kept = waiting || await keptScope('readonly', (store) => store.get('scope'));
    // Signed in with nothing started, the scope section is open on a phone too: reading a scope is
    // what signing in opens up (messy round 5, run 4: it was closed, and the scope went into the logo box).
    const task = document.getElementById('task');
    if (!kept && !project && !(task && task.value.trim())) $('scope-panel').open = true;
    if (!kept) { await resumeReading(); return; }
    putBack(kept, true);
    const body = inBox(kept);
    if (!body) { forgetKept(); await resumeReading(); return; }
    if (!justSignedIn) {
      waiting = kept;
      $('scope-panel').open = true;
      $('scope-results').innerHTML = '<p class="note" role="status">The scope you gave before signing in is in the box above. Press "Find the tasks that need a SWMS" to read it.</p>';
      await resumeReading();
      return;
    }
    await takeScope();
    if (keptShown) { keptShown = false; $('scope-drop-note').textContent = 'or drag the file here'; $('scope-file-clear').classList.add('hidden'); }
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
  // A finished reading is kept too, with the packages ticked, until the user prepares the SWMS from it or
  // reads another scope (messy round 6, run 1: a reload before Prepare lost the list, and the only way
  // back was a second paid reading). Opening it again reads nothing: the server keeps the result.
  const READING_KEY = 'sitewrite-scope-reading';
  const keepReading = (value) => { try { if (value) localStorage.setItem(READING_KEY, JSON.stringify(value)); else localStorage.removeItem(READING_KEY); } catch { /* not kept */ } };
  const keptReading = () => { try { return JSON.parse(localStorage.getItem(READING_KEY) || 'null'); } catch { return null; } };
  let running = false;
  async function resumeReading() {
    const kept = keptReading();
    if (!kept || !kept.id || running || !S.signedIn || !S.signedIn() || !S.call) return;
    // A project already made from this reading has its own list: the reading is done with.
    if (kept.done && project && project.from && project.from.readingId === kept.id) { keepReading(null); return; }
    $('scope-panel').open = true;
    $('scope-error').textContent = '';
    $('scope-read').disabled = true;
    try {
      await readWithAi({ state: kept.state || '' }, kept.id, kept.done ? kept.choice || { chosen: [], answers: {} } : null);
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
    const RP = window.SiteWriteProgress;
    if (!RP) return null;
    const tracker = RP.track({ what: 'scope', lead: LEAD, steps: ['reading every word of the scope', 'matching each work package to SiteWrite\'s job steps'] });
    tracker.update(reading.progress);
    $('scope-results').innerHTML = tracker.html();
    return tracker;
  }

  async function readWithAi(body, resumeId, keptChoice = null) {
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
      if (reading.status !== 'done') {
        keepReading(null);
        if (tracker) tracker.fail();
        $('scope-results').innerHTML = `${tracker ? tracker.html() : ''}<p class="note">${esc(reading.error || 'The AI reading failed. Try again later.')} ${TYPE_TASKS}</p>`;
        return;
      }
      if (tracker) tracker.finish();
      // Kept, finished, until the SWMS are prepared from it or another scope is read.
      keepReading({ id: reading.id, state: body.state || '', done: true, choice: keptChoice || null });
      // A finished reading brought back shows the list as it was left, with no message and no chime.
      if (keptChoice) {
        showPackages(reading, { crane: keptChoice.crane || '', slinging: keptChoice.slinging || '', answers: keptChoice.answers || {}, chosen: keptChoice.chosen || [] });
        $('scope-results').insertAdjacentHTML('afterbegin', '<p class="note" role="status">The scope reading is back as you left it. Tick the packages you need, then press the Prepare button at the bottom.</p>');
      } else showPackages(reading, null, waited);
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
  const C = () => window.SiteWriteScopeChoice;
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
    // The SWMS title the work prints under, not the reading's generic package name (messy round 15, B run 6: "Trade installation:
    // residential tower" was what she ticked).
    const titled = (aiReading.reading.titles && aiReading.reading.titles[pack.name]) || pack.name;
    const name = offer && !offer.full ? `${esc(C().CRANAGE_TICK)}</strong> <span class="meta">(${esc(titled)}: ${count})</span>` : `${esc(titled)}</strong> <span class="meta">(${count})</span>`;
    const others = full ? ((mapped && mapped.byOthers) || []).map((entry, j) => {
      const yes = C().othersAnswer(choice.answers, pack, entry) === 'yes';
      // The crew's own work that names the same work keeps its step whatever is answered (messy round 10, run 4).
      const own = C().ownWorkNaming ? C().ownWorkNaming(pack.rows, entry.step) : '';
      const ownNote = own ? ` Your own work names it too ("${esc(own.replace(/[.\s]+$/, ''))}"), so its step stays for that work. This answer is about the work done by others.` : '';
      return `<fieldset class="scope-others"><legend>Scope review: ${esc(entry.step.toLowerCase())} by others</legend><p class="meta">${esc(entry.says)}${entry.clause ? ` (${esc(entry.clause)})` : ''} Do you need this in your SWMS?${ownNote}</p><label><input type="radio" name="others-${index}-${j}" data-others="${index}" data-step="${esc(entry.step)}" value="no" ${yes ? '' : 'checked'}> No, leave it out</label> <label><input type="radio" name="others-${index}-${j}" data-others="${index}" data-step="${esc(entry.step)}" value="yes" ${yes ? 'checked' : ''}> Yes, our crew does some of it</label></fieldset>`;
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
    return !count ? 'Prepare the SWMS ticked' : count === 1 ? 'Prepare this SWMS' : `Prepare these ${count} SWMS`;
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
    const note = flags.size && window.SiteWriteHrcw ? ` ${esc(window.SiteWriteHrcw.HRCW_NOTE)}` : '';
    const clause = C().craneClause(reading.reading);
    const crane = kept ? kept.crane : craneNow();
    choice = {
      crane,
      slinging: kept ? kept.slinging || '' : slingingNow(),
      clause,
      answers: kept ? { ...kept.answers } : {},
      // None is ticked to start (messy round 3: 21 of 22 were ticked and had to be unticked one by
      // one). The user ticks what they need, or presses Tick all.
      ticked: new Set(kept ? kept.chosen : []),
    };
    $('scope-results').innerHTML = `${warn}<p class="meta" style="margin-top:10px">The AI found ${work.reduce((sum, pack) => sum + pack.rows.length, 0)} activities in ${work.length} work packages${duties.length ? `, and ${duties.length} ${duties.length === 1 ? 'duty' : 'duties'}` : ''}. Tick each package you need a SWMS for: each one ticked becomes one SWMS. Then press the Prepare button at the bottom.${note}</p>
      <div class="actions scope-tick-all"><button type="button" class="small secondary" data-scope-tick="all">Tick all</button><button type="button" class="small secondary" data-scope-tick="none">Untick all</button></div>
      <div class="scope-packages">${work.map((pack, index) => packageCard(pack, index)).join('')}</div>
      ${duties.length ? `<details class="scope-duties"><summary>${duties.length} ${duties.length === 1 ? 'duty' : 'duties'} in the scope: no SWMS needed</summary><ul>${duties.map((row) => `<li>${esc(row.activity)}</li>`).join('')}</ul></details>` : ''}
      ${conflicts.length ? `<details class="scope-conflicts"><summary>${conflicts.length} possible ${conflicts.length === 1 ? 'conflict' : 'conflicts'} in the scope</summary><ul>${conflicts.map((item) => `<li><strong>${esc(item.clauseA)} and ${esc(item.clauseB)}</strong> (${esc(item.confidence)} confidence): ${esc(item.why)}</li>`).join('')}</ul><button type="button" class="small secondary" id="conflict-open" aria-label="Show the conflicts in full">Show the conflicts in full</button></details>` : ''}
      <div class="actions scope-go"><button type="button" id="scope-confirm">${prepareButton()}</button></div>
      <p class="error" id="scope-choice-error" role="alert"></p>
      <p class="meta">Fill in the site details once. SiteWrite then takes you through each SWMS in turn, and you can download them all together.</p>
      <div class="actions"><button type="button" class="secondary" data-scope-report>Scope review report (Word)</button></div>
      <p class="error" id="scope-report-error"></p>`;
    // After a wait, a message says the reading is finished (with a chime), then any conflicts show.
    // Coming back to change the choice shows neither again.
    if (kept) return;
    if (waited && window.SiteWriteProgress) announceRead(work, () => showConflicts(conflicts));
    else showConflicts(conflicts);
  }

  // Owner, 13 October 2026: a message pops up with a chime when the AI has finished, and its button
  // takes the user to the work packages to choose from.
  function announceRead(packages, after) {
    const any = packages.length > 0;
    window.SiteWriteProgress.announce({
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
    keepChoice();
  });
  // The ticks, crane answer and scope review answers, kept with the finished reading.
  function keepChoice() {
    const kept = keptReading();
    if (!kept || !kept.done || !aiReading || kept.id !== aiReading.id || !choice) return;
    keepReading({ ...kept, choice: { chosen: [...choice.ticked], crane: choice.crane || '', slinging: choice.slinging || '', answers: choice.answers || {} } });
  }
  function redrawCard(work, index, focus) {
    const card = $(`scope-package-${index}`);
    card.outerHTML = packageCard(work[index], index);
    const back = focus && document.querySelector(`#scope-package-${index} ${focus}`);
    if (back) back.focus();
  }

  // Conflicts in the scope open a pop-up. It is not modal, so the tasks can still be used.
  function showConflicts(conflicts) {
    const old = $('conflict-dialog');
    if (old) old.remove();
    const html = window.SiteWriteConflicts ? window.SiteWriteConflicts.conflictDialog(conflicts) : '';
    if (!html) return;
    // In the page above the work packages, so it never covers the form (messy round 3).
    const list = document.querySelector('#scope-results .scope-packages');
    if (list) list.insertAdjacentHTML('beforebegin', html); else document.body.insertAdjacentHTML('beforeend', html);
    const dialog = $('conflict-dialog');
    if (typeof dialog.show === 'function') dialog.show(); else dialog.setAttribute('open', '');
    $('conflict-dialog-title').focus({ preventScroll: true });
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
    // Otherwise it is left unanswered, unless the scope clearly says cranes are used by others for this
    // work (messy round 3: "A crane company" was ticked for scopes that never mention a crane).
    const crane = (work.some((pack) => C().isCranage(pack.name)) ? choice.crane : '') || C().craneFromReading(aiReading.reading);
    const slinging = crane === 'company' ? choice.slinging || '' : '';
    const items = C().projectItems(aiReading.reading, chosen, { answers: choice.answers, crane, slinging });
    startProject(items, { readingId: aiReading.id, state: aiReading.state || '', chosen, answers: choice.answers, crane, slinging });
    // Prepared: the project holds the reading now, and "Change the SWMS chosen" opens it again.
    if (project && project.from && project.from.readingId === aiReading.id) keepReading(null);
  }

  $('scope-results').addEventListener('click', (event) => {
    if (event.target.closest('#scope-confirm')) { confirmPackages(); return; }
    // Tick all or Untick all, in one press. The list stays open.
    const all = event.target.closest('[data-scope-tick]');
    if (all && choice && aiReading) {
      const { work } = C().packagesOf(aiReading.reading);
      choice.ticked = new Set(all.dataset.scopeTick === 'all' ? work.map((pack) => pack.name) : []);
      work.forEach((pack, index) => {
        if (C().isCranage(pack.name)) { redrawCard(work, index, ''); return; }
        const box = document.querySelector(`[data-package="${index}"]`);
        if (box) box.checked = choice.ticked.has(pack.name);
        const card = $(`scope-package-${index}`);
        if (card) card.classList.toggle('off', !choice.ticked.has(pack.name));
      });
      $('scope-choice-error').textContent = '';
      $('scope-confirm').textContent = prepareButton();
      keepChoice();
      return;
    }
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
    // A new task starts from SiteWrite's steps, order, controls and PPE again, as a new SWMS.
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
    window.siteWriteScopeTask = { task: text, kinds: item.kinds || null, leaveOut: item.leaveOut || null, unmatched: item.unmatched || null, scope: item.scopeTask || null };
    document.querySelectorAll('input[name="fallRisk"]').forEach((input) => { input.checked = input.value === item.fallRisk; });
    document.querySelector('input[name="fallRisk"]').dispatchEvent(new Event('change', { bubbles: true }));
    // In a project, openItem moves the page once the project box is drawn.
    if (!label) $('start').scrollIntoView({ behavior: 'smooth', block: 'start' });
    taskEl.focus({ preventScroll: true });
  }

  // A project: every task from the scope, each prepared in turn with the same site details.
  const PROJECT_KEY = 'sitewrite.project';
  let project = null;
  const writeProject = () => { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); } catch { /* not kept */ } };
  const saveProject = () => {
    // A main contractor's list is kept on the server for the company too (Goal 12 stage 6).
    if (project && project.sitelink) { project.sitelink.dirty = true; project.sitelink.page = listPage(); }
    writeProject();
    if (project && project.sitelink) saveListSoon();
  };
  try { project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); } catch { project = null; }

  // from: the reading and the choice the project was made from, so the choice can be changed.
  // Changed, the SWMS already started for packages still chosen are kept as they are.
  function startProject(items, from) {
    const same = project && project.from && project.from.readingId === from.readingId;
    if (same) {
      // The choice is by package; a SWMS's title may be a work title (messy round 9).
      const packOf = (item) => item.package || item.title;
      const dropped = project.items.filter((item) => item.body && !from.chosen.includes(packOf(item)));
      if (dropped.length && !confirm(`Take out ${dropped.map((item) => item.title).join(', ')}? What you prepared for ${dropped.length === 1 ? 'it' : 'them'} will be lost.`)) return;
      items = items.map((item) => project.items.find((old) => packOf(old) === packOf(item) && old.body) || item);
    } else if (project && project.items.some((item) => item.body) && !confirm('Start a new project? The SWMS prepared in the current project will be cleared.')) return;
    // Owner, 13 October 2026 (D239): the SWMS chosen are prepared in one go. The site details are
    // asked once, then one page holds each SWMS's own questions (project-go.js), and one button
    // prepares them all. Answers kept from before stay.
    const before = same ? project : null;
    project = { current: 0, items, from, stage: items.every((item) => item.body) ? 'review' : 'questions', shared: (before && before.shared) || { crane: from.crane || '', site: null, designs: {}, emergency: {} } };
    saveProject();
    // The list has done its job; closing it keeps the page short. The SWMS form waits until a SWMS is opened to check.
    $('scope-panel').open = false;
    showSingle(false);
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

  // The details every SWMS of the project shares, given once on the page above. Opening a SWMS to check
  // never empties them with what it was prepared with before they were given (messy round 3, run 3: the
  // scaffold supervisor went empty after SWMS 4 was ready).
  const SHARED_KEYS = ['workplace', 'principalContractor', 'siteManager', 'scaffoldSupervisor', 'hospital', 'firstAider', 'musterPoint', 'firstAidLocation', 'siteRules', 'worksManager', 'worksManagerPhone', 'complianceResponsible', 'reviewer', 'reviewDate', 'preparedBy'];
  function withPageDetails(body) {
    const now = S.payload ? S.payload() : {};
    const out = { ...body };
    for (const key of SHARED_KEYS) if (String(now[key] || '').trim()) out[key] = now[key];
    return out;
  }
  // Answers given (not empty) only: an empty answer kept with one SWMS does not hide one given since.
  const given = (answers) => Object.fromEntries(Object.entries(answers || {}).filter(([, value]) => typeof value === 'string' && value.trim()));

  // On a builder's list, a detail the builder set that is changed while one SWMS is open is that SWMS's
  // own: the other SWMS keep the detail every SWMS shares, and their ticks (messy round 8, stuck point 4:
  // the first aid location changed in Testing and commissioning cleared the ticks of After hours
  // shutdowns, already submitted). The details above as every SWMS shares them are kept while it is open.
  const listSharedNow = () => {
    const set = window.SiteWriteBuilderSet;
    const now = S.payload ? S.payload() : {};
    return set ? Object.fromEntries(set.KEYS.map((key) => [key, now[key] === undefined ? (key === 'siteRules' ? [] : '') : now[key]])) : {};
  };
  const asBoxes = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Array.isArray(value) ? value.join('\n') : value]));
  function settleOwnDetails() {
    const set = window.SiteWriteBuilderSet;
    if (!project || !project.sitelink || !project.listShared || !set) return;
    const item = project.items[project.current];
    const now = S.payload ? S.payload() : {};
    if (item) {
      const own = { ...(item.pageOwn || {}) };
      for (const field of set.FIELDS) {
        if (!(field.key in project.listShared)) continue;
        // A detail no one had given yet (the scaffold supervisor) given while a SWMS is open is for every
        // SWMS, not this one's own (messy round 11, SiteLink: "For every SWMS, still to give: Scaffold
        // supervisor" stayed after it was filled in).
        const blank = (value) => (Array.isArray(value) ? !value.length : !String(value || '').trim());
        if (blank(project.listShared[field.key]) && !blank(now[field.key]) && !(field.key in own)) { project.listShared[field.key] = now[field.key]; continue; }
        if (set.same(field, now[field.key], project.listShared[field.key])) delete own[field.key];
        else own[field.key] = now[field.key] === undefined ? '' : now[field.key];
      }
      if (Object.keys(own).length) item.pageOwn = own; else delete item.pageOwn;
    }
    // The boxes above go back to what every SWMS shares.
    if (S.fillFields) S.fillFields(asBoxes(project.listShared));
    delete project.listShared;
  }
  S.listOpenTitle = () => (project && project.sitelink && project.stage === 'check' && project.listShared && project.items[project.current] ? project.items[project.current].title : '');

  function openItem(index, { toNeed = false, toCover = false } = {}) {
    if (!project || !project.items[index]) return;
    if (window.SiteWriteProjectGo && window.SiteWriteProjectGo.clearNotes) window.SiteWriteProjectGo.clearNotes();
    // From one open SWMS straight to the next: the one left keeps its own details first.
    if (project.stage === 'check') settleOwnDetails();
    if (project.sitelink) project.listShared = listSharedNow();
    project.current = index;
    // From the one-go page or the review list, a SWMS opens to be checked (D240).
    if (project.stage) project.stage = 'check';
    project.items[index].checked = true;
    showSingle(true);
    // Answers to the emergency questions given in another SWMS of the project fill the same questions here.
    // Only those that fit this SWMS: an answer naming plant it does not use is not filled in (messy round 11).
    const shared = acrossFor(project.items[index]);
    if (project.items[index].body && Object.keys(shared).length) project.items[index].body = { ...project.items[index].body, emergency: { ...shared, ...given(project.items[index].body.emergency) } };
    if (project.items[index].body) project.items[index].body = { ...withPageDetails(project.items[index].body), ...(project.sitelink && project.items[index].pageOwn ? project.items[index].pageOwn : {}) };
    // With none prepared yet, its own details show in the boxes above while it is open.
    else if (project.sitelink && project.items[index].pageOwn && S.fillFields) S.fillFields(asBoxes(project.items[index].pageOwn));
    // Answers given on the one-go page since it was prepared (it is marked as needing preparing again)
    // go with it, so checking it does not bring back the old ones.
    const opened = project.items[index];
    // Only what changed on that page goes over it: the work done inside it stays (messy round 9, A fault 1).
    if (opened.body && opened.stale && window.SiteWriteProjectGo && window.SiteWriteProjectGo.changesFor) {
      const now = window.SiteWriteProjectGo.changesFor(index, project, projectHooks);
      const keep = ['task', 'site', 'facts', 'crane', 'slinging', 'designs', 'movedIn', 'fallRisk', 'ownSteps', 'substancesNotUsed', 'substancesNotUsedWhy'].filter((key) => key in now);
      opened.body = { ...opened.body, ...Object.fromEntries(keep.map((key) => [key, key === 'facts' ? { ...(opened.body.facts || {}), ...now.facts } : now[key]])) };
    }
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
      // To check it, the draft is shown as it will print, with Change this step on each step. With no
      // reply from the server (a 502), it says so with Try again and keeps the SWMS as prepared (messy
      // round 4, A fault 5: it fell back to its task form with no word).
      const failed = (error) => {
        const bar = $('check-bar');
        const text = `${error && error.message && !error.serverDown ? `${error.message} ` : 'SiteWrite could not reach the server, so this SWMS could not be opened. '}It is kept as prepared.`;
        if (bar) { bar.insertAdjacentHTML('beforeend', `<p class="error" role="alert" id="project-open-error">${esc(text)} <button type="button" class="link" data-project-open="${index}">Try again</button></p>`); bar.classList.remove('hidden'); bar.scrollIntoView({ block: 'start' }); }
        else if ($('project-error')) $('project-error').textContent = text;
      };
      S.fillForm(item.body).then((ok) => {
        if (!ok) { failed({ message: ($('start-error') && $('start-error').textContent) || 'This SWMS could not be opened.' }); return; }
        if (item.swmsId) S.editing = { id: item.swmsId, title: item.title };
        if (ok && project.stage === 'check' && S.prepare) {
          S.prepare({ scroll: false }).then(() => {
            // "Go to it" goes straight to the work with no job steps, or the first thing still needed (owner, D287).
            if (toCover && S.goToCover && S.goToCover()) { if (S.markStage) S.markStage('draft'); return; }
            if (toNeed && S.goToFirstNeed && S.goToFirstNeed()) { if (S.markStage) S.markStage('draft'); return; }
            // With nothing left to answer, what it needs is its check, under the draft (D286).
            const check = toNeed && $('new-check');
            if (check) { check.scrollIntoView({ block: 'start' }); if (S.markStage) S.markStage('draft'); return; }
            const bar = $('check-bar');
            if (bar && !bar.classList.contains('hidden')) bar.scrollIntoView({ block: 'start' });
            if (S.markStage) S.markStage('draft');
          }, failed);
        }
      }, failed);
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
    window.siteWriteScopeTask = null;
    showSingle(true);
    const taskEl = $('task');
    taskEl.value = '';
    delete taskEl.dataset.preset;
    taskEl.dispatchEvent(new Event('input', { bubbles: true }));
    renderProject();
    return true;
  }

  // A saved SWMS opened to change from My SWMS ("Fix this in SiteWrite") that is not one of the project's
  // own puts the project aside until the user goes back to it (messy round 4, A fault 11).
  let paused = false;
  S.projectForSaved = (id) => {
    if (!project) return;
    const at = project.items.findIndex((item) => item.swmsId === id);
    if (at >= 0) {
      paused = false;
      project.current = at;
      project.stage = 'check';
      saveProject();
      showSingle(true);
      renderProject();
      return;
    }
    paused = true;
    renderProject();
  };
  function renderProject() {
    const panel = $('project-panel');
    const now = $('project-now');
    const bar = $('check-bar');
    if (!project) { panel.classList.add('hidden'); now.classList.add('hidden'); if (bar) bar.classList.add('hidden'); return; }
    if (paused) {
      panel.classList.add('hidden');
      now.classList.add('hidden');
      showSingle(true);
      if (bar) { bar.innerHTML = '<p>You are changing a saved SWMS. Your project is kept as it was.</p><div class="actions"><button type="button" class="secondary" data-project-resume>Back to the project</button></div>'; bar.classList.remove('hidden'); }
      return;
    }
    // The one-go page and the review list (project-go.js).
    if ((project.stage === 'questions' || project.stage === 'review') && window.SiteWriteProjectGo) {
      now.classList.add('hidden');
      showSingle(false);
      window.SiteWriteProjectGo.render(panel, project, projectHooks);
      panel.classList.remove('hidden');
      return;
    }
    // A SWMS open to check: a bar above its draft says which one, and goes back to the list.
    if (bar) {
      const checking = project.stage === 'check' && project.items[project.current];
      const nextToCheck = checking ? project.items.findIndex((other, index) => index > project.current && !other.checked) : -1;
      // A save refused as the list was saved on another device says so here too (messy round 16, SiteLink).
      const listNote = checking && project.sitelink && project.sitelink.note ? `<p class="warning" role="status" id="list-note-check">${esc(project.sitelink.note)}</p>` : '';
      bar.innerHTML = checking ? `${listNote}<p><strong>Checking SWMS ${project.current + 1} of ${project.items.length}: ${esc(project.items[project.current].title)}.</strong> Read each step as it will print. To change a step's wording, press Change beside its line (on a phone, press Change this step first). Your changes are kept, and SiteWrite learns from them. When it is right, go back to the list.</p>
        <div class="actions"><button type="button" class="secondary" data-project-review>Back to the list of SWMS</button>${nextToCheck >= 0 ? `<button type="button" class="secondary" data-project-open="${nextToCheck}">Check SWMS ${nextToCheck + 1}: ${esc(project.items[nextToCheck].title)}</button>` : ''}</div>` : '';
      bar.classList.toggle('hidden', !checking);
    }
    // While one SWMS is checked, the project box is short: the list is one press away.
    if (project.stage === 'check') {
      // Counted as the list counts them: prepared, not waiting to be prepared again, and checked part by
      // part (messy round 4, run 3: "2 of 2 ready to download" here, while the list said none).
      const ready = project.items.filter((item) => item.status === 'ready' && !item.stale && checkOf(item)).length;
      now.classList.add('hidden');
      panel.innerHTML = `<div class="project-head"><h2>Project SWMS</h2></div>
        <p class="meta">Checking SWMS ${project.current + 1} of ${project.items.length}. ${ready ? `${ready} of ${project.items.length} ready to download.` : 'None ready to download yet: each needs its check under its draft.'}</p>
        <div class="actions"><button type="button" class="secondary" data-project-review>Back to the list of SWMS</button></div>
        <p class="error" id="project-error"></p>`;
      panel.classList.remove('hidden');
      return;
    }
    const ready = project.items.filter((item) => item.status === 'ready').length;
    // Each SWMS is checked on its own (D240, D286): only those checked download.
    const checked = project.items.filter((item) => item.status === 'ready' && checkOf(item)).length;
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
      ${project.items.map((item, index) => (item.status === 'write' ? `<p class="note">SWMS ${index + 1}, ${esc(item.title)}, waits for your own step for the work SiteWrite has no job steps for. Write it with "Write a step for this" above its draft to add this SWMS to the download. ${index === project.current ? '<button type="button" class="link" data-cover-jump>Go to it</button>' : `<button type="button" class="link" data-project-open="${index}">Open it</button>`}</p>` : '')).join('')}
      ${project.items.map((item, index) => (item.status === 'tick' ? `<p class="note">SWMS ${index + 1}, ${esc(item.title)}, has work SiteWrite has no job steps for. Above its draft, write your own step for it, say which of its steps covers it, or say which SWMS covers it, to add this SWMS to the download. ${index === project.current ? '<button type="button" class="link" data-cover-jump>Go to it</button>' : `<button type="button" class="link" data-project-open="${index}">Open it</button>`}</p>` : '')).join('')}
      <div id="project-download">${ready ? (S.canDownload && S.canDownload() ? (checked ? `<div class="actions"><button type="button" id="project-zip">Download ${checked} checked SWMS (Word and PDF, one zip)</button></div>${S.signedIn && S.signedIn() ? '<p class="meta">Downloading saves each SWMS under My SWMS, so every copy printed has a record and a revision.</p>' : ''}` : '') + (checked < ready ? `<p class="note">${ready - checked === 1 ? 'One SWMS is' : `${ready - checked} SWMS are`} ready but not checked yet. Open each, tick each part as checked under its draft, and give your name and role.</p>` : '') : '<p class="note">Sign in, or start the free trial, to download the project\'s SWMS together.</p>') : ''}</div>
      <p class="error" id="project-error"></p>
      <p class="meta" id="project-status" role="status"></p>
      <div class="actions"><button type="button" class="small secondary" id="project-close">Close project</button></div>`;
    panel.classList.remove('hidden');
  }

  // A draft that names work SiteWrite has no job steps for is ready once the box above it is
  // ticked (owner decision D184), or the user has written a step for each part.
  // One with site questions or blanks still to answer (goal 2) needs answers first.
  const statusOf = (item) => {
    if (item.kind !== 'draft' || (item.needs || []).length) return 'needs';
    // Work that is all the task's work (D211) needs the user's own step, not the tick.
    if ((item.notCoveredMain || []).some((part) => !(item.notCoveredWritten || []).includes(part))) return 'write';
    const ticked = [...(item.body.notCoveredConfirmed || []), ...(item.notCoveredWritten || [])];
    return (item.notCovered || []).every((part) => ticked.includes(part)) ? 'ready' : 'tick';
  };
  // The check each SWMS of the project is given under its draft (D286): kept with it, and cleared when a
  // part it ticked changes. checkOf gives a SWMS's check only while it is complete.
  // One that needs preparing again is not checked (messy round 3, D286).
  const checkOf = (item) => (item && !item.stale && item.check && item.check.partHashes && item.check.name && item.check.role ? item.check : null);
  const sameTask = (a, b) => String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();
  // The SWMS open to check is the one shown, also once its task is reworded there: the task box is
  // this SWMS's (messy round 9, A fault 1: the pool task reworded inside it, and every change after was
  // dropped from the project, so the list still said "Not finished" and reopening lost the work).
  const taskShown = (task) => project && project.stage === 'check' && !paused && $('task') && sameTask(task, $('task').value);
  const itemShown = (input) => {
    const item = project && project.items[project.current];
    return item && item.body && input && (sameTask(input.task, item.body.task) || taskShown(input.task)) ? item : null;
  };
  S.projectCheck = (input) => checkOf(itemShown(input));
  // The SWMS open to check is one on a main contractor's list (account.js: no "Save to a site" for it).
  S.onBuilderList = () => { const item = project && project.sitelink && !paused && project.stage === 'check' ? project.items[project.current] : null; return Boolean(item && item.requiredId); };
  // A project SWMS saved or downloaded on its own is that saved SWMS from then on, so Save, Download and
  // Submit add revisions to one record (messy round 11, SiteLink: My SWMS showed 4 SWMS for 2 submitted,
  // and a worker could sign on to a copy never submitted).
  // The answers saved or downloaded are the SWMS's answers from then on, so Submit and Download all send
  // the revision that printed, not an older copy the project kept (messy round 15, SiteLink blocker 1:
  // Generator installation was downloaded as revision 1, then Submit with no change made revision 2).
  S.projectSaved = (input, id, saved) => {
    const item = itemShown(input);
    if (!item || !id) return;
    const body = saved && typeof saved === 'object' && item.body ? { ...saved } : null;
    if (item.swmsId === id && !body) return;
    item.swmsId = id;
    if (body) item.body = body;
    saveProject();
  };
  // The name and role a SWMS was checked by, kept when its ticks come off, so ticking the parts again
  // does not empty them (messy round 9, stuck point 3: "Your role" was empty after "Does not apply").
  S.projectCheckWho = (input) => {
    const item = itemShown(input);
    const from = item && [item.check, item.checkKept, item.checkWho].find((one) => one && (one.name || one.role));
    return from ? { name: from.name || '', role: from.role || '' } : null;
  };
  S.onCheckDone = (input, check, note) => {
    const item = itemShown(input);
    if (!item) return;
    const before = JSON.stringify([item.check || null, item.checkNote || '']);
    const who = check || item.check;
    if (who && (who.name || who.role)) item.checkWho = { name: who.name || '', role: who.role || '' };
    if (check) { item.check = check; delete item.checkNote; } else if (item.check) { delete item.check; if (note) item.checkNote = note; }
    if (JSON.stringify([item.check || null, item.checkNote || '']) === before) return;
    saveProject();
    renderProject();
  };
  // The must-fix items SiteWrite's check found on a project's SWMS, said on the project's list.
  S.onCheckResult = (input, count) => {
    const item = itemShown(input);
    if (!item || (item.mustFix || 0) === count) return;
    if (count) item.mustFix = count; else delete item.mustFix;
    saveProject();
    renderProject();
  };
  S.projectCheckOf = checkOf;

  // The project's other SWMS, by title, for saying which one covers work this SWMS has no steps for.
  S.projectOthers = () => (project && !paused ? project.items.filter((_item, index) => index !== project.current).map((item) => item.title) : []);
  // Owner, D289: in a project, work named as "covered in" another SWMS of the project moves into it, and
  // that SWMS must then give its steps. The work each SWMS has had moved into it: [{ part, from }].
  function movedInto(index) {
    const me = project && project.items[index];
    if (!me) return undefined;
    const out = [];
    project.items.forEach((other, at) => {
      if (at === index) return;
      const named = (other.body && other.body.notCoveredElsewhere) || {};
      for (const [part, title] of Object.entries(named)) if (title === me.title) out.push({ part, from: `SWMS ${at + 1} (${other.title})` });
    });
    return out.length ? out : undefined;
  }
  // The SWMS open to check takes the site answers every SWMS of the project shares (not its own): true for
  // all, or the ids of those still as the project gave them when this SWMS changed others for itself
  // (messy round 10, SiteLink blocker 4).
  S.projectSiteShared = (site) => {
    if (!project || paused || project.stage !== 'check' || project.items.length < 2) return undefined;
    const item = project.items[project.current];
    if (!item) return undefined;
    const shared = (project.shared && project.shared.site) || {};
    const ids = ['liveServices', 'publicInterface', 'otherTrades', 'ground', 'access'].filter((id) => String((site || {})[id] || '').trim() && String((site || {})[id] || '').trim() === String(shared[id] || '').trim());
    if (ids.length === 5 && !item.siteOwn) return true;
    return ids.length ? ids : undefined;
  };
  // Falls changed to Yes on the draft of a project SWMS ("Change my answer to Yes"): the draft waits for
  // the fall questions, so the project keeps the new answer now, and the SWMS needs preparing again. It
  // was lost before (messy round 9: the office admin changed it, and the foreman's list still said No).
  S.projectFallChanged = (value) => {
    if (!project || paused || project.stage !== 'check') return;
    const item = project.items[project.current];
    if (!item || !['yes', 'no'].includes(value)) return;
    item.goFall = value;
    delete item.fallFrom;
    if (item.fallRisk && item.fallRisk !== value) item.fallRisk = value;
    if (item.body) item.body = { ...item.body, fallRisk: value };
    const go = window.SiteWriteProjectGo;
    if (go && go.markStale) go.markStale([project.current], 'Its fall answer changed.');
    saveProject();
  };
  S.projectMovedIn = () => (project && !paused && project.stage === 'check' ? movedInto(project.current) : undefined);
  // Products given in another SWMS of the project, offered in this one (owner, D292): [{ row, from }].
  S.projectProducts = () => {
    if (!project || paused || project.stage !== 'check') return [];
    const out = [];
    project.items.forEach((item, index) => {
      if (index === project.current || !item.body || !Array.isArray(item.body.substances)) return;
      for (const row of item.body.substances) if (row && String(row.product || '').trim() && !out.some((other) => sameWork(other.row.product, row.product))) out.push({ row, from: `SWMS ${index + 1}` });
    });
    return out;
  };
  // Designs given in another SWMS of the project, by the same design (messy round 7: the formwork design given
  // in SWMS 1 was asked again in SWMS 2): [{ row, from }].
  S.projectDesigns = () => {
    if (!project || paused || project.stage !== 'check') return [];
    const out = [];
    project.items.forEach((item, index) => {
      if (index === project.current || !item.body || !Array.isArray(item.body.designs)) return;
      for (const row of item.body.designs) if (row && row.id && row.status === 'given' && String(row.number || '').trim() && !/^(?:added|method)-/.test(row.id) && !out.some((other) => other.row.id === row.id)) out.push({ row, from: `SWMS ${index + 1}` });
    });
    return out;
  };
  // A step written for work, moved with the work from one SWMS of the project to another (messy round 4,
  // A fault 4: one piece of work was written twice). Each SWMS changed is prepared again.
  const sameWork = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const byTitle = (title) => (project ? project.items.findIndex((item, index) => index !== project.current && item.title === title) : -1);
  const ownStepsOf = (item) => (item.body && Array.isArray(item.body.ownSteps) ? item.body.ownSteps : Array.isArray(item.ownSteps) ? item.ownSteps : []);
  function setOwnSteps(at, list, why) {
    const item = project.items[at];
    const next = list.length ? list : undefined;
    item.ownSteps = next;
    if (item.body) item.body = { ...item.body, ownSteps: next };
    if (item.kind) { item.stale = why; if (window.SiteWriteProjectGo && window.SiteWriteProjectGo.uncheck) window.SiteWriteProjectGo.uncheck(item); }
  }
  S.projectGiveStep = (title, step) => {
    const at = byTitle(title);
    if (at < 0 || !step) return false;
    const list = ownStepsOf(project.items[at]).filter((other) => !sameWork(other.name, step.name));
    setOwnSteps(at, [...list, { ...step }], `Work was moved here from SWMS ${project.current + 1}, with your step for it.`);
    saveProject();
    return true;
  };
  S.projectTakeStep = (title, part) => {
    const at = byTitle(title);
    if (at < 0) return null;
    const list = ownStepsOf(project.items[at]);
    const step = list.find((other) => sameWork(other.part, part));
    if (!step) return null;
    setOwnSteps(at, list.filter((other) => other !== step), `Work was moved back to SWMS ${project.current + 1}, with your step for it.`);
    saveProject();
    return { ...step };
  };
  // Work moved into this SWMS, sent back to the SWMS it came from: the move is undone there.
  S.projectSendBack = (part, step) => {
    const me = project && project.items[project.current];
    if (!me) return false;
    const at = project.items.findIndex((other, index) => index !== project.current && other.body && Object.entries(other.body.notCoveredElsewhere || {}).some(([key, title]) => title === me.title && sameWork(key, part)));
    if (at < 0) return false;
    const origin = project.items[at];
    const key = Object.keys(origin.body.notCoveredElsewhere || {}).find((name) => sameWork(name, part));
    const elsewhere = { ...(origin.body.notCoveredElsewhere || {}) };
    delete elsewhere[key];
    const keepOut = (list) => (Array.isArray(list) ? list.filter((name) => !sameWork(name, part)) : list);
    origin.body = { ...origin.body, notCoveredElsewhere: Object.keys(elsewhere).length ? elsewhere : undefined, notCoveredConfirmed: keepOut(origin.body.notCoveredConfirmed), movedOut: keepOut(origin.body.movedOut) };
    const list = ownStepsOf(origin);
    setOwnSteps(at, step ? [...list.filter((other) => !sameWork(other.name, step.name)), { ...step }] : list, `Work you moved to SWMS ${project.current + 1} was sent back: write its step here, or say which SWMS covers it.`);
    origin.status = statusOf(origin);
    saveProject();
    return true;
  };
  S.onCoverTick = (confirmed, elsewhere) => {
    if (paused) return;
    const item = project && project.items[project.current];
    if (!item || !item.body || $('task').value.trim() !== item.body.task.trim()) return;
    const before = project.items.map((_other, at) => JSON.stringify(movedInto(at) || []));
    item.body = { ...item.body, notCoveredConfirmed: confirmed, notCoveredElsewhere: elsewhere };
    item.status = statusOf(item);
    // A SWMS that now has work moved into it, or moved out again, is prepared again with it.
    const changed = project.items.map((_other, at) => at).filter((at) => at !== project.current && JSON.stringify(movedInto(at) || []) !== before[at]);
    for (const at of changed) if (project.items[at].kind) project.items[at].stale = `Work was moved here from SWMS ${project.current + 1}: write its steps in this SWMS.`;
    // Its ticks go with it: it is checked again once prepared (D286).
    for (const at of changed) if (project.items[at].stale && window.SiteWriteProjectGo && window.SiteWriteProjectGo.uncheck) window.SiteWriteProjectGo.uncheck(project.items[at]);
    saveProject();
    renderProject();
  };

  // An answer to an emergency question fills the same question in the project's other SWMS (D239).
  // Each answer given is kept with the ones before it, so another SWMS takes the latest one that fits it
  // (public/gate-rules.js acrossFor): a pump operator's answer does not reach the cranage SWMS, which
  // keeps the earlier answer that fits it (messy round 11, run 1).
  function shareEmergency(answers) {
    if (!project || !answers || typeof answers !== 'object') return;
    project.shared = project.shared || { site: null, designs: {}, emergency: {} };
    const given = Object.fromEntries(Object.entries(answers).filter(([, value]) => typeof value === 'string' && value.trim()));
    project.shared.emergency = { ...(project.shared.emergency || {}), ...given };
    const all = project.shared.emergencyAll = project.shared.emergencyAll || {};
    for (const [id, value] of Object.entries(given)) {
      const list = (all[id] || []).filter((answer) => answer !== value);
      all[id] = [...list, value].slice(-8);
    }
  }
  // The words that say what a SWMS of the project uses: its task and the plant its draft lists.
  const itemWords = (item) => [item && item.task, item && item.goTask, item && item.body && item.body.task, ...((item && item.plantNames) || [])].filter(Boolean).join('\n');
  // The emergency answers given in the project's other SWMS that fit this one.
  function acrossFor(item) {
    const shared = (project && project.shared) || {};
    const rules = window.SiteWriteGate;
    if (!rules || !rules.acrossFor) return { ...(shared.emergency || {}) };
    return rules.acrossFor(shared.emergencyAll || {}, shared.emergency || {}, itemWords(item));
  }
  S.emergencyAcross = acrossFor;

  // As the user answers under the draft (app.js), the SWMS in the project takes the answers that print
  // as given, and what it still needs. A change that needs the draft prepared again waits for it.
  S.onAnswers = ({ task, needs, answers, stale }) => {
    if (paused) return;
    const item = project && project.items[project.current];
    const same = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    if (stale || !item || !item.body || item.kind !== 'draft' || (same(task) !== same(item.body.task) && !taskShown(task))) return;
    const before = JSON.stringify([item.needs, item.status]);
    item.body = { ...item.body, ...answers };
    shareEmergency(answers.emergency);
    item.needs = needs;
    item.status = statusOf(item);
    saveProject();
    if (JSON.stringify([item.needs, item.status]) !== before) renderProject();
  };

  // Each prepared draft is kept against its task; the result gets a Next SWMS button.
  // The emergency answers a SWMS keeps: only those its draft asks (download-gate.js gateChecks). An
  // answer given for another SWMS of the project then does not change this one's saved input, so a
  // SWMS not changed keeps its revision when the project is downloaded again (D278).
  const askedEmergency = (draft) => (draft && draft.kind === 'draft' && Array.isArray(draft.gateChecks)
    ? draft.gateChecks.filter((check) => check.kind === 'emergency' && typeof check.id === 'string').map((check) => check.id.replace(/^emergency\./, ''))
    : null);
  const keptEmergency = (body, asked) => {
    if (!asked || !body || !body.emergency) return body;
    const kept = Object.fromEntries(Object.entries(body.emergency).filter(([id]) => asked.includes(id)));
    return { ...body, emergency: Object.keys(kept).length ? kept : undefined };
  };
  function keepDesigns(rows) {
    if (!project || !Array.isArray(rows)) return;
    project.shared = project.shared || { site: null, designs: {}, emergency: {} };
    project.shared.designs = project.shared.designs || {};
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.status || /^(?:added|method)-\d+$/.test(row.id)) continue;
      const { file: _file, read: _read, ...kept } = row;
      project.shared.designs[row.id] = { ...(project.shared.designs[row.id] || {}), ...kept };
    }
  }
  S.askedEmergency = askedEmergency;
  S.keptEmergency = keptEmergency;
  S.onDraft = (draft, body) => {
    if (!project || paused) return;
    const item = project.items[project.current];
    // The task box has one sentence to a line (useTask), so spacing is not compared.
    const same = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    // The task as given on the one-go page (goTask) counts as the same SWMS, and so does the task
    // reworded in the box while it is open to check (messy round 9, A fault 1).
    if (!item || (same(body.task) !== same(item.task) && same(body.task) !== same(item.goTask) && !taskShown(body.task))) return;
    item.emergencyAsked = askedEmergency(draft) || item.emergencyAsked;
    item.body = keptEmergency(body, item.emergencyAsked);
    item.kind = draft.kind;
    if (draft.kind === 'draft') item.plantNames = (draft.plant || []).map((row) => row && row.item).filter(Boolean);
    // Prepared again here with the answers as they are now, it no longer needs preparing again (messy
    // round 6, run 4: the list said both SWMS needed preparing again and were not checked, right after
    // they were checked).
    delete item.stale;
    delete item.checkKept;
    shareEmergency(body.emergency);
    // The one-go page shows the answers as last given here (project-go.js). Site answers changed while
    // checking this SWMS become its own, so Prepare all does not put the shared ones back over them.
    if (project.stage) {
      item.facts = { ...(body.facts || {}) };
      item.goTask = body.task;
      const sharedSite = (project.shared && project.shared.site) || {};
      const site = body.site && typeof body.site === 'object' ? body.site : null;
      const same = (a, b) => ['liveServices', 'publicInterface', 'otherTrades', 'ground', 'access'].every((id) => String((a || {})[id] || '').trim() === String((b || {})[id] || '').trim());
      if (project.stage === 'check' && site && !same(site, item.siteOwn || sharedSite)) item.siteOwn = { ...site };
    }
    item.notCovered = draft.notCovered || [];
    item.notCoveredWritten = draft.notCoveredWritten || [];
    item.notCoveredMain = draft.notCoveredMain || [];
    item.highAfter = (draft.jobSteps || []).map((step, at) => (step.risk && step.risk.after && step.risk.after.level === 'High' ? `step ${at + 1} (${step.step})` : '')).filter(Boolean);
    // A design answered in this SWMS ("Not issued yet") is the project's answer for it too: the one-go
    // page shows it, and Prepare all keeps it (messy round 4, run 3: it was lost on reopening).
    keepDesigns(body.designs);
    // What the one-go page sends for it now is what it was prepared with: Prepare all puts in only what
    // changes there after this (project-go.js changesFor).
    if (project.stage && window.SiteWriteProjectGo && window.SiteWriteProjectGo.markSent) window.SiteWriteProjectGo.markSent(project.current, project, projectHooks);
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
    if (open) { openItem(Number(open.dataset.projectOpen), { toNeed: open.dataset.projectNeed !== undefined, toCover: open.dataset.projectCover !== undefined }); return; }
    if (event.target.closest('[data-project-review]')) { backToReview(); return; }
    if (event.target.closest('[data-project-resume]')) {
      paused = false;
      S.editing = null;
      const result = $('result');
      if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
      renderProject();
      requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
      return;
    }
    if (event.target.closest('#project-close, #project-fresh, [data-list-close]')) {
      if (project && project.sitelink) { closeBuilderList(); return; }
      closeProject('Close this project and start fresh? SWMS you have not downloaded or saved will need preparing again.');
      return;
    }
    if (event.target.closest('#project-zip')) {
      $('project-error').textContent = '';
      // Said once, beside the button where there is one: on a phone the top of the list is far away.
      const near = $('project-zip-error');
      if (near) near.textContent = '';
      const say = (text) => { (near || $('project-error')).textContent = text; };
      // Each SWMS carries its own check (D240 "Review each, download all", D286): only those checked go.
      // One that needs preparing again after an answer changed waits until it is (messy round 3).
      const ready = project.items.filter((item) => item.status === 'ready' && item.body && !item.stale && checkOf(item));
      if (!ready.length) { say('Check each SWMS first: open it, tick each part as checked under its draft, and give your name and role.'); return; }
      const button = event.target.closest('#project-zip');
      button.disabled = true;
      try {
        // The SWMS open now, if it was saved or downloaded on its own, is that saved SWMS.
        const open = project.items[project.current];
        if (open && !open.swmsId && S.editing && S.editing.id) open.swmsId = S.editing.id;
        const swms = ready.map((item) => ({ ...item.body, swmsTitle: item.title, swmsNumber: project.items.indexOf(item) + 1, swmsId: item.swmsId || undefined, check: checkOf(item) }));
        const site = S.siteId ? S.siteId() : '';
        // Word and PDF of each, in one zip (D240).
        const result = await S.download('/api/project.zip', 'SiteWrite-project-SWMS.zip', { swms, siteId: site || undefined, pdf: true });
        // Downloaded: the note that the work is not saved yet goes, and stays gone after a reload (messy round 15, A run 1;
        // round 16, A runs 1 and 3).
        if (S.unsavedDownloaded) S.unsavedDownloaded(); else if (S.unsavedNoteOff) S.unsavedNoteOff();
        // Each SWMS is saved as a record when the project is downloaded; later changes save as its next revision.
        for (const saved of (result && result.items) || []) if (ready[saved.index]) ready[saved.index].swmsId = saved.id;
        saveProject();
        if (result && result.items && result.items.length) {
          // The page says how many were downloaded, and which are not ready yet (project-go.js, D278).
          project.downloaded = new Date().toISOString();
          project.lastDownload = { at: project.downloaded, count: result.items.length, total: project.items.length };
          saveProject();
          renderProject();
          // The list from before projects were prepared in one go says it on its status line.
          if ($('project-status')) $('project-status').textContent = `Saved ${result.items.length} SWMS under My SWMS, each as its own revision, and downloaded them as Word and PDF in one zip. Changes you make to one now save as its next revision.`;
          const said = $('go-downloaded');
          if (said && said.scrollIntoView) said.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (error) {
        say(error.message);
      } finally {
        button.disabled = false;
      }
    }
  });

  // Back to the review list from a SWMS being checked: the list shows what each still needs.
  async function backToReview() {
    if (!project) return;
    // An answer changed in the SWMS being checked but not yet put into its draft goes in first, so
    // going back to the list (or the phone's Back) keeps it.
    if (project.stage === 'check' && S.liveGate && S.liveGate().stale && S.prepare) {
      try { await S.prepare({ scroll: false }); } catch { /* the draft says what went wrong */ }
    }
    settleOwnDetails();
    project.stage = 'review';
    saveProject();
    renderProject();
    if (S.drawSetBy) S.drawSetBy();
    requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
    if (S.markStage) S.markStage('review');
  }

  S.renderProject = () => renderProject();
  // The one-go page or the review list is shown: the work of each SWMS is with the project (app.js
  // restoreUnsaved brings back only the details above, not a draft under the list).
  S.projectListOpen = () => Boolean(project && !paused && (project.stage === 'questions' || project.stage === 'review'));
  // The phone's Back button from a SWMS being checked goes back to the list (app.js).
  S.projectReview = () => { if (project && project.stage === 'check') backToReview(); else if (project && project.stage) requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' })); };
  // What the one-go page and the review list (project-go.js) use of the project.
  const projectHooks = {
    save: saveProject,
    render: renderProject,
    open: openItem,
    statusOf,
    useTask,
    movedInto: (index) => movedInto(index),
    close: () => (project && project.sitelink ? closeBuilderList() : closeProject('Close this project and start fresh? SWMS you have not downloaded or saved will need preparing again.')),
    builder: () => (project && project.sitelink) || null,
    changedList: () => { if (project && project.sitelink) { project.current = 0; saveProject(); } },
    changeChoice: () => changeChoice(),
  };

  // ---- A main contractor's list (Goal 12 stage 6) ----
  // A list the company took up opens here as a project: its SWMS already listed, the builder's site
  // details filled in above (each marked "Set by {builder}", from-builders.js), and the company's work
  // kept on the server as well as on this device, so the office can start on a desktop and the foreman
  // finish on a phone. The company's own details always come from its profile (builder-set.js), and
  // the main contractor never sees any of this work.
  const ASIDE_KEY = 'sitewrite.project.aside';
  // The details above that every SWMS of the list shares, as kept for the company: never its company details.
  const LIST_PAGE_KEYS = ['state', 'residential', 'workplace', 'principalContractor', 'siteManager', 'scaffoldSupervisor', 'hospital', 'firstAider', 'firstAidLocation', 'musterPoint', 'siteRules', 'worksManager', 'worksManagerPhone', 'complianceResponsible', 'reviewer', 'reviewDate', 'date', 'preparedBy'];
  function listPage() {
    // While a SWMS is open, the details every SWMS shares are kept, not that SWMS's own.
    const now = { ...(S.payload ? S.payload() : {}), ...((project && project.listShared) || {}) };
    // An emptied first aid location or site rules box is kept as empty, so it counts as a change.
    const empty = { firstAidLocation: '', siteRules: [] };
    return Object.fromEntries(LIST_PAGE_KEYS.map((key) => [key, now[key] === undefined && key in empty ? empty[key] : now[key]]).filter(([, value]) => value !== undefined));
  }
  const sameText = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
  // Each SWMS of a list is known by the builder's id for it, or its own id (one the company added).
  const itemKey = (item) => (item && (item.requiredId || item.ownId || item.wasRequired)) || '';
  // The answers filled across from one SWMS to another name it by its place in the list: when the list
  // changes (a SWMS taken off, put back, or new from the builder), each points to the same SWMS again.
  function remapIndexes(before, after) {
    const keyAt = before.map(itemKey);
    const placeOf = new Map(after.map((item, index) => [itemKey(item), index]));
    const moved = (at) => (Number.isInteger(at) && keyAt[at] && placeOf.has(keyAt[at]) ? placeOf.get(keyAt[at]) : undefined);
    for (const item of after) {
      if (item.filledFrom) {
        for (const [question, at] of Object.entries(item.filledFrom)) {
          const to = moved(at);
          if (to === undefined) delete item.filledFrom[question]; else item.filledFrom[question] = to;
        }
      }
      if (item.fallFrom !== undefined) {
        const to = moved(item.fallFrom);
        if (to === undefined) delete item.fallFrom; else item.fallFrom = to;
      }
    }
  }
  S.remapProjectIndexes = remapIndexes;

  // The company's saved work brought together with the list as the builder has it now: a SWMS new on
  // the list is added; one the builder took off stays, as the company's own; one whose work the builder
  // changed is marked to prepare again.
  function reconcile(saved, list) {
    const builder = list.builder.name;
    const fresh = (item) => ({ ...item, body: null, status: 'todo' });
    if (!saved || !Array.isArray(saved.items)) return { current: 0, stage: 'questions', items: list.items.map(fresh), offList: [], shared: { crane: '', site: null, designs: {}, emergency: {} } };
    const had = new Map(saved.items.filter((item) => item.requiredId).map((item) => [item.requiredId, item]));
    const off = new Map((saved.offList || []).filter((item) => item && item.requiredId).map((item) => [item.requiredId, item]));
    const update = (before, item) => {
      const next = { ...before, title: item.title, task: item.task, scopeTask: item.scopeTask, site: item.site, plant: item.plant, kinds: item.kinds, leaveOut: item.leaveOut, unmatched: item.unmatched, highRisk: item.highRisk, clauses: item.clauses, alsoCovers: item.alsoCovers, draftNotes: item.draftNotes };
      if (!sameText(before.task, item.task)) {
        next.workChanged = `${builder} changed the work for this SWMS.`;
        if (before.goTask !== undefined && sameText(before.goTask, before.task)) delete next.goTask;
        if (next.kind && !next.stale) {
          next.stale = `${builder} changed the work for it.`;
          if (window.SiteWriteProjectGo && window.SiteWriteProjectGo.uncheck) window.SiteWriteProjectGo.uncheck(next);
        }
      }
      return next;
    };
    const items = [];
    for (const item of list.items) {
      if (off.has(item.requiredId)) continue;
      items.push(had.has(item.requiredId) ? update(had.get(item.requiredId), item) : { ...fresh(item), newOnList: true });
    }
    for (const [id, item] of had) if (!list.items.some((one) => one.requiredId === id)) items.push({ ...item, requiredId: undefined, wasRequired: id, own: true, ownId: item.ownId || `was-${id}` });
    for (const item of saved.items) if (!item.requiredId) items.push(item);
    remapIndexes(saved.items, items);
    const offList = [...off.values()].map((item) => { const now = list.items.find((one) => one.requiredId === item.requiredId); return now ? update(item, now) : null; }).filter(Boolean);
    // A SWMS open to check on another device is not open here: the list shows instead.
    const stage = saved.stage === 'check' ? (items.some((item) => item.kind) ? 'review' : 'questions') : saved.stage || 'questions';
    return { ...saved, current: 0, stage, items, offList, shared: saved.shared || { crane: '', site: null, designs: {}, emergency: {} } };
  }

  // The details above, as the company last had them, with the builder's where it has not changed them.
  function fillPage(page) {
    const values = { ...page };
    if (Array.isArray(values.siteRules)) values.siteRules = values.siteRules.join('\n');
    if (S.fillFields) S.fillFields(values);
    const tick = (name, value, tries = 0) => {
      if (!value) return;
      const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
      if (!radio) { if (tries < 25) setTimeout(() => tick(name, value, tries + 1), 200); return; }
      if (!radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    tick('state', page.state);
    tick('residential', page.residential);
    if (S.showBuilderFields) S.showBuilderFields(true);
  }
  // The builder's details taken off the page when the list is closed, so they are not left in the next SWMS.
  function clearListPage() {
    const set = window.SiteWriteBuilderSet;
    // Through the form's own filling, so what it says of the job address follows.
    if (set && S.fillFields) S.fillFields(Object.fromEntries(set.FIELDS.map((field) => [field.key, ''])));
    if (S.showBuilderFields) S.showBuilderFields();
  }

  function sitelinkOf(data, saved, before) {
    const list = data.list;
    return {
      id: list.id, builder: list.builder, project: list.project, subcontractor: list.subcontractor, due: list.due, contact: list.contact, answers: list.answers,
      siteDetails: list.siteDetails, builderSet: list.builderSet, seen: saved.seen || {}, listItems: list.items,
      // Stage 7: what the company has submitted on the list, the responses, conditions and the log.
      sent: data.sent || (before && before.sent) || null,
      version: saved.version || 0, savedOn: saved.updatedOn || '', savedBy: saved.updatedBy || '',
      dirty: false, page: saved.page || {}, note: (before && before.note) || '',
    };
  }

  // Opens a list the company took up (from-builders.js gives it as the server sent it).
  S.openBuilderList = async (data) => {
    const list = data.list;
    const saved = data.progress || {};
    // The list already on this device is brought up to date, keeping work not yet saved.
    if (project && project.sitelink && project.sitelink.id === list.id) {
      paused = false;
      S.syncBuilderList(data);
      $('scope-panel').open = false;
      if (project.stage !== 'check') showSingle(false);
      renderProject();
      requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
      return;
    }
    if (project && !(project.sitelink && project.sitelink.id === list.id)) {
      // Another project on this page is put aside, and comes back when the list is closed.
      if (!project.sitelink) { try { localStorage.setItem(ASIDE_KEY, JSON.stringify(project)); } catch { /* not kept */ } }
      else await flushList().catch(() => {});
    }
    paused = false;
    project = reconcile(saved.project, list);
    project.sitelink = sitelinkOf(data, saved);
    document.body.classList.add('from-builder');
    fillPage(saved.page || {});
    writeProject();
    $('scope-panel').open = false;
    showSingle(false);
    renderProject();
    if (S.drawSetBy) S.drawSetBy();
    requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
  };

  // The work a save holds, to tell whether anything changed since the last save from this device. Which
  // SWMS is open and the page's stage are where this device is, not work (sitelink-subbie.js sameWork).
  const workOf = (body) => {
    const parts = window.SiteWriteCheckParts;
    const { current, stage, ...rest } = body.project || {};
    const value = { project: rest, page: body.page || {} };
    return parts && parts.stable ? parts.stable(JSON.parse(JSON.stringify(value))) : JSON.stringify(value);
  };
  // The list on this device, brought up to date from the server (another device may have saved since).
  S.builderListLocal = () => (project && project.sitelink ? project.sitelink.id : '');
  S.builderInfo = () => (project && project.sitelink) || null;
  S.syncBuilderList = (data) => {
    if (!project || !project.sitelink || project.sitelink.id !== data.list.id || !data.progress) return;
    const local = project.sitelink;
    const saved = data.progress;
    if (saved.version > (local.version || 0)) {
      // Changes made here count only when the work differs from this device's last save (a reload marks
      // the page changed when nothing is).
      const { sitelink: mine, ...work } = project;
      const changedHere = local.dirty && !(local.savedWork && local.savedWork === workOf({ project: work, page: listPage() }));
      const note = changedHere ? `This list was saved on another device${saved.updatedBy ? ` by ${saved.updatedBy}` : ''} on ${saved.updatedOn}. The newest work is shown. Changes made on this device since were not kept.` : '';
      project = reconcile(saved.project, data.list);
      project.sitelink = { ...sitelinkOf(data, saved), note };
      fillPage(saved.page || {});
    } else {
      // This device is up to date: the builder's list and details as they are now, the work as it is here.
      const set = window.SiteWriteBuilderSet;
      const merged = set ? set.mergePage({ company: (S.getProfile && S.getProfile()) || {}, builderSet: data.list.builderSet, page: local.page, seen: local.seen }) : { page: local.page, seen: local.seen };
      const { sitelink, ...rest } = project;
      project = reconcile(rest, data.list);
      // On this device a SWMS open to check stays open: the same SWMS, not SWMS 1 (messy round 11, SiteLink:
      // a reload on a draft opened SWMS 1, not the one being checked).
      project.stage = rest.stage || project.stage;
      const was = (rest.items || [])[rest.current];
      const key = (item) => (item ? item.requiredId || item.ownId || item.title : '');
      const at = was ? project.items.findIndex((item) => key(item) && key(item) === key(was)) : -1;
      if (at >= 0) project.current = at;
      project.sitelink = { ...sitelinkOf(data, { ...saved, page: merged.page, seen: merged.seen }), version: local.version, dirty: local.dirty, savedWork: local.savedWork || '' };
      fillPage(merged.page);
      if (local.dirty) saveListSoon();
    }
    document.body.classList.add('from-builder');
    writeProject();
    renderProject();
    if (S.drawSetBy) S.drawSetBy();
    // After a reload on a SWMS being checked, its draft opens again, not an empty form under its name.
    const open = project.stage === 'check' && project.items[project.current];
    if (open && open.body && $('result') && $('result').classList.contains('hidden')) openItem(project.current);
  };

  // Signed out, a list from a main contractor does not stay on a shared phone: it is the company's.
  S.dropBuilderList = () => {
    if (!project || !project.sitelink) return '';
    const name = project.sitelink.builder.name;
    leaveList();
    return name;
  };
  function leaveList() {
    clearTimeout(listTimer);
    clearListPage();
    let aside = null;
    try { aside = JSON.parse(localStorage.getItem(ASIDE_KEY) || 'null'); localStorage.removeItem(ASIDE_KEY); } catch { aside = null; }
    project = aside && Array.isArray(aside.items) ? aside : null;
    if (project) writeProject(); else { try { localStorage.removeItem(PROJECT_KEY); } catch { /* nothing kept */ } }
    document.body.classList.remove('from-builder');
    window.siteWriteScopeTask = null;
    showSingle(true);
    renderProject();
    if (S.drawSetBy) S.drawSetBy();
  }

  // Closing the list keeps the work: it is the company's, on the server, and opens again from the list.
  async function closeBuilderList() {
    if (!project || !project.sitelink) return false;
    const builder = project.sitelink.builder.name;
    if (!confirm(`Close the list from ${builder}? Your work on it is kept for your company. Open it again from From main contractors.`)) return false;
    await flushList().catch(() => {});
    if (project && project.sitelink && project.sitelink.dirty && !confirm('Your latest changes could not be saved to SiteWrite: it could not be reached. Close anyway? They are lost if you do.')) return false;
    leaveList();
    if (S.showPanel) S.showPanel('from-builders');
    return true;
  }

  // Kept on the server a moment after the last change, and when the page is put away.
  // This page load's own id: a save whose answer was lost (a 502) is known as this page's when it is sent
  // again with more work, not taken for another device's (messy round 15, SiteLink blocker 1).
  const PAGE_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  let listTimer = null;
  let listSaving = null;
  function saveListSoon(wait = 2500) {
    clearTimeout(listTimer);
    listTimer = setTimeout(() => { saveList().catch(() => {}); }, wait);
  }
  const savedLine = (link) => (link.offline ? 'Not saved to SiteWrite yet: it could not be reached. Your work is kept on this device, and is saved when SiteWrite can be reached.'
    : link.savedOn ? `Saved for your company on ${link.savedOn}. Anyone in your team can carry on, on any device.` : 'Saved for your company as you go. Anyone in your team can carry on, on any device.');
  S.listSavedLine = () => (project && project.sitelink ? savedLine(project.sitelink) : '');
  function sayList(text, kind = '') {
    if (project && project.sitelink) project.sitelink.note = text;
    const el = $('list-note');
    if (el) { el.textContent = text; el.className = `${kind || 'note'}${text ? '' : ' hidden'}`; }
  }
  async function saveList() {
    clearTimeout(listTimer);
    if (!project || !project.sitelink || !project.sitelink.dirty || !S.signedIn || !S.signedIn()) return;
    if (listSaving) { await listSaving.catch(() => {}); if (project && project.sitelink && project.sitelink.dirty) saveListSoon(300); return; }
    const link = project.sitelink;
    const { sitelink, ...rest } = project;
    const body = { baseVersion: link.version || 0, project: rest, page: listPage(), pageId: PAGE_ID };
    const work = workOf(body);
    link.dirty = false;
    // Nothing changed since this device last saved (a reload, a box typed back as it was): no save, so
    // another device's next save is not refused (messy round 8, stuck point 1).
    if (link.savedWork && link.savedWork === work && !link.offline) { writeProject(); return; }
    listSaving = S.call('PUT', `/api/from-builders/${encodeURIComponent(link.id)}/progress`, body).then((data) => {
      if (!project || !project.sitelink || project.sitelink.id !== link.id) return;
      Object.assign(project.sitelink, { version: data.version, savedOn: data.savedOn, overrides: data.overrides, offline: false, savedWork: work });
      writeProject();
      const el = $('list-saved');
      if (el) el.textContent = savedLine(project.sitelink);
    }, (error) => {
      if (!project || !project.sitelink || project.sitelink.id !== link.id) return;
      project.sitelink.dirty = true;
      if (error.status === 409 && error.data && error.data.progress) {
        const saved = error.data.progress;
        // This device had nothing new since its last save: the newer work is taken up with no warning,
        // as nothing here was lost.
        const nothingNew = Boolean(link.savedWork) && link.savedWork === work;
        // The newer work from the other device is shown; the builder's list is as this page last had it.
        // The page says so wherever the person is, the SWMS being checked included (messy round 16, SiteLink: a stale
        // phone page's save was refused and nothing showed). With nothing new here, it says the newest work is shown.
        const note = nothingNew ? error.message : `${error.message} Changes made on this device since were not kept.`;
        project = reconcile(saved.project, { builder: link.builder, items: link.listItems || [] });
        project.sitelink = { ...link, version: saved.version, savedOn: saved.updatedOn, savedBy: saved.updatedBy, seen: saved.seen, page: saved.page, dirty: false, offline: false, savedWork: '', note };
        fillPage(saved.page || {});
        writeProject();
        renderProject();
        if (S.drawSetBy) S.drawSetBy();
        sayList(note, 'warning');
        // The saved line names the newest save, the other device's, as the note above it does: left as this page's own last
        // save, the two times differed (messy round 18, SiteLink smaller fault: 9:57 pm in the note, 9:56 pm on the line).
        { const el = $('list-saved'); if (el) el.textContent = savedLine(project.sitelink); }
        return;
      }
      if (error.status === 404) { sayList(error.message, 'warning'); return; }
      if (error.status === 402) { sayList(error.message, 'warning'); return; }
      project.sitelink.offline = true;
      writeProject();
      const el = $('list-saved');
      if (el) el.textContent = savedLine(project.sitelink);
      saveListSoon(15000);
    }).finally(() => { listSaving = null; });
    await listSaving;
  }
  async function flushList() {
    if (listSaving) await listSaving.catch(() => {});
    if (project && project.sitelink && project.sitelink.dirty) await saveList();
  }
  S.flushBuilderList = flushList;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && project && project.sitelink && project.sitelink.dirty) saveList().catch(() => {}); });
  // The details above are part of the list's work too: a change to one is kept, and the "Set by" notes follow.
  ['input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
    if (!project || !project.sitelink || !event.target.closest || !event.target.closest('#job-details')) return;
    saveProject();
    if (S.drawSetBy) S.drawSetBy();
  }));
  // A list on this device opens with its own state, the details above as last given here; signed in,
  // from-builders.js brings it up to date from the server.
  if (project && project.sitelink) {
    document.body.classList.add('from-builder');
    fillPage(project.sitelink.page || {});
  }

  // On a computer the scope section starts open, so a person whose way in is a scope sees where to
  // attach it (messy round 4, run 1: it started closed and the scope went into the logo box). A project
  // in progress keeps it closed; on a phone it starts closed, to keep the page short.
  if (!project && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) $('scope-panel').open = true;
  renderProject();
})();
