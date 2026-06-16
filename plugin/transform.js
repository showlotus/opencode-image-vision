import { createHash } from 'node:crypto'
import { isImagePart, extractBase64 } from '../shared/image-utils.js'
import { isUnsupportedModel, extractModelFromMessages } from '../shared/model-detect.js'
import { modelSupportsImage } from '../src/opencode.js'
import { dbg } from '../shared/debug.js'
import { startProgressToast, toastDone, toastFail } from '../shared/toast.js'

// 判断当前会话模型是否需要插件介入识别图片
// 主依据：opencode 提供的模型能力 capabilities.input.image
// 能力数据缺失（返回 null）时，回退到内置关键字列表兜底判断
// 取不到模型时默认介入，避免漏处理
function shouldInterveneForModel(providers, modelId) {
  if (!modelId) return true
  const image = modelSupportsImage(providers, modelId)
  if (image === true) return false
  if (image === false) return true
  return isUnsupportedModel(modelId)
}

// 取消息列表中最后一条 user 消息（即当前轮次刚发送的消息）
// transform 钩子传入的是完整会话历史，历史消息里的图片可能仍是原始 part，
// 若全量扫描会导致重复识别且进度统计错误（如第 2 轮 2 张图却显示 3 张）
function findLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === 'user') return messages[i]
  }
  return null
}

// 创建 messages.transform 钩子
// 作用：当不支持图片输入的模型的会话里出现图片时，直接用视觉 provider 识别图片，
// 把图片 part 原地替换成识别结果文字，让模型无需主动调用任何工具即可获得图片内容
// 单张失败不影响其余图片，失败的 part 替换为错误说明文字
export function createTransformHook(deps) {
  const { getProvider, cache, prompt, getProviders, client } = deps

  return async (input, output) => {
    try {
      dbg({ event: 'hook_fired', messages: output?.messages?.length ?? 0 })
      if (!output?.messages?.length) return

      // 仅扫描当前轮次（最后一条 user 消息）里的图片 part
      const lastUser = findLastUserMessage(output.messages)
      const targets = []
      if (lastUser?.parts) {
        const parts = lastUser.parts
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i]
          dbg({
            event: 'part',
            role: 'user',
            type: p?.type,
            mime: p?.mime,
            keys: p && typeof p === 'object' ? Object.keys(p) : null,
            urlPrefix: typeof p?.url === 'string' ? p.url.slice(0, 40) : null,
            isImage: isImagePart(p),
          })
          if (isImagePart(p)) targets.push({ parts, index: i })
        }
      }

      dbg({ event: 'targets', count: targets.length })
      if (!targets.length) return

      // 确认有图片后，再判断当前模型是否需要介入；模型本身支持图片时直接放行
      const modelId = extractModelFromMessages(output.messages)
      const providers = getProviders ? await getProviders() : []
      dbg({
        event: 'gating',
        modelId,
        providersCount: providers.length,
        imageSupport: modelSupportsImage(providers, modelId),
        intervene: shouldInterveneForModel(providers, modelId),
      })
      if (!shouldInterveneForModel(providers, modelId)) return

      // 确认需要识别后，再惰性构造视觉 provider（此时才解析端点，避免启动期调用 client）
      const provider = await getProvider()

      const total = targets.length
      let current = 1
      let successCount = 0
      let failCount = 0
      const startTime = Date.now()

      // 持续显示的进度 Toast：长耗时识别期间不消失，多图展示「当前/总数」与已用时长
      const stopProgress = startProgressToast(client, () => ({
        current,
        total,
        elapsedMs: Date.now() - startTime,
      }))
      try {
        // 顺序识别每张图片（沿用插件模式顺序处理约定）
        for (let n = 0; n < targets.length; n++) {
          current = n + 1
          const { parts, index } = targets[n]
          const part = parts[index]

          const base64 = extractBase64(part)
          dbg({ event: 'base64', index, ok: !!base64, len: base64 ? base64.length : 0 })
          if (!base64) continue

          // MD5 去重，命中缓存直接复用描述，避免重复请求视觉模型
          const hash = createHash('md5').update(base64).digest('hex').slice(0, 16)
          if (cache.has(hash)) {
            parts[index] = { type: 'text', text: '[图片识别结果]\n' + cache.get(hash) }
            successCount++
            continue
          }

          try {
            // provider.analyze 内部自带超时控制，无需额外包装
            const desc = await provider.analyze(base64, part.mime, prompt)
            cache.set(hash, desc)
            parts[index] = { type: 'text', text: '[图片识别结果]\n' + desc }
            successCount++
            dbg({ event: 'analyze_ok', index, descLen: desc.length })
          } catch (e) {
            parts[index] = { type: 'text', text: '[图片识别失败: ' + e.message + ']' }
            failCount++
            dbg({ event: 'analyze_fail', index, error: e.message })
          }
        }
      } finally {
        stopProgress()
      }

      const elapsedMs = Date.now() - startTime

      // 收尾提示：有失败给出汇总，否则提示完成（均附带总耗时）
      if (failCount > 0) {
        await toastFail(client, total > 1 ? `${failCount}/${total} failed` : undefined, elapsedMs)
      } else if (successCount > 0) {
        await toastDone(client, successCount, elapsedMs)
      }
    } catch (e) {
      console.error(`[image-vision] transform 注入失败: ${e.message}`)
    }
  }
}
