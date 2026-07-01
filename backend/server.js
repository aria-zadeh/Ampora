require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();
app.use(cors());
app.use(express.json());

// 10 req/min per IP — applied to all /ai/* routes.
// On limit hit, return 429 with { error: 'rate_limited' }.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});
app.use('/ai', aiLimiter);

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

class GeminiError extends Error {
  constructor(message, type, status) {
    super(message);
    this.name = 'GeminiError';
    this.type = type; // 'rate_limited' | 'bad_request' | 'ai_failed'
    this.status = status;
  }
}

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new GeminiError('Gemini rate limited', 'rate_limited', 429);
    } else if (res.status >= 400 && res.status < 500) {
      throw new GeminiError(`Gemini bad request: ${res.status}`, 'bad_request', res.status);
    } else {
      throw new GeminiError(`Gemini server error: ${res.status}`, 'ai_failed', res.status);
    }
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

app.post('/ai/breakdown', async (req, res) => {
  const { task } = req.body || {};
  if (!task || !task.title || !task.dueDate) {
    return res.status(400).json({ error: 'bad_request' });
  }
  const hours = Math.floor((new Date(task.dueDate) - Date.now()) / 3600000);
  const prompt = `You are a task planning assistant for a high school student with ADHD.
Task: ${task.title} | Subject: ${task.subject} | Due in ${hours} hours | Difficulty: ${task.difficulty}
Generate JSON: { "starterAction": "2-5 min concrete first step", "subtasks": [{ "title": string, "estimatedMinutes": number }] }
${hours <= 24 ? 'All subtasks ≤10 min.' : 'First 1-3 subtasks ≤10 min, rest 15-30 min.'} Max 8 subtasks.
Return only valid JSON. No preamble.`;
  try {
    const text = await callGemini(prompt);
    res.json(JSON.parse(text.replace(/```json|```/g, '').trim()));
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.type === 'rate_limited') return res.status(429).json({ error: 'rate_limited', retryAfter: 60 });
      if (e.type === 'bad_request') return res.status(400).json({ error: 'bad_request' });
    }
    res.status(500).json({ error: 'ai_failed' });
  }
});

app.post('/ai/extract-dates', async (req, res) => {
  const { userInput } = req.body || {};
  if (!userInput) {
    return res.status(400).json({ error: 'bad_request' });
  }
  const today = new Date().toISOString().split('T')[0];
  const prompt = `Today's date is ${today}. Extract tasks and due dates from this text. Return JSON array: [{ "title": string, "dueDate": "ISO8601 or null", "subject": "string or null" }]
Text: ${userInput}
Return only valid JSON. No preamble.`;
  try {
    const text = await callGemini(prompt);
    res.json(JSON.parse(text.replace(/```json|```/g, '').trim()));
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.type === 'rate_limited') return res.status(429).json({ error: 'rate_limited', retryAfter: 60 });
      if (e.type === 'bad_request') return res.status(400).json({ error: 'bad_request' });
    }
    res.status(500).json({ error: 'ai_failed' });
  }
});

app.post('/ai/simplify', async (req, res) => {
  const { subtask } = req.body || {};
  if (!subtask || !subtask.title) {
    return res.status(400).json({ error: 'bad_request' });
  }
  const prompt = `A high school student with ADHD is stuck on: "${subtask.title}"
Rewrite as a simpler concrete action doable in 2 minutes or less. Return only the new step, no preamble.`;
  try {
    const text = await callGemini(prompt);
    res.json({ simplified: text.trim() });
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.type === 'rate_limited') return res.status(429).json({ error: 'rate_limited', retryAfter: 60 });
      if (e.type === 'bad_request') return res.status(400).json({ error: 'bad_request' });
    }
    res.status(500).json({ error: 'ai_failed' });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Ampora backend on port 3000'));
