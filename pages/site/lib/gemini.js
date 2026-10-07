// Appel Gemini côté serveur uniquement : la clé ne quitte jamais le backend (.env ou secret GitHub).
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * @param {object} o
 * @param {string} o.prompt     message utilisateur
 * @param {string} [o.system]   consignes système
 * @param {{role:'user'|'model',text:string}[]} [o.history]
 * @param {boolean} [o.json]    réponse JSON
 * @returns {Promise<any|null>} null si aucune clé n'est configurée
 */
export async function generate({ prompt, system, history = [], json = false, temperature = 0.2, maxOutputTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('COLLER_')) return null;

  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-flash-latest'])];
  const body = {
    contents: [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: prompt }] }
    ],
    generationConfig: {
      temperature,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {})
    }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let lastError;
  for (const model of models) {
    const r = await fetch(`${BASE}${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    if (r.status === 404) { lastError = new Error(`Modèle introuvable : ${model}`); continue; }
    if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
    const d = await r.json();
    const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!json) return text;
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  }
  throw lastError;
}
