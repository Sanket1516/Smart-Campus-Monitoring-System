const INTENTS = Object.freeze([
  'total_inside',
  'late_returns_today',
  'hostellers_outside',
  'unauthorized_today',
  'unknown',
]);

const normalizeIntent = (raw) => {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return 'unknown';

  // Accept exact token fast path.
  if (INTENTS.includes(normalized)) {
    return normalized;
  }

  // Extract valid intent from any noisy model output.
  const matches = normalized.match(
    /\b(total_inside|late_returns_today|hostellers_outside|unauthorized_today|unknown)\b/g
  );

  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }

  // Last fallback: sanitize first token.
  const token = normalized.split(/\s+/)[0].replace(/[^a-z_]/g, '');
  return INTENTS.includes(token) ? token : 'unknown';
};

const keywordClassifyIntent = (query) => {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return 'unknown';

  if (
    /\b(unauthori[sz]ed|invalid|intruder|access denied|not authorized|unknown id)\b/.test(q)
  ) {
    return 'unauthorized_today';
  }

  if (
    /\b(late|delay|delayed|late return|returned late|late returns)\b/.test(q) &&
    /\b(today|todays|now|current|case|cases|return|returns)\b/.test(q)
  ) {
    return 'late_returns_today';
  }

  if (
    /\b(hosteller|hostellers|hostel student|hostel students)\b/.test(q) &&
    /\b(outside|out|not inside|away)\b/.test(q)
  ) {
    return 'hostellers_outside';
  }

  if (
    /\b(how many|count|number|total)\b/.test(q) &&
    /\b(inside|in campus|currently inside|present)\b/.test(q)
  ) {
    return 'total_inside';
  }

  return 'unknown';
};

const classifyIntent = async (query) => {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 5000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'gemma:2b';
  const prompt = [
    'You are an intent classifier for a smart campus entry monitoring chatbot.',
    'Classify the user query into exactly one intent from:',
    'total_inside, late_returns_today, hostellers_outside, unauthorized_today, unknown.',
    'Output rules:',
    '1) Return only one token (intent).',
    '2) No explanation.',
    '3) No punctuation.',
    '4) If unsure, return unknown.',
    `User query: ${query}`,
  ].join('\n');

  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        system:
          'You are a strict intent classifier. Return exactly one token only: total_inside or late_returns_today or hostellers_outside or unauthorized_today or unknown.',
        options: {
          temperature: 0,
          top_p: 0.1,
          num_predict: 2,
          stop: ['\n', ' '],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const payload = await response.json();
    const parsed = normalizeIntent(payload.response);
    return parsed === 'unknown' ? keywordClassifyIntent(query) : parsed;
  } catch (_error) {
    return keywordClassifyIntent(query);
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  INTENTS,
  classifyIntent,
  keywordClassifyIntent,
  normalizeIntent,
};

