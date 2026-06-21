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

export function preloadImages(urls: string[]): Promise<void[]> {
  const tasks = urls
    .filter(Boolean)
    .map(async (url) => {
      const blobUrl = url.startsWith('data:') ? getBlobUrl(url) : url
      if (preheated.has(blobUrl)) return
      const img = new Image()
      img.src = blobUrl
      try {
        await img.decode()
        preheated.add(blobUrl)
      } catch {
        // decode 失败时降级为 onload
        await new Promise<void>((resolve) => {
          img.onload = () => { preheated.add(blobUrl); resolve() }
          img.onerror = () => { preheated.add(blobUrl); resolve() }
        })
      }
    })
  return Promise.all(tasks)
}
