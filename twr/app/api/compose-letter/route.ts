// /api/compose-letter
//   POST { session_id, player_id?, selected_template_id, selected_answer,
//          composed_letter }
//     embeds the composed letter (text-embedding-3-large 3072d halfvec)
//     and upserts letter_exchanges with the composed fields. Does NOT
//     generate or reveal the match — that happens later in /api/letter
//     once the player advances to the receive phase.
//     received_letter_id is left NULL; share_choice is left NULL until
//     /api/share-letter is called.
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const OPENAI_URL      = 'https://api.openai.com/v1/embeddings'
const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIM   = 3072

interface PostBody {
  session_id:            string
  player_id?:            string | null
  selected_template_id:  number
  selected_answer:       string
  composed_letter:       string
}

export async function POST(request: Request) {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  const openai = process.env.OPENAI_API_KEY
  if (!url || !secret || !openai) {
    return Response.json({ error: 'server env missing' }, { status: 500 })
  }

  let body: PostBody
  try { body = await request.json() }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }

  if (!body.session_id) {
    return Response.json({ error: 'session_id required' }, { status: 400 })
  }
  if (typeof body.selected_template_id !== 'number' || !Number.isFinite(body.selected_template_id)) {
    return Response.json({ error: 'selected_template_id required (number)' }, { status: 400 })
  }
  const selectedAnswer = (body.selected_answer ?? '').toString().trim().slice(0, 600)
  if (!selectedAnswer) {
    return Response.json({ error: 'selected_answer required' }, { status: 400 })
  }
  const composed = (body.composed_letter ?? '').toString().trim().slice(0, 4000)
  if (!composed) {
    return Response.json({ error: 'composed_letter required' }, { status: 400 })
  }

  const sup = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

  // Validate the template exists and is active — surface a clean 400.
  const { data: tpl, error: tplErr } = await sup
    .from('blank_fill_templates')
    .select('id')
    .eq('id', body.selected_template_id)
    .eq('active', true)
    .maybeSingle()
  if (tplErr) return Response.json({ error: 'template lookup failed: ' + tplErr.message }, { status: 500 })
  if (!tpl)   return Response.json({ error: 'unknown or inactive selected_template_id' }, { status: 400 })

  // Embed the composed letter — this becomes the matching key in
  // letter_exchanges.composed_letter_embedding and (later, on share)
  // in seed_letters.blank_answer_embedding.
  const oaRes = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${openai}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: composed, dimensions: EMBEDDING_DIM }),
  })
  if (!oaRes.ok) {
    const errText = await oaRes.text()
    return Response.json({ error: 'openai embed failed', detail: errText.slice(0, 400) }, { status: 502 })
  }
  const oaJson = await oaRes.json() as { data?: Array<{ embedding: number[] }> }
  const vec = oaJson.data?.[0]?.embedding
  if (!vec || vec.length !== EMBEDDING_DIM) {
    return Response.json({ error: `embedding shape unexpected (got ${vec?.length ?? 0})` }, { status: 502 })
  }
  const halfvecLiteral = '[' + vec.join(',') + ']'

  // Upsert by session_id. If a prior compose call exists for this session
  // (e.g. player edited and re-saved), the new composed letter + embedding
  // overwrite the old. share_choice is reset to NULL so the player must
  // decide again via /api/share-letter.
  const { error: upErr } = await sup.from('letter_exchanges').upsert({
    session_id:                 body.session_id,
    player_id:                  body.player_id ?? null,
    selected_template_id:       body.selected_template_id,
    selected_answer:            selectedAnswer,
    composed_letter:            composed,
    composed_letter_embedding:  halfvecLiteral,
    composed_at:                new Date().toISOString(),
    share_choice:               null,
  }, { onConflict: 'session_id' })
  if (upErr) {
    return Response.json({ error: 'letter_exchanges upsert failed: ' + upErr.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
