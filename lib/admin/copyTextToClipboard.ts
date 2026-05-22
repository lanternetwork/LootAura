/**
 * Copy text in the browser with Clipboard API fallback for restricted contexts.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('Clipboard copy is only available in the browser')
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to execCommand (e.g. permissions policy or non-secure context).
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) {
    throw new Error('Clipboard unavailable in this browser')
  }
}
