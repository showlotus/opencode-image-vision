import { appendFileSync } from 'node:fs'

// 调试开关，默认关闭
// 开启方式（任一）：设置环境变量 IMAGE_VISION_DEBUG=1，或插件选项传入 debug: true
// 日志路径可用环境变量 IMAGE_VISION_DEBUG_PATH 覆盖，默认 /tmp/iv-debug.log
let enabled = !!process.env.IMAGE_VISION_DEBUG
const LOG_PATH = process.env.IMAGE_VISION_DEBUG_PATH || '/tmp/iv-debug.log'

// 设置调试开关；环境变量一旦开启则始终生效（优先级最高）
export function setDebug(value) {
  enabled = !!value || !!process.env.IMAGE_VISION_DEBUG
}

// 写一条调试日志；开关关闭时为空操作，零开销
// 接受对象或返回对象的函数：传入函数时，仅在开关开启时才调用求值，
// 避免调用方在开关关闭时仍构造参数对象（尤其含 Object.keys 等计算）
export function dbg(objOrFn) {
  if (!enabled) return
  const obj = typeof objOrFn === 'function' ? objOrFn() : objOrFn
  try {
    appendFileSync(LOG_PATH, new Date().toISOString() + ' ' + JSON.stringify(obj) + '\n')
  } catch {}
}
