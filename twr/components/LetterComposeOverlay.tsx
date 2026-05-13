'use client'
import { useEffect, useRef, useState } from 'react'
import { getSessionId, getPlayerId } from '@/lib/session'

// Letter-compose phase. Sits between Sealing and LetterOverlay.
//
// Flow (spec):
//   1. Show the player's three sealing answers back to them.
//   2. Player picks one answer/word/phrase that connects to a memory.
//   3. Show a writing prompt that quotes the picked phrase.
//   4. Player writes a short text — this becomes their letter.
//   5. Player decides whether the letter enters the anonymous archive.
//   6. onComplete → matched letter is fetched + displayed in LetterOverlay.
//
// Side effects per step:
//   step 'select' → POST /api/blank-fill with the chosen template_id+answer.
//     Overwrites blank_fill_responses so the match RPC keys on the picked
//     anchor (not whichever answer happened to be first in SealingOverlay's
//     mirror). This is what makes the player's *choice* shape the match.
//   step 'write' → POST /api/letter (no reply) to create the exchange row
//     under the refreshed embedding, then POST /api/letter again with
//     reply_text = composed letter to persist the composed letter as the
//     player's contribution. The reply_text column is reused for the new
//     "player wrote first" semantics; share_player_letter RPC already
//     copies it into seed_letters.letter_text when share=Yes.
//   step 'share' → POST /api/share-letter with the chosen flag.

interface SealingAnswer {
  template_id: number
  answer_text: string
  blank_fill_templates: { template: string } | { template: string }[] | null
}

interface LetterComposeOverlayProps {
  onComplete: () => void
}

type Step = 'load' | 'select' | 'write' | 'share' | 'done'

// "I _____ at 3 a.m." + answer "stare at the ceiling" → readable preview.
function fillTemplate(template: string, answer: string): string {
  return template.replace(/_+/g, answer.trim() || '___')
}

function tplOf(row: SealingAnswer): string {
  const t = row.blank_fill_templates
  if (!t) return ''
  if (Array.isArray(t)) return t[0]?.template ?? ''
  return t.template ?? ''
}

export default function LetterComposeOverlay({ onComplete }: LetterComposeOverlayProps) {
  const [step, setStep]         = useState<Step>('load')
  const [answers, setAnswers]   = useState<SealingAnswer[]>([])
  const [picked, setPicked]     = useState<SealingAnswer | null>(null)
  const [letter, setLetter]     = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    void (async () => {
      try {
        const sid = getSessionId()
        const r = await fetch(`/api/final-reflections?session_id=${encodeURIComponent(sid)}`)
        if (!r.ok) { setError((await r.text()).slice(0, 200)); return }
        const data = await r.json() as { answers: SealingAnswer[] }
        const rows = (data.answers ?? []).filter((a) => a.answer_text?.trim())
        if (rows.length === 0) {
          // sealing 을 skip-all 한 케이스 — 선택지가 없으므로 직진.
          onComplete(); return
        }
        setAnswers(rows)
        setStep('select')
      } catch (e) {
        setError(String(e).slice(0, 200))
      }
    })()
  }, [onComplete])

  async function pickAnswer(row: SealingAnswer) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      // re-mirror: 선택된 sealing 답을 매칭 키로 만들기 위해 blank_fill_responses
      // 의 answer + embedding 을 갱신. 같은 session_id 라 upsert.
      const r = await fetch('/api/blank-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id:  getSessionId(),
          player_id:   getPlayerId(),
          template_id: row.template_id,
          answer:      row.answer_text,
        }),
      })
      if (!r.ok) { setError((await r.text()).slice(0, 200)); return }
      setPicked(row)
      setStep('write')
    } catch (e) {
      setError(String(e).slice(0, 200))
    } finally { setBusy(false) }
  }

  async function saveLetter() {
    if (busy || !letter.trim()) return
    setBusy(true); setError(null)
    try {
      // 1) match row 생성 (no reply_text) — idempotent. letter-receive 단계에서
      //    재호출해도 같은 row 가 반환된다.
      const r1 = await fetch('/api/letter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: getSessionId(), player_id: getPlayerId() }),
      })
      if (!r1.ok) { setError((await r1.text()).slice(0, 200)); return }
      // 2) composed letter 를 reply_text 컬럼에 저장 (column 재활용).
      const r2 = await fetch('/api/letter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: getSessionId(),
          player_id:  getPlayerId(),
          reply_text: letter.trim(),
        }),
      })
      if (!r2.ok) { setError((await r2.text()).slice(0, 200)); return }
      setStep('share')
    } catch (e) {
      setError(String(e).slice(0, 200))
    } finally { setBusy(false) }
  }

  async function decideShare(share: boolean) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/share-letter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: getSessionId(), player_id: getPlayerId(), share }),
      })
      if (!r.ok) { setError((await r.text()).slice(0, 200)); return }
      setStep('done')
      onComplete()
    } catch (e) {
      setError(String(e).slice(0, 200))
    } finally { setBusy(false) }
  }


  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-end pb-10 px-6 pointer-events-none">
      <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none
        bg-gradient-to-t from-black/85 via-black/55 to-transparent" />

      <div className="pointer-events-auto w-full max-w-2xl flex-1 flex flex-col justify-end
        gap-6 py-10 mb-6 relative">

        {step === 'load' && (
          <p className="text-white/60 text-sm tracking-widest animate-pulse text-center">
            gathering what you said…
          </p>
        )}

        {step === 'select' && (
          <div className="flex flex-col gap-5 animate-[fadeIn_900ms_ease-out]">
            <p className="text-white/55 text-[11px] tracking-[0.3em] uppercase text-center">
              one of these is closer to a real moment than the others.
            </p>
            <p className="text-white/45 text-[10px] tracking-[0.2em] uppercase text-center">
              choose the line that pulls a memory with it.
            </p>
            <div className="flex flex-col gap-3 mt-2">
              {answers.map((row) => (
                <button
                  key={row.template_id}
                  onClick={() => void pickAnswer(row)}
                  disabled={busy}
                  className="text-left text-white/80 text-base leading-relaxed font-serif italic
                    px-5 py-4 border border-white/20 hover:border-white/70 hover:text-white
                    bg-black/50 backdrop-blur-sm transition-colors
                    [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {fillTemplate(tplOf(row), row.answer_text)}
                </button>
              ))}
            </div>
            {error && <p className="text-red-300 text-xs">failed: {error}</p>}
          </div>
        )}

        {step === 'write' && picked && (
          <div className="flex flex-col gap-4 animate-[fadeIn_900ms_ease-out]">
            <p className="text-white/55 text-[11px] tracking-[0.3em] uppercase text-center">
              tell me where this came from.
            </p>
            <p className="text-white/75 text-base font-serif italic text-center
              [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">
              {fillTemplate(tplOf(picked), picked.answer_text)}
            </p>
            <p className="text-white/40 text-[10px] leading-relaxed text-center max-w-md mx-auto">
              a moment, a place, a person. a few lines is enough.
              <br/>this becomes your letter.
            </p>
            <textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              rows={6}
              disabled={busy}
              placeholder="write here."
              className="bg-black/60 backdrop-blur-sm border border-white/30
                text-white text-sm leading-relaxed p-3 outline-none
                focus:border-white/70 transition-colors resize-none
                placeholder:text-white/40 disabled:opacity-40"
            />
            <div className="flex justify-center">
              <button
                onClick={() => void saveLetter()}
                disabled={busy || !letter.trim()}
                className="text-white text-xs tracking-[0.3em] uppercase
                  px-6 py-3 border border-white/40 hover:border-white
                  bg-black/50 backdrop-blur-sm transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >save ▸</button>
            </div>
            {error && <p className="text-red-300 text-xs text-center">failed: {error}</p>}
          </div>
        )}

        {step === 'share' && (
          <div className="flex flex-col gap-5 animate-[fadeIn_700ms_ease-out]">
            <p className="text-white/60 text-[11px] tracking-[0.3em] uppercase text-center">
              place this letter in the archive?
            </p>
            <p className="text-white/40 text-[10px] leading-relaxed text-center max-w-md mx-auto">
              if you allow it, your words may reach the next stranger who arrives here.
              <br/>you stay anonymous.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => void decideShare(true)}
                disabled={busy}
                className="text-white text-xs tracking-[0.3em] uppercase
                  px-6 py-3 border border-white/40 hover:border-white
                  bg-black/50 backdrop-blur-sm transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >yes, share</button>
              <button
                onClick={() => void decideShare(false)}
                disabled={busy}
                className="text-white/70 text-xs tracking-[0.3em] uppercase
                  px-6 py-3 border border-white/20 hover:border-white/60
                  bg-black/50 backdrop-blur-sm transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >keep private</button>
            </div>
            {error && <p className="text-red-300 text-xs text-center">failed: {error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
