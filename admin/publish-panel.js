export async function mountPublishPanel(host, { request, el, button, openModal, toast }) {
  const panel = el('section','admin-management-result')
  const prepare = button('生成公开清单与差异'), refresh = button('刷新发布与 Pages 状态')
  const publish = button('确认公开并发布', {}, 'ui-button ui-button-primary'), abandon = button('结束此记录，重新预览')
  const status = el('p','muted','正在读取私有发布记录…'), destination = el('p','muted','固定目标：CoolTrHzZ/Personal_Tool_Site · main')
  const actionsLink = el('a','','查看对应 GitHub Actions'); actionsLink.target = '_blank'; actionsLink.rel = 'noopener noreferrer'
  const list = el('ul','admin-file-list'), patch = el('pre','admin-command'), history = el('div','muted')
  status.setAttribute('role','status')
  panel.append(el('h3','','显式发布到 GitHub Pages'), destination,
    el('p','muted','这是内容变更预览，不执行导入 HTML。发布会公开全部站点记录，包括停用条目、笔记和 AI 正文、CFG 历史、工具脚本与下载。先检查清单和差异，移除私密内容；仅发布已保存的服务器草稿，未保存浏览器编辑不包含；保存草稿不会发布。'),
    prepare, refresh, status, actionsLink, list, patch, publish, abandon, history)
  host.append(panel)
  let info, busy = false, errorText = '', uncertain = false
  const stages = { prepared:'未提交 · 已校验快照，等待确认', committing:'提交结果待核对 · 已记录确切 commit', committed:'已提交 · 未确认推送', push_unknown:'推送结果待核对 · 禁止盲目重推', pushed:'已确认推送 · 等待 Pages 结果' }
  const pages = { pending:'Pages 待完成，稍后刷新', unknown:'Pages 结果暂不可读，稍后刷新', failed:'Pages/CI 失败；请查看 GitHub，刷新不会再次推送', deployed:'GitHub 记录此 commit 的 Pages 部署成功', superseded:'此部署已被替代，不代表当前线上版本' }
  function draw() {
    const job = info?.job
    destination.textContent = '固定目标：CoolTrHzZ/Personal_Tool_Site · main' + (job?.publicUrl ? ' · 当前站点 ' + job.publicUrl : '') + (job?.proposedPublicUrl && job.proposedPublicUrl !== job.publicUrl ? ' · 草稿公开地址 ' + job.proposedPublicUrl : '')
    status.textContent = (uncertain ? '发布操作结果尚不能确认，请先刷新记录。' : job ? stages[job.stage] + (job.commit ? ' · commit ' + job.commit : '') + (job.pages ? ' · ' + (pages[job.pages.state] || '待核对') : '') + (job.lastError ? ' · ' + job.lastError : '') : '尚无待发布快照。先生成清单与差异；这一步不提交、不推送。') + (errorText ? ' · ' + errorText : '')
    list.replaceChildren(...(job?.files || []).map(file => el('li','',file.action + ' · ' + file.path + ' · ' + file.bytes + ' 字节' + (file.sha256 ? ' · SHA256 ' + file.sha256 : ''))))
    patch.textContent = (job?.truncated ? '文本差异显示前 64 KiB；文件清单与 SHA256 完整。大文件/二进制请自行检查后确认。\n' : '') + (job?.patch || '')
    history.textContent = (info?.history || []).map(item => '历史：' + (item.commit || item.id) + ' · ' + item.stage).join('\n')
    actionsLink.href = 'https://github.com/CoolTrHzZ/Personal_Tool_Site/actions' + (Number.isSafeInteger(job?.pages?.runId) ? '/runs/' + job.pages.runId : '')
    publish.textContent = job?.stage === 'prepared' ? '确认公开并发布' : '核对并继续原 commit'
    prepare.disabled = busy || uncertain || Boolean(job && ['committing','committed','push_unknown'].includes(job.stage))
    refresh.disabled = busy
    publish.disabled = busy || uncertain || !job || job.stage === 'pushed'
    abandon.disabled = busy || uncertain || !job || job.stage === 'push_unknown'
  }
  const act = async (path, body) => {
    if (busy) return
    busy = true; errorText = ''; draw()
    try { info = await request(path, { method:'POST', ...(body ? { body: JSON.stringify(body) } : {}) }); uncertain = false; draw() }
    catch (error) { errorText = error.message; uncertain ||= ['publishing/publish','publishing/abandon'].includes(path); toast(error.message,'error') }
    finally { busy = false; draw() }
  }
  prepare.onclick = () => act('publishing/prepare')
  refresh.onclick = () => act('publishing/refresh')
  publish.onclick = async () => {
    const job = info?.job
    if (!job || busy) return
    if (!await openModal({ title: '确认向公开站点发布？', body: '目标 CoolTrHzZ/Personal_Tool_Site 的 main；' + (job.publicUrl || '按现有 Pages 设置') + '。将公开这份已列出的 ' + job.files.length + ' 个文件删改及其内容。停用条目仍公开。' + (job.commit ? '仅继续已确认 commit ' + job.commit + '，不包含之后新增的草稿。' : '会生成 commit 并推送；Pages 结果需后续刷新核对。'), confirm:true, okText:'确认公开并执行' })) return
    if (info?.job?.id !== job.id || busy) return
    await act('publishing/publish', { id: job.id, confirmed:true })
  }
  abandon.onclick = async () => {
    const job = info?.job
    if (!job || busy || !await openModal({ title:'结束当前发布记录？', body:'保存历史 commit 记录并重新准备。草稿保留；已推送内容不会从线上撤回。未知推送结果必须先核对。', confirm:true, okText:'结束记录' })) return
    if (info?.job?.id !== job.id || busy) return
    await act('publishing/abandon', { id:job.id, confirmed:true })
  }
  try { info = await request('publishing'); draw() } catch (error) { status.textContent = error.message; publish.disabled = true; abandon.disabled = true }
}
