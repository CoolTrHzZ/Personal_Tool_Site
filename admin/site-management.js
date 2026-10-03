import { mountPublishPanel } from './publish-panel.js'

export function mountSiteManagement({ request, el, button, toast, openModal, downloadBase64, fileToPayload, reload, cloud = false }) {
  function backup(host) {
    host.append(el('p', 'muted', cloud ? '此备份包含服务器私有草稿的全部内容文件；不含认证、运行配置、浏览器草稿和源码。恢复仅替换私有草稿，不修改仓库或线上站点。' : '完整备份包含站点全部公开 JSON、桌面工具 EXE、CFG（含历史）、静态工具文件、内置工具配置与工具索引。恢复会替换这些内容；不包含浏览器个人数据、草稿或应用源码。'))
    const exportButton = button('导出完整站点备份', {}, 'ui-button ui-button-primary')
    const upload = document.createElement('input'); upload.type = 'file'; upload.accept = '.gz,.devos.gz'; upload.className = 'ui-input'; upload.setAttribute('aria-label', '选择完整站点备份')
    const result = el('div', 'admin-management-result'); result.setAttribute('aria-live', 'polite')
    host.append(exportButton, upload, result)
    exportButton.onclick = async () => {
      exportButton.disabled = true
      try { const backup = await request('backup'); downloadBase64(backup.filename, backup.content); toast(`已导出 ${backup.files} 个文件的完整备份`) } catch (error) { toast(error.message, 'error') } finally { exportButton.disabled = false }
    }
    upload.onchange = async () => {
      const file = upload.files[0]; upload.value = ''; if (!file) return
      upload.disabled = true; result.replaceChildren(el('p', '', '正在校验并生成恢复预览…'))
      try {
        if (file.size > 192 * 1024 * 1024) throw new Error('备份文件不能超过 192 MiB（解压后公开文件上限 128 MiB）')
        const preview = await request('backup/preview', { method: 'POST', body: JSON.stringify(await fileToPayload(file)) })
        result.replaceChildren(el('h3', '', `恢复预览 · ${preview.files} 个文件`), el('p', 'muted', '校验通过。下列文件将新增、覆盖或删除；其他源码不变。预览 30 分钟有效，本地内容有变化时需重新预览。'))
        const list = el('ul', 'admin-file-list')
        for (const change of preview.changes) list.append(el('li', '', `${{ add: '新增', replace: '覆盖', delete: '删除' }[change.action]} · ${change.path}`))
        if (!preview.changes.length) list.append(el('li', '', '内容与当前站点相同'))
        const restore = button('确认恢复完整备份', {}, 'ui-button ui-button-primary'); result.append(list, restore)
        restore.onclick = async () => {
          if (!await openModal({ title: '恢复整个站点的公开内容？', body: `将替换 ${preview.changes.length} 个文件。建议先导出当前备份。恢复后需要重新发布才会影响 GitHub Pages。`, confirm: true, okText: '恢复备份' })) return
          restore.disabled = true; upload.disabled = true
          try { await request('backup/restore', { method: 'POST', body: JSON.stringify({ token: preview.token }) }); toast('站点已恢复，文件校验通过'); await reload('', false) }
          catch (error) { toast(error.message, 'error'); restore.disabled = false }
          finally { upload.disabled = false }
        }
      } catch (error) { result.replaceChildren(el('p', 'cfg-admin-error', error.message)) }
      finally { upload.disabled = false }
    }
  }
  async function publishing(host) {
    if (cloud) return mountPublishPanel(host, { request, el, button, openModal, toast })
    const panel = el('section', 'admin-management-result'); host.append(panel)
    const refresh = button('刷新待发布清单'), validate = button('运行发布前校验', {}, 'ui-button ui-button-primary')
    const list = el('ul', 'admin-file-list'), status = el('p', 'muted', '正在读取 Git 状态…')
    panel.append(el('h3', '', '发布前检查'), el('p', 'muted', cloud ? '下面是服务器私有草稿相对当前代码快照的变更。保存和校验不会提交或推送；显式发布入口尚未接入。' : '下面是本地 Git 尚未提交的真实变更。此页面不提交或推送代码；已提交但未推送的更改请用终端确认。'), refresh, validate, status, list)
    const load = async () => {
      refresh.disabled = true
      try {
        const info = await request('publishing'); list.replaceChildren()
        status.textContent = info.git ? `分支 ${info.branch || 'detached HEAD'} · ${info.files.length} 个文件变更` : info.message
        for (const file of info.files) list.append(el('li', '', `${file.status} · ${file.path}${file.managed ? ' · 站点内容' : ''}`))
        panel.querySelector('pre')?.remove()
        if (info.command) panel.append(el('pre', 'admin-command', info.command))
      } catch (error) { status.textContent = error.message } finally { refresh.disabled = false }
    }
    refresh.onclick = load
    validate.onclick = async () => {
      validate.disabled = true; status.textContent = '正在检查公开数据、关联与工具文件…'
      try { const info = await request('publishing/validate', { method: 'POST' }); status.textContent = info.ok ? cloud ? '私有草稿校验通过，尚未发布。' : '发布前校验通过。可在终端检查改动后提交发布。' : `校验未通过：${info.issues.join('；')}` }
      catch (error) { status.textContent = error.message } finally { validate.disabled = false }
    }
    await load()
  }
  return { backup, publishing }
}
