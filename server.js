require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const pathMod = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const PROMPTS = require('./prompts');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── TOKEN POOL (persistent JSON file) ──────────────────────────────────────
const POOL_PATH = pathMod.join(__dirname, 'token-pool.json');
function readPool() {
  try { if (fs.existsSync(POOL_PATH)) return JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')); } catch { /* */ }
  return [];
}
function writePool(pool) { fs.writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2)); }

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Object interaction → narrator response
app.post('/api/narrate', async (req, res) => {
  const { object } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 200,
      system: PROMPTS.NARRATOR,
      messages: [{ role: 'user', content: `The player examines: ${object}` }],
    });
    res.json({ text: response.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Journal prompt from card types
app.post('/api/journal-prompt', async (req, res) => {
  const { cards } = req.body;
  const counts = {};
  cards.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Emotion';
  const category = PROMPTS.CARD_TO_CATEGORY[dominant] || 'emotion';
  const pool = PROMPTS.JOURNAL_QUESTIONS[category];
  const question = pool[Math.floor(Math.random() * pool.length)];
  res.json({ question, category });
});

// Boundary conversation
app.post('/api/conversation', async (req, res) => {
  const { messages, sessionData } = req.body;
  const sessionContext = buildSessionContext(sessionData);
  const system = PROMPTS.CONVERSATION.replace('{{ SESSION_DATA }}', sessionContext);
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 350,
      system,
      messages,
    });
    res.json({ text: response.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Character reveal — called after conversation ends
app.post('/api/character', async (req, res) => {
  const { sessionData } = req.body;
  const sessionContext = buildSessionContext(sessionData);
  const system = PROMPTS.CHARACTER.replace('{{ SESSION_DATA }}', sessionContext);
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: 'Reveal the character.' }],
    });
    const raw = response.content[0].text.trim();
    // Strip markdown code fences if present
    const clean = raw.replace(/```json|```/g, '').trim();
    const character = JSON.parse(clean);
    res.json(character);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get random situation for final message
app.get('/api/situation', (req, res) => {
  const situations = PROMPTS.SITUATIONS;
  const situation = situations[Math.floor(Math.random() * situations.length)];
  res.json({ situation });
});

// Generate token words (visual label)
app.post('/api/token', async (req, res) => {
  const { sessionData } = req.body;
  const journalText = sessionData.journals.map(j => j.text).join(' ');
  const cardNames = sessionData.cards.map(c => c.name).join(', ');
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 50,
      system: PROMPTS.TOKEN,
      messages: [{ role: 'user', content: `Cards: ${cardNames}\nJournal: "${journalText}"` }],
    });
    const words = response.content[0].text.trim().split(/\s+/).slice(0, 3);
    res.json({ words });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TOKEN POOL ROUTES ──────────────────────────────────────────────────────

// Deposit a token into the pool
app.post('/api/pool/deposit', (req, res) => {
  const { archetype, signature, description, words, message, situation, cardTypes, defenseHint } = req.body;
  const pool = readPool();
  const token = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    archetype, signature, description, words, message, situation,
    cardTypes: cardTypes || [],
    defenseHint: defenseHint || '',
    createdAt: new Date().toISOString(),
  };
  pool.push(token);
  writePool(pool);
  res.json({ ok: true, tokenId: token.id });
});

// Receive a matching token from the pool
app.get('/api/pool/receive', (req, res) => {
  const { cardTypes, exclude } = req.query;
  const pool = readPool();
  if (pool.length === 0) return res.json({ token: null });
  const myTypes = cardTypes ? cardTypes.split(',') : [];
  const candidates = pool
    .filter(t => t.id !== exclude)
    .map(t => {
      let score = 0;
      myTypes.forEach(mt => { if (t.cardTypes.includes(mt)) score += 1; });
      score += Math.random() * 0.5;
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score);
  res.json({ token: candidates[0] || pool[Math.floor(Math.random() * pool.length)] });
});

// Get all tokens for pool visualization
app.get('/api/pool/all', (_req, res) => {
  const pool = readPool();
  res.json({
    tokens: pool.map(t => ({ id: t.id, archetype: t.archetype, words: t.words, createdAt: t.createdAt })),
    total: pool.length,
  });
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildSessionContext(sessionData) {
  return `
Objects touched: ${sessionData.objects.map(o => `${o.name} (${o.cardType})`).join(', ')}
Objects ignored: ${sessionData.ignored?.join(', ') || 'none'}
Cards: ${sessionData.cards.map(c => `[${c.type}] ${c.name}`).join(', ')}

Journal entries:
${sessionData.journals.map((j, i) =>
  `Entry ${i + 1}\nPrompt: "${j.prompt}"\nResponse: "${j.text}"`
).join('\n\n')}
`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TWR → http://localhost:${PORT}`));