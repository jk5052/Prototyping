# In-Game Oracle Words 생성 로직

방 1–4 플레이 중 player 가 모으는 **단어 조각들** — 화면 우상단 `collected` 패널에 누적되는 짧은 phrase 들 — 이 어떻게 만들어지고 어디로 흘러가는지 정리한 문서.

이건 talisman PDF 의 `moodWords` 와는 **별개의 시스템**입니다. (talisman 쪽은 `CARD_GENERATION.md` 참고.)

- **단어 풀**: `twr/data/oracleWords.ts`
- **픽 트리거**: `twr/app/page.tsx` (EventOverlay 의 onConfirm 콜백)
- **저장**: `twr/stores/gameStore.ts` (`collectedWords`)
- **표시**: `twr/components/CollectedWordsPanel.tsx`
- **소비처**: `twr/components/JournalingOverlay.tsx` (방-사이 저널링 UI)

## 1. 단어 풀 — `data/oracleWords.ts`

LLM 호출 없는 **사전 큐레이팅 풀**. 8 개 카테고리 × 각 10 개 = 총 80 개의 evocative phrase:

| 카테고리 | 예시 |
|---|---|
| `time` | the long pause, thirteen seconds, a borrowed hour, almost, not yet |
| `space` | the next room, a closed window, no exit, the corner, beneath |
| `weather` | fog, the dry season, low pressure, hailstone, a clear sky |
| `body` | an unsteady hand, the held breath, shoulder turned, a quiet pulse |
| `object` | obsidian, a cracked cup, the same coat, an empty frame, old paper |
| `feeling` | something unfinished, a private joke, almost forgiven, the wrong relief |
| `motion` | the long walk back, a slow exhale, a quiet refusal, the first step |
| `fragment` | as if to say, and then nothing, or perhaps, something like that |

> 카테고리는 **분류 도구가 아니라 의미 분포를 다양하게 유지하기 위한 파티션**. 추출 시점에는 카테고리를 의식하지 않고 전체 80 개를 한 풀로 다룸.

`pickOracleWords(n = 3)` 는 `ALL = Object.values(ORACLE_WORDS).flat()` 의 사본에서 `Math.random()` 으로 `n` 개를 비복원 추출 (한 번 픽한 phrase 는 같은 호출 안에서 다시 안 나옴, 다만 호출 간에는 중복 가능):

```ts
const pool = [...ALL]
const out: string[] = []
for (let i = 0; i < n && pool.length > 0; i++) {
  const idx = Math.floor(Math.random() * pool.length)
  out.push(pool[idx])
  pool.splice(idx, 1)
}
```

## 2. 트리거 — 매 choice 직후

`page.tsx` 의 `EventOverlay onConfirm` 콜백 안:

```tsx
// choice마다 오라클 단어 3개 누적 — 우상단 패널에 append
addOracleWords(pickOracleWords(3))
```

즉 **각 인터랙티브 아이템의 각 choice 마다 3 개씩 추가**. EventOverlay 한 chain 이 4 단계면 4 × 3 = 12 개가 append 됨. 방 4 개 (R1–R4) × 평균 5 chain × 3 단계 ≈ 한 세션 60 개 안팎.

LLM/네트워크 호출 없음 → 클릭과 동시에 즉각적으로 우상단 패널이 업데이트.

## 3. 저장 — Zustand `gameStore.collectedWords`

```ts
collectedWords: string[]    // 누적 오라클 단어 — choice마다 3개씩 append

addOracleWords: (words) => set((state) => ({
  collectedWords: [...state.collectedWords, ...words],
})),
```

- **in-memory only** — Supabase 등 영속 저장소에 안 들어감. 탭 새로고침 시 소실.
- `resetForNewPlay()` 가 landing → intro 전환 시 `[]` 로 리셋 → 새 세션에 풀이 섞이지 않음.
- choice 자체는 `narrative_logs` 로 별도 영속화되지만 거기에는 picked oracle words 가 포함되지 않음.

## 4. 표시 — `CollectedWordsPanel`

우상단 (`top-12 right-12`) 고정. `pointer-events-none` 이라 게임 진행을 막지 않음.

- 전체 누적을 위에서 아래로 나열
- 가장 마지막에 추가된 `freshCount` (page.tsx 에서 `3` 으로 전달) 개의 phrase 는 **1.6 초 동안** `text-white/90 border-white/40` 으로 fade-in highlight
- 1.6 초 경과 후 나머지와 같은 `text-white/35 border-white/10` 으로 가라앉음
- `max-h-[60vh] overflow-hidden` — 화면을 넘어서면 아래쪽이 잘림 (스크롤 없음, 의도된 ephemeral 감각)

## 5. 소비처 — `JournalingOverlay` (방 사이 저널링)

방-사이 (R1→R2, R2→R3, R3→R4, R4→R5) 전환 직전에 띄우는 `JournalingOverlay` 가 `collectedWords` 를 `seedWords` prop 으로 받습니다 (`page.tsx` L295). UI 흐름:

1. **pick 단계** (`seedWords.length >= 2` 일 때만): 누적된 phrase 들을 버튼으로 펼쳐서 player 가 **2–3 개 골라잡음**
2. picked 배열 확정 → `/api/journal-prompt` POST `{ session_id, from_room, recent_event, seed_words: picked }`
3. **writing 단계**: LLM 이 돌려준 2-line 프롬프트를 보고 player 가 자유 답변 작성
4. submit/skip → `journals` 테이블 insert → 다음 방으로

`seedWords.length < 2` 면 pick 단계 스킵하고 곧장 prompt fetch (마운트 1회).

## 6. ⚠️ `seed_words` 는 서버에서 **사용되지 않음**

`/api/journal-prompt` 의 request body 는 `seed_words: string[]` 를 받아들이지만 라우트 코드 안에서는 **읽지 않습니다**:

- LLM system prompt 는 worldbuilding 가이드라인이 고정 (TYOV / Alone Among the Stars 풍)
- user 메시지의 `ANCHOR` 는 라우트 안에 하드코딩된 `ANCHORS` 배열 (`'a doorway', 'a song you cannot sing', 'a window', ...` 총 16 개) 에서 `Math.floor(Math.random() * ANCHORS.length)` 로 매번 새로 픽
- 결과적으로 player 가 어떤 phrase 를 골랐든 동일한 분포의 프롬프트가 나옴 — **pick 단계는 의례 / 페이싱 장치**로 작동

> 의도된 동작인지 확인 필요. 만약 picked phrase 가 실제 프롬프트의 ANCHOR 가 되어야 한다면 `journal-prompt/route.ts` L113 의 `const anchor = ANCHORS[...]` 를 `body.seed_words?.length ? body.seed_words[Math.floor(...)] : ANCHORS[...]` 로 바꾸면 1 줄 패치.

## 7. talisman 과의 관계

- talisman PDF 의 page 1 하단에 노출되는 phrase 들은 `moodWords` — `lib/moodExtraction.ts` 가 Claude Sonnet 4.5 로 player 의 raw text (`narrative_logs.response`, `journals.response`, `final_reflections.answer_text`, blank_fill 답변) 에서 추출
- player 가 in-game 에서 픽한 `collectedWords` 는 **talisman 으로 전달되지 않음** (`card-bundle` 이 store 를 못 봄, 서버에서 풀의 출처조차 모름)
- 즉 화면에서 보이는 "수집된 단어" 와 마지막 카드에 박히는 phrase 는 **별개 vocabulary** 임을 player 는 모름 — 의도된 분리인지 확인 필요

## 8. 손볼 만한 곳

- **`seed_words` 정착화**: journal-prompt 가 picked phrase 를 진짜 ANCHOR 로 쓰도록
- **collectedWords 의 영속화**: localStorage 미러링 → 새로고침 후에도 잔존, 혹은 `journals.picked_seed_words` 컬럼 추가하여 nightly 분석 시 phrase 분포 추적
- **talisman 통합**: card-bundle 에 `collected_words` 를 추가 페이로드로 보내 `moodWords` 와 별개 블록으로 page 1 에 노출 (player 가 in-game 에서 본 단어와 카드의 단어가 만나는 closure)
- **풀 확장**: 현재 80 개. 한 세션 60 개 안팎 추출이면 중복률이 높음 — 카테고리당 20 개로 늘리면 체감 풍부도 ↑
