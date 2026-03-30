// ─── SCENE DATA ───────────────────────────────────────────────────────────────
// Linear narrative. Each scene has a description + choices.
// Each choice may or may not give a card (card: null = no card).

const ROOM1 = {
  id: 'R1',
  label: 'Room 1',
  scenes: [
    {
      id: 'S-01',
      narrative: 'You enter a white room. One table, one chair, one mirror. The door behind you is not locked — it stays slightly open. Somewhere, a heartbeat.',
      question: 'Someone watches a door left open, from across the room. What do you do?',
      choices: [
        { key: 'A', text: 'Close the door.',                                card: null },
        { key: 'B', text: 'Watch the door back. See if anything moves.',    card: { type: 'Ambiguous Intention', name: 'The open door' } },
        { key: 'C', text: 'Sit in the chair. Ignore the door.',             card: null },
        { key: 'D', text: 'Walk toward the door slowly.',                   card: { type: 'Ambiguous Intention', name: 'The open door' } },
        { key: 'E', text: 'Look for who\'s watching.',                      card: { type: 'Ambiguous Intention', name: 'The open door' } },
      ],
    },
    {
      id: 'S-02',
      narrative: 'A glass of water sits on the table. You didn\'t ask for it. You don\'t know who placed it there. The surface is still.',
      question: 'A glass of water is offered, without being asked. What do you do?',
      choices: [
        { key: 'A', text: 'Drink it without thinking.',                     card: null },
        { key: 'B', text: 'Hold the glass. Feel its temperature.',          card: { type: 'Ambiguous Intention', name: 'The offered water' } },
        { key: 'C', text: 'Leave it. You didn\'t ask for this.',            card: null },
        { key: 'D', text: 'Look around for who offered it.',                card: { type: 'Ambiguous Intention', name: 'The offered water' } },
        { key: 'E', text: 'Pour it out slowly.',                            card: { type: 'Ambiguous Intention', name: 'The offered water' } },
      ],
    },
    {
      id: 'S-03',
      narrative: 'From somewhere behind the wall, a voice calls. It sounds familiar — someone you know, or someone you once knew. You can\'t place it.',
      question: 'A familiar voice calls, and someone follows without knowing why. What do you do?',
      choices: [
        { key: 'A', text: 'Follow the voice.',                              card: { type: 'Ambiguous Intention', name: 'The familiar voice' } },
        { key: 'B', text: 'Call back. Ask who it is.',                       card: { type: 'Ambiguous Intention', name: 'The familiar voice' } },
        { key: 'C', text: 'Stay still. Wait for it to speak again.',        card: { type: 'Ambiguous Intention', name: 'The familiar voice' } },
        { key: 'D', text: 'Cover your ears.',                               card: null },
        { key: 'E', text: 'Pretend you didn\'t hear it.',                   card: null },
      ],
    },
    {
      id: 'S-04',
      narrative: 'The floor gives way to soft ground. In the center, a small mound of earth. Something has been buried here — in the place you keep returning to.',
      question: 'A small box is buried in the place you always return to. What do you do?',
      choices: [
        { key: 'A', text: 'Dig it up immediately.',                         card: { type: 'Secret', name: 'The buried box' } },
        { key: 'B', text: 'Touch the ground above it. Don\'t dig.',         card: { type: 'Secret', name: 'The buried box' } },
        { key: 'C', text: 'Bury it deeper.',                                card: { type: 'Secret', name: 'The buried box' } },
        { key: 'D', text: 'Walk away. Some things stay buried.',            card: null },
        { key: 'E', text: 'Mark the spot. Come back later.',                card: null },
      ],
    },
    {
      id: 'S-05',
      narrative: 'A mirror appears — but it has two faces. One shows you as you are. The other shows something slightly different. Someone behind you is taking measurements.',
      question: 'Someone stands still before a mirror with two faces, while being measured. What do you do?',
      choices: [
        { key: 'A', text: 'Look at the version that\'s different.',         card: { type: 'Evaluation', name: 'The double mirror' } },
        { key: 'B', text: 'Look at the version that\'s you.',               card: null },
        { key: 'C', text: 'Turn around. Face whoever is measuring.',        card: { type: 'Evaluation', name: 'The double mirror' } },
        { key: 'D', text: 'Stand still. Let them measure.',                 card: { type: 'Evaluation', name: 'The double mirror' } },
        { key: 'E', text: 'Break the mirror.',                              card: null },
      ],
    },
    {
      id: 'S-06',
      narrative: 'You find yourself making a gesture — something habitual, something yours. A hand on the back of your neck. A way of standing. Someone nearby is writing it down.',
      question: 'A familiar gesture is performed for someone who is writing it down. What do you do?',
      choices: [
        { key: 'A', text: 'Keep going. Pretend you don\'t notice.',         card: { type: 'Evaluation', name: 'The recorded gesture' } },
        { key: 'B', text: 'Stop the gesture. Become still.',                card: null },
        { key: 'C', text: 'Ask what they\'re writing.',                     card: { type: 'Evaluation', name: 'The recorded gesture' } },
        { key: 'D', text: 'Exaggerate the gesture. Make it a performance.', card: { type: 'Evaluation', name: 'The recorded gesture' } },
        { key: 'E', text: 'Take the pen from them.',                        card: null },
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

    let tokenWords = ['silence', 'trace', 'door'];
    try {
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionData: this.getSessionData() }),
      });
      const data = await res.json();
      tokenWords = data.words;
      document.getElementById('token-words').innerHTML = data.words
        .map((w, i) =>
          `<span class="token-word" style="animation-delay:${i * 0.25}s">${w}</span>`
        ).join('');
    } catch {
      document.getElementById('token-words').innerHTML =
        tokenWords.map(w => `<span class="token-word">${w}</span>`).join('');
    }

    // ── Deposit token into the pool ──
    const cardTypes = [...new Set(session.cards.map(c => c.type))];
    let depositedId = '';
    try {
      const depRes = await fetch('/api/pool/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetype: session.character?.archetype || 'The One Who Passed Through',
          signature: session.character?.signature || '',
          description: session.character?.description || '',
          words: tokenWords,
          message: session.finalMessage,
          situation: session.situation,
          cardTypes,
        }),
      });
      const depData = await depRes.json();
      depositedId = depData.tokenId || '';
    } catch { /* silent */ }

    // ── Receive a stranger's token from the pool ──
    await delay(1500);
    try {
      const rcvRes = await fetch(
        `/api/pool/receive?cardTypes=${cardTypes.join(',')}&exclude=${depositedId}`
      );
      const rcvData = await rcvRes.json();
      if (rcvData.token) {
        session.receivedToken = rcvData.token;
        this.showReceivedToken(rcvData.token);
      }
    } catch { /* silent */ }
  },

  showReceivedToken(token) {
    const section = document.getElementById('received-section');
    if (!section) return;
    section.style.display = 'flex';
    document.getElementById('recv-archetype').textContent = token.archetype || 'A stranger';
    document.getElementById('recv-message').textContent = token.message
      ? `"${token.message}"`
      : 'They left something here, but the words have faded.';
    document.getElementById('recv-sig').textContent = token.signature || '';
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