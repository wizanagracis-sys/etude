'use strict';
/* GR9 — boutique de compétences, sous-navigations, projets, veille, assistant et contact.
   Toutes les URL de l'API sont relatives (api/…) pour fonctionner aussi sur GitHub Pages (sous-dossier du dépôt). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PAGES = ['accueil', 'catalogue', 'realisations', 'veille', 'parcours', 'contact'];
const TITLES = { accueil: 'ACCUEIL', catalogue: 'BOUTIQUE', realisations: 'RÉALISATIONS', veille: 'VEILLE', parcours: 'PARCOURS', contact: 'CONTACT' };
const FILTER_PAGES = new Set(['catalogue', 'realisations']);

// Sous-navigation propre à chaque section (affichée uniquement quand la section est active)
const SUBNAV = {
  accueil: [['presentation', 'Présentation'], ['outils', 'Outils utilisés'], ['disponibilite', 'Disponibilité']],
  catalogue: [['all', 'Tout'], ['sys', 'Systèmes'], ['net', 'Réseaux'], ['virt', 'Virtualisation'], ['sec', 'Cybersécurité'], ['web', 'Web & dev'], ['itil', 'Support & ITIL']],
  realisations: [['all', 'Tous'], ['sys', 'Systèmes'], ['net', 'Réseaux'], ['virt', 'Virtualisation'], ['web', 'Web'], ['itil', 'ITIL']],
  veille: [['actualites', 'Actualités'], ['trame', 'Trame en 9 blocs'], ['sources', 'Sources']],
  parcours: [['profil', 'Profil'], ['formation', 'Formation'], ['experience', 'Expérience'], ['competences', 'Compétences'], ['outils', 'Outils']],
  contact: [['message', 'Message'], ['coordonnees', 'Coordonnées'], ['selection', 'Ma sélection']]
};

let DATA = null;
let selection = [];
let newsItems = [];
let newsBlock = 0;
let navigated = false;
let lastAuto = '';

/* ---------- utilitaires ---------- */
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fmt = d => { const t = new Date(d); return isNaN(t) ? '—' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(t); };
const level = n => DATA.levels[n] || 'Notions';
const catLabel = id => DATA.categories.find(c => c.id === id)?.label || id;
const skillById = id => DATA.skills.find(s => s.id === id);
const projectById = id => DATA.projects.find(p => p.id === id);

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toast-region').append(el);
  setTimeout(() => el.remove(), 3500);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.ripple');
  if (!b) return;
  b.classList.remove('ripple-active'); void b.offsetWidth; b.classList.add('ripple-active');
});

/* ---------- niveau (points) ---------- */
function levelHtml(n) {
  const label = level(n);
  return `<span class="level" role="img" aria-label="Niveau : ${esc(label)}">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}<span>${esc(label)}</span></span>`;
}

/* ---------- routage : #page/sous-section?param=valeur ---------- */
function parseHash() {
  const h = location.hash.slice(1);
  const [path, qs = ''] = h.split('?');
  const [p, sub] = path.split('/');
  return { page: PAGES.includes(p) ? p : 'accueil', sub: sub || null, params: new URLSearchParams(qs), has: h !== '' };
}

function subCount(page, id) {
  if (!DATA || !FILTER_PAGES.has(page)) return '';
  const list = page === 'catalogue' ? DATA.skills : DATA.projects;
  return `<small>${id === 'all' ? list.length : list.filter(x => x.cat === id).length}</small>`;
}

function markSub(page, id) {
  $$('#subnav-links a').forEach(a => {
    const on = a.getAttribute('href') === `#${page}/${id}`;
    a.classList.toggle('is-active', on);
    on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
    if (on && a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
}

function renderSubnav(page, sub) {
  const wrap = $('#subnav');
  document.body.classList.toggle('subnav-open', navigated);
  if (!navigated) { wrap.hidden = true; return; }
  $('#subnav-label').textContent = TITLES[page];
  $('#subnav-links').innerHTML = SUBNAV[page]
    .map(([id, label]) => `<a href="#${page}/${id}">${esc(label)}${subCount(page, id)}</a>`).join('');
  markSub(page, sub || SUBNAV[page][0][0]);
  wrap.hidden = false;
}

/* Suivi du défilement : le sous-lien actif suit la section affichée (pages à ancres uniquement) */
let spy = null, spyLocked = false;
['wheel', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, () => { spyLocked = false; }, { passive: true }));
function setupSpy(page) {
  spy?.disconnect(); spy = null;
  if (FILTER_PAGES.has(page) || typeof IntersectionObserver === 'undefined') return;
  spy = new IntersectionObserver(entries => {
    if (spyLocked || !navigated) return;
    const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (hit) markSub(page, hit.target.dataset.sub);
  }, { rootMargin: `-${$('#site-header').offsetHeight + 24}px 0px -55% 0px` });
  $$(`[data-page="${page}"] [data-sub]:not([data-nospy])`).forEach(t => spy.observe(t));
}

function route() {
  const { page, sub, params, has } = parseHash();
  if (has) navigated = true;
  $$('.page').forEach(p => p.classList.toggle('is-active', p.dataset.page === page));
  $$('.nav-link').forEach(a => {
    const on = a.dataset.nav === page;
    a.classList.toggle('is-active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    if (on && a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
  document.title = page === 'accueil' ? 'GR9 | Portfolio SISR' : `GR9 | ${TITLES[page][0]}${TITLES[page].slice(1).toLowerCase()}`;
  spyLocked = true;
  renderSubnav(page, sub);
  setupSpy(page);

  if (DATA) {
    if (page === 'catalogue') renderCatalogue(sub || 'all', params.get('q') || '');
    if (page === 'realisations') renderProjects(sub || 'all');
  }

  requestAnimationFrame(() => {
    const target = !FILTER_PAGES.has(page) && sub ? $(`[data-page="${page}"] [data-sub="${sub}"]`) : null;
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo(0, 0);
  });
}
window.addEventListener('hashchange', route);

/* ---------- boutique ---------- */
function productCard(s) {
  const shown = s.tools.slice(0, 4), more = s.tools.length - shown.length;
  return `<article class="card product cat-${s.cat}" data-id="${esc(s.id)}">
    <div class="product-top"><span class="sku">${esc(s.sku)}</span><span class="cat-label">${esc(catLabel(s.cat))}</span></div>
    <h3>${esc(s.title)}</h3><p>${esc(s.pitch)}</p>
    ${levelHtml(s.level)}
    <div class="tags">${shown.map(t => `<span>${esc(t)}</span>`).join('')}${more > 0 ? `<span>+${more}</span>` : ''}</div>
    <div class="product-actions">
      <button class="btn btn-small btn-ghost ripple" type="button" data-open-skill="${esc(s.id)}">Fiche</button>
      <button class="btn btn-small btn-primary ripple" type="button" data-add="${esc(s.id)}">Ajouter</button>
    </div></article>`;
}

function renderCatalogue(cat, q) {
  const search = $('#search');
  if (search.value !== q) search.value = q;
  let list = DATA.skills.filter(s => cat === 'all' || s.cat === cat);
  const needle = norm(q.trim());
  if (needle) list = list.filter(s => norm([s.sku, s.title, s.pitch, catLabel(s.cat), ...s.tools, ...s.deliverables].join(' ')).includes(needle));
  const sort = $('#sort').value;
  if (sort === 'level') list = [...list].sort((a, b) => b.level - a.level || a.sku.localeCompare(b.sku));
  if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  $('#catalogue-count').textContent = `${list.length} compétence${list.length > 1 ? 's' : ''}`;
  $('#product-grid').innerHTML = list.map(productCard).join('') ||
    '<p class="empty">Aucune compétence ne correspond. <a href="#catalogue/all">Voir tout le catalogue</a></p>';
  updateCartUI();
}

function currentCat() { const { page, sub } = parseHash(); return page === 'catalogue' ? (sub || 'all') : 'all'; }
$('#search').addEventListener('input', e => {
  const q = e.target.value, cat = currentCat();
  history.replaceState(null, '', `#catalogue/${cat}${q ? '?q=' + encodeURIComponent(q) : ''}`);
  renderCatalogue(cat, q);
});
$('#sort').addEventListener('change', () => renderCatalogue(currentCat(), $('#search').value));

/* ---------- sélection (panier sans paiement) ---------- */
const STORE_KEY = 'gr9-selection';
function loadSelection() { try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveSelection() { try { localStorage.setItem(STORE_KEY, JSON.stringify(selection)); } catch { /* stockage indisponible */ } }
const selected = () => selection.map(skillById).filter(Boolean);

function toggleSkill(id) {
  if (!skillById(id)) return;
  const i = selection.indexOf(id);
  if (i >= 0) selection.splice(i, 1); else selection.push(id);
  saveSelection(); updateCartUI();
  toast(i >= 0 ? 'Retiré de votre sélection.' : 'Ajouté à votre sélection.');
}

function updateCartUI() {
  const items = selected();
  $('#cart-count').textContent = items.length;
  $('#cart-count').classList.toggle('has-items', items.length > 0);
  $$('[data-add]').forEach(b => { const on = selection.includes(b.dataset.add); b.textContent = on ? '✓ Dans ma sélection' : 'Ajouter'; b.classList.toggle('is-on', on); });
  const addModal = $('#skill-add');
  if (addModal.dataset.id) { const on = selection.includes(addModal.dataset.id); addModal.textContent = on ? '✓ Dans ma sélection (retirer)' : 'Ajouter à ma sélection'; }
  const list = items.length
    ? items.map(s => `<div class="cart-item cat-${s.cat}"><div><span class="sku">${esc(s.sku)}</span><strong>${esc(s.title)}</strong><small>${esc(level(s.level))}</small></div><button type="button" class="icon-btn" data-remove="${esc(s.id)}" aria-label="Retirer ${esc(s.sku)}">×</button></div>`).join('')
    : '<p class="empty-note">Aucune compétence choisie pour le moment. <a href="#catalogue/all">Parcourir la boutique</a></p>';
  $('#cart-items').innerHTML = list;
  $('#selection-list').innerHTML = list;
  $('#cart-send').disabled = !items.length;
  $('#cart-clear').disabled = !items.length;
  $('#selection-fill').disabled = !items.length;
}

function buildMessage() {
  const items = selected();
  if (!items.length) return '';
  return `Bonjour Gracis,\n\nVotre portfolio m'a intéressé(e). Compétences qui m'intéressent :\n${items.map(s => `- ${s.sku} · ${s.title} (${level(s.level)})`).join('\n')}\n\nPourriez-vous me proposer un échange ?\n`;
}
function fillMessage() {
  const field = $('#message-field'), msg = buildMessage();
  if (!msg) return;
  if (!field.value.trim() || field.value === lastAuto) { field.value = lastAuto = msg; }
  else { field.value += `\n\n${msg}`; lastAuto = ''; }
  const subject = $('#contact-form [name=subject]');
  if (!subject.value) subject.value = 'Demande d’échange — sélection de compétences';
}

$('#cart-btn').addEventListener('click', () => $('#cart-modal').showModal());
$('#cart-clear').addEventListener('click', () => { selection = []; saveSelection(); updateCartUI(); });
$('#cart-send').addEventListener('click', () => { $('#cart-modal').close(); location.hash = '#contact/message'; fillMessage(); });
$('#selection-fill').addEventListener('click', () => { fillMessage(); toast('Sélection insérée dans le message.'); });

/* ---------- outils & matrice de compétences ---------- */
function renderTools(el) {
  el.innerHTML = DATA.tools.map(g => `<div class="tool-group"><h3>${esc(g.group)}</h3><div class="tool-chips">${g.items.map(t => `<a class="tool-chip" href="#catalogue/all?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div></div>`).join('');
}
function renderMatrix() {
  $('#skill-matrix').innerHTML = DATA.categories.map(c => {
    const rows = DATA.skills.filter(s => s.cat === c.id);
    return `<article class="card skill-panel cat-${c.id}"><span class="mini-label">${esc(c.label.toUpperCase())}</span>${rows.map(s => `<button type="button" class="skill-row" data-open-skill="${esc(s.id)}"><span>${esc(s.title)}</span><b>${esc(level(s.level))}</b></button>`).join('')}</article>`;
  }).join('');
}

/* ---------- projets ---------- */
function renderProjects(cat) {
  const list = DATA.projects.filter(p => cat === 'all' || p.cat === cat);
  $('#project-grid').innerHTML = list.map(p => {
    const n = DATA.skills.filter(s => s.projects.includes(p.id)).length;
    return `<article class="card project-card cat-${p.cat}" data-id="${esc(p.id)}"><span class="project-code">${esc(p.code)}</span><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p>
      <div class="tags">${p.tools.slice(0, 5).map(t => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="product-actions"><button class="btn btn-small btn-ghost ripple" type="button" data-open-project="${esc(p.id)}">Détails</button><span class="muted">${n} compétence${n > 1 ? 's' : ''} illustrée${n > 1 ? 's' : ''}</span></div></article>`;
  }).join('') || '<p class="empty">Aucun projet dans cette catégorie.</p>';
}

function openProject(id) {
  const p = projectById(id);
  if (!p) return;
  $('#project-category').textContent = p.code;
  $('#project-title').textContent = p.title;
  $('#project-summary').textContent = p.summary;
  $('#project-context').textContent = p.context;
  $('#project-tech').innerHTML = p.tools.map(t => `<span>${esc(t)}</span>`).join('');
  $('#project-skills').innerHTML = DATA.skills.filter(s => s.projects.includes(id)).map(s => `<button type="button" data-open-skill="${esc(s.id)}">${esc(s.sku)} · ${esc(s.title)}</button>`).join('') || '<span class="muted">—</span>';
  $('#project-result').textContent = p.result;
  $('#project-modal').showModal();
}

function openSkill(id) {
  const s = skillById(id);
  if (!s) return;
  $('#skill-eyebrow').textContent = `${s.sku} · ${catLabel(s.cat).toUpperCase()}`;
  $('#skill-title').textContent = s.title;
  $('#skill-pitch').textContent = s.pitch;
  $('#skill-level').innerHTML = levelHtml(s.level);
  $('#skill-deliverables').innerHTML = s.deliverables.map(d => `<li>${esc(d)}</li>`).join('');
  $('#skill-tools').innerHTML = s.tools.map(t => `<a class="tool-chip" href="#catalogue/all?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('');
  $('#skill-projects').innerHTML = s.projects.map(pid => projectById(pid)).filter(Boolean).map(p => `<button type="button" data-open-project="${esc(p.id)}">${esc(p.title)}</button>`).join('')
    + (s.link ? `<a href="${esc(s.link)}">Voir la veille →</a>` : '') || '<span class="muted">—</span>';
  $('#skill-add').dataset.id = id;
  updateCartUI();
  $('#skill-modal').showModal();
}
$('#skill-add').addEventListener('click', e => toggleSkill(e.currentTarget.dataset.id));

/* ---------- clics délégués (cartes, modales, retrait) ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  const sk = t.closest('[data-open-skill]'), pr = t.closest('[data-open-project]'), add = t.closest('[data-add]'), rm = t.closest('[data-remove]');
  if (sk || pr) $$('dialog[open]').forEach(d => d.close());
  if (sk) openSkill(sk.dataset.openSkill);
  else if (pr) openProject(pr.dataset.openProject);
  else if (add) toggleSkill(add.dataset.add);
  else if (rm) toggleSkill(rm.dataset.remove);
  const link = t.closest('dialog a[href^="#"]');
  if (link) link.closest('dialog').close();
});
$$('[data-close-dialog]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

/* ---------- veille ---------- */
const EMBEDDED_NEWS = { updatedAt: new Date().toISOString(), items: [{ id: 'e1', title: 'Veille momentanément indisponible', teaser: 'Les actualités se chargent depuis le serveur ou depuis data/news.json. Ouvrez le site via npm start ou GitHub Pages.', content: '<p>Aucune donnée de veille n’a pu être chargée.</p>', source: 'Portfolio', date: new Date().toISOString(), url: '#veille', block: 1 }] };

const OK_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'BR', 'H4']);
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  (function walk(src, dst) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) dst.append(n.textContent);
      else if (n.nodeType === 1) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(n.tagName)) continue;
        if (OK_TAGS.has(n.tagName)) { const el = document.createElement(n.tagName.toLowerCase()); walk(n, el); dst.append(el); }
        else walk(n, dst);
      }
    }
  })(doc.body, out);
  return out;
}

function setStatus(kind, text) { $('#feed-status').innerHTML = `<span class="status-dot ${kind}"></span>${esc(text)}`; }

function renderNewsGrid() {
  const items = newsItems.filter(n => !newsBlock || n.block === newsBlock);
  $('#news-grid').innerHTML = items.map(n => `<article class="card news-card"><div class="news-card-top"><span>${fmt(n.date)}</span><span>Bloc ${esc(n.block || 1)}</span></div><h3>${esc(n.title)}</h3><p>${esc(n.teaser)}</p><div class="news-card-footer"><span class="news-source">${esc(n.source)}</span><button class="news-open" type="button" data-news-index="${newsItems.indexOf(n)}">Découvrir →</button></div></article>`).join('')
    || '<p class="empty">Aucune actualité pour ce bloc pour le moment.</p>';
  $$('.trame-block').forEach(b => {
    const k = Number(b.dataset.block);
    b.classList.toggle('is-active', k === newsBlock);
    $('em', b).textContent = `${newsItems.filter(n => n.block === k).length} fiche(s)`;
  });
}

function renderNews(data, kind) {
  newsItems = data.items;
  const labels = { live: ['success', 'Flux actualisé automatiquement'], snapshot: ['success', 'Synthèse enregistrée'], error: ['error', 'Veille indisponible'] };
  setStatus(...labels[kind]);
  $('#news-updated').textContent = `Dernière mise à jour : ${fmt(data.updatedAt)}`;
  renderNewsGrid();
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('indisponible');
  const d = await r.json();
  if (!Array.isArray(d.items) || !d.items.length) throw new Error('vide');
  return d;
}
async function loadNews(force = false) {
  setStatus('', 'Vérification…');
  try { renderNews(await fetchJson(`api/news${force ? '?force=1' : ''}`), 'live'); return; } catch { /* hébergement statique */ }
  try { renderNews(await fetchJson(`data/news.json${force ? '?t=' + Date.now() : ''}`), 'snapshot'); return; } catch { /* fichier absent */ }
  renderNews(EMBEDDED_NEWS, 'error');
}
$('#news-refresh').addEventListener('click', async () => { await loadNews(true); toast('Veille rechargée.'); });
$('#trame-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-block]');
  if (!b) return;
  const k = Number(b.dataset.block);
  newsBlock = newsBlock === k ? 0 : k;
  renderNewsGrid();
  $('#news-grid').scrollIntoView?.({ behavior: 'smooth', block: 'center' });
});
$('#news-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-news-index]');
  if (!b) return;
  const n = newsItems[Number(b.dataset.newsIndex)];
  $('#news-modal-source').textContent = n.source;
  $('#news-modal-date').textContent = fmt(n.date);
  $('#news-modal-title').textContent = n.title;
  $('#news-modal-teaser').textContent = n.teaser;
  $('#news-modal-content').replaceChildren(...sanitize(n.content).childNodes);
  const link = $('#news-modal-source-link');
  link.hidden = !/^https:\/\//.test(n.url);
  link.href = link.hidden ? '#' : n.url;
  $('#news-modal').showModal();
});

/* ---------- assistant ---------- */
const chat = { history: [] };
function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = `msg msg-${role}`;
  el.textContent = text;
  $('#assistant-log').append(el);
  el.scrollIntoView?.({ block: 'end' });
  return el;
}
const STOP = new Set(['les', 'des', 'une', 'pour', 'avec', 'dans', 'quel', 'quels', 'quelle', 'quelles', 'est', 'sont', 'que', 'qui', 'vous', 'avez', 'votre', 'mes', 'ton', 'ses', 'sur', 'plus', 'pas', 'aux', 'par', 'comment', 'faire', 'fait']);
function localSearch(q) {
  const tokens = norm(q).split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t));
  if (!tokens.length) return [];
  return DATA.skills
    .map(s => { const h = norm([s.title, s.pitch, s.sku, ...s.tools, ...s.deliverables].join(' ')); return { s, score: tokens.filter(t => h.includes(t)).length }; })
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.s);
}
async function askAssistant(q) {
  addMsg('user', q);
  const pending = addMsg('bot', '…');
  try {
    const r = await fetch('api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, history: chat.history.slice(-6) }) });
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('statique');
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'erreur');
    pending.textContent = d.answer;
    chat.history.push({ role: 'user', text: q }, { role: 'model', text: d.answer });
  } catch {
    const found = localSearch(q);
    pending.textContent = found.length
      ? 'L’assistant IA n’est pas disponible ici. Voici les compétences qui correspondent le mieux :'
      : 'L’assistant IA n’est pas disponible ici et je ne trouve pas de compétence correspondante. Utilisez le formulaire de contact.';
    if (found.length) {
      const box = document.createElement('div');
      box.className = 'linklist';
      box.innerHTML = found.map(s => `<button type="button" data-open-skill="${esc(s.id)}">${esc(s.sku)} · ${esc(s.title)}</button>`).join('');
      pending.append(box);
    }
  }
}
function toggleAssistant(open) {
  const panel = $('#assistant');
  panel.hidden = !open;
  $('#assistant-fab').setAttribute('aria-expanded', String(open));
  if (open) { if (!$('#assistant-log').children.length) addMsg('bot', 'Bonjour ! Dites-moi ce dont vous avez besoin (par exemple : « sauvegarde », « serveur Debian », « VLAN ») et je vous oriente vers les bonnes compétences.'); $('#assistant-input').focus(); }
}
$('#assistant-fab').addEventListener('click', () => toggleAssistant($('#assistant').hidden));
$('#assistant-close').addEventListener('click', () => toggleAssistant(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#assistant').hidden) toggleAssistant(false); });
$('#assistant-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#assistant-input'), q = input.value.trim();
  if (!q) return;
  input.value = '';
  askAssistant(q);
});

/* ---------- contact ---------- */
$('#contact-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget, note = $('#form-note');
  if (form.website.value) return; // champ piège anti-robots
  note.textContent = 'Envoi en cours…';
  const fd = new FormData(form);
  fd.delete('website');
  try {
    const r = await fetch('api/contact', { method: 'POST', body: fd });
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('statique');
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur');
    note.textContent = 'Message envoyé avec succès.';
    form.reset(); lastAuto = '';
    toast('Message transmis.');
  } catch (err) {
    if (err.message === 'statique' || err instanceof TypeError) {
      // Hébergement statique (GitHub Pages) : ouverture de l'application mail avec le message prérempli
      const body = `${fd.get('message')}\n\n— ${fd.get('name')} (${fd.get('email')})`.slice(0, 1800);
      location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(fd.get('subject'))}&body=${encodeURIComponent(body)}`;
      note.textContent = 'Votre application mail s’ouvre avec le message prérempli.';
    } else note.textContent = `Échec de l’envoi : ${err.message}`;
  }
});

/* ---------- démarrage ---------- */
const header = $('#site-header');
const setHeader = () => document.documentElement.style.setProperty('--header', `${header.offsetHeight}px`);
setHeader();
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(setHeader).observe(header);

async function init() {
  try {
    const r = await fetch('data/catalog.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error();
    DATA = await r.json();
  } catch {
    $('#app').insertAdjacentHTML('afterbegin', '<p class="load-error">Le catalogue n’a pas pu être chargé. Ouvrez le site via <code>npm start</code> ou GitHub Pages (pas en double-cliquant sur index.html).</p>');
    route();
    return;
  }
  selection = loadSelection().filter(id => skillById(id));
  renderTools($('#tools-home'));
  renderTools($('#tools-parcours'));
  renderMatrix();
  updateCartUI();
  route();
  loadNews();
  setInterval(() => loadNews(false), 2 * 60 * 60 * 1000);
}
init();
