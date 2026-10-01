// Workers open this page from the QR code, read the SWMS and sign with a finger.
(() => {
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const show = (id, text) => { $(id).textContent = text; $(id).classList.remove('hidden'); };

  async function load() {
    try {
      const response = await fetch(`/api/sign/${encodeURIComponent(token)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'This sign-on link is not valid.');
      $('title').textContent = data.title;
      $('where').textContent = [data.company, data.workplace].filter(Boolean).join(' · ');
      $('risks').innerHTML = data.highRisk.length ? data.highRisk.map((item) => `<li>${esc(item)}</li>`).join('') : '<li>Not identified as high risk construction work.</li>';
      $('steps').innerHTML = data.jobSteps.map((step, index) => `
        <details>
          <summary>${index + 1}. ${esc(step.step)}</summary>
          <p class="meta" style="margin-top:6px">Hazards</p><ul>${step.hazards.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
          <p class="meta" style="margin-top:6px">Controls</p><ul>${step.controls.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </details>`).join('');
      const worn = data.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.label));
      $('ppe').innerHTML = worn.map((item) => `<li>${esc(item)}</li>`).join('') || '<li>None listed.</li>';
      $('swms').classList.remove('hidden');
      $('sign-form').classList.remove('hidden');
      setUpPad();
    } catch (error) {
      $('title').textContent = 'Sign-on';
      show('load-error', error.message);
    }
  }

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

  $('sign-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('sign-error').classList.add('hidden');
    if (!drawn) return show('sign-error', 'Sign in the box first.');
    if (!$('confirmed').checked) return show('sign-error', 'Tick the box to confirm the SWMS has been explained to you.');
    $('submit').disabled = true;
    try {
      const response = await fetch(`/api/sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('name').value, company: $('company').value, signature: signatureImage(), confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The sign-on could not be saved.');
      $('sign-form').classList.add('hidden');
      show('done', data.message);
    } catch (error) {
      show('sign-error', error.message);
      $('submit').disabled = false;
    }
  });

  load();
})();
