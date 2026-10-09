// The builder SWMS check page (task #106). Not linked from anywhere yet (#78 comes after launch).
// A SWMS is uploaded or pasted, or a SiteReady draft is checked, and the page shows the score,
// the findings and the email to copy. Signed-in users only; the session is the main page's.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let session = '';
  try { session = localStorage.getItem('siteready.session') || ''; } catch { /* not kept */ }
  if (!session) $('signedOut').classList.remove('hidden');
  let mode = 'upload';

  function setMode(next) {
    mode = next;
    $('tabUpload').setAttribute('aria-selected', String(next === 'upload'));
    $('tabDraft').setAttribute('aria-selected', String(next === 'draft'));
    $('uploadPart').classList.toggle('hidden', next !== 'upload');
    $('draftPart').classList.toggle('hidden', next !== 'draft');
  }
  $('tabUpload').addEventListener('click', () => setMode('upload'));
  $('tabDraft').addEventListener('click', () => setMode('draft'));

  fetch('/api/states').then((response) => response.json()).then((data) => {
    // Blank by default, so an uploaded SWMS is checked under the state it states, not Queensland's.
    // A state chosen here overrides the document's.
    $('state').innerHTML = `<option value="">As stated in the SWMS</option>${data.states.filter((state) => state.loaded).map((state) => `<option value="${esc(state.id)}">${esc(state.name)}</option>`).join('')}`;
  }).catch(() => {});

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
  }

  async function body() {
    const common = { state: $('state').value, to: $('to').value, from: $('from').value };
    if (mode === 'draft') {
      if (!$('state').value) throw new Error('Choose the state or territory of the work.');
      return { ...common, draft: { state: $('state').value, task: $('task').value, fallRisk: $('fallRisk').value, workplace: $('workplace').value, principalContractor: $('principalContractor').value, complianceResponsible: $('responsible').value } };
    }
    const file = $('file').files[0];
    return file ? { ...common, file: { name: file.name, data: await readFile(file) } } : { ...common, text: $('text').value };
  }

  function show(data) {
    $('score').textContent = data.score;
    const band = $('band');
    band.textContent = data.band;
    band.className = `band ${data.band === 'Accepted' ? 'accepted' : data.band === 'Accepted with changes' ? 'changes' : 'rejected'}`;
    const option = [...$('state').options].find((item) => item.value && item.value === data.state);
    const stateLine = option ? `Checked under ${option.textContent} law.` : 'No state was found in the SWMS, so the national model WHS Regulations were used. Choose the state above and check again.';
    $('taskLine').textContent = `${data.task ? `Task: ${String(data.task).replace(/\.$/, '')}. ` : ''}${stateLine}`;
    const notFound = $('notFound');
    notFound.classList.toggle('hidden', !(data.notFound && data.notFound.length));
    notFound.innerHTML = data.notFound && data.notFound.length ? `<strong>Check these lines against the SWMS.</strong> The AI gave them, but they are not word for word in the document:<ul>${data.notFound.slice(0, 10).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : '';
    $('subject').value = data.email.subject;
    $('email').value = data.email.body;
    const ordered = [...data.findings.filter((item) => item.hard && !item.pass), ...data.findings.filter((item) => !item.hard && !item.pass), ...data.findings.filter((item) => item.pass)];
    $('findings').innerHTML = ordered.map((item) => `<li class="${item.pass ? 'pass' : 'fail'}">
      <span class="rule">${esc(item.rule)} ${esc(item.title)}</span>
      ${item.hard ? (item.pass ? ' (passed)' : ' (must fix)') : ` (${item.points} of ${item.max})`}
      <div>${esc(item.message)}</div>
      <div class="source">Source: ${esc(item.source)}</div></li>`).join('');
    $('result').classList.remove('hidden');
  }

  const headers = () => ({ 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {}) });
  async function answer(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'The SWMS could not be checked. Try again.');
    return data;
  }
  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const minutes = (seconds) => (seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`);

  // An uploaded or pasted SWMS is read by the AI, which takes up to a few minutes for a long one, so
  // the server starts the check and the page asks for the result every few seconds until it is ready.
  async function waitForCheck(started) {
    const progress = $('progress');
    const begun = Date.now();
    const clock = () => { $('elapsed').textContent = minutes(Math.round((Date.now() - begun) / 1000)); };
    clock();
    progress.classList.remove('hidden');
    progress.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const ticking = setInterval(clock, 1000);
    try {
      let check = started;
      while (check.status === 'checking') {
        if (Date.now() - begun > 20 * 60 * 1000) throw new Error('The check is taking too long. Try again later.');
        await wait(3000);
        check = await answer(await fetch(`/api/check/${encodeURIComponent(check.id)}`, { headers: headers() }));
      }
      if (check.status !== 'done') throw new Error(check.error || 'The SWMS could not be checked. Try again.');
      return check;
    } finally {
      clearInterval(ticking);
      progress.classList.add('hidden');
    }
  }

  $('checkForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('error').innerHTML = '';
    $('result').classList.add('hidden');
    $('go').disabled = true;
    $('go').textContent = 'Checking...';
    try {
      const data = await answer(await fetch('/api/check', { method: 'POST', headers: headers(), body: JSON.stringify(await body()) }));
      show(data.status === 'checking' ? await waitForCheck(data) : data);
    } catch (error) {
      $('error').innerHTML = `<div class="bad">${esc(error.message)}</div>`;
    } finally {
      $('go').disabled = false;
      $('go').textContent = 'Check the SWMS';
    }
  });

  $('copy').addEventListener('click', async () => {
    const text = `Subject: ${$('subject').value}\n\n${$('email').value}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      $('email').select();
      document.execCommand('copy');
    }
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy the email'; }, 2000);
  });
})();
