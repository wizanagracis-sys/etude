import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getNews } from './lib/news.js';
import { ask } from './lib/assistant.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();
app.disable('x-powered-by');

// --- en-têtes de sécurité ---
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"
  });
  next();
});
app.use(express.json({ limit: '16kb' }));

// --- limiteur simple par IP ---
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const arr = (hits.get(req.ip) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Trop de requêtes, réessayez dans un instant.' });
    arr.push(now); hits.set(req.ip, arr); next();
  };
}

// --- fichiers publics : liste blanche (le code serveur, .env et le cache ne sont jamais servis) ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
for (const dir of ['css', 'js', 'data', 'assets']) {
  app.use('/' + dir, express.static(path.join(__dirname, dir), { dotfiles: 'ignore', index: false }));
}

// --- veille ---
app.get('/api/news', async (req, res) => {
  try {
    const data = await getNews({ force: req.query.force === '1' });
    if (!data) return res.status(503).json({ error: 'Veille indisponible.' });
    res.json(data);
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Veille indisponible.' }); }
});

// --- assistant visiteurs (Gemini) ---
app.post('/api/assistant', limiter(10, 60_000), async (req, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 600) return res.status(400).json({ error: 'Message invalide.' });
  const hist = (Array.isArray(history) ? history : []).slice(-6)
    .filter(h => h && ['user', 'model'].includes(h.role) && typeof h.text === 'string')
    .map(h => ({ role: h.role, text: h.text.slice(0, 600) }));
  try {
    const answer = await ask({ message: message.trim(), history: hist });
    if (answer === null) return res.status(503).json({ error: 'Assistant non configuré.' });
    res.json({ answer });
  } catch (e) { console.error('Assistant :', e.message); res.status(502).json({ error: 'Assistant momentanément indisponible.' }); }
});

// --- contact ---
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.zip', '.txt', '.xlsx', '.pptx']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => cb(ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase()) ? null : new Error('Type de fichier non autorisé.'), true)
});
const oneLine = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();

app.post('/api/contact', limiter(5, 10 * 60_000), upload.array('attachments', 5), async (req, res) => {
  try {
    const name = oneLine(req.body.name).slice(0, 120);
    const email = oneLine(req.body.email).slice(0, 160);
    const subject = oneLine(req.body.subject).slice(0, 160);
    const message = String(req.body.message || '').slice(0, 6000);
    if (!name || !email || !subject || !message) return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return res.status(503).json({ error: 'Le serveur mail n’est pas encore configuré.' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from: `Portfolio GR9 <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_TO || process.env.SMTP_USER,
      replyTo: email,
      subject: `Portfolio GR9 — ${subject}`,
      text: `Nom / entreprise : ${name}\nE-mail : ${email}\n\n${message}`,
      attachments: (req.files || []).map(f => ({ filename: path.basename(f.originalname), content: f.buffer, contentType: f.mimetype }))
    });
    res.json({ ok: true });
  } catch (e) { console.error('Contact :', e.message); res.status(500).json({ error: 'Impossible d’envoyer le message pour le moment.' }); }
});

// erreurs (dont multer) toujours en JSON
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err instanceof multer.MulterError || /autorisé/.test(err.message) ? 400 : 500).json({ error: err.message || 'Erreur serveur.' });
});

// actualisation planifiée de la veille (2 h) + au démarrage
const refresh = () => getNews().catch(e => console.error('Veille :', e.message));
setInterval(refresh, 2 * 60 * 60 * 1000).unref();
refresh();

app.listen(PORT, () => console.log(`GR9 portfolio : http://localhost:${PORT}`));
