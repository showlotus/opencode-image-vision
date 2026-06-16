import { resolveProviderConfig, fetchOpencodeProviders, getProviderBaseUrl } from '../src/opencode.js'
import { createProviderFromConfig } from '../src/providers/index.js'
import { createCache } from '../shared/cache.js'
import { dbg, setDebug } from '../shared/debug.js'
import { createTransformHook } from './transform.js'

const DEFAULT_PROMPT = [
  'Describe this image in detail, including:',
  'text content, UI layout structure, interface elements, color scheme.',
  'If there are code or technical details, list them thoroughly.',
].join(' ')

export default {
  id: 'image-vision',
  server: async (input, options = {}) => {
    // 插件通过 transform 钩子直接识别图片并注入结果，依赖视觉 provider
    // provider 初始化失败时整体降级返回空（等价于插件未安装），避免注入异常
    try {
      setDebug(options.debug)
      const model = options.model
      if (!model || typeof model !== 'string') {
        throw new Error('未配置视觉模型，请在 opencode 插件 options 中设置 model（格式 providerId/modelId）')
      }
      const slashIdx = model.indexOf('/')
      if (slashIdx === -1) throw new Error(`Invalid model format: "${model}"`)
      const providerId = model.slice(0, slashIdx)
      const modelId = model.slice(slashIdx + 1)

      // 这里只做同步校验（读凭据），不调用 opencode client
      // 关键：插件 server() 在 opencode 启动加载阶段被 await，若此处等待 client 回应会与
      // 「启动需等插件加载完成」形成死锁，导致 TUI 卡死黑屏。故所有 client 调用一律延迟到钩子触发时
      const providerConfig = resolveProviderConfig(providerId, modelId)
      providerConfig.timeout = options.timeout || 120000
      providerConfig.providerId = providerId
      const cache = createCache()

      // 记忆化获取 opencode 的 providers 数据，端点解析与模型能力判断复用同一份（带超时，永不卡死）
      let providersPromise
      const getProviders = () => (providersPromise ??= fetchOpencodeProviders(input.client))

      // 记忆化构造 provider：首次识别时再按 opencode 实际端点精修 baseURL
      // （如订阅制 zhipuai-coding-plan 应走编程端点而非通用按量付费端点）
      let providerPromise
      const getProvider = () =>
        (providerPromise ??= (async () => {
          const dynamicBaseUrl = getProviderBaseUrl(await getProviders(), providerId)
          if (dynamicBaseUrl) providerConfig.baseUrl = dynamicBaseUrl
          return createProviderFromConfig(providerConfig)
        })())

      dbg({ event: 'server_init_ok', model, providerId, modelId })
      return {
        // 发送消息前：把不支持图片的模型会话里的图片 part 直接替换成视觉识别结果文字
        // 是否介入由模型自身的图片输入能力决定（getProviders 提供 opencode 模型能力数据）
        'experimental.chat.messages.transform': createTransformHook({
          getProvider,
          cache,
          prompt: options.prompt || DEFAULT_PROMPT,
          getProviders,
          client: input.client,
        }),
      }
    } catch (e) {
      dbg({ event: 'server_init_fail', error: e.message })
      console.error(`[image-vision] 初始化失败（视觉 provider 不可用）: ${e.message}`)
      return {}
    }
  },
}
