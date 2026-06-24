const TITLE = 'Image Vision'
// 盲文旋转动画帧，循环播放形成 spinner 效果（同 opencode thinking 样式）
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_INTERVAL = 80
const PROGRESS_DURATION = 130
// 其他 Toast 结束后额外等待，避免边界时刻与进度 Toast 抢显示
const EXTERNAL_TOAST_BUFFER = 300

// 格式化已用时长为可读英文文本
function formatElapsed(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`
}

export async function toast(client, message, variant = 'info', duration = 30000) {
  if (!client?.tui?.showToast) return
  try {
    await client.tui.showToast({
      body: { title: TITLE, message, variant, duration },
    })
  } catch {}
}

// 订阅 tui.toast.show，记录外部 Toast 占用时段，供进度 Toast 避让
function listenExternalToasts(client, isStopped, onExternalToast) {
  if (!client?.event?.subscribe) return () => {}

  const abort = new AbortController()
  const listen = async () => {
    try {
      const { stream } = await client.event.subscribe({ signal: abort.signal })
      for await (const event of stream) {
        if (isStopped()) break
        if (event?.type !== 'tui.toast.show') continue
        const props = event.properties
        if (!props) continue
        // 忽略本插件自己的 Toast，避免自阻塞
        if (props.title === TITLE) continue
        const duration = props.duration ?? 3000
        onExternalToast(Date.now() + duration + EXTERNAL_TOAST_BUFFER)
      }
    } catch {
      // 订阅失败或中断时静默退出
    }
  }
  listen()
  return () => abort.abort()
}

// 启动持续刷新的进度 Toast
// opencode 的 showToast 没有 id、无法更新或关闭同一条，故以「短时长 + 定时重发」
// 保证长耗时识别期间 Toast 始终可见；停止后最后一条会很快自动消失，不残留
// 若有其他 Toast 正在展示，则暂停刷新，待其结束后再恢复，避免来回抢占
// getState 返回 { current, total, elapsedMs }，多图时展示「当前/总数」进度，elapsedMs 为已用时长；返回停止函数
export function startProgressToast(client, getState) {
  if (!client?.tui?.showToast) return () => {}
  let stopped = false
  let blockedUntil = 0

  const stopListen = listenExternalToasts(
    client,
    () => stopped,
    (until) => {
      blockedUntil = Math.max(blockedUntil, until)
    },
  )

  const show = () => {
    if (stopped) return
    if (Date.now() < blockedUntil) return
    const { current, total, elapsedMs = 0 } = getState()
    const frame = SPINNER_FRAMES[Math.floor(elapsedMs / SPINNER_INTERVAL) % SPINNER_FRAMES.length]
    const progress = total > 1 ? ` (${current}/${total})` : ''
    const elapsed = formatElapsed(elapsedMs)
    // 不 await，定时器内即发即走；toast 内部已自带异常吞掉
    toast(client, `${frame} Analyzing image${progress} · ${elapsed} elapsed`, 'info', PROGRESS_DURATION)
  }
  let timer
  const loop = () => {
    if (stopped) return
    show()
    timer = setTimeout(loop, SPINNER_INTERVAL)
  }
  loop()
  return () => {
    stopped = true
    clearTimeout(timer)
    stopListen()
  }
}

export async function toastDone(client, count, elapsedMs) {
  const base = count > 1 ? `✅ ${count} images analyzed` : '✅ Image analysis complete'
  const label = elapsedMs != null ? `${base} · took ${formatElapsed(elapsedMs)}` : base
  await toast(client, label, 'success', 2000)
}

export async function toastFail(client, reason, elapsedMs) {
  const base = reason ? `⚠️ Analysis failed: ${reason}` : '⚠️ Analysis failed, skipped'
  const msg = elapsedMs != null ? `${base} · took ${formatElapsed(elapsedMs)}` : base
  await toast(client, msg, 'warning', 3000)
}
