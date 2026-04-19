// ============================================================
// KAHOOT QUIZ EXPORTER
// Run in DevTools console on: https://create.kahoot.it/my-library/kahoots/all
// Adds an "Export All Quizzes" button to the library toolbar.
// Each quiz is saved as a self-contained .json file with images
// embedded as base64 data URLs.
// ============================================================
(function () {
  'use strict';

  const REQUIRED_URL = 'https://create.kahoot.it/my-library/kahoots/all';
  const SCRIPT_ID    = 'kahoot-exporter-v1';

  // Prevent double-injection if the script is pasted twice
  if (document.getElementById(SCRIPT_ID)) {
    console.log('[KahootExporter] Already running.');
    return;
  }

  if (!window.location.href.startsWith(REQUIRED_URL)) {
    alert('[Kahoot Exporter]\nPlease navigate to:\n' + REQUIRED_URL);
    return;
  }

  // ── Styles ─────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = SCRIPT_ID;
  style.textContent = `
    .ke-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: #46178f; color: #fff; border: none; border-radius: 6px;
      padding: 7px 16px; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background .15s; white-space: nowrap;
    }
    .ke-btn:hover    { background: #5a1fb3; }
    .ke-btn:active   { background: #350d6b; }
    .ke-btn:disabled { background: #888; cursor: default; }
    .ke-status  { font-size: 12px; font-weight: 600; color: #444; }
    .ke-toolbar { display: inline-flex; align-items: center; gap: 10px; margin-top: 10px; }
  `;
  document.head.appendChild(style);

  // ── Auth: read JWT from localStorage and decode the user ID ─
  function getAuth() {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('No JWT token found – are you logged in?');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { token, userId: payload.sub };
  }

  // ── Fetch an image URL and return a base64 data URL, or null ─
  async function imageToBase64(url) {
    if (!url) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const blob = await r.blob();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror  = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  // pointsMultiplier in Kahoot API: 0 = no points, 1 = 1000 pts, 2 = 2000 pts
  const mapPoints = m => (m === 0 ? 0 : (m || 1) * 1000);

  // Strip characters that are illegal in filenames
  const sanitize = name =>
    name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 120) || 'kahoot';

  // Trigger a browser download of a JSON object
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);
  }

  // ── Fetch every quiz the user owns, handling pagination ────
  async function fetchAllKahoots(token, userId) {
    const all = [];
    let pageTimestamp = null;
    while (true) {
      let url = `/rest/users/${userId}/library/workspace/?creator=${userId}&orderBy=lastEdit&limit=100`;
      if (pageTimestamp) url += `&pageTimestamp=${pageTimestamp}`;
      const data = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      if (!data.entities?.length) break;
      all.push(...data.entities);
      if (all.length >= data.totalHits) break;
      pageTimestamp = data.pageTimestamp;
    }
    // Only export quiz-type kahoots (not courses or stories)
    return all.filter(e => e.card.type === 'quiz');
  }

  // ── Fetch full quiz detail and convert to export schema ────
  async function exportQuiz(token, quizId) {
    const r = await fetch(`/rest/kahoots/${quizId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error(`API ${r.status} for quiz ${quizId}`);
    const quiz = await r.json();

    // Resolve all question images in parallel
    const questions = await Promise.all((quiz.questions || []).map(async q => ({
      question_text: q.question || '',
      time_limit:    (q.time || 30000) / 1000,    // milliseconds → seconds
      points:        mapPoints(q.pointsMultiplier),
      image_data:    await imageToBase64(q.image || null), // null if no image or fetch fails
      answers:       (q.choices || []).map(c => ({
        answer_text: c.answer  || '',
        is_correct:  !!c.correct,
      })),
    })));

    return {
      version:     1,
      exported_at: new Date().toISOString(),
      title:       quiz.title    || '',
      is_public:   false, // Default to false - more in line with user expectations.
      language:    quiz.language  || null,
      topic:       quiz.audience  || null,
      questions,
    };
  }

  // ── Inject the toolbar button next to the Search bar ───────
  function injectToolbar() {
    if (document.querySelector('.ke-toolbar')) return;

    const searchBar = document.querySelector('[placeholder="Search"]');
    if (!searchBar) return;
    const anchor = searchBar.closest('div')?.parentElement;
    if (!anchor) return;

    const status = Object.assign(document.createElement('span'), {
      className: 'ke-status'
    });

    const btn = Object.assign(document.createElement('button'), {
      className:   'ke-btn',
      textContent: '⬇ Export All Quizzes',
      title:       'Download every quiz in your library as a JSON file',
    });

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const { token, userId } = getAuth();

        status.textContent = 'Fetching quiz list…';
        const quizzes = await fetchAllKahoots(token, userId);

        for (let i = 0; i < quizzes.length; i++) {
          const card = quizzes[i].card;
          status.textContent = `Exporting ${i + 1} / ${quizzes.length}: ${card.title}`;
          try {
            const exported = await exportQuiz(token, card.uuid);
            downloadJSON(exported, sanitize(card.title) + '.json');
          } catch (e) {
            // Log failures but keep going so one bad quiz doesn't abort the rest
            console.error(`[KahootExporter] Skipped "${card.title}":`, e);
          }
          // Small pause between downloads so the browser isn't overwhelmed
          await new Promise(r => setTimeout(r, 350));
        }

        status.textContent = `✔ Done — ${quizzes.length} quiz(zes) exported!`;
      } catch (e) {
        status.textContent = `✖ ${e.message}`;
        console.error('[KahootExporter]', e);
      } finally {
        btn.disabled = false;
        setTimeout(() => { status.textContent = ''; }, 5000);
      }
    });

    const toolbar = Object.assign(document.createElement('div'), {
      className: 'ke-toolbar'
    });
    toolbar.appendChild(btn);
    toolbar.appendChild(status);
    anchor.insertBefore(toolbar, anchor.children[1] ?? null);
  }

  // ── Re-inject after SPA navigations (React Router swaps DOM) ─
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.location.href.startsWith(REQUIRED_URL)) injectToolbar();
    }, 500);
  }).observe(document.body, { childList: true, subtree: true });

  injectToolbar();
  console.log('[KahootExporter] ✓ Ready. Click "Export All Quizzes" to begin.');
})();
