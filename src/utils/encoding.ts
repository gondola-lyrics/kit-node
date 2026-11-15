/**
 * Decodes standard base64 as UTF-8 text, identically in browsers and Node.
 * Re-encoding rejects noncanonical base64 bits; fatal UTF-8 decoding rejects malformed text instead of replacing it.
 *
 * @param value Base64 text; whitespace, URL-safe alphabets, and misplaced padding are rejected.
 *
 * @returns Decoded text with a leading UTF-8 BOM removed, or null for empty input, invalid base64 or invalid UTF-8.
 */
export const decodeBase64AsText = (value: string): string | null => {
  if (!value) {
    return null
  }
  try {
    const binary = atob(value)
    if (btoa(binary).replace(/=+$/, '') !== value.replace(/=+$/, '')) {
      return null
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
