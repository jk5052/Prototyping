require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const PROMPTS = require('./prompts');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

app.listen(3000, () => console.log('TWR → http://localhost:3000'));