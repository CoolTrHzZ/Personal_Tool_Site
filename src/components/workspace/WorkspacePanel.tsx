import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCheck, Coffee, ListTodo, Pause, Play, Plus, RotateCcw, StickyNote, Timer, Trash2 } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import '../../styles/pages/workspace.css'

import { emptyTodos, initialTimer, isTodoList, isTimer, isWorkspaceNote, MINUTE, type Todo } from './storage'
import { hasPersonalPending, readPersonalRaw, rememberPersonalPending, writePersonalRaw } from '../../utils/personal-storage'
import PersonalDataPanel from './PersonalDataPanel'

function useLocalValue<T>(key: string, fallback: T, validate: (value: unknown) => value is T) {
  const [state, setState] = useState<{ value: T; error: string }>(() => {
    try {
      const raw = readPersonalRaw(key)
      if (raw === null) return { value: fallback, error: '' }
      const value: unknown = JSON.parse(raw)
      return validate(value) ? { value, error: hasPersonalPending(key) ? '修改尚未保存，请重试或先备份。' : '' } : { value: fallback, error: '本地数据格式异常，原记录暂未覆盖；可先导出备份。' }
    } catch { return { value: fallback, error: '无法读取本地数据，已暂停保存。请检查存储设置。' } }
  })
  const protectedValue = useRef(Boolean(state.error))

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== null && event.key !== key) return
      if (hasPersonalPending(key)) {
        setState(current => ({ ...current, error: '其他标签页更新了记录，当前未保存修改已保留；请先备份，再重试保存。' }))
        return
      }
      try {
        if (event.storageArea !== localStorage) return
        const raw = localStorage.getItem(key)
        const value: unknown = raw === null ? fallback : JSON.parse(raw)
        if (!validate(value)) throw new Error('Invalid stored value')
        protectedValue.current = false
        setState({ value, error: '' })
      } catch {
        protectedValue.current = true
        setState(current => ({ ...current, error: '另一标签页的数据格式异常，已保留当前内容。' }))
      }
    }
    function restored() {
      if (hasPersonalPending(key)) return
      protectedValue.current = false
      sync(new StorageEvent('storage', { key, storageArea: localStorage }))
    }
    window.addEventListener('storage', sync)
    window.addEventListener('devos:personal-data-restored', restored)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('devos:personal-data-restored', restored) }
  }, [key, fallback, validate])

  function update(value: T, retry = false) {
    if (!validate(value)) { setState(current => ({ ...current, error: '内容超出限制，本次修改未应用。' })); return }
    const raw = JSON.stringify(value)
    if (protectedValue.current && !retry) {
      rememberPersonalPending(key, raw)
      setState(current => ({ value, error: current.error || '修改尚未保存，请重试或先备份。' }))
      return
    }
    let error = ''
    try { writePersonalRaw(key, raw); protectedValue.current = false }
    catch { protectedValue.current = true; error = '保存失败，修改仅保留在当前页面；请先备份或重试。' }
    setState({ value, error })
  }
  return [state.value, update, state.error] as const
}

export default function WorkspacePanel() {
  const [todos, saveTodos, todoError] = useLocalValue<Todo[]>('devos.workspace.todos', emptyTodos, isTodoList)
  const [note, saveNote, noteError] = useLocalValue('devos.workspace.note', '', isWorkspaceNote)
  const [timer, saveTimer, timerError] = useLocalValue('devos.workspace.timer', initialTimer, isTimer)
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(Date.now)
  const duration = (timer.phase === 'focus' ? timer.minutes : 5) * MINUTE
  const remaining = timer.deadline === null ? timer.remainingMs : Math.min(duration, Math.max(0, timer.deadline - now))
  const seconds = Math.ceil(remaining / 1000)
  const completedTodos = todos.filter(todo => todo.done).length

  useEffect(() => {
    if (timer.deadline === null) return
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [timer.deadline])

  useEffect(() => {
    if (timer.deadline !== null && now >= timer.deadline) saveTimer({ ...timer, remainingMs: 0, deadline: null, completed: true })
  }, [now, timer, saveTimer])

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    saveTodos([...todos, { id: crypto.randomUUID(), text, done: false }])
    setDraft('')
  }

  function resetTimer(phase = timer.phase, minutes = timer.minutes) {
    saveTimer({ phase, minutes, remainingMs: (phase === 'focus' ? minutes : 5) * MINUTE, deadline: null, completed: false })
  }

  function toggleTimer() {
    const time = Date.now()
    setNow(time)
    if (timer.deadline !== null) {
      const left = Math.min(duration, Math.max(0, timer.deadline - time))
      saveTimer({ ...timer, remainingMs: left, deadline: null, completed: left === 0 })
    } else if (timer.completed) {
      const phase = timer.phase === 'focus' ? 'break' : 'focus'
      const remainingMs = (phase === 'focus' ? timer.minutes : 5) * MINUTE
      saveTimer({ ...timer, phase, remainingMs, deadline: time + remainingMs, completed: false })
    } else {
      saveTimer({ ...timer, deadline: time + timer.remainingMs })
    }
  }

  return (
    <div className="workspace-panel" aria-label="个人工作台">
      <section className="workspace-card" aria-labelledby="workspace-todos-heading">
        <div className="workspace-card-heading">
          <h2 id="workspace-todos-heading"><ListTodo size={15} aria-hidden="true" />今日待办</h2>
          <span className="workspace-meta">{String(completedTodos).padStart(2, '0')} / {String(todos.length).padStart(2, '0')}</span>
        </div>
        <form className="workspace-todo-form" onSubmit={addTodo}>
          <label className="sr-only" htmlFor="workspace-todo-input">新增待办</label>
          <Input id="workspace-todo-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={160} placeholder="下一件要完成的事…" autoComplete="off" />
          <Button type="submit" iconOnly icon={<Plus size={16} aria-hidden="true" />} disabled={!draft.trim()}>添加待办</Button>
        </form>
        {todos.length === 0 ? <p className="workspace-empty"><CheckCheck size={16} aria-hidden="true" />清空脑袋，从一件小事开始。</p> : (
          <ul className="workspace-todos">
            {todos.map(todo => (
              <li key={todo.id} className={todo.done ? 'is-complete' : ''}>
                <label><input type="checkbox" checked={todo.done} onChange={() => saveTodos(todos.map(item => item.id === todo.id ? { ...item, done: !item.done } : item))} /><span>{todo.text}</span></label>
                <Button type="button" size="sm" iconOnly icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => saveTodos(todos.filter(item => item.id !== todo.id))}>删除待办：{todo.text}</Button>
              </li>
            ))}
          </ul>
        )}
        <p className={`workspace-save-status ${todoError ? 'has-error' : ''}`} role="status">{todoError || (todos.length > 0 && completedTodos === todos.length ? '今日事项全部完成。做得不错！' : '保存在此浏览器 · 未完成事项持续保留')}</p>
        {todoError && <Button size="sm" onClick={() => saveTodos(todos, true)}>重试保存待办</Button>}
      </section>

      <section className="workspace-card workspace-focus" aria-labelledby="workspace-focus-heading">
        <div className="workspace-card-heading">
          <h2 id="workspace-focus-heading"><Timer size={15} aria-hidden="true" />专注计时</h2>
          <span className={`workspace-meta ${timer.deadline !== null ? 'is-running' : ''}`}>{timer.deadline !== null ? '运行中' : timer.completed ? '已完成' : '待命'}</span>
        </div>
        <div className="workspace-focus-settings">
          <div className="workspace-focus-modes" role="group" aria-label="计时模式">
            <button type="button" aria-pressed={timer.phase === 'focus'} disabled={timer.deadline !== null} onClick={() => resetTimer('focus')}>专注</button>
            <button type="button" aria-pressed={timer.phase === 'break'} disabled={timer.deadline !== null} onClick={() => resetTimer('break')}><Coffee size={12} aria-hidden="true" />休息</button>
          </div>
          <label className="sr-only" htmlFor="workspace-focus-duration">专注时长</label>
          <select id="workspace-focus-duration" aria-label="专注时长" value={timer.minutes} disabled={timer.deadline !== null} onChange={event => resetTimer('focus', Number(event.target.value))}>
            {[25, 45, 60].map(minutes => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
          </select>
        </div>
        <div className="workspace-clock" role="timer" aria-label={`${timer.phase === 'focus' ? '专注' : '休息'}剩余时间`}>{String(Math.floor(seconds / 60)).padStart(2, '0')}<span>:</span>{String(seconds % 60).padStart(2, '0')}</div>
        <progress className="workspace-progress" value={Math.min(duration, duration - remaining)} max={duration} aria-label="本轮计时进度" />
        <div className="workspace-focus-actions">
          <Button type="button" variant="primary" size="sm" icon={timer.deadline !== null ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />} onClick={toggleTimer}>{timer.deadline !== null ? '暂停' : timer.completed ? timer.phase === 'focus' ? '开始休息' : '下一轮专注' : '开始'}</Button>
          <Button type="button" size="sm" icon={<RotateCcw size={13} aria-hidden="true" />} onClick={() => resetTimer()}>重置</Button>
        </div>
        <p className={`workspace-save-status ${timerError ? 'has-error' : ''}`} role="status">{timerError || (timer.completed ? timer.phase === 'focus' ? '本轮专注完成，休息一下吧。' : '休息结束，准备好再出发。' : '计时自动保留 · 休息 5 分钟')}</p>
        {timerError && <Button size="sm" onClick={() => saveTimer(timer, true)}>重试保存计时</Button>}
      </section>

      <section className="workspace-card" aria-labelledby="workspace-note-heading">
        <div className="workspace-card-heading">
          <h2 id="workspace-note-heading"><StickyNote size={15} aria-hidden="true" />临时便笺</h2>
          <span className="workspace-meta">{note.length} / 10000</span>
        </div>
        <label className="sr-only" htmlFor="workspace-note">临时便笺内容</label>
        <textarea id="workspace-note" className="ui-textarea workspace-note" value={note} onChange={event => saveNote(event.target.value)} placeholder="捕捉灵感、暂存片段，随手记在这里…" aria-describedby="workspace-note-status" />
        <p id="workspace-note-status" className={`workspace-save-status ${noteError ? 'has-error' : ''}`} role="status">{noteError || (note ? '已自动保存到此浏览器' : '输入即自动保存到此浏览器')}</p>
        {noteError && <Button size="sm" onClick={() => saveNote(note, true)}>重试保存便笺</Button>}
      </section>
      <PersonalDataPanel />
    </div>
  )
}
