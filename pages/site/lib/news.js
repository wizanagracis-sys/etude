import Parser from 'rss-parser';
import fs from 'node:fs/promises';
import path from 'node:path';
import { generate } from './gemini.js';

const parser = new Parser({ timeout: 12000 });

export const FEEDS = [
  ['CERT-FR', 'https://www.cert.ssi.gouv.fr/avis/feed/'],
  ['CERT-FR', 'https://www.cert.ssi.gouv.fr/alerte/feed/'],
  ['CNIL', 'https://www.cnil.fr/fr/rss.xml'],
  ['Microsoft Security', 'https://www.microsoft.com/en-us/security/blog/feed/'],
  ['Cisco Security', 'https://blogs.cisco.com/security/feed'],
  ['Cisco PSIRT', 'https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml']
];

// Domaines acceptés pour les liens « source originale » (anti-liens inventés ou malveillants).
const TRUSTED = ['cert.ssi.gouv.fr', 'ssi.gouv.fr', 'cyber.gouv.fr', 'cnil.fr', 'microsoft.com', 'cisco.com'];

export const TRAME = [
  'Contexte & problématique',
  'Évolution technologique & tendances',
  'Fonctionnement des technologies étudiées',
  'Menaces, attaques & dérives',
  'Impacts sur l’infrastructure SISR',
  'Protection & architecture de sécurité',
  'Cas concrets & scénarios',
  'Prospective & compétences SISR',
  'Synthèse & bilan'
];

const THEMES = 'IA autonome, agents IA, cybersécurité, Zero Trust, IAM, MFA, segmentation réseau, Active Directory, cloud, systèmes Linux/Windows, virtualisation, vulnérabilités, attaques, EDR/XDR, SIEM, sauvegardes, supervision, automatisation SISR';

export function trustedUrl(url = '') {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return TRUSTED.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s = '') => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// HTML minimal autorisé (pas d'attributs, pas de script) pour le contenu produit par l'IA.
const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'h4']);
export function cleanHtml(html = '') {
  return String(html)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(\/?)([a-z0-9]+)[^>]*>/gi, (m, slash, tag) => ALLOWED.has(tag.toLowerCase()) ? `<${slash}${tag.toLowerCase()}>` : '')
    .slice(0, 4000);
}

async function collect() {
  const results = await Promise.allSettled(FEEDS.map(async ([source, url]) => {
    const feed = await parser.parseURL(url);
    return (feed.items || []).slice(0, 8).map(item => ({
      source,
      title: strip(item.title || 'Sans titre'),
      url: item.link || '',
      date: item.isoDate || item.pubDate || new Date().toISOString(),
      raw: strip(item.contentSnippet || item.content || '').slice(0, 600)
    }));
  }));
  const seen = new Set();
  return results
    .flatMap((r, i) => { if (r.status === 'rejected') console.warn('Flux indisponible :', FEEDS[i][1], r.reason?.message); return r.status === 'fulfilled' ? r.value : []; })
    .filter(x => trustedUrl(x.url) && !seen.has(x.url) && seen.add(x.url))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 24);
}

/** Collecte les flux, fait sélectionner/traduire par Gemini (si clé) et renvoie {updatedAt, mode, items}. */
export async function refreshNews() {
  const recent = await collect();
  if (!recent.length) return null;
  const byUrl = new Map(recent.map(x => [x.url, x]));

  let items = [];
  let mode = 'raw';
  try {
    const ai = await generate({
      json: true,
      temperature: 0.15,
      prompt: `Tu es le rédacteur d'une veille technologique SISR en français. À partir des actualités ci-dessous, garde uniquement celles réellement utiles aux thèmes : ${THEMES}. Associe chacune à un bloc de la trame : ${TRAME.map((t, i) => `${i + 1} ${t}`).join(' ; ')}. Ne crée aucun fait absent des sources et recopie les URL telles quelles. Traduis en français si nécessaire. Réponds uniquement avec un JSON {"items":[{"title":"","teaser":"","content":"","block":1,"url":""}]}. Teaser : 180 caractères maximum. Content : HTML simple (<p>, <ul>, <li>) sans script. Maximum 8 éléments. SOURCES : ${JSON.stringify(recent.map(({ source, title, url, date, raw }) => ({ source, title, url, date, raw })))}`
    });
    if (ai) {
      items = (ai.items || [])
        .filter(x => x && byUrl.has(x.url))
        .map((x, i) => {
          const src = byUrl.get(x.url);
          const block = Math.min(9, Math.max(1, parseInt(x.block, 10) || 1));
          return { id: `n${i + 1}`, title: String(x.title || src.title).slice(0, 160), teaser: String(x.teaser || src.raw).slice(0, 200), content: cleanHtml(x.content) || `<p>${esc(src.raw)}</p>`, source: src.source, date: src.date, url: src.url, block };
        });
      if (items.length) mode = 'ai';
    }
  } catch (e) { console.warn('Gemini indisponible :', e.message); }

  if (!items.length) {
    items = recent.slice(0, 8).map((x, i) => ({
      id: `n${i + 1}`, title: x.title.slice(0, 160),
      teaser: x.raw.slice(0, 180) + (x.raw.length > 180 ? '…' : ''),
      content: `<p>${esc(x.raw || 'Publication disponible via la source officielle.')}</p>`,
      source: x.source, date: x.date, url: x.url, block: 1
    }));
  }
  return { updatedAt: new Date().toISOString(), mode, items };
}

// --- cache serveur (server/data/news-cache.json, non versionné) ---
const CACHE = path.resolve('server/data/news-cache.json');
const TWO_HOURS = 2 * 60 * 60 * 1000;
const MIN_FORCE_GAP = 10 * 60 * 1000; // « Actualiser » ne peut pas relancer l'IA plus d'une fois / 10 min
let inflight = null;

async function readCache() { try { return JSON.parse(await fs.readFile(CACHE, 'utf8')); } catch { return null; } }

export async function getNews({ force = false } = {}) {
  const cached = await readCache();
  const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
  const stale = age > TWO_HOURS || !cached?.items?.length;
  if (!stale && !(force && age > MIN_FORCE_GAP)) return cached;
  inflight ??= refreshNews()
    .then(async data => {
      if (data) { await fs.mkdir(path.dirname(CACHE), { recursive: true }); await fs.writeFile(CACHE, JSON.stringify(data, null, 2)); }
      return data;
    })
    .finally(() => { inflight = null; });
  return (await inflight) || cached;
}
