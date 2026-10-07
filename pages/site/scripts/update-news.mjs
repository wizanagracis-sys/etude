// Met à jour data/news.json (utilisé par GitHub Pages) — lancé toutes les 2 h par le workflow GitHub.
import 'dotenv/config';
import fs from 'node:fs/promises';
import { refreshNews } from '../lib/news.js';

const FILE = new URL('../data/news.json', import.meta.url);
const previous = JSON.parse(await fs.readFile(FILE, 'utf8').catch(() => '{"items":[]}'));
const data = await refreshNews();

if (!data?.items?.length) { console.warn('Aucune actualité collectée : fichier conservé.'); process.exit(0); }
if (JSON.stringify(previous.items) === JSON.stringify(data.items)) { console.log('Aucun changement.'); process.exit(0); }
await fs.writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`news.json mis à jour (${data.items.length} éléments, mode ${data.mode}).`);
