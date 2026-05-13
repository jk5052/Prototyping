'use client'
import Spline from '@splinetool/react-spline'
import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import {
  ITEMS,
  ITEM_BY_NAME,
  ROOM_MODELS,
  ROOM_INTROS,
  ROOM_ENTRY_EVENTS,
  ENTRY_ITEM_ID,
  FINAL_SCENE_VIDEO,
  type ObjectEvent,
} from '@/data/events'
import { useIdleTracker } from '@/lib/useIdleTracker'
import { preloadChoicesIndex } from '@/lib/choicesIndex'
import { logChoice } from '@/lib/narrativeLog'
import { pickOracleWords } from '@/data/oracleWords'
import { resetSessionId } from '@/lib/session'
import Room from '@/components/Room'
import EventOverlay from '@/components/EventOverlay'
import RoomIntro from '@/components/RoomIntro'
import CollectedWordsPanel from '@/components/CollectedWordsPanel'
import JournalingOverlay from '@/components/JournalingOverlay'
import VoidDialogue from '@/components/VoidDialogue'
import LetterOverlay from '@/components/LetterOverlay'
import LetterReplyOverlay from '@/components/LetterReplyOverlay'
import LetterComposeOverlay from '@/components/LetterComposeOverlay'
import SealingOverlay from '@/components/SealingOverlay'
import CardOverlay from '@/components/CardOverlay'

const ROOM_PHASES = ['room1', 'room2', 'room3', 'room4', 'room5'] as const
type RoomPhase = (typeof ROOM_PHASES)[number]
const isRoomPhase = (p: string): p is RoomPhase => (ROOM_PHASES as readonly string[]).includes(p)

export default function Home() {
  const phase = useGameStore((s) => s.phase)
  const setPhase = useGameStore((s) => s.setPhase)
  const addChoice = useGameStore((s) => s.addChoice)
  const choices = useGameStore((s) => s.choices)
  const startRoom = useGameStore((s) => s.startRoom)
  const addCancellation = useGameStore((s) => s.addCancellation)
  const collectedWords = useGameStore((s) => s.collectedWords)
  const addOracleWords = useGameStore((s) => s.addOracleWords)
  const resetForNewPlay = useGameStore((s) => s.resetForNewPlay)

  // chain runner — item chain과 entry chain 모두 처리.
  // entry chain은 itemId = ENTRY_ITEM_ID로 식별.
  const [chain, setChain] = useState<
    { itemId: string; events: ObjectEvent[]; index: number } | null
  >(null)
  const [introsShown, setIntrosShown] = useState<Set<number>>(new Set())
  const currentEvent = chain ? chain.events[chain.index] ?? null : null

  // 방 transition 시 띄우는 저널링 모달 (door click 또는 next-room 버튼).
  const [journaling, setJournaling] = useState<{ from: number; to: number | null } | null>(null)
  // 미탐색 아이템이 남은 채 방을 나가려 할 때 한 번 더 물어보는 confirm 모달.
  // door 클릭 또는 좌상단 next-room 버튼 클릭 시 unexplored>0 이면 발화. ok 누르면
  // setJournaling 으로 정상 전환, cancel 누르면 모달만 닫고 방에 남음.
  const [confirmExit, setConfirmExit] = useState<{ from: number; to: number | null } | null>(null)
  // zoomOnClick 플래그를 가진 아이템 (현재 R4 포스터들) 클릭 시, 카메라가 해당 mesh
  // 로 줌인. chain 종료/취소 시 base 로 복귀. Room 의 useFrame 이 lerp 처리.
  const [zoomTarget, setZoomTarget] = useState<string | null>(null)

  // 방 컨텍스트 (훅을 조건부로 못 쓰니 top-level에서 계산)
  const inRoom = isRoomPhase(phase)
  const roomNumber = inRoom ? parseInt(phase.replace('room', ''), 10) : 0
  // 모든 방에 RoomIntro(눈 깜빡임) 흐름. 텍스트 없으면 빈 문자열로 fallback.
  const introText = inRoom ? ROOM_INTROS[roomNumber] ?? '' : ''
  const showIntro = inRoom && !introsShown.has(roomNumber)

  // 방 진입 시 RoomLog 초기화
  useEffect(() => {
    if (inRoom) startRoom(roomNumber)
  }, [inRoom, roomNumber, startRoom])

  // choices_rag 라벨 한 번 preload — narrative_logs upsert 시 스냅샷용.
  useEffect(() => {
    preloadChoicesIndex()
  }, [])

  // RoomIntro 종료 콜백 — intro 마킹 + entry chain 자동 시작 (방당 1회).
  const handleIntroComplete = (room: number) => {
    setIntrosShown((prev) => new Set(prev).add(room))
    const events = ROOM_ENTRY_EVENTS[room]
    if (events && events.length > 0) {
      setChain({ itemId: ENTRY_ITEM_ID, events, index: 0 })
    }
  }

  // idle 트래킹 — 인트로/오버레이 중에는 비활성
  useIdleTracker(inRoom && !showIntro && !chain, roomNumber)

  // Landing
  if (phase === 'landing') {
    return (
      <div className="relative w-screen h-screen bg-black overflow-hidden">
        <Spline scene="https://prod.spline.design/N17xaJGIJPeIZR3T/scene.splinecode" />
        {/* Spline 워터마크 가리기 */}
        <div className="absolute bottom-0 right-0 w-40 h-12 bg-black z-50" />
        <div className="absolute right-16 top-1/2 -translate-y-1/2 pointer-events-none">
          <button
            onClick={() => {
              // 새 플레이 시작 — session_id 새로 발급 + 인-메모리 게임 상태 리셋.
              // 동일 탭에서 replay 시 기존 letter_exchanges/card 가 묶여 새 매칭/생성이
              // 안 되던 문제를 해소.
              resetSessionId()
              resetForNewPlay()
              setPhase('intro')
            }}
            className="pointer-events-auto text-white/40 hover:text-white
              text-sm tracking-[0.3em] uppercase transition-all duration-1000
              border border-white/10 hover:border-white/30 px-8 py-3"
          >
            Play
          </button>
        </div>
      </div>
    )
  }

  // Intro — introvideo.mp4 재생 후 자동으로 room1. 클릭 시 스킵.
  if (phase === 'intro') {
    return (
      <div
        onClick={() => setPhase('room1')}
        className="w-screen h-screen bg-black flex items-center justify-center cursor-pointer"
      >
        <video
          src="/introvideo.mp4"
          autoPlay
          muted
          playsInline
          onEnded={() => setPhase('room1')}
          className="w-full h-full object-cover"
        />
        <p className="absolute bottom-6 right-6 text-white/30 text-[10px] tracking-[0.3em] uppercase pointer-events-none">
          click to skip
        </p>
      </div>
    )
  }

  // Rooms 1~5 (r3f + GLB)
  if (inRoom) {
    const modelPath = ROOM_MODELS[roomNumber]
    const roomChoiceCount = choices.filter((c) => c.room === roomNumber).length
    // 방 넘어가기 버튼은 좌측상단에 항상 표시 (chain/intro 중일 때만 숨김).
    const showNextBtn = !chain && !showIntro
    // R5 종료 후엔 LLM 대화 → sealing → letter → card 순서. 다음 phase 는 conversation.
    const nextPhase: RoomPhase | 'conversation' =
      roomNumber < 5 ? (`room${roomNumber + 1}` as RoomPhase) : 'conversation'
    // 한 번 진행한 아이템은 재클릭 lockout. door 는 choices 에 기록되지 않으므로 자연히 제외.
    const isUsed = (name: string) =>
      choices.some((c) => c.room === roomNumber && c.itemId === name)
    // 현재 방에 남은 미탐색 (regular) 아이템 수. door 와 entry chain 은 제외.
    // door 클릭 / next-room 버튼 시 이 값이 >0 이면 confirm 모달 한 번 띄움.
    const unexploredCount = ITEMS
      .filter((it) => it.room === roomNumber && it.kind !== 'door')
      .filter((it) => !isUsed(it.itemId)).length
    const toRoomFor = (np: RoomPhase | 'conversation') =>
      np === 'conversation' ? null : Number(np.replace('room', ''))
    // door 또는 next-room 버튼 공통 진입점. unexplored>0 이면 confirm, 아니면 바로 journaling.
    const requestExit = () => {
      const target = { from: roomNumber, to: toRoomFor(nextPhase) }
      if (unexploredCount > 0) setConfirmExit(target)
      else setJournaling(target)
    }

    return (
      <div className="relative w-screen h-screen bg-black">
        <Room
          modelPath={modelPath}
          onObjectClick={(name) => {
            if (chain || showIntro || journaling || confirmExit) return
            const item = ITEM_BY_NAME[name]
            if (!item) return
            // door 클릭 → unexplored>0 면 confirm, 아니면 곧장 저널링 모달.
            // R5 출구는 conversation 으로 이어지므로 toRoom=null (마지막 방 종료 의미).
            if (item.kind === 'door') {
              requestExit()
              return
            }
            if (item.events.length === 0) return
            if (isUsed(name)) return
            // zoomOnClick 아이템 (R4 포스터) — chain 시작과 동시에 카메라 줌인 트리거.
            if (item.zoomOnClick) setZoomTarget(name)
            setChain({ itemId: name, events: item.events, index: 0 })
          }}
          isInteractive={(name) =>
            !!ITEM_BY_NAME[name] && !chain && !showIntro && !journaling && !isUsed(name)
          }
          // glow registry 빌드용 — noGlow 아이템 (R4 엘리베이터) 은 인터랙션은 유지하되
          // 시각적 강조에서만 제외. 포스터만 자체발광하게 됨.
          isItem={(name) => !!ITEM_BY_NAME[name] && !ITEM_BY_NAME[name].noGlow}
          isUsed={isUsed}
          zoomTarget={zoomTarget}
          disableControls
        />

        {showIntro && (
          <RoomIntro
            text={introText}
            onComplete={() => handleIntroComplete(roomNumber)}
          />
        )}

        {chain && currentEvent && (
          <EventOverlay
            // event 변경 시 EventOverlay 내부 상태 리셋되도록 key 부여
            key={`${chain.itemId}#${chain.index}`}
            event={currentEvent}
            onChoose={(choice, meta, choiceIndex) => {
              const isLast = chain.index >= chain.events.length - 1
              const ended = !!choice.endChain || isLast
              addChoice({
                room: roomNumber,
                itemId: chain.itemId,
                eventIndex: chain.index,
                event_text: currentEvent.text,
                response: choice.label,
                tag: choice.tag,
                defenses: choice.defenses,
                ended_chain: ended,
                latency_ms: meta.latency_ms,
                changed_mind: meta.changed_mind,
                hover_sequence: meta.hover_sequence,
              })
              // Supabase narrative_logs (fire-and-forget; 실패해도 게임은 진행).
              void logChoice({
                room: roomNumber,
                itemId: chain.itemId,
                eventIndex: chain.index,
                choiceIndex,
                prompt: currentEvent.text,
                label: choice.label,
                tag: choice.tag,
                endChain: ended,
                latencyMs: meta.latency_ms,
                changedMind: meta.changed_mind,
                hoverSequence: meta.hover_sequence,
              })
              // choice마다 오라클 단어 3개 누적 — 우상단 패널에 append
              addOracleWords(pickOracleWords(3))
              if (ended) {
                setChain(null)
                setZoomTarget(null)
                // R4 는 exit door mesh 가 없고 5 포스터/엘리베이터 chain 이 그 자체로
                // 출구 — 포스터/엘리베이터 chain 종료 시에만 자동으로 JournalingOverlay
                // 진입. entry chain (ENTRY_ITEM_ID) 끝남에는 발화 X.
                if (
                  roomNumber === 4 &&
                  (chain.itemId.startsWith('poster_') || chain.itemId === 'modern_apartment_elevator')
                ) {
                  setJournaling({ from: 4, to: 5 })
                }
              } else setChain({ ...chain, index: chain.index + 1 })
            }}
            onCancel={() => {
              // R4 한정: 포스터/엘리베이터 chain 은 한 번 시작하면 끝까지 진행해야
              // 다음 방으로 넘어가는 단방향 동선. ESC / 배경 클릭으로 빠져나가지
              // 못하게 onCancel 무시. (다른 방은 종전대로 cancel 허용.)
              if (
                roomNumber === 4 &&
                (chain.itemId.startsWith('poster_') || chain.itemId === 'modern_apartment_elevator')
              ) return
              addCancellation(roomNumber)
              setChain(null)
              setZoomTarget(null)
            }}
          />
        )}

        <CollectedWordsPanel words={collectedWords} freshCount={3} />

        {journaling && (
          <JournalingOverlay
            fromRoom={journaling.from}
            toRoom={journaling.to}
            recentEvent={currentEvent?.text ?? choices[choices.length - 1]?.event_text ?? null}
            seedWords={collectedWords}
            onComplete={() => {
              setJournaling(null)
              setPhase(nextPhase)
            }}
          />
        )}

        {showNextBtn && (
          <button
            onClick={requestExit}
            className="absolute top-4 left-4 text-white/30 hover:text-white/80
              text-[10px] tracking-[0.3em] uppercase transition-colors duration-700
              px-2 py-1"
          >
            {roomNumber < 5 ? 'next room ▸' : 'continue ▸'}
          </button>
        )}

        {confirmExit && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <div className="max-w-md mx-6 px-8 py-7 border border-white/15 bg-black/80 text-center">
              <p className="font-serif text-white/85 text-lg leading-relaxed italic">
                there are still things you haven&apos;t looked at.
              </p>
              <p className="mt-2 text-white/40 text-[11px] tracking-[0.25em] uppercase">
                {unexploredCount} item{unexploredCount === 1 ? '' : 's'} left in this room
              </p>
              <div className="mt-6 flex justify-center gap-6">
                <button
                  onClick={() => setConfirmExit(null)}
                  className="text-white/60 hover:text-white/90 text-[11px] tracking-[0.3em] uppercase px-3 py-2 transition-colors duration-500"
                >
                  stay
                </button>
                <button
                  onClick={() => { const t = confirmExit; setConfirmExit(null); setJournaling(t) }}
                  className="text-white/85 hover:text-white text-[11px] tracking-[0.3em] uppercase px-3 py-2 border border-white/30 hover:border-white/60 transition-colors duration-500"
                >
                  leave anyway ▸
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 text-white/20 text-xs tracking-widest">
          Room {roomNumber} / 5 · {roomChoiceCount} chosen
        </div>
      </div>
    )
  }

  // Void — finalroom 배경 위에서 LLM 대화 (영어, 무명 voice).
  // 배경은 Spline viewer (full runtime) — GLB export 가 라이팅/애니메이션을
  // 빼버려서 GLB 직접 로드 대신 viewer URL 을 쓰면 Spline editor 와 동일하게
  // 렌더됨. 인터랙티브 hook 은 필요 없음 (배경 전용).
  if (phase === 'conversation') {
    return (
      <FinalSceneShell>
        {/* flow: R5 → conversation(LLM) → sealing(3 lines) → letter → card.
            구 blank_fill phase 는 sealing 에 흡수 — SealingOverlay 가 첫 답변을
            /api/blank-fill 로 mirror 하여 downstream embedding 파이프라인 유지. */}
        <VoidDialogue onComplete={() => setPhase('sealing')} />
      </FinalSceneShell>
    )
  }

  // Sealing ritual — finalroom 배경 위에서 LLM 대화 직후 3개 짧은 문장.
  // VoidDialogue 종료 직후 진입. final_reflections 에 prompt_key 별 upsert + 첫 답변은
  // blank_fill_responses 로 mirror 되어 downstream embedding 파이프라인을 유지.
  // 완료 시 letter (receive) 단계로 — 매칭된 편지를 먼저 보여준다.
  if (phase === 'sealing') {
    return (
      <FinalSceneShell>
        <SealingOverlay onComplete={() => setPhase('letter')} />
      </FinalSceneShell>
    )
  }

  // Letter receive — finalroom 배경 위에서 매칭된 편지 1개를 fade-in 으로 보여준다.
  // /api/letter 가 blank_fill_responses 의 embedding+defense 로 매칭.
  // 완료 시 letter-reply 로 — 받은 편지에 짧은 사적 답장을 쓴다.
  if (phase === 'letter') {
    return (
      <FinalSceneShell>
        <LetterOverlay onComplete={() => setPhase('letter-reply')} />
      </FinalSceneShell>
    )
  }

  // Letter reply — 받은 편지를 컨텍스트로 보여주고 짧은 답장 입력.
  // /api/respond-to-letter 로 reply_text 만 저장. seed_letters 로 가지 않음.
  // 완료 시 letter-compose 로 — 자기 자신의 편지(미래 풀용)를 쓴다.
  if (phase === 'letter-reply') {
    return (
      <FinalSceneShell>
        <LetterReplyOverlay onComplete={() => setPhase('letter-compose')} />
      </FinalSceneShell>
    )
  }

  // Letter compose — 3 sealing 답 중 하나를 픽 → memory prompt → 짧은 글 작성
  // → archive 공개 여부 결정. share=true 면 seed_letters 에 자기 편지가 입수됨.
  if (phase === 'letter-compose') {
    return (
      <FinalSceneShell>
        <LetterComposeOverlay onComplete={() => setPhase('card')} />
      </FinalSceneShell>
    )
  }

  // Talisman card — 마지막 출력. PDF 미리보기 + 다운로드.
  if (phase === 'card') {
    return (
      <FinalSceneShell>
        <CardOverlay onComplete={() => setPhase('landing')} />
      </FinalSceneShell>
    )
  }

  return null
}

// finalroom 5 phase 공통 셸 — 미리 export 한 MP4 loop 를 배경으로. 동적 3D
// (Spline runtime / GLB) 대신 video 를 쓰는 이유는 고정된 NPC 와 같은 자리에
// 머무는 감각이 필요하기 때문. autoPlay+muted+loop+playsInline 으로 iOS 포함
// 자동 재생. object-cover 로 종횡비 보정.
function FinalSceneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      <video
        src={FINAL_SCENE_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />
      {children}
    </div>
  )
}