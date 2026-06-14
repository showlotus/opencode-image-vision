// 并发执行任务，控制最大并发数，结果按原顺序返回
export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0

  // 单个执行器：循环领取下一个未处理的任务，直到全部完成
  const run = async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  }

  // 启动不超过任务数量的并发执行器
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  )
  return results
}
