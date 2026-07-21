import { toCanvas } from 'html-to-image'

const OVERLAY_ID = 'feedchat-screenshot-overlay'

interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): SelectionRect {
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  return { x, y, width, height }
}

function cropCanvas(
  source: HTMLCanvasElement,
  rect: SelectionRect,
  scaleX: number,
  scaleY: number,
): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = Math.round(rect.width * scaleX)
  output.height = Math.round(rect.height * scaleY)

  const ctx = output.getContext('2d')
  if (!ctx) throw new Error('Could not create screenshot canvas')

  ctx.drawImage(
    source,
    Math.round(rect.x * scaleX),
    Math.round(rect.y * scaleY),
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height,
  )

  return output
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not create screenshot image'))
        return
      }
      resolve(new File([blob], name, { type: 'image/png' }))
    }, 'image/png')
  })
}

function injectStyles(): void {
  if (document.getElementById('feedchat-screenshot-styles')) return

  const style = document.createElement('style')
  style.id = 'feedchat-screenshot-styles'
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      cursor: crosshair;
      user-select: none;
      touch-action: none;
    }

    #${OVERLAY_ID} img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
    }

    #${OVERLAY_ID} .feedchat-screenshot-selection {
      position: absolute;
      border: 2px solid #fff;
      outline: 1px solid rgba(0, 0, 0, 0.35);
      box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.45);
      pointer-events: none;
    }

    #${OVERLAY_ID} .feedchat-screenshot-hint {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.78);
      color: #fff;
      font: 600 13px/1.2 'Segoe UI', system-ui, sans-serif;
      pointer-events: none;
      white-space: nowrap;
    }
  `
  document.head.appendChild(style)
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function captureViewport(): Promise<HTMLCanvasElement> {
  const width = window.innerWidth
  const height = window.innerHeight
  const pixelRatio = window.devicePixelRatio || 1

  return toCanvas(document.documentElement, {
    cacheBust: true,
    width,
    height,
    canvasWidth: width * pixelRatio,
    canvasHeight: height * pixelRatio,
    pixelRatio: 1,
    style: {
      margin: '0',
    },
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true
      return node.id !== OVERLAY_ID
    },
  })
}

function pickSelection(previewUrl: string): Promise<SelectionRect | null> {
  injectStyles()

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.id = OVERLAY_ID

    const image = document.createElement('img')
    image.src = previewUrl
    image.alt = ''

    const hint = document.createElement('div')
    hint.className = 'feedchat-screenshot-hint'
    hint.textContent = 'Drag to select an area. Press Esc to cancel.'

    const selection = document.createElement('div')
    selection.className = 'feedchat-screenshot-selection'
    selection.hidden = true

    overlay.append(image, selection, hint)
    document.body.appendChild(overlay)

    let startX = 0
    let startY = 0
    let dragging = false

    const cleanup = (result: SelectionRect | null) => {
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(result)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cleanup(null)
      }
    }

    const updateSelection = (rect: SelectionRect) => {
      selection.hidden = rect.width < 2 || rect.height < 2
      selection.style.left = `${rect.x}px`
      selection.style.top = `${rect.y}px`
      selection.style.width = `${rect.width}px`
      selection.style.height = `${rect.height}px`
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      startX = event.clientX
      startY = event.clientY
      overlay.setPointerCapture(event.pointerId)
      updateSelection({ x: startX, y: startY, width: 0, height: 0 })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      updateSelection(normalizeRect(startX, startY, event.clientX, event.clientY))
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      overlay.releasePointerCapture(event.pointerId)

      const rect = normalizeRect(startX, startY, event.clientX, event.clientY)
      if (rect.width < 8 || rect.height < 8) {
        selection.hidden = true
        return
      }

      cleanup(rect)
    }

    overlay.addEventListener('pointerdown', onPointerDown)
    overlay.addEventListener('pointermove', onPointerMove)
    overlay.addEventListener('pointerup', onPointerUp)
    document.addEventListener('keydown', onKeyDown, true)
  })
}

export async function pickAreaScreenshot(
  hideElements: HTMLElement[] = [],
): Promise<File | null> {
  const previousVisibility = hideElements.map((el) => el.style.visibility)
  for (const el of hideElements) {
    el.style.visibility = 'hidden'
  }

  await waitForNextFrame()
  await waitForNextFrame()

  let sourceCanvas: HTMLCanvasElement
  try {
    sourceCanvas = await captureViewport()
  } catch {
    for (const [index, el] of hideElements.entries()) {
      el.style.visibility = previousVisibility[index] ?? ''
    }
    return null
  } finally {
    for (const [index, el] of hideElements.entries()) {
      el.style.visibility = previousVisibility[index] ?? ''
    }
  }

  const scaleX = sourceCanvas.width / window.innerWidth
  const scaleY = sourceCanvas.height / window.innerHeight
  const previewUrl = sourceCanvas.toDataURL('image/png')

  const rect = await pickSelection(previewUrl)
  if (!rect) return null

  const cropped = cropCanvas(sourceCanvas, rect, scaleX, scaleY)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return canvasToFile(cropped, `screenshot-${timestamp}.png`)
}
