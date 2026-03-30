// ─── SCENE DATA ───────────────────────────────────────────────────────────────
// Linear narrative. Each scene has a description + choices.
// Each choice may or may not give a card (card: null = no card).

const ROOM1 = {
  id: 'R1',
  label: 'Room 1',
  scenes: [
    {
      id: 'S-01',
      narrative: 'You enter a white room. One table, one chair, one mirror. The door closes behind you. It is not locked. Somewhere, a heartbeat.',
      question: 'What do you do first?',
      choices: [
        { key: 'A', text: 'Try the door. Check if you can leave.',         card: null },
        { key: 'B', text: 'Look in the mirror.',                            card: { type: 'Emotion',      name: 'Reflection' } },
        { key: 'C', text: 'Sit in the chair. Wait.',                        card: { type: 'Memory',       name: 'Waiting' } },
        { key: 'D', text: 'Examine the table. See what\'s on it.',          card: null },
        { key: 'E', text: 'Walk the perimeter. Touch the walls.',           card: { type: 'Object',       name: 'The boundary' } },
      ],
    },
    {
      id: 'S-02',
      narrative: 'There is an envelope on the table. Your name is written on the front. You don\'t recognize the handwriting.',
      question: 'What do you do?',
      choices: [
        { key: 'A', text: 'Open it immediately.',                           card: null },
        { key: 'B', text: 'Turn it over. Smell it. Feel the weight. Then open it.', card: { type: 'Emotion', name: 'The body first' } },
        { key: 'C', text: 'Don\'t open it. Put it in your pocket.',         card: { type: 'Memory',       name: 'The unopened thing' } },
        { key: 'D', text: 'Open it just enough to read the first line.',    card: null },
        { key: 'E', text: 'Try to figure out who sent it before opening.',  card: { type: 'Object',       name: 'The unanswered question' } },
      ],
    },
    {
      id: 'S-03',
      narrative: 'You pass the corridor. Through a half-open door, two people are talking. One says: "...they probably don\'t know." The other replies: "I think that\'s me."',
      question: 'What is this conversation about?',
      choices: [
        { key: 'A', text: 'Me. They\'re talking about something I don\'t know.',   card: { type: 'Emotion',      name: 'The one being talked about' } },
        { key: 'B', text: 'Someone else. This has nothing to do with me.',          card: null },
        { key: 'C', text: 'They\'re protecting someone. There\'s goodwill here.',   card: { type: 'Relationship', name: 'The protector' } },
        { key: 'D', text: 'I can\'t tell. Not enough information.',                 card: null },
        { key: 'E', text: 'I shouldn\'t have heard this. I keep walking.',          card: { type: 'Memory',       name: 'The overheard thing' } },
      ],
    },
    {
      id: 'S-04',
      narrative: 'A faded family photo hangs on the wall. Something feels off. Someone might be missing. Or the arrangement is wrong.',
      question: 'Who do you look at first?',
      choices: [
        { key: 'A', text: 'The person in the center.',                      card: null },
        { key: 'B', text: 'The person at the edge.',                        card: { type: 'Relationship', name: 'The one at the edge' } },
        { key: 'C', text: 'The person not looking at the camera.',          card: { type: 'Emotion',      name: 'The one looking away' } },
        { key: 'D', text: 'The empty space. Someone should be there.',      card: { type: 'Relationship', name: 'The missing person' } },
        { key: 'E', text: 'The whole photo first. No one in particular.',   card: null },
      ],
    },
    {
      id: 'S-05',
      narrative: 'Five photographs hang on the wall. You can take one.',
      question: 'Which do you take?',
      choices: [
        { key: 'A', text: 'People gathered, laughing. Their faces are blurred.',    card: { type: 'Relationship', name: 'The blurred crowd' } },
        { key: 'B', text: 'An empty room. Light through a window.',                 card: { type: 'Memory',       name: 'The room before' } },
        { key: 'C', text: 'The ocean, just before a storm.',                        card: { type: 'Emotion',      name: 'The held moment' } },
        { key: 'D', text: 'A child looking back. Expression hidden.',               card: { type: 'Memory',       name: 'The backward glance' } },
        { key: 'E', text: 'You don\'t take anything.',                              card: null },
      ],
    },
    {
      id: 'S-06',
      narrative: 'Your phone buzzes. Sender: someone close. Message: "We should talk."',
      question: 'What happens in your body first?',
      choices: [
        { key: 'A', text: 'Heart speeds up.',                               card: { type: 'Emotion', name: 'The alarm' } },
        { key: 'B', text: 'Stomach gets heavy.',                            card: { type: 'Emotion', name: 'The weight' } },
        { key: 'C', text: 'Nothing. It\'s just a text.',                    card: null },
        { key: 'D', text: 'Hands go cold.',                                 card: { type: 'Emotion', name: 'The freeze' } },
        { key: 'E', text: 'You reply immediately: "About what?"',           card: null },
      ],
    },
  ],
};

// ─── SESSION STATE ────────────────────────────────────────────────────────────

const session = {
  currentSceneIndex: 0,
  cards: [],
  choices: [],              // { sceneId, choiceKey, choiceText }
  journals: [],
  conversationHistory: [],
  turnCount: 0,
  _currentPrompt: '',
  character: null,
  situation: '',
  finalMessage: '',
};

// ─── PHASE MANAGER ───────────────────────────────────────────────────────────

function showPhase(id) {
  document.querySelectorAll('.phase').forEach(el => {
    el.classList.remove('active');
    el.style.display = 'none';
  });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  void el.offsetWidth;
  el.classList.add('active');
}

// ─── GAME ─────────────────────────────────────────────────────────────────────

const Game = {

  start() {
    showPhase('phase-room');
    this.renderScene();
  },

  // ── SCENE ─────────────────────────────────────────────

  renderScene() {
    const scene = ROOM1.scenes[session.currentSceneIndex];

    // Fade out, update, fade in
    const sceneEl = document.getElementById('scene-content');
    sceneEl.style.opacity = 0;

    setTimeout(() => {
      // Room label
      document.getElementById('room-label').textContent =
        `${ROOM1.label} — ${session.currentSceneIndex + 1} / ${ROOM1.scenes.length}`;

      // Narrative
      document.getElementById('scene-narrative').textContent = scene.narrative;

      // Question
      document.getElementById('scene-question').textContent = scene.question;

      // Choices
      const choicesEl = document.getElementById('scene-choices');
      choicesEl.innerHTML = '';
      scene.choices.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.innerHTML = `<span class="choice-key">${c.key}</span>${c.text}`;
        btn.onclick = () => this.makeChoice(scene, c);
        choicesEl.appendChild(btn);
      });

      // Cards tray
      this.updateCardsTray();

      // Hide card notification
      document.getElementById('card-notification').style.display = 'none';

      sceneEl.style.transition = 'opacity 0.5s ease';
      sceneEl.style.opacity = 1;
    }, 300);
  },

  async makeChoice(scene, choice) {
    // Lock choices
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.disabled = true;
      if (btn.querySelector('.choice-key')?.textContent === choice.key) {
        btn.classList.add('selected');
      }
    });

    // Record choice
    session.choices.push({
      sceneId: scene.id,
      choiceKey: choice.key,
      choiceText: choice.text,
    });

    // Give card if this choice triggers one
    if (choice.card) {
      session.cards.push(choice.card);
      this.showCardNotification(choice.card);
      await delay(1400);
    }

    // Fetch narrator response
    document.getElementById('scene-question').innerHTML =
      '<span class="loading-text">...</span>';
    document.getElementById('scene-choices').style.opacity = '0.3';

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object: `${scene.id}: player chose "${choice.text}"` }),
      });
      const data = await res.json();
      document.getElementById('scene-question').textContent = '';

      // Show narrator response below narrative
      document.getElementById('scene-narrative').textContent =
        scene.narrative + '\n\n' + data.text;
    } catch {
      document.getElementById('scene-question').textContent = '';
    }

    document.getElementById('scene-choices').innerHTML = '';

    // Advance to next scene or go to door
    await delay(2000);

    session.currentSceneIndex++;
    if (session.currentSceneIndex < ROOM1.scenes.length) {
      this.renderScene();
    } else {
      this.goToDoor();
    }
  },

  showCardNotification(card) {
    const notif = document.getElementById('card-notification');
    notif.style.display = 'flex';
    notif.innerHTML = `
      <span style="font-size:0.7rem; color:var(--mid);">Card received</span>
      <span class="mini-card ${card.type}">${card.type} — ${card.name}</span>
    `;
  },

  updateCardsTray() {
    const list = document.getElementById('cards-list');
    if (session.cards.length === 0) {
      list.innerHTML = '<span style="font-size:0.72rem; color:var(--line);">none yet</span>';
    } else {
      list.innerHTML = session.cards
        .map(c => `<span class="mini-card ${c.type}">${c.type} — ${c.name}</span>`)
        .join('');
    }
  },

  // ── DOOR / JOURNALING ────────────────────────────────

  async goToDoor() {
    showPhase('phase-door');

    // Show collected cards
    const doorCards = document.getElementById('door-cards');
    if (session.cards.length === 0) {
      doorCards.innerHTML = '<span style="font-size:0.8rem; color:var(--mid); font-style:italic;">No cards collected.</span>';
    } else {
      doorCards.innerHTML = session.cards
        .map(c => `<span class="mini-card ${c.type}">${c.type} — ${c.name}</span>`)
        .join('');
    }

    // Fetch journal prompt
    document.getElementById('journal-prompt').innerHTML =
      '<span class="loading-text">drawing a question...</span>';

    try {
      const res = await fetch('/api/journal-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: session.cards }),
      });
      const data = await res.json();
      document.getElementById('journal-prompt').textContent = data.question;
      session._currentPrompt = data.question;
    } catch {
      const fallback = "Write about something you reached for but didn't take.";
      document.getElementById('journal-prompt').textContent = fallback;
      session._currentPrompt = fallback;
    }

    const textarea = document.getElementById('journal-input');
    textarea.value = '';
    textarea.addEventListener('input', () => {
      document.getElementById('journal-count').textContent =
        textarea.value.length + ' characters';
    });
  },

  submitJournal() {
    const text = document.getElementById('journal-input').value.trim();
    if (text.length < 10) {
      document.getElementById('journal-input').style.borderColor = '#d4a8a8';
      return;
    }
    session.journals.push({ prompt: session._currentPrompt, text });
    showPhase('phase-boundary');
    this.startConversation();
  },

  // ── BOUNDARY / CONVERSATION ───────────────────────────

  async startConversation() {
    document.getElementById('conversation-log').innerHTML = '';
    const opening = await this.fetchConversation([
      { role: 'user', content: 'I have passed through the rooms.' }
    ]);
    session.conversationHistory = [
      { role: 'user', content: 'I have passed through the rooms.' },
      { role: 'assistant', content: opening },
    ];
    session.turnCount = 1;
    this.appendMessage('observer', opening);
  },

  async sendMessage() {
    const input = document.getElementById('conv-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.appendMessage('player', text);
    session.conversationHistory.push({ role: 'user', content: text });
    session.turnCount++;

    if (session.turnCount >= 5) {
      document.getElementById('reveal-btn').style.display = 'block';
    }

    const reply = await this.fetchConversation(session.conversationHistory);
    session.conversationHistory.push({ role: 'assistant', content: reply });
    this.appendMessage('observer', reply);
  },

  async fetchConversation(messages) {
    const log = document.getElementById('conversation-log');
    const loadingEl = document.createElement('div');
    loadingEl.className = 'conv-msg observer';
    loadingEl.innerHTML = '<span class="loading-text">...</span>';
    log.appendChild(loadingEl);
    this.scrollLog();

    try {
      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionData: this.getSessionData() }),
      });
      const data = await res.json();
      loadingEl.remove();
      return data.text;
    } catch {
      loadingEl.remove();
      return '...';
    }
  },

  appendMessage(role, text) {
    const log = document.getElementById('conversation-log');
    const el = document.createElement('div');
    el.className = `conv-msg ${role}`;
    el.textContent = text;
    log.appendChild(el);
    this.scrollLog();
  },

  scrollLog() {
    const log = document.getElementById('conversation-log');
    log.scrollTop = log.scrollHeight;
  },

  // ── CHARACTER REVEAL ──────────────────────────────────

  async revealCharacter() {
    showPhase('phase-character');
    document.getElementById('archetype-name').innerHTML =
      '<span class="loading-text">reading the room...</span>';

    try {
      const res = await fetch('/api/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionData: this.getSessionData() }),
      });
      const data = await res.json();
      session.character = data;
      await delay(400);
      document.getElementById('archetype-name').textContent = data.archetype;
      await delay(300);
      document.getElementById('archetype-desc').textContent = data.description;
      await delay(300);
      document.getElementById('archetype-sig').textContent = data.signature;
    } catch {
      document.getElementById('archetype-name').textContent = 'The One Who Passed Through';
      document.getElementById('archetype-desc').textContent = 'Something was here.';
      document.getElementById('archetype-sig').textContent = 'Left before the door closed.';
    }
  },

  // ── FINAL MESSAGE ──────────────────────────────────────

  async goToFinalMessage() {
    showPhase('phase-message');
    document.getElementById('situation-text').innerHTML =
      '<span class="loading-text">finding someone...</span>';

    try {
      const res = await fetch('/api/situation');
      const data = await res.json();
      session.situation = data.situation;
      document.getElementById('situation-text').textContent =
        `Someone is here right now — ${data.situation}.`;
    } catch {
      session.situation = 'someone sitting alone';
      document.getElementById('situation-text').textContent =
        'Someone is here right now — someone sitting alone.';
    }

    const textarea = document.getElementById('message-input');
    textarea.value = '';
    textarea.addEventListener('input', () => {
      document.getElementById('message-count').textContent =
        textarea.value.length + ' characters';
    });
  },

  // ── TOKEN ──────────────────────────────────────────────

  async generateToken() {
    const text = document.getElementById('message-input').value.trim();
    if (text.length < 5) {
      document.getElementById('message-input').style.borderColor = '#d4a8a8';
      return;
    }
    session.finalMessage = text;
    showPhase('phase-token');

    document.getElementById('token-archetype').textContent =
      session.character?.archetype || 'The One Who Passed Through';
    document.getElementById('token-message-display').textContent =
      `"${session.finalMessage}"`;
    document.getElementById('token-to').textContent =
      `for — ${session.situation}`;
    document.getElementById('token-words').innerHTML =
      '<span class="loading-text">distilling...</span>';

    try {
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionData: this.getSessionData() }),
      });
      const data = await res.json();
      document.getElementById('token-words').innerHTML = data.words
        .map((w, i) =>
          `<span class="token-word" style="animation-delay:${i * 0.25}s">${w}</span>`
        ).join('');
    } catch {
      document.getElementById('token-words').innerHTML =
        '<span class="token-word">silence</span>' +
        '<span class="token-word">trace</span>' +
        '<span class="token-word">door</span>';
    }
  },

  // ── HELPER ─────────────────────────────────────────────

  getSessionData() {
    return {
      objects: session.choices.map(c => ({ name: c.choiceText, cardType: 'choice' })),
      ignored: [],
      cards: session.cards,
      journals: session.journals,
      choices: session.choices,
    };
  },
};

// ─── UTILS ───────────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('conv-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      Game.sendMessage();
    }
  });
});