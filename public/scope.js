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

  function show(data) {
    found = data.tasks || [];
    const note = data.note ? `<p class="note">${esc(data.note)}</p>` : '';
    $('scope-results').innerHTML = note + (found.length
      ? `<p class="meta" style="margin-top:10px">${found.length} ${found.length === 1 ? 'task' : 'tasks'} found. Tasks marked high risk construction work need a SWMS by law; most builders ask for one for every task. Check each one against the scope before you rely on it.</p>` + found.map((item, index) => `
        <div class="scope-task">
          <h3>${esc(item.title)}${item.needsSwms ? ' <span class="tag-risk">High risk</span>' : ''}</h3>
          <p>${esc(item.task)}</p>
          ${(item.highRisk || []).length ? `<p class="meta">High risk construction work: ${esc(item.highRisk.join('; '))}</p>` : ''}
          <details><summary>From the scope (${item.lines.length} ${item.lines.length === 1 ? 'line' : 'lines'})</summary><ul>${item.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>
          <button type="button" class="small" data-scope-task="${index}">Use this task</button>
        </div>`).join('') + (found.length > 1 ? `<div class="actions" style="margin-top:12px"><button type="button" id="project-start">Prepare a SWMS for every task (${found.length})</button></div><p class="meta">Fill in the site details once. SiteReady then takes you through each SWMS in turn, and you can download them all together.</p>` : '')
      : '<p class="note">No site work that needs a SWMS was found. If the scope does include site work, paste the part that describes it.</p>');
  }

  $('scope-read').addEventListener('click', async () => {
    const button = $('scope-read');
    $('scope-error').textContent = '';
    const file = $('scope-file').files[0];
    const text = $('scope-text').value.trim();
    if (!file && !text) {
      $('scope-error').textContent = 'Attach the scope or paste it first.';
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      $('scope-error').textContent = 'The file is too large. Attach the scope only, or paste it.';
      return;
    }
    button.disabled = true;
    try {
      const body = file ? { file: { name: file.name, data: await readFile(file) } } : { text };
      const response = await fetch(api('/api/scope'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The scope could not be read.');
      show(data);
    } catch (error) {
      $('scope-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $('scope-results').addEventListener('click', (event) => {
    if (event.target.closest('#project-start')) { startProject(); return; }
    const button = event.target.closest('[data-scope-task]');
    const item = button && found[Number(button.dataset.scopeTask)];
    if (!item) return;
    const taskEl = $('task');
    if (taskEl.value.trim() && taskEl.value.trim() !== taskEl.dataset.preset && !confirm('Replace the task you have written?')) return;
    useTask(item);
  });

  function useTask(item) {
    const taskEl = $('task');
    taskEl.value = item.task;
    // A new task starts from SiteReady's step order and PPE again.
    taskEl.dispatchEvent(new Event('input', { bubbles: true }));
    taskEl.dataset.preset = item.task;
    $('task-trade').value = item.trade || '';
    // The scope reader's steps for this task are ticked when the task is used as it stands.
    window.siteReadyScopeTask = { task: item.task, kinds: item.kinds || null };
    document.querySelectorAll('input[name="fallRisk"]').forEach((input) => { input.checked = input.value === item.fallRisk; });
    document.querySelector('input[name="fallRisk"]').dispatchEvent(new Event('change', { bubbles: true }));
    $('start').scrollIntoView({ behavior: 'smooth', block: 'start' });
    taskEl.focus();
  }

  // A project: every task from the scope, each prepared in turn with the same site details.
  const PROJECT_KEY = 'siteready.project';
  let project = null;
  const saveProject = () => { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); } catch { /* not kept */ } };
  try { project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); } catch { project = null; }

  function startProject() {
    if (project && project.items.some((item) => item.body) && !confirm('Start a new project? The SWMS prepared in the current project will be cleared.')) return;
    project = { current: 0, items: found.map((item) => ({ title: item.title, task: item.task, trade: item.trade || '', kinds: item.kinds || null, fallRisk: item.fallRisk || '', body: null, status: 'todo' })) };
    saveProject();
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
    useTask(project.items[index]);
    renderProject();
    // With the site details already filled in, go straight to this SWMS's questions.
    const start = $('start');
    if (index > 0 && start.checkValidity() && document.querySelector('input[name="fallRisk"]:checked')) start.requestSubmit($('continue'));
  }

  function renderProject() {
    const panel = $('project-panel');
    if (!project) { panel.classList.add('hidden'); return; }
    const ready = project.items.filter((item) => item.status === 'ready').length;
    const label = { ready: 'Ready', needs: 'Needs answers', todo: 'To do' };
    panel.innerHTML = `<h2>Project SWMS</h2>
      <p class="meta">${ready} of ${project.items.length} ready. Site details stay filled in from one SWMS to the next.</p>
      <ul class="project-list">${project.items.map((item, index) => `<li class="${index === project.current ? 'current' : ''}"><span>${index + 1}. ${esc(item.title)}</span><span><span class="project-status ${item.status === 'ready' ? 'ready' : item.status === 'needs' ? 'needs' : ''}">${label[item.status]}${index === project.current ? ', open now' : ''}</span> <button type="button" class="small secondary" data-project-open="${index}">${item.status === 'todo' ? 'Start' : 'Open'}</button></span></li>`).join('')}</ul>
      <div id="project-download">${ready ? (S.canDownload && S.canDownload() ? `${S.confirmBlock('project')}<div class="actions"><button type="button" id="project-zip">Download ${ready} SWMS (Word, one zip)</button></div>` : '<p class="note">Sign in, or start the free trial, to download the project\'s SWMS together.</p>') : ''}</div>
      <p class="error" id="project-error"></p>
      <div class="actions"><button type="button" class="small secondary" id="project-close">Close project</button></div>`;
    panel.classList.remove('hidden');
  }

  // Each prepared draft is kept against its task; the result gets a Next SWMS button.
  S.onDraft = (draft, body) => {
    if (!project) return;
    const item = project.items[project.current];
    if (!item || body.task.trim() !== item.task.trim()) return;
    item.body = body;
    item.status = draft.kind === 'draft' ? 'ready' : 'needs';
    saveProject();
    renderProject();
    const next = project.items.findIndex((other, index) => index > project.current && other.status !== 'ready');
    const box = document.getElementById('result-actions');
    if (box && next >= 0) box.insertAdjacentHTML('afterbegin', `<div class="actions" style="margin-bottom:12px"><button type="button" data-project-open="${next}">Next SWMS: ${esc(project.items[next].title)}</button></div>`);
  };

  document.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-project-open]');
    if (open) { openItem(Number(open.dataset.projectOpen)); return; }
    if (event.target.closest('#project-close')) {
      if (!confirm('Close this project? SWMS you have not downloaded or saved will need preparing again.')) return;
      project = null;
      try { localStorage.removeItem(PROJECT_KEY); } catch { /* nothing kept */ }
      renderProject();
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
        const swms = project.items.filter((item) => item.status === 'ready' && item.body).map((item) => ({ ...item.body, swmsTitle: item.title }));
        await S.download('/api/project.zip', 'SiteReady-project-SWMS.zip', { swms, reviewConfirmed: true, reviewedBy: name });
      } catch (error) {
        $('project-error').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }
  });

  renderProject();
})();
