// The progress bar shown while the AI reads a scope (scope.js) or a written methodology
// (method-read.js), and the message with a chime when the reading is finished (owner, 13 October
// 2026). The AI does not report its progress, so the bar is driven by what is known: the reading's
// stage on the server (step 1 reads the document, step 2 matches the work to the job step library)
// and the time taken against the time a document of this length usually takes. It eases towards
// 95% and shows 100% only once the reading is done. Used by the browser, the server (the expected
// time) and the tests.
(function (root) {
  // Expected seconds for a reading of a document this long. Fitted to 37 real scope readings
  // (2,841 to 347,991 characters, 62 to 770 seconds, October 2026) with a margin, so most finish
  // before it: about 3 minutes for a 15 page scope and 12 minutes for a 300,000 character one.
  function expectedSeconds(characters) {
    const thousands = Math.max(1, Number(characters) || 0) / 1000;
    return Math.round(Math.max(60, 50 * Math.pow(thousands, 0.48)));
  }

  // How far along a share of the time is, from 0 towards 1, never reaching it: steady to 0.85 at
  // the expected time, then creeping more and more slowly, so a long reading never stalls.
  function ease(share) {
    const t = Math.max(0, Number(share) || 0);
    if (t <= 1) return 0.85 * t * (1.4 - 0.4 * t);
    return 0.85 + 0.15 * (1 - 1 / (1 + 3.4 * (t - 1)));
  }

  // Step 1 is most of the work: it ends at 80%. Step 2, the smaller call, runs from 80% to 95%.
  const STEP_ONE = 0.75;
  const STEP_ONE_TOP = 80;
  const TOP = 95;

  // The percentage for a reading: 100 only when done, otherwise below 95.
  // elapsed and stageElapsed are seconds; stage is 'reading', 'steps' or '' (not known).
  function percent({ done = false, elapsed = 0, expected = 60, stage = '', stageElapsed = 0 } = {}) {
    if (done) return 100;
    const time = Math.max(30, Number(expected) || 60);
    if (stage === 'steps') return STEP_ONE_TOP + (TOP - STEP_ONE_TOP) * ease(stageElapsed / (time * (1 - STEP_ONE)));
    if (stage === 'reading') return STEP_ONE_TOP * ease(elapsed / (time * STEP_ONE));
    return TOP * ease(elapsed / time);
  }

  const api = { expectedSeconds, percent, ease, TOP };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  // ---- In the browser ----

  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const doc = root.document;
  const byId = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const now = () => Date.now();

  // A small worker digging with a shovel. It moves along the bar with the percentage.
  const WORKER = `<svg class="rp-worker-svg" viewBox="0 0 32 32" width="32" height="32" focusable="false" aria-hidden="true">
    <ellipse class="rp-mound" cx="26" cy="30" rx="5" ry="2"/>
    <circle class="rp-dirt" cx="26" cy="26" r="1.1"/>
    <g class="rp-body">
      <path class="rp-legs" d="M11.5 21 L10 30 M14.5 21 L16 30"/>
      <path class="rp-vest" d="M10 12.5 Q13 11.5 16 12.5 L16.5 21.5 L9.5 21.5 Z"/>
      <path class="rp-stripe" d="M9.8 18 L16.3 18"/>
      <circle class="rp-head" cx="13" cy="8.6" r="2.9"/>
      <path class="rp-hat" d="M9.6 8 Q13 2.8 16.4 8 Z M9 8 L17.6 8"/>
      <g class="rp-dig">
        <path class="rp-arm" d="M14.5 13.5 L19 17.5 M12 14 L17 20"/>
        <path class="rp-handle" d="M16 15 L25.5 25.5"/>
        <path class="rp-blade" d="M24.2 24.4 L28 23.6 L28.8 27.4 L25.6 28.6 Z"/>
      </g>
    </g>
  </svg>`;

  const trackers = new Map();
  let count = 0;
  let timer = null;

  function tickAll() {
    for (const tracker of trackers.values()) tracker.draw();
    if (![...trackers.values()].some((tracker) => tracker.state === 'running') && timer) {
      root.clearInterval(timer);
      timer = null;
    }
  }

  function minutes(seconds) {
    const m = Math.max(1, Math.round(seconds / 60));
    return `${m} minute${m === 1 ? '' : 's'}`;
  }

  // One reading's bar. what: 'scope' or 'methodology'. Its HTML can be drawn again at any time
  // (a card redrawn mid-reading) and shows where the reading is.
  function track({ what = 'scope', lead = '', steps = ['Reading every word', 'Matching the work to SiteWrite\'s job steps'] } = {}) {
    count += 1;
    const id = `read-progress-${count}`;
    const tracker = {
      id,
      what,
      state: 'running',
      shown: 0,
      expected: 0,
      elapsed: 0,
      stage: '',
      stageElapsed: 0,
      seenAt: now(),
      // What the server said about the reading: { stage, elapsedSeconds, stageSeconds, expectedSeconds }.
      update(progress) {
        if (!progress) return tracker;
        tracker.expected = Number(progress.expectedSeconds) || tracker.expected || 60;
        tracker.elapsed = Number(progress.elapsedSeconds) || 0;
        tracker.stage = progress.stage || '';
        tracker.stageElapsed = Number(progress.stageSeconds) || 0;
        tracker.seenAt = now();
        tracker.draw();
        return tracker;
      },
      // The percentage now, never lower than shown before.
      value() {
        if (tracker.state === 'done') return 100;
        if (tracker.state !== 'running') return tracker.shown;
        const since = Math.max(0, (now() - tracker.seenAt) / 1000);
        const next = percent({ elapsed: tracker.elapsed + since, expected: tracker.expected || 60, stage: tracker.stage, stageElapsed: tracker.stageElapsed + since });
        tracker.shown = Math.max(tracker.shown, Math.floor(next));
        return tracker.shown;
      },
      slow() {
        const since = Math.max(0, (now() - tracker.seenAt) / 1000);
        return tracker.state === 'running' && tracker.expected > 0 && tracker.elapsed + since > tracker.expected;
      },
      stageText() {
        if (tracker.state === 'done') return 'Finished';
        if (tracker.state === 'failed') return 'Stopped';
        if (tracker.stage === 'steps') return `Step 2 of 2: ${steps[1]}`;
        if (tracker.stage === 'reading') return `Step 1 of 2: ${steps[0]}`;
        return steps[0];
      },
      html() {
        const value = tracker.value();
        const about = tracker.expected ? ` For a ${what} this long it usually takes about ${minutes(tracker.expected)}.` : '';
        return `<div class="read-progress" id="${id}" data-state="${tracker.state}" style="--p:${value}">
          ${tracker.state === 'running' ? `<p class="rp-lead">${esc(lead)}${esc(about)} You can leave this page open and come back. A message shows when it is finished.</p>` : ''}
          <div class="rp-bar">
            <div class="rp-worker">${WORKER}</div>
            <div class="rp-track" role="progressbar" aria-label="${esc(`Reading the ${what}`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-valuetext="${value} percent"><div class="rp-fill"></div></div>
          </div>
          <p class="rp-row"><span class="rp-stage" aria-live="polite">${esc(tracker.stageText())}</span> <strong class="rp-pc">${value}%</strong></p>
          <p class="meta rp-slow${tracker.slow() ? '' : ' hidden'}">Taking longer than usual. It is still reading.</p>
        </div>`;
      },
      // Moves the bar on the page, where it is shown.
      draw() {
        const el = byId(id);
        if (!el || !el.querySelector) return;
        const value = tracker.value();
        if (el.style && el.style.setProperty) el.style.setProperty('--p', String(value));
        el.setAttribute('data-state', tracker.state);
        const bar = el.querySelector('.rp-track');
        if (bar) { bar.setAttribute('aria-valuenow', String(value)); bar.setAttribute('aria-valuetext', `${value} percent`); }
        const pc = el.querySelector('.rp-pc');
        if (pc) pc.textContent = `${value}%`;
        const stage = el.querySelector('.rp-stage');
        if (stage && stage.textContent !== tracker.stageText()) stage.textContent = tracker.stageText();
        const slow = el.querySelector('.rp-slow');
        if (slow) slow.classList.toggle('hidden', !tracker.slow());
      },
      finish() { tracker.state = 'done'; tracker.shown = 100; tracker.draw(); trackers.delete(id); },
      fail() { tracker.state = 'failed'; tracker.draw(); trackers.delete(id); },
      stop() { trackers.delete(id); },
    };
    trackers.set(id, tracker);
    if (!timer && root.setInterval) timer = root.setInterval(tickAll, 500);
    return tracker;
  }

  // ---- The chime ----

  // Browsers only let a page play sound after the user has pressed something on it, so the sound is
  // set up on the press that starts the reading, and played when the reading is finished.
  let audio = null;
  function unlockAudio() {
    try {
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context) return;
      if (!audio) audio = new Context();
      if (audio.state === 'suspended' && audio.resume) audio.resume().catch(() => {});
    } catch {
      audio = null;
    }
  }

  // A short rising three-note chime, made in the browser: no sound file. Silent if sound is blocked.
  function chime() {
    try {
      unlockAudio();
      if (!audio) return;
      const play = () => {
        const start = audio.currentTime + 0.05;
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
          const at = start + index * 0.16;
          const tone = audio.createOscillator();
          const gain = audio.createGain();
          tone.type = 'sine';
          tone.frequency.setValueAtTime(frequency, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
          tone.connect(gain);
          gain.connect(audio.destination);
          tone.start(at);
          tone.stop(at + 0.65);
        });
      };
      if (audio.state === 'suspended' && audio.resume) audio.resume().then(play).catch(() => {});
      else play();
    } catch {
      // Sound is a nicety; the message on screen is what matters.
    }
  }

  // ---- The tab's title while the page is not seen ----

  let title = null;
  function restoreTitle() {
    if (title === null || !doc) return;
    if (doc.hidden || (doc.hasFocus && !doc.hasFocus())) return;
    doc.title = title;
    title = null;
  }
  function markTitle(text) {
    if (!doc || !('title' in doc)) return;
    const unseen = doc.hidden || (doc.hasFocus && !doc.hasFocus());
    if (!unseen) return;
    if (title === null) title = doc.title;
    doc.title = `Ready: ${text} | ${title}`;
  }
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', restoreTitle);
  if (root.addEventListener) root.addEventListener('focus', restoreTitle);

  // ---- The message when a reading is finished ----

  // An alert dialog with focus on its button, the chime, and the tab's title changed while the page
  // is not seen. go runs on the main button; after runs however it is closed.
  function announce({ heading, text, button, tab, go, after }) {
    const old = byId('read-done');
    if (old) { if (old.close) { try { old.close(); } catch { /* already closed */ } } old.remove(); }
    // Not modal, and at the foot of the screen: the list it is about stays in view and can be ticked at
    // once (messy round 6, runs 1 and 7: on a phone it covered the package list until it was closed).
    doc.body.insertAdjacentHTML('beforeend', `<dialog class="read-done" id="read-done" role="alertdialog" aria-labelledby="read-done-title" aria-describedby="read-done-text">
  <p class="read-done-mark" aria-hidden="true">&#10003;</p>
  <h2 id="read-done-title">${esc(heading)}</h2>
  <p id="read-done-text">${esc(text)}</p>
  <div class="actions"><button type="button" data-read-done-go>${esc(button)}</button> <button type="button" class="secondary" data-read-done-close>Close</button></div>
</dialog>`);
    const dialog = byId('read-done');
    let closed = false;
    const close = (andGo) => {
      if (closed) return;
      closed = true;
      if (dialog.close && dialog.open !== false) { try { dialog.close(); } catch { /* already closed */ } }
      dialog.removeAttribute('open');
      restoreTitle();
      if (andGo && go) go();
      if (after) after();
    };
    dialog.addEventListener('click', (event) => {
      const target = event.target;
      if (target.closest && target.closest('[data-read-done-go]')) close(true);
      else if (target.closest && target.closest('[data-read-done-close]')) close(false);
    });
    // Escape closes it, as Close does.
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(false); });
    dialog.addEventListener('close', () => close(false));
    // A tap anywhere else on the page (a package ticked) closes it.
    const outside = (event) => {
      if (closed) { doc.removeEventListener('click', outside, true); return; }
      if (event.target && event.target.closest && event.target.closest('#read-done')) return;
      doc.removeEventListener('click', outside, true);
      close(false);
    };
    doc.addEventListener('click', outside, true);
    if (typeof dialog.show === 'function') { try { dialog.show(); } catch { dialog.setAttribute('open', ''); } } else dialog.setAttribute('open', '');
    const first = dialog.querySelector && dialog.querySelector('[data-read-done-go]');
    if (first && first.focus) first.focus();
    markTitle(tab || heading);
    chime();
    return dialog;
  }

  root.SiteWriteProgress = { ...api, track, unlockAudio, chime, announce };
})(typeof window !== 'undefined' ? window : globalThis);
