// CFG chat colors use low control codes as content, including VT/FF outside quotes.
// Keep them byte-for-byte; filenames and metadata still use their own strict validation.
export function hasUnsupportedCfgControl(text) {
  return [...text].some(character => {
    const code = character.charCodeAt(0)
    return code === 0 || (code >= 0x11 && code < 0x20) || (code >= 0x7f && code <= 0x9f)
  })
}
