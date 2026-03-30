// ─── THE POOL — floating token exchange ─────────────────────────────────────

const container = document.getElementById('pool-container');
const countEl = document.getElementById('pool-count');
let allTokens = [];

async function loadTokens() {
  try {
    const res = await fetch('/api/pool/all');
    const data = await res.json();
    allTokens = data.tokens;
    countEl.textContent = `${data.total} tokens drifting`;
    renderFloatingTokens();
  } catch {
    countEl.textContent = 'the pool is quiet';
  }
}

function renderFloatingTokens() {
  container.innerHTML = '';
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  allTokens.forEach((token, i) => {
    const el = document.createElement('div');
    el.className = 'floating-token';
    const label = token.words ? token.words.join(' · ') : token.archetype || '· · ·';
    el.textContent = label;

    // Random position
    el.style.left = (Math.random() * (vw - 200)) + 'px';
    el.style.top = (Math.random() * (vh - 60)) + 'px';

    // Random animation
    const dur = 8 + Math.random() * 12;
    el.style.animationDuration = dur + 's';
    el.style.animationDelay = (Math.random() * -dur) + 's';
    el.style.opacity = 0.3 + Math.random() * 0.5;

    el.onclick = () => receiveToken(token.id);
    container.appendChild(el);
  });
}

async function receiveToken(clickedId) {
  // Get user's card types from URL params (passed from main game)
  const params = new URLSearchParams(window.location.search);
  const cardTypes = params.get('cardTypes') || '';
  const myTokenId = params.get('myToken') || '';

  try {
    const res = await fetch(`/api/pool/receive?cardTypes=${cardTypes}&exclude=${myTokenId}`);
    const data = await res.json();
    if (data.token) {
      showReceived(data.token);
    }
  } catch {
    // silently fail
  }
}

function showReceived(token) {
  document.getElementById('recv-archetype').textContent = token.archetype || 'A stranger';
  document.getElementById('recv-message').textContent = token.message
    ? `"${token.message}"`
    : 'They left something here, but the words have faded.';
  document.getElementById('recv-sig').textContent = token.signature || '';
  document.getElementById('received-overlay').classList.add('active');
}

function closeReceived() {
  document.getElementById('received-overlay').classList.remove('active');
}

// Reposition on resize
window.addEventListener('resize', () => {
  if (allTokens.length > 0) renderFloatingTokens();
});

// Init
loadTokens();

// Refresh every 30s
setInterval(loadTokens, 30000);
