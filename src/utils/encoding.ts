/**
 * Decodes canonical standard base64 into bytes, identically in browsers and Node.
 * atob decides what is decodable; the round-trip re-encode keeps the result canonical, so slacker forms stay undecoded.
 *
 * @param value Base64 text; whitespace, URL-safe alphabets, and misplaced padding are rejected.
 *
 * @returns The decoded bytes, or null when the input is not canonical base64.
 */
export const decodeBase64 = (value: string): Uint8Array | null => {
  if (!value) {
    return null
  }
  try {
    const binary = atob(value)
    if (btoa(binary).replace(/=+$/, '') !== value.replace(/=+$/, '')) {
      return null
    }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}
