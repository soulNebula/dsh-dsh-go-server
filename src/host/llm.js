// Model port on top of DSH's LLM runtime.
// Purposes: 'teach' (expensive/structured) and 'quick' (grading, short calls).
// Retries only happen before any text was streamed, so a retry never
// duplicates output or cost twice.
import { AppError } from './errors.js'

const RETRYABLE = new Set(['llm-empty', 'llm-timeout'])
const CALL_TIMEOUT_MS = 6 * 60_000
const MAX_RETRIES = 2
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('aborted')) }, { once: true })
})

export function createLlmPort({ getLlm, getDefault, prefs, logger }) {
  const capabilities = { teach: false, quick: false }

  function route(purpose = 'teach') {
    const settings = prefs.read()
    const provider = purpose === 'quick' ? settings.quickProvider : settings.teachProvider
    const model = purpose === 'quick' ? settings.quickModel : settings.teachModel
    if (provider && model) return { provider, model }
    if (purpose === 'quick' && settings.teachProvider && settings.teachModel) {
      return { provider: settings.teachProvider, model: settings.teachModel }
    }
    const fallback = getDefault()
    if (fallback?.provider && fallback?.model) return { provider: fallback.provider, model: fallback.model }
    throw new AppError('llm-missing', 'No model is configured in DSH yet.')
  }

  async function attempt({ purpose = 'teach', system, user, maxTokens = 4000, signal, onText }) {
    const llm = getLlm()
    if (!llm) throw new AppError('llm-missing', 'DSH has no model service in this profile.')
    const target = route(purpose)
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS)
    const fused = signal ? AbortSignal.any([signal, timeout]) : timeout
    let text = ''
    try {
      const prepared = await llm.prepareCall({ ...target, maxTokens }, fused)
      const messages = [{ role: 'user', content: [{ type: 'text', text: String(user ?? '') }] }]
      const stream = prepared.stream({ ...prepared.config, ...(system ? { system } : {}), messages, signal: fused })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          text += chunk.text
          onText?.(chunk.text)
        } else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
          throw new AppError('llm-failed', chunk.reason?.failure?.message ?? 'The model call failed')
        }
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      if (error instanceof AppError) throw error
      if (timeout.aborted) throw new AppError('llm-timeout', 'The model took too long to respond. Try again.')
      throw new AppError('llm-failed', 'The model call failed. Try again.')
    }
    if (!text.trim()) throw new AppError('llm-empty', 'The model returned nothing this time. Try again.')
    return text
  }

  async function call(options) {
    let lastError
    for (let tries = 0; tries <= MAX_RETRIES; tries += 1) {
      try {
        return await attempt(options)
      } catch (error) {
        lastError = error
        if (options.signal?.aborted || !RETRYABLE.has(error?.code) || tries === MAX_RETRIES) throw error
        await sleep(1500 * (tries + 1), options.signal)
      }
    }
    throw lastError
  }

  async function refreshCapabilities(signal) {
    const llm = getLlm()
    if (!llm) return { ...capabilities }
    for (const purpose of ['teach', 'quick']) {
      try {
        const target = route(purpose)
        const info = await llm.resolveModelInfo?.(target.provider, target.model, signal)
        capabilities[purpose] = info?.inputModalities?.includes('image') === true
      } catch {
        capabilities[purpose] = false
      }
    }
    return { ...capabilities }
  }

  return Object.freeze({
    complete: options => call({ ...options, onText: undefined }),
    stream: options => call(options),
    route,
    supportsImages: purpose => capabilities[purpose] === true,
    refreshCapabilities,
    listModels: async signal => {
      const llm = getLlm()
      if (!llm?.listProviders) return []
      const rows = []
      for (const provider of llm.listProviders()) {
        try {
          const models = await llm.listModels(provider.id)
          for (const model of models) rows.push({ provider: provider.id, model: model.id, name: model.name ?? model.id, images: model.inputModalities?.includes('image') === true })
        } catch {
          // provider not signed in
        }
        signal?.throwIfAborted()
      }
      return rows
    },
  })
}
