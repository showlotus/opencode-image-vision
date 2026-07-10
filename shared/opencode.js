// 通过 opencode SDK 读取全部 provider（含模型能力信息）
// 这会尊重用户在 opencode 配置里的覆盖以及 models.dev 的定义
// 带超时兜底：client 调用若长时间无响应（如 server 未就绪/代理异常），超时后返回空数组，
// 绝不无限等待，避免拖垮调用方
export async function fetchOpencodeProviders(client, timeoutMs = 5000) {
  try {
    if (!client?.config?.providers) return []
    const res = await Promise.race([
      client.config.providers(),
      new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!res) return []
    return res?.data?.providers ?? res?.providers ?? []
  } catch {
    return []
  }
}

// 判断指定模型是否支持图片输入
// 返回 true 支持 / false 不支持 / null 无法判定（数据缺失，交由调用方兜底）
export function modelSupportsImage(providers, modelId) {
  if (!modelId || !Array.isArray(providers)) return null
  for (const p of providers) {
    const model = p?.models?.[modelId]
    if (model) {
      const image = model?.capabilities?.input?.image
      return typeof image === 'boolean' ? image : null
    }
  }
  return null
}
