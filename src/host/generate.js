// Structured generation on top of the model port.
// generateJson: JSON answer → extract → normalize → one repair round.
// For streamed output, see references/02-contracts.md and 03-patterns.md:
// keep the same normalize/repair contract per emitted unit.
import { extractJson, JsonExtractError } from '../core/json.js'
import { AppError } from './errors.js'

const REPAIR = 'Your previous reply could not be parsed as JSON. Reply again with the complete answer as valid JSON only — no code fences, no commentary.'

export async function generateJson(llm, {
  purpose = 'teach',
  prompt,
  maxTokens = 8000,
  signal,
  normalize = value => value,
  onText,
}) {
  const request = { purpose, system: prompt.system, user: prompt.user, maxTokens, signal }
  const first = onText ? await llm.stream({ ...request, onText }) : await llm.complete(request)
  try {
    return normalize(extractJson(first))
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error
    const retryUser = `${prompt.user}\n\n<previous_reply>\n${String(first).slice(0, 12000)}\n</previous_reply>\n\n${REPAIR}${error instanceof JsonExtractError ? '' : `\nProblem: ${error.message}`}`
    const second = await llm.complete({ ...request, user: retryUser })
    try {
      return normalize(extractJson(second))
    } catch {
      throw new AppError('bad-output', 'The model did not return a usable answer. Try again or pick a stronger model in settings.')
    }
  }
}

