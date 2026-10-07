// Vérifie la cohérence du site : catalogue, projets, outils, veille. Code de sortie 1 si erreur.
import fs from 'node:fs/promises';

const read = async f => JSON.parse(await fs.readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const catalog = await read('catalog.json');
const news = await read('news.json');
const errors = [], warns = [];
const dup = (arr, label) => { const s = new Set(); for (const x of arr) { if (s.has(x)) errors.push(`${label} en double : ${x}`); s.add(x); } };

const cats = new Set(catalog.categories.map(c => c.id));
const projects = new Set(catalog.projects.map(p => p.id));
const tools = new Set(catalog.tools.flatMap(g => g.items));

dup(catalog.skills.map(s => s.id), 'id compétence');
dup(catalog.skills.map(s => s.sku), 'référence');
dup(catalog.projects.map(p => p.id), 'id projet');

for (const s of catalog.skills) {
  if (!cats.has(s.cat)) errors.push(`${s.sku} : catégorie inconnue (${s.cat})`);
  if (!catalog.levels[s.level]) errors.push(`${s.sku} : niveau invalide (${s.level})`);
  for (const p of s.projects) if (!projects.has(p)) errors.push(`${s.sku} : projet inconnu (${p})`);
  for (const t of s.tools) if (!tools.has(t)) warns.push(`${s.sku} : outil absent de la liste « Outils utilisés » (${t})`);
}
for (const t of tools) if (!catalog.skills.some(s => s.tools.includes(t))) warns.push(`outil sans compétence associée : ${t}`);
for (const p of catalog.projects) {
  if (!cats.has(p.cat)) errors.push(`projet ${p.id} : catégorie inconnue (${p.cat})`);
  if (!catalog.skills.some(s => s.projects.includes(p.id))) warns.push(`projet ${p.id} : relié à aucune compétence`);
}
for (const n of news.items || []) {
  if (!n.title || !n.url?.startsWith('https://')) errors.push(`veille ${n.id} : titre ou URL invalide`);
  if (!(n.block >= 1 && n.block <= 9)) errors.push(`veille ${n.id} : bloc de trame invalide`);
  if (/<\s*(script|iframe|style)/i.test(n.content || '')) errors.push(`veille ${n.id} : contenu HTML non autorisé`);
}

// liens de veille (avertissement seulement : certains sites refusent les requêtes automatisées)
if (process.argv.includes('--links')) {
  for (const n of news.items || []) {
    try { const r = await fetch(n.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) }); if (r.status >= 400) warns.push(`lien ${r.status} : ${n.url}`); }
    catch { warns.push(`lien injoignable : ${n.url}`); }
  }
}

warns.forEach(w => console.warn('⚠', w));
errors.forEach(e => console.error('✖', e));
console.log(`${catalog.skills.length} compétences, ${catalog.projects.length} projets, ${news.items?.length || 0} actualités — ${errors.length} erreur(s), ${warns.length} avertissement(s).`);
process.exit(errors.length ? 1 : 0);
