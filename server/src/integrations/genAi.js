const env = require('../config/env');

/**
 * "Ask Gen AI" - a general knowledge assistant for the doctor's own quick
 * reference (dosage checks, guideline lookups, drafting phrasing), never a
 * diagnostic tool and never given identifiable patient data (enforced by
 * the UI's disclaimer + by this endpoint accepting only a free-text
 * question, with nowhere to attach a patient/appointment id).
 *
 * Mock mode (default) returns a canned, clearly-labeled placeholder so the
 * screen is fully demoable with no API key. Set ANTHROPIC_API_KEY to call
 * the real Claude API instead.
 */
async function askGenAi(question) {
  if (env.mock.genAi || !env.anthropic.apiKey) {
    return (
      `[Sandbox response - no AI provider configured]\n\n` +
      `You asked: "${question}"\n\n` +
      `This is a placeholder answer. Set ANTHROPIC_API_KEY in the server's .env ` +
      `to have this answered by a real model instead.`
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.anthropic.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: question }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gen AI request failed: ${res.status} ${text}`);
  }
  const body = await res.json();
  return body?.content?.[0]?.text || '(no response)';
}

module.exports = { askGenAi };
