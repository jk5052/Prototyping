# The White Room — Architecture Walkthrough

Companion to `TECH_OVERVIEW.md` (system-level), `CARD_GENERATION.md` (talisman pipeline), and `ORACLE_WORDS.md` (word fragments). This document follows a **single playthrough** in code, with file:line references. The intended audience is a developer re-entering the codebase after time away, or auditing the engine for the paper.

All line numbers reflect `main @ HEAD` at the time of writing. Source moves; treat references as anchors rather than contracts.

---

## 1. Entry — Landing and session bootstrap

The site root is `twr/app/page.tsx`. It is a single client component (`'use client'` at line 1) that switches on `phase` from Zustand and renders a different scene per phase. The route handler is therefore the entire game tree, not a per-phase route.

| Step | File / line | What happens |
|---|---|---|
| Mount | `twr/app/page.tsx:36` (`export default function Home`) | `phase = 'landing'` from `useGameStore` (`gameStore.ts:52`) |
| Preload | `twr/app/page.tsx:78` (`useEffect(preloadChoicesIndex)`) | `choicesIndex.ts:loadOnce()` pulls the ~200-row `choices_rag` mirror once per page load. This is what lets `narrativeLog.ts:logChoice` snapshot defense labels client-side without a per-click API round trip |
| Play click | `twr/app/page.tsx:103` (`onClick={...}`) | `resetSessionId()` (`lib/session.ts`) issues a new `sessionStorage` UUID; `resetForNewPlay()` clears the Zustand store (`gameStore.ts:98`); `setPhase('intro')`. The session-id reset matters because `letter_exchanges` is keyed on `session_id` — replaying without a reset would surface the previous letter match |
| Intro | `twr/app/page.tsx:123` | `<video src="/introvideo.mp4">` autoplays; `onEnded` or click moves to `room1` |

The session id is the load-bearing identity of the whole run. Every Supabase write under RLS carries it as the `x-session-id` header (`lib/supabase.ts`); every server route uses it as the upsert key.

---

## 2. Rooms 1–5 — Choice → narrative_logs

A single `Room` component (`twr/components/Room.tsx`) renders all five rooms with different GLBs. Mesh names key into `twr/data/events.ts`.

| Step | File / line | What happens |
|---|---|---|
| GLB resolve | `Room.tsx:73`–`Room.tsx:106` (model dictionary) | `useGLTF` loads the GLB; the glow registry walks `scene.traverse` to find every named mesh that matches `ITEMS` and stores root + `baseScale: Vector3` (the `Vector3` is important — see `Room.tsx:759` end-of-file changelog for the mirrored-mesh fix) |
| Click | `app/page.tsx:174` (`onObjectClick`) | Looks up `ITEM_BY_NAME[name]`. If `kind='door'` → `requestExit` (`app/page.tsx:164`); else start a chain `{itemId, events, index: 0}` |
| Entry chain | `app/page.tsx:83`–`89` (`handleIntroComplete`) | After `RoomIntro` finishes, `ROOM_ENTRY_EVENTS[room]` (if present) auto-fires as a chain with `itemId = ENTRY_ITEM_ID` (`'__entry__'`). Normalised to `'room_entry'` for the `choices_rag` lookup (`choicesIndex.ts:7`) |
| Event UI | `EventOverlay.tsx` | Renders 3–4 buttons. Tracks hover dwell, latency, changed-mind flag in `meta` |
| Choice commit | `app/page.tsx:227`–`272` (`onChoose`) | Two side effects: `addChoice` (Zustand) and `void logChoice` (`lib/narrativeLog.ts:31`). `logChoice` calls `lookupChoice` (`choicesIndex.ts`) to denormalise primary/secondary defense + VAD + axis labels at insert time, then upserts `narrative_logs` with onConflict `(session_id, room, item_id, event_index, choice_index)` (`narrativeLog.ts:75`) |
| Oracle words | `app/page.tsx:258` | `addOracleWords(pickOracleWords(3))` — see `twr/ORACLE_WORDS.md`. Words go into `gameStore.collectedWords` but are not written to Supabase |
| Chain advance | `app/page.tsx:259`–`271` | If `choice.endChain` or last event in the chain, clear `chain`; for R4 posters/elevator a sealing exit to room5 fires (`app/page.tsx:265`). Otherwise advance `index` |

The denormalised snapshot in `narrative_logs` is the *only* defense label most of the system reads. `session_analysis` (Opus 4.7) is run lazily later and stored separately; it does not overwrite the per-row labels.

---

## 3. Inter-room — JournalingOverlay

| Step | File / line | What happens |
|---|---|---|
| Trigger | `app/page.tsx:164` (`requestExit`) or door click | If unexplored items remain → `confirmExit` modal first; else `setJournaling({from, to})` |
| Prompt | `JournalingOverlay.tsx` → `POST /api/journal-prompt` | Server reads recent `narrative_logs` for the session and asks Sonnet 4.5 for a single short prompt. `seed_words` is in the payload but ignored — see `ORACLE_WORDS.md` §6 |
| Response | `JournalingOverlay.tsx` → `journals` table | The player types or skips with `·`. The row goes into `journals` under RLS (anon publishable + `x-session-id`) |
| Advance | `app/page.tsx:298` (`setPhase(nextPhase)`) | `nextPhase` is `roomN+1` for N<5, else `conversation` (`app/page.tsx:151`) |

Journals are unlabelled at insert; aggregation happens at `session_analysis` generation time.

---

## 4. Conversation — Sonnet 4.5

After R5's journaling completes, `phase = 'conversation'`. This is the first endgame phase.

| Step | File / line | What happens |
|---|---|---|
| Scene mount | `app/page.tsx:354` → `ConversationScene` (`app/page.tsx:439`) | Inlined component, not a separate file. Plays `/subvideo.gif` for `INTRO_DURATION_MS=5500` (`app/page.tsx:438`) then fades in `VoidDialogue` |
| First turn | `VoidDialogue.tsx` → `POST /api/conversation` | Server runs `getOrCreateSessionAnalysis` (`lib/sessionAnalysis.ts`) on first call — Opus 4.7 reads all `narrative_logs` + `journals` for the session and emits a structured profile (`primary_defense`, secondary, etc.) into `session_analysis`. This single deep read is the only Opus 4.7 call in the whole game |
| Film stem | `app/api/conversation/route.ts` | Picks a film-stimulus stem keyed on `primary_defense` and passes it as the opening NPC turn |
| 6 turns | client loop | Up to 6 player turns. Free text is sanitized through `anthropicSanitize.ts:stripLoneSurrogates` before being included in the Anthropic body (`buildAnthropicBody`) — this is the patch for orphan UTF-16 halves triggering Anthropic 502s |
| End | `VoidDialogue.tsx` → `onComplete` | `setPhase('sealing')` |

---

## 5. Sealing → blank-fill mirror

`SealingOverlay` runs *before* the letter phase in the current flow (previously after — see TECH_OVERVIEW §9.1). It also doubles as the blank-fill phase.

| Step | File / line | What happens |
|---|---|---|
| Prompts | `SealingOverlay.tsx:53` → `GET /api/sealing-prompts?session_id=...` | Server uses `hashSeed(session_id + ':a'/':b'/':c') % pool` with walk-forward distinctness (`app/api/sealing-prompts/route.ts:21`). Deterministic per session |
| Per-line submit | `SealingOverlay.tsx:76` → `POST /api/final-reflections` | Upsert `(session_id, template_id) → answer_text` |
| Mirror | `SealingOverlay.tsx:89`–`101` | First **non-skipped** answer is fire-and-forget POSTed to `/api/blank-fill`, which embeds the answer (3072d → halfvec) and aggregates `primary_defense` from `narrative_logs`. This row is what `match_letter_for_session` reads next |
| Complete | `SealingOverlay.tsx` → `onComplete` | `setPhase('letter')` |

---

## 6. Letter chain — receive → reply → compose

Three back-to-back phases, each rendered inside `FinalSceneShell` (the `<video>` backdrop, `app/page.tsx:418`).

### 6.1 Receive (`phase='letter'`)

| Step | File / line | What happens |
|---|---|---|
| Match | `LetterOverlay.tsx` → `POST /api/letter` | Server reads `blank_fill_responses` for the session, runs `match_letter_for_session` RPC (cosine top-5 random within defense lane, `_any` fallback). Pins `letter_exchanges.received_letter_id`. Idempotent — same session always sees the same letter |
| Display | `LetterOverlay.tsx` | Renders the matched `seed_letters.letter_text` + pseudonym. No defense label shown |
| Continue | `LetterOverlay.tsx` → `onComplete` | `setPhase('letter-reply')` |

### 6.2 Private reply (`phase='letter-reply'`)

| Step | File / line | What happens |
|---|---|---|
| Compose | `LetterReplyOverlay.tsx` → `POST /api/respond-to-letter` | Writes `letter_exchanges.reply_text` + `reply_at`. 409 if `received_letter_id` is missing. `·` is accepted as silence |
| Privacy | — | `reply_text` is **never** propagated to `seed_letters`. Only the original letter's author can read it back via `/api/letter-inbox` (gated on `player_id`) |
| Continue | `LetterReplyOverlay.tsx` → `onComplete` | `setPhase('letter-compose')` |

### 6.3 Composed letter for the future pool (`phase='letter-compose'`)

| Step | File / line | What happens |
|---|---|---|
| Pick seed | `LetterComposeOverlay.tsx` | Reads the player's three `final_reflections` answers, lets them pick one as the seed phrase |
| Memory prompt | `LetterComposeOverlay.tsx` | UI-side scaffold; no LLM call |
| Compose | `LetterComposeOverlay.tsx` → `POST /api/compose-letter` | Server embeds the composed letter (`text-embedding-3-large` 3072d → `halfvec(3072)`) and writes `composed_letter`, `composed_letter_embedding`, `selected_template_id`, `selected_answer`, `composed_at`. Resets `share_choice` to NULL |
| Archive opt-in | `LetterComposeOverlay.tsx` → `POST /api/share-letter` | `share=true` runs `share_player_letter` RPC to insert into `seed_letters` (`source='player'`) and returns `qr_url`. `share=false` just records the decision |
| Continue | `LetterComposeOverlay.tsx` → `onComplete` | `setPhase('card')` |

---

## 7. Card — `card-bundle` orchestration

`CardOverlay.tsx` (`twr/components/CardOverlay.tsx:48`) fires once on mount (`fetchedRef` guard at `:55`):

| Step | File / line | What happens |
|---|---|---|
| Bundle call | `CardOverlay.tsx:59` → `POST /api/card-bundle` | Server is the orchestrator. See `twr/CARD_GENERATION.md` §2 for the full sequence: read `narrative_logs` + `journals` + `blank_fill_responses` + `final_reflections` + `letter_exchanges` → `extractMoodWords` (Sonnet 4.5, `lib/moodExtraction.ts`) → `/api/generate-card` (Flux Schnell) → `/api/find-poems` (`match_poems` RPC) → QR encode → `generated_cards` insert |
| PDF preview | `TalismanPDF.tsx` | A6 ×2 portrait. Page 1: image + sealing lines + mood fragments. Page 2: poem + composed letter + QR. Private reply is NOT included |
| Label variant | `TalismanLabelPDF.tsx` | Separate 50mm square label PDF |
| End | `CardOverlay.tsx:145` → `onComplete` | `setPhase('landing')` — loops back |

The `card-bundle` route is idempotent on the `generated_cards` PK, so re-opening the card phase after a partial failure won't double-insert.

---

## 8. Read-side surfaces (Infinity Wall)

Outside the player's run, `twr/app/letters/page.tsx` renders the gallery and `twr/app/letter/[id]/page.tsx` renders a single shared letter (the QR landing). Both read `seed_letters` directly under the anon key — the `source='player'` rows are publicly readable per the RLS policy in migration `16`. There is no longer a `/api/public-letters` route.

External replies via QR land in `letter_replies` (`/api/letter-reply`). The author of the original letter retrieves them via `/api/letter-inbox`, gated on persistent `player_id`. Successful inbox fetches flip `delivered=true`.

---

## 9. The two embedding boundaries

The system has two distinct embedding entry points and they currently feed different downstream code paths:

| Entry | What's embedded | Stored in | Read by |
|---|---|---|---|
| `/api/blank-fill` (mirrored from `SealingOverlay`) | first sealing answer | `blank_fill_responses.answer_embedding` (halfvec 3072) | `match_letter_for_session` (v1, live) |
| `/api/compose-letter` | composed letter body | `letter_exchanges.composed_letter_embedding` (halfvec 3072); also copied into `seed_letters.blank_answer_embedding` for `source='player'` rows by `share_player_letter` | `match_letter_for_session_v2` — staged in migration `18`, not wired into `/api/letter` |

The implication: today's matching mixes seed authors (short blank phrase) with past players (full composed prose) in the same vector space and column. A v2 variant that keys consistently on composed letters is one route-handler edit away from going live.

---

## 10. Where to start when something breaks

| Symptom | First place to look |
|---|---|
| R3 chair / R4 mirror disappeared | `Room.tsx` glow registry — confirm `baseScale: Vector3` (not number) is being preserved through `useFrame` (`Room.tsx` end-of-file changelog) |
| R4 poster blurry on zoom | `app/page.tsx:212`–`220` swap layer; `public/assets/poster_*.png` must exist |
| Conversation phase shows black screen | `/subvideo.gif` deployed? `ConversationScene` has a 5.5s hard timer; if the GIF 404s the timer still fires and `VoidDialogue` appears over black |
| Letter phase 409 | `blank_fill_responses` row missing — sealing's first-answer mirror did not run or failed. Check `bfPostedRef` in `SealingOverlay.tsx:46` |
| Card phase hangs | `/api/card-bundle` orchestration order in `app/api/card-bundle/route.ts`; isolate by hitting `/api/generate-card` and `/api/find-poems` independently |
| Anthropic 502 on free-text routes | Lone UTF-16 surrogate in player input — confirm the route calls `buildAnthropicBody` from `lib/anthropicSanitize.ts` |

---

## 11. Companion docs

- `twr/TECH_OVERVIEW.md` — system-level: phases, schema, models, RLS, thesis framing
- `twr/CARD_GENERATION.md` — talisman pipeline deep dive (mood → Flux → poem → PDF)
- `twr/ORACLE_WORDS.md` — in-game word fragments collected per choice
- `twr/AGENTS.md` / `twr/CLAUDE.md` — Next.js 16 breaking-change notes for AI agents editing the codebase
