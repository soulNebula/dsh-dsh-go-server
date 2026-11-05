// Entity ids are the only user-independent keys used in file paths.
// Pattern: <prefix>_<base36 time><6 random base36 chars>.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
export const ID_PATTERN = /^[a-z]{2,8}_[a-z0-9]{6,40}$/u

export function newId(prefix, now = Date.now(), random = Math.random) {
  let tail = ''
  for (let index = 0; index < 6; index += 1) {
    tail += ALPHABET[Math.floor(random() * ALPHABET.length)]
  }
  return `${prefix}_${now.toString(36)}${tail}`
}

export function assertId(value, prefix) {
  const text = String(value ?? '')
  if (!ID_PATTERN.test(text) || (prefix !== undefined && !text.startsWith(`${prefix}_`))) {
    throw new TypeError(`invalid ${prefix ?? 'entity'} id`)
  }
  return text
}
