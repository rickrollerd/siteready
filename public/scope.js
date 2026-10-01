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
        </div>`).join('')
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
    const button = event.target.closest('[data-scope-task]');
    const item = button && found[Number(button.dataset.scopeTask)];
    if (!item) return;
    const taskEl = $('task');
    if (taskEl.value.trim() && taskEl.value.trim() !== taskEl.dataset.preset && !confirm('Replace the task you have written?')) return;
    taskEl.value = item.task;
    taskEl.dataset.preset = item.task;
    document.querySelectorAll('input[name="fallRisk"]').forEach((input) => { input.checked = input.value === item.fallRisk; });
    document.querySelector('input[name="fallRisk"]').dispatchEvent(new Event('change', { bubbles: true }));
    $('start').scrollIntoView({ behavior: 'smooth', block: 'start' });
    taskEl.focus();
  });
})();
