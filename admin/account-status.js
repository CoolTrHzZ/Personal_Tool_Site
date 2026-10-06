// Session refreshes must not replace an unfinished display-name or avatar edit.
export function renderAccountSessionStatus(element, session) {
  element.textContent = session.mode === 'cloud'
    ? '站点维护者 · ' + (session.rememberedDevice ? '此设备保持登录 7 天' : '本次登录')
    : '本机维护者 · 个人设置仅存此浏览器'
}
