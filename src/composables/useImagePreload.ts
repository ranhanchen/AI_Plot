const blobCache = new Map<string, string>()

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

export function getBlobUrl(base64: string): string {
  if (!base64) return ''
  const cached = blobCache.get(base64)
  if (cached) return cached
  const blob = base64ToBlob(base64)
  const url = URL.createObjectURL(blob)
  blobCache.set(base64, url)
  return url
}

const preheated = new Set<string>()

export function isPreheated(url: string): boolean {
  if (!url) return false
  const blobUrl = url.startsWith('data:') ? getBlobUrl(url) : url
  return preheated.has(blobUrl)
}

export function preloadImages(urls: string[]): Promise<void> {
  const valid = urls.filter(Boolean)
  if (valid.length === 0) return Promise.resolve()

  const BATCH_SIZE = 3
  let index = 0

  return new Promise<void>((resolve) => {
    function processBatch() {
      const batch = valid.slice(index, index + BATCH_SIZE)
      index += batch.length
      if (batch.length === 0) { resolve(); return }

      const tasks = batch.map(async (url) => {
        const blobUrl = url.startsWith('data:') ? getBlobUrl(url) : url
        if (preheated.has(blobUrl)) return
        const img = new Image()
        img.src = blobUrl
        try {
          await img.decode()
          preheated.add(blobUrl)
        } catch {
          await new Promise<void>((r) => {
            img.onload = () => { preheated.add(blobUrl); r() }
            img.onerror = () => { preheated.add(blobUrl); r() }
          })
        }
      })

      Promise.all(tasks).then(() => {
        if (index < valid.length) {
          setTimeout(processBatch, 0)
        } else {
          resolve()
        }
      })
    }

    setTimeout(processBatch, 0)
  })
}
