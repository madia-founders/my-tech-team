#!/usr/bin/env node
/**
 * Live view of the Claude Code agent tree for a `/my-tech-team:code` run. Run it from the root of
 * the project the pipeline is working in (or set WATCH_CWD), with the path to this file:
 *
 *   node <plugin>/scripts/watch-agents.mjs                # newest session that spawned agents; polls 1s -> 10s
 *   INTERVAL=30 node <plugin>/scripts/watch-agents.mjs    # raise the idle backoff ceiling
 *   SESSION=<id> node <plugin>/scripts/watch-agents.mjs   # pin to a specific session
 *
 * Strictly read-only: it only ever opens transcripts under ~/.claude/projects/ for reading,
 * so it can never interfere with a run in flight.
 *
 * State is evidence-based, never inferred from silence:
 *
 *   <role>  the agent's turn is open and it emitted something within ACTIVE_S
 *   ⏳  its turn is open but it has gone quiet - a long tool call, a backoff, or it died
 *   ✅  its turn ended. Proven from the transcripts, not guessed from the clock.
 */
import { readdirSync, readFileSync, statSync, openSync, readSync, fstatSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const MIN_S = Number(process.env.MIN_INTERVAL || 1) // poll rate while the run is moving
const MAX_S = Number(process.env.INTERVAL || 10) // ceiling once it goes quiet
const ACTIVE_S = Number(process.env.ACTIVE || 60) // working -> quiet edge, for an OPEN turn only
const WANT = process.env.SESSION || null
const ROOT = join(homedir(), '.claude', 'projects', (process.env.WATCH_CWD || process.cwd()).replace(/[/.]/g, '-'))

// On a terminal, take over the alternate screen buffer (like top/less) so frames never
// accumulate in scrollback and Ctrl-C restores the terminal exactly as it was. When the
// output is piped, print plainly instead - no escape codes in the pipe.
const INTERACTIVE = process.stdout.isTTY === true
if (INTERACTIVE) {
  process.stdout.write('\x1b[?1049h\x1b[?25l') // enter alt screen, hide cursor
  process.on('exit', () => process.stdout.write('\x1b[?25h\x1b[?1049l'))
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))
}

const ROLE = {
  'tech-lead': '🧑‍✈️',
  'plan-challenger': '🥊',
  'review-challenger': '⚔️',
  'commons-owner': '🏗️',
  implementer: '🤓',
  'code-reviewer': '🧐',
  Explore: '🔍',
  Plan: '📐',
  claude: '⚙️',
}

function pickSession() {
  if (WANT) return WANT
  let entries
  try {
    entries = readdirSync(ROOT)
  } catch {
    throw new Error(`no transcripts at ${ROOT} - run this from the repo root, or set WATCH_CWD=/path/to/workspace`)
  }
  const runs = entries
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: f.slice(0, -6), m: statSync(join(ROOT, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  if (!runs.length) throw new Error(`no sessions under ${ROOT}`)
  // Prefer the newest session that actually spawned agents - otherwise you just
  // watch whichever session is doing the watching.
  const withKids = runs.find((r) => {
    try {
      return readdirSync(join(ROOT, r.id, 'subagents')).length > 0
    } catch {
      return false
    }
  })
  return (withKids || runs[0]).id
}

// Read only the tail of a multi-MB transcript, dropping the leading partial line.
function tailLines(path, bytes = 262_144) {
  const fd = openSync(path, 'r')
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split('\n')
    if (start > 0) lines.shift()
    return lines.filter(Boolean)
  } finally {
    closeSync(fd)
  }
}

const one = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n)
const ms = (t) => (t ? Date.parse(t) || 0 : 0)
const hint = (b) => {
  const i = b.input || {}
  return one(i.description ?? i.file_path ?? i.pattern ?? i.command ?? i.prompt ?? '', 60)
}

// --- turn boundaries -------------------------------------------------------------------
// A turn STARTS with a user record carrying a plain string: the spawn prompt, or a SendMessage
// resume (those read "The coordinator sent a message while you were working:"). Verified: a
// <system-reminder> user record never arrives AFTER an end_turn, so it can't fake a restart -
// if that ever changes, every finished agent flips back to "working" and this is why.
//
// A turn ENDS with an assistant record whose stop_reason is "end_turn" - but that record is
// sometimes never flushed even though the turn completed (~9% of turns). That is why the
// lead-side delivery below is the authoritative signal, and why the two are combined with a
// max() rather than gated on each other: an agent holding live background children ends its
// turn with NO notification at all, and would otherwise read as working forever.
const isStart = (e) => e.type === 'user' && typeof e.message?.content === 'string'
const isEnd = (e) => e.type === 'assistant' && e.message?.stop_reason === 'end_turn'

function activity(e) {
  if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) return null
  for (let j = e.message.content.length - 1; j >= 0; j--) {
    const b = e.message.content[j]
    if (b.type === 'text' && b.text?.trim()) return { at: e.timestamp, what: one(b.text, 96) }
    if (b.type === 'tool_use') return { at: e.timestamp, what: `${b.name}(${hint(b)})` }
  }
  return null
}

// Walk the tail backwards for two independent things: the most recent turn marker, which says
// whether the turn is open, and the most recent assistant event, which says what it is doing.
// Finding NEITHER marker means the turn is open and has already overflowed the window - the
// only way that happens is a turn actively emitting large tool results, so treating it as open
// is both the safe default and the true one.
function scanAgent(path) {
  let lines
  try {
    lines = tailLines(path)
  } catch {
    return null // meta.json exists but the transcript has not been written yet
  }
  let act = null
  let turn = null
  for (let i = lines.length - 1; i >= 0; i--) {
    let e
    try {
      e = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (!turn) {
      if (isStart(e)) turn = { open: true, at: e.timestamp }
      else if (isEnd(e)) turn = { open: false, at: e.timestamp }
    }
    if (!act) act = activity(e)
    if (act && turn) break
  }
  return { act, turn }
}

// A parked agent's transcript stops changing, so re-parsing its tail every poll is pure waste.
// Pure memoisation on (size, mtime) - it cannot change what any scan returns.
const scanCache = new Map()
function scanAgentCached(path) {
  let s
  try {
    s = statSync(path)
  } catch {
    return null
  }
  const hit = scanCache.get(path)
  if (hit && hit.size === s.size && hit.mtime === s.mtimeMs) return hit.st
  const st = scanAgent(path)
  scanCache.set(path, { size: s.size, mtime: s.mtimeMs, st })
  return st
}

// --- lead-side delivery evidence -------------------------------------------------------
const TASK_ID = /<task-id>([0-9a-z]+)<\/task-id>/
const SPAWN_STUB = 'Async agent launched successfully'

// The one string that could carry a task-notification, whichever record type wraps it.
// Note queue-operation.content is TOP-LEVEL, not under `message`.
function notifText(e) {
  if (e.type === 'queue-operation') return typeof e.content === 'string' ? e.content : null
  if (e.type === 'attachment') return typeof e.attachment?.prompt === 'string' ? e.attachment.prompt : null
  if (e.type === 'user') return typeof e.message?.content === 'string' ? e.message.content : null
  return null
}

// A tool_result can carry SEVERAL text blocks - a harness warning can be prepended ahead of
// the real payload - so the spawn stub has to be looked for in every one of them, not just the
// first. Miss it and the agent reads as "returned" ~15ms after it was born.
const resultTexts = (b) =>
  Array.isArray(b.content) ? b.content.filter((c) => c.type === 'text').map((c) => c.text ?? '') : [String(b.content ?? '')]

// One backwards pass over the lead transcript yields everything the tree needs from it: the
// lead's own turn state, plus the moment each agent's result was delivered. Verified: those
// notifications land in the LEAD file for agents at EVERY depth - a depth-2 agent's shows up
// here and NOT in its spawner's transcript - so this single index covers the whole tree.
// Scanning backwards means the first hit per id is already the most recent one.
function scanLead(path, wantTool) {
  const delivered = new Map() // agentId   -> timestamp
  const returned = new Map() // toolUseId -> timestamp (synchronous agents only)
  let lines
  try {
    lines = tailLines(path)
  } catch {
    return { st: null, delivered, returned }
  }
  let act = null
  let turn = null
  for (let i = lines.length - 1; i >= 0; i--) {
    let e
    try {
      e = JSON.parse(lines[i])
    } catch {
      continue
    }

    const t = notifText(e)
    if (t) {
      const id = TASK_ID.exec(t)?.[1]
      // Keying by the captured id is what keeps background Bash tasks out: they share the
      // <task-id> namespace with a `b...` prefix, and simply never match an agent.
      if (id && !delivered.has(id)) delivered.set(id, e.timestamp)
    }
    // A synchronous agent (run_in_background: false) gets no notification at all - its only
    // completion evidence is a real tool_result. The stub written ~15ms after spawn is not one.
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const b of e.message.content) {
        if (b.type !== 'tool_result' || !wantTool.has(b.tool_use_id) || returned.has(b.tool_use_id)) continue
        if (resultTexts(b).some((t) => t.startsWith(SPAWN_STUB))) continue
        returned.set(b.tool_use_id, e.timestamp)
      }
    }

    if (e.isSidechain === true) continue // never let a subagent record decide the lead's state
    if (!turn) {
      if (isStart(e)) turn = { open: true, at: e.timestamp }
      else if (isEnd(e)) turn = { open: false, at: e.timestamp }
    }
    if (!act) act = activity(e)
  }
  return { st: { act, turn }, delivered, returned }
}

// Once an agent has been seen to return, remember it. The evidence eventually scrolls out of
// the tail window, and without this the row would flip back to "working" hours later. Only a
// NEWER start unlatches it, so a SendMessage resume still reads correctly.
const latch = new Map()

// Compare on TIMESTAMPS, never on scan order, so a delivery noticed a poll late can never
// outrank a newer start. Math.max on the elapsed guards against a clock step making a stopped
// agent look busy.
function resolve(id, st, born, delivery, now) {
  const start = !st ? born : st.turn ? (st.turn.open ? ms(st.turn.at) : 0) : now
  const end = Math.max(st?.turn && !st.turn.open ? ms(st.turn.at) : 0, delivery, latch.get(id) || 0)
  if (end > start) {
    latch.set(id, end)
    return { done: true, what: null }
  }
  // An agent whose turn just started has no assistant record yet; measuring from the turn
  // start keeps it out of "quiet" while it is only thinking.
  const since = Math.max(ms(st?.act?.at), start, born)
  return { done: false, quiet: Math.max(0, now - since) / 1000 >= ACTIVE_S, what: st?.act?.what || null }
}

// A general-purpose agent has no role of its own - it inherits its spawner's.
function roleEmoji(type, parent, byId, depth = 0) {
  if (type === 'general-purpose' && parent && depth < 8) {
    const p = byId.get(parent)
    if (p) return roleEmoji(p.type, p.parent, byId, depth + 1)
  }
  // Plugin agents are recorded namespaced (`my-tech-team:implementer`); match either spelling.
  return ROLE[type] || ROLE[String(type).replace(/^my-tech-team:/, '')] || '⚙️'
}

function loadAgents(dir) {
  let files
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.meta.json'))
  } catch {
    return []
  }
  return files.map((f) => {
    const id = f.slice(6, -10)
    const m = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    return {
      id,
      name: m.name || m.description || m.agentType,
      type: m.agentType,
      parent: m.parentAgentId || null,
      toolUseId: m.toolUseId || null,
      born: statSync(join(dir, f)).mtimeMs, // the meta file is written at spawn
      st: scanAgentCached(join(dir, `agent-${id}.jsonl`)),
    }
  })
}

function line(name, r, indent, role) {
  const emoji = r.done ? '✅' : r.quiet ? '⏳' : role
  const rows = [`${indent}${emoji}  \x1b[1m${name}\x1b[0m`]
  // The detail line answers "what is it doing", so it belongs to an open turn only.
  if (!r.done && r.what) rows.push(`${indent}    \x1b[90m${r.what}\x1b[0m`)
  return rows
}

function build() {
  const session = pickSession()
  const agents = loadAgents(join(ROOT, session, 'subagents'))
  const byId = new Map(agents.map((a) => [a.id, a]))
  const wantTool = new Set(agents.map((a) => a.toolUseId).filter(Boolean))
  const lead = scanLead(join(ROOT, `${session}.jsonl`), wantTool)
  const now = Date.now()

  for (const a of agents) {
    const delivery = Math.max(ms(lead.delivered.get(a.id)), ms(lead.returned.get(a.toolUseId)))
    a.r = resolve(a.id, a.st, a.born, delivery, now)
  }
  const kids = new Map()
  for (const a of agents) {
    const k = a.parent || '_'
    if (!kids.has(k)) kids.set(k, [])
    kids.get(k).push(a)
  }

  const rows = []
  rows.push(...line('tech lead', resolve('_lead', lead.st, 0, 0, now), '  ', ROLE['tech-lead']))
  const walk = (p, ind) => {
    for (const a of (kids.get(p) || []).sort((x, y) => x.born - y.born)) {
      rows.push(...line(a.name, a.r, ind, roleEmoji(a.type, a.parent, byId)))
      walk(a.id, `${ind}    `)
    }
  }
  walk('_', '  ')

  // The signature deliberately excludes the clock and the poll delay - those tick on
  // their own and would otherwise read as "something changed" on every single poll. This is
  // also why no row carries an elapsed time: a string that re-renders every second would pin
  // the poll at MIN_S forever.
  const back = agents.filter((a) => a.r.done).length
  const head = `\x1b[1magents\x1b[0m  ${session.slice(0, 8)}  ${agents.length} spawned, ${agents.length - back} working, ${back} returned`
  const sig = `${head}\n${rows.join('\n')}`
  return { sig, body: `${head}  \x1b[90m${new Date().toLocaleTimeString()}\x1b[0m`, rows }
}

function paint(lines) {
  if (!INTERACTIVE) {
    process.stdout.write(`${lines.join('\n')}\n`)
    return
  }
  // Home + draw repaints without the blank flash a full \x1b[2J causes. \x1b[K after
  // every line is what clears the tail of a previously LONGER line on that same row -
  // overwriting only replaces as many columns as the new line occupies. \x1b[J then
  // drops any rows the previous frame had below this one.
  process.stdout.write(`\x1b[H${lines.join('\x1b[K\n')}\x1b[K\x1b[J`)
}

let delay = MIN_S
let prevSig = null

function tick() {
  let view
  try {
    view = build()
  } catch (err) {
    console.error(`\x1b[31m${err.message}\x1b[0m`)
    process.exit(1)
  }
  // Poll fast while the run is moving; back off geometrically once it goes quiet, so a
  // parked pipeline costs one stat sweep every MAX_S instead of one every second.
  delay = view.sig === prevSig ? Math.min(delay * 2, MAX_S) : MIN_S
  prevSig = view.sig
  paint([`${view.body} \x1b[90m(${delay}s)\x1b[0m`, '', ...view.rows])
  setTimeout(tick, delay * 1000)
}

tick()
