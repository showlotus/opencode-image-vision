#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createProvider } from './providers/index.js'
import { analyzeSessionImages, MAX_LIMIT } from './analyze.js'

// 环境变量驱动的默认值（仅 MCP 独立模式使用）
const DEFAULT_PROMPT =
  process.env.prompt ||
  [
    'Describe this image in detail, including:',
    'text content, UI layout structure, interface elements, color scheme.',
    'If there are code or technical details, list them thoroughly.',
  ].join(' ')

const DEFAULT_LIMIT = Number(process.env.limit) || 5
const DEFAULT_CONCURRENCY = Number(process.env.concurrency) || 5

let provider
try {
  provider = createProvider()
} catch (e) {
  console.error(`Failed to initialize provider: ${e.message}`)
  process.exit(1)
}

const server = new McpServer({
  name: 'image-vision',
  version: '1.0.3',
})

server.tool(
  'analyze_images',
  'Read images from OpenCode session database and analyze them via a vision AI provider. Returns text descriptions for each image found.',
  {
    session_id: z.string().describe('OpenCode session ID (e.g. ses_xxx)'),
    prompt: z.string().optional().describe('Custom analysis prompt. Defaults to a detailed description prompt.'),
    limit: z.number().int().positive().max(MAX_LIMIT).optional().describe(`Maximum number of images to analyze. Default: ${DEFAULT_LIMIT}.`),
  },
  async ({ session_id, prompt, limit: userLimit }) => {
    const result = await analyzeSessionImages(provider, session_id, {
      prompt: prompt || DEFAULT_PROMPT,
      limit: userLimit || DEFAULT_LIMIT,
      concurrency: DEFAULT_CONCURRENCY,
    })
    return {
      content: [{ type: 'text', text: result.text }],
      isError: !result.ok,
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
