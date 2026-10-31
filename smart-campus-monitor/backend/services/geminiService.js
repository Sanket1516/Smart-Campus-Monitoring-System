/**
 * Minimal Gemini client (Generative Language REST API) — same endpoint the Smart Form
 * auto-filling project uses. Configured with GEMINI_API_KEY / GEMINI_MODEL.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const isConfigured = () => Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);

const generateJson = async ({ system, prompt, timeoutMs = Number(process.env.AI_TIMEOUT_MS || 15000) }) => {
  if (!isConfigured()) throw new Error('Gemini is not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}/${process.env.GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
    if (!text.trim()) throw new Error('Gemini returned an empty response');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { isConfigured, generateJson };
