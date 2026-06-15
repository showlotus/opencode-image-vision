const TITLE = '图片识别'

export async function toast(client, message, variant = 'info', duration = 30000) {
  if (!client?.tui?.showToast) return
  try {
    await client.tui.showToast({
      body: { title: TITLE, message, variant, duration },
    })
  } catch {}
}

export async function toastProgress(client, current, total) {
  const progress = total > 1 ? ` (${current}/${total})` : ''
  await toast(client, `🔍 正在识别图片${progress}...`, 'info', 30000)
}

export async function toastDone(client, count) {
  const label = count > 1 ? `✅ ${count} 张图片识别完成` : '✅ 图片识别完成'
  await toast(client, label, 'success', 2000)
}

export async function toastFail(client, reason) {
  const msg = reason ? `⚠️ 识别失败：${reason}` : '⚠️ 识别失败，已跳过'
  await toast(client, msg, 'warning', 3000)
}
