const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(secret))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Seal any JSON value into a transport/storage-safe string (iv.ciphertext, base64url). */
export async function sealJson(value: unknown, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    TEXT_ENCODER.encode(JSON.stringify(value)),
  )
  return `${toBase64Url(iv)}.${toBase64Url(ciphertext)}`
}

/** Open a value sealed with `sealJson`; returns `null` if missing, malformed, or tampered. */
export async function unsealJson<T>(sealed: string | undefined, secret: string): Promise<T | null> {
  if (!sealed)
    return null
  const [ivPart, dataPart] = sealed.split('.')
  if (!ivPart || !dataPart)
    return null
  try {
    const key = await deriveKey(secret)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
      key,
      fromBase64Url(dataPart),
    )
    return JSON.parse(TEXT_DECODER.decode(plain)) as T
  }
  catch {
    return null
  }
}
