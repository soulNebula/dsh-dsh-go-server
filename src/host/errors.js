// Errors that are safe to show to the user. Everything else is logged and
// replaced by a generic message at the RPC boundary.

export class AppError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export const USER_ERRORS = new Set(['AppError'])

export function publicMessage(error) {
  if (error?.name === 'AppError' && typeof error.message === 'string') return error.message
  return 'Request failed'
}

export function publicCode(error, prefix = 'failed') {
  if (error?.name === 'AppError' && typeof error.code === 'string') return error.code
  return prefix
}
