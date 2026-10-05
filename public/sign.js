// Workers open this page from the QR code, read the SWMS and sign with a finger.
// The form stays locked until the worker has read to the end and each section has been on
// screen for its minimum reading time. The server checks the time again, and the answers.
(() => {
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const show = (id, text) => { $(id).textContent = text; $(id).classList.remove('hidden'); };
  const api = `/api/sign/${encodeURIComponent(token)}`;

  let data = null;
  let translated = null;
  let language = { code: 'en' };
  const translations = {};
  const seconds = {};
  const visible = {};
  let reachedEnd = false;
  let unlocked = false;
  let finished = false;

  // A translated item with its English beneath; English only when no translation is chosen.
  function both(english, other) {
    if (!translated || other === undefined) return esc(english);
    const dir = language.rtl ? 'rtl' : 'ltr';
    return `<span class="tr" lang="${esc(language.code)}" dir="${dir}">${esc(other)}</span><span class="en" lang="en" dir="ltr">${esc(english)}</span>`;
  }
  const list = (items, others = []) => items.map((item, i) => `<li>${both(item, others[i])}</li>`).join('');

  function render() {
    const tr = translated || {};
    const steps = tr.steps || [];
    const minimum = Object.fromEntries(data.sections.map((item) => [item.id, item.minSeconds]));
    const section = (id, inner) => `<section class="read" id="sec-${id}" data-section="${id}" data-min="${minimum[id]}">${inner}</section>`;
    $('title-translated').innerHTML = translated ? `<span lang="${esc(language.code)}" dir="${language.rtl ? 'rtl' : 'ltr'}">${esc(tr.title)}</span>` : '';
    $('sections').innerHTML = [
      section('risks', `<h2>High risk work</h2><ul>${data.highRisk.length ? list(data.highRisk, tr.highRisk) : '<li>Not identified as high risk construction work.</li>'}</ul>`),
      `<h2 id="steps-start">Job steps</h2>`,
      ...data.jobSteps.map((step, index) => {
        const other = steps[index] || {};
        return section(`step-${index + 1}`, `<h3>${index + 1}. ${both(step.step, other.step)}</h3>
          <p class="meta">Hazards</p><ul>${list(step.hazards, other.hazards)}</ul>
          <p class="meta">Controls</p><ul>${list(step.controls, other.controls)}</ul>`);
      }),
      section('ppe', `<h2>PPE to wear</h2><ul>${data.ppe.length ? list(data.ppe, tr.ppe) : '<li>None listed.</li>'}</ul>`),
    ].join('');
    const picked = {};
    document.querySelectorAll('#questions input:checked').forEach((input) => { picked[input.name] = input.value; });
    $('questions').innerHTML = data.questions.length ? `<p class="meta">Answer these to show you have read the SWMS.</p>${data.questions.map((q, n) => {
      const other = (tr.questions || [])[n] || {};
      return `<fieldset class="q" id="q-${q.id}"><legend>${n + 1}. ${both(q.question, other.question)}</legend>${q.options.map((option, i) => `
        <label><input type="radio" name="${q.id}" value="${i}"${picked[q.id] === String(i) ? ' checked' : ''}><span>${both(option, (other.options || [])[i])}</span></label>`).join('')}</fieldset>`;
    }).join('')}` : '';
    observe();
    progress();
  }

  // A section counts while at least half of it, or most of the screen, shows it.
  let observer = null;
  function observe() {
    if (observer) observer.disconnect();
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.id === 'end') {
          if (entry.isIntersecting) reachedEnd = true;
          continue;
        }
        const screen = entry.rootBounds ? entry.rootBounds.height : window.innerHeight;
        visible[entry.target.dataset.section] = entry.isIntersecting && (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= 0.6 * screen);
      }
      progress();
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    document.querySelectorAll('.read').forEach((element) => observer.observe(element));
    observer.observe($('end'));
  }

  // Time is only counted while the page is on screen.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const step = (now - last) / 1000;
    last = now;
    if (!data || finished || document.visibilityState !== 'visible' || step > 2) return;
    for (const id of Object.keys(visible)) if (visible[id]) seconds[id] = (seconds[id] || 0) + step;
    progress();
  }, 250);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  function progress() {
    if (!data || finished) return;
    let read = 0;
    for (const item of data.sections) {
      const done = (seconds[item.id] || 0) >= item.minSeconds;
      if (done) read += 1;
      const element = $(`sec-${item.id}`);
      if (element) element.classList.toggle('is-read', done);
    }
    const total = data.sections.length;
    const ready = read === total && reachedEnd;
    if (ready && !unlocked) unlocked = true;
    $('progress').textContent = $('explained').checked
      ? 'Your supervisor has explained the SWMS. Sign on below.'
      : unlocked ? 'You have read the SWMS. Answer the questions and sign on below.'
      : `Read ${read} of ${total} sections${read === total ? '. Scroll to the end.' : '. Take your time with each one.'}`;
    lock();
  }

  function lock() {
    const explained = $('explained').checked;
    $('locked').disabled = !(unlocked || explained);
    $('questions').classList.toggle('hidden', explained);
    $('supervisor-field').classList.toggle('hidden', !explained);
  }

  async function load() {
    try {
      const response = await fetch(api);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'This sign-on link is not valid.');
      data = body;
      $('title').textContent = data.title;
      $('where').textContent = [data.company, data.workplace].filter(Boolean).join(' · ');
      if (data.languages.length) {
        $('language').innerHTML += data.languages.map((item) => `<option value="${esc(item.code)}">${esc(item.label)}</option>`).join('');
        $('language-panel').classList.remove('hidden');
      }
      render();
      $('swms').classList.remove('hidden');
      $('sign-form').classList.remove('hidden');
      $('progress').classList.remove('hidden');
      setUpPad();
    } catch (error) {
      $('title').textContent = 'Sign-on';
      show('load-error', error.message);
    }
  }

  $('language').addEventListener('change', async () => {
    const code = $('language').value;
    $('language-status').classList.add('hidden');
    if (code === 'en') {
      translated = null;
      language = { code: 'en' };
    } else {
      try {
        if (!translations[code]) {
          show('language-status', 'Translating. This can take a minute the first time.');
          $('language').disabled = true;
          const response = await fetch(`${api}/translation?lang=${encodeURIComponent(code)}`);
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || 'The translation could not be made.');
          translations[code] = body;
        }
        translated = translations[code];
        language = translated.language;
        $('language-status').classList.add('hidden');
      } catch (error) {
        show('language-status', error.message);
        $('language').value = language.code;
      } finally {
        $('language').disabled = false;
      }
    }
    $('banner').classList.toggle('hidden', !translated);
    $('less-reliable').classList.toggle('hidden', !(translated && language.lessReliable));
    render();
  });

  $('explained').addEventListener('change', progress);

  // The signature pad draws with a finger, stylus or mouse.
  let drawn = false;
  function setUpPad() {
    const pad = $('pad');
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const size = () => {
      pad.width = pad.clientWidth * ratio;
      pad.height = pad.clientHeight * ratio;
      const context = pad.getContext('2d');
      context.scale(ratio, ratio);
      context.lineWidth = 2.2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#1c2430';
      drawn = false;
    };
    size();
    let last = null;
    const point = (event) => {
      const box = pad.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    pad.addEventListener('pointerdown', (event) => {
      if ($('locked').disabled) return;
      pad.setPointerCapture(event.pointerId);
      last = point(event);
    });
    pad.addEventListener('pointermove', (event) => {
      if (!last) return;
      const next = point(event);
      const context = pad.getContext('2d');
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(next.x, next.y);
      context.stroke();
      last = next;
      drawn = true;
    });
    const stop = () => { last = null; };
    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);
    $('clear').addEventListener('click', size);
  }

  // The signature is sent small, as a 360 x 120 picture.
  function signatureImage() {
    const out = document.createElement('canvas');
    out.width = 360;
    out.height = 120;
    const context = out.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, out.width, out.height);
    context.drawImage($('pad'), 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  const SECTION_NAMES = { ppe: ['sec-ppe', 'PPE to wear'], steps: ['steps-start', 'Job steps'] };

  $('sign-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('sign-error').classList.add('hidden');
    document.querySelectorAll('.q.wrong').forEach((element) => element.classList.remove('wrong'));
    const explained = $('explained').checked;
    if (explained && !$('supervisor').value.trim()) return show('sign-error', 'Enter the name of the supervisor who explained the SWMS to you.');
    if (!drawn) return show('sign-error', 'Sign in the box first.');
    if (!$('confirmed').checked) return show('sign-error', 'Tick the box to confirm the SWMS has been explained to you.');
    const answers = {};
    if (!explained) {
      for (const q of data.questions) {
        const chosen = document.querySelector(`#questions input[name="${q.id}"]:checked`);
        if (!chosen) return show('sign-error', 'Answer each question before you sign on.');
        answers[q.id] = Number(chosen.value);
      }
    }
    const reading = { sections: Object.fromEntries(data.sections.map((item) => [item.id, Math.round((seconds[item.id] || 0) * 10) / 10])) };
    $('submit').disabled = true;
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('name').value, company: $('company').value, signature: signatureImage(), confirmed: true,
          readId: data.readId, answers, language: language.code, reading,
          explained, supervisor: explained ? $('supervisor').value : '',
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        // A wrong answer names the question and links to the section to read again.
        if (Array.isArray(body.wrong)) {
          body.wrong.forEach((id) => { const element = $(`q-${id}`); if (element) element.classList.add('wrong'); });
          $('sign-error').innerHTML = `${esc(body.message)} ${(body.sections || []).filter((id) => SECTION_NAMES[id]).map((id) => `<a href="#${SECTION_NAMES[id][0]}">Go to ${SECTION_NAMES[id][1]}</a>`).join(' ')}`;
          $('sign-error').classList.remove('hidden');
          $('submit').disabled = false;
          return;
        }
        throw new Error(body.message || 'The sign-on could not be saved.');
      }
      finished = true;
      $('sign-form').classList.add('hidden');
      $('progress').classList.add('hidden');
      show('done', body.message);
    } catch (error) {
      show('sign-error', error.message);
      $('submit').disabled = false;
    }
  });

  load();
})();
