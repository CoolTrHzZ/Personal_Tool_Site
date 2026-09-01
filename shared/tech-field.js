const noop = () => {}

export function mountTechField(root) {
  if (!root) return noop

  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = root.querySelector('canvas.tech-field') || document.createElement('canvas')
  const grid = root.querySelector('.tech-grid') || document.createElement('div')
  const createdCanvas = !canvas.parentElement
  const createdGrid = !grid.parentElement
  canvas.className = 'tech-field'
  canvas.setAttribute('aria-hidden', 'true')
  grid.className = 'tech-grid'
  grid.setAttribute('aria-hidden', 'true')
  if (createdGrid) root.prepend(grid)
  if (createdCanvas) root.prepend(canvas)

  const context = canvas.getContext('2d')
  if (!context) {
    if (createdGrid) grid.remove()
    if (createdCanvas) canvas.remove()
    return noop
  }

  const nodes = []
  let frameId = 0
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const count = width < 768 ? 28 : 48
    if (nodes.length !== count) {
      nodes.length = 0
      for (let index = 0; index < count; index += 1) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          radius: 1 + Math.random() * 1.4,
        })
      }
    } else {
      nodes.forEach(node => {
        node.x = Math.min(node.x, width)
        node.y = Math.min(node.y, height)
      })
    }
  }

  const draw = () => {
    frameId = 0
    if (document.hidden || media.matches) return
    const width = window.innerWidth
    const height = window.innerHeight
    const accent = window.getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2997FF'
    const mx = (Number.parseFloat(root.style.getPropertyValue('--mx')) || 52) / 100 * width
    const my = (Number.parseFloat(root.style.getPropertyValue('--my')) || 18) / 100 * height
    context.clearRect(0, 0, width, height)
    context.fillStyle = accent
    context.strokeStyle = accent
    context.lineWidth = 0.85
    nodes.forEach(node => {
      node.x += node.vx + (mx - node.x) * 0.0008
      node.y += node.vy + (my - node.y) * 0.0008
      if (node.x < -10 || node.x > width + 10) node.vx *= -1
      if (node.y < -10 || node.y > height + 10) node.vy *= -1
      context.globalAlpha = 0.88
      context.beginPath()
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      context.fill()
    })
    for (let first = 0; first < nodes.length; first += 1) {
      for (let second = first + 1; second < nodes.length; second += 1) {
        const dx = nodes[first].x - nodes[second].x
        const dy = nodes[first].y - nodes[second].y
        const distance = Math.hypot(dx, dy)
        if (distance > 170) continue
        context.globalAlpha = (1 - distance / 170) * 0.42
        context.beginPath()
        context.moveTo(nodes[first].x, nodes[first].y)
        context.lineTo(nodes[second].x, nodes[second].y)
        context.stroke()
      }
    }
    context.globalAlpha = 1
    frameId = requestAnimationFrame(draw)
  }

  const syncMotion = () => {
    if (media.matches) {
      cancelAnimationFrame(frameId)
      frameId = 0
      canvas.style.display = 'none'
      grid.style.display = 'none'
      return
    }
    canvas.style.display = ''
    grid.style.display = ''
    resize()
    if (!document.hidden && !frameId) frameId = requestAnimationFrame(draw)
  }

  const onVisibility = () => {
    if (!document.hidden && !media.matches && !frameId) frameId = requestAnimationFrame(draw)
  }
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)
  media.addEventListener('change', syncMotion)
  syncMotion()

  return () => {
    cancelAnimationFrame(frameId)
    frameId = 0
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibility)
    media.removeEventListener('change', syncMotion)
    if (createdCanvas) canvas.remove()
    if (createdGrid) grid.remove()
  }
}
