// Extract the first parseable JSON value from a model reply.
// A reply may contain prose, code fences, trailing commas, or be truncated.
// The repair ladder is deliberately boring and bounded: every step is pure.

const FENCE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/iu

export class JsonExtractError extends Error {
  constructor(message, preview = '') {
    super(message)
    this.name = 'JsonExtractError'
    this.preview = preview.slice(0, 200)
  }
}

function stripFence(value) {
  const match = FENCE.exec(value)
  return match ? match[1].trim() : value.trim()
}

// Find the first complete {...} or [...] using a string-aware bracket stack.
function balancedSlice(value) {
  const start = value.search(/[[{]/u)
  if (start < 0) return null
  const open = value[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < value.length; index += 1) {
    const char = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return value.slice(start, index + 1)
    }
  }
  return null
}

function stripTrailingCommas(value) {
  return value.replace(/,\s*([}\]])/gu, '$1')
}

// Remove the last incomplete member, then close open brackets. Bounded rounds.
function repairTruncated(value, rounds = 40) {
  let current = value
  for (let round = 0; round < rounds; round += 1) {
    const stack = []
    let inString = false
    let escaped = false
    let cut = -1
    for (let index = 0; index < current.length; index += 1) {
      const char = current[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') { inString = true; continue }
      if (char === '{' || char === '[') stack.push(char)
      else if (char === '}' || char === ']') stack.pop()
      else if (char === ',') cut = index
    }
    if (!stack.length && !inString) return current
    if (cut < 0) return current
    const next = current.slice(0, cut)
    const closes = stack.slice().reverse().map(pair => (pair === '{' ? '}' : ']')).join('')
    current = `${next}${closes}`
    try {
      JSON.parse(stripTrailingCommas(current))
      return current
    } catch {
      // try again with a shorter prefix
    }
  }
  return current
}

export function extractJson(input) {
  const text = stripFence(String(input ?? ''))
  const candidates = [text]
  const slice = balancedSlice(text)
  if (slice) candidates.push(slice)

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try stripped trailing commas
    }
    try {
      return JSON.parse(stripTrailingCommas(candidate))
    } catch {
      // try truncation repair
    }
    try {
      return JSON.parse(repairTruncated(candidate))
    } catch {
      // next candidate
    }
  }
  throw new JsonExtractError('No JSON value found in the reply', text)
}

