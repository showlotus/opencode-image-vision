#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { getDatabase, getImages } from './db.js'
import { createProvider } from './providers/index.js'

const DEFAULT_PROMPT =
  process.env.prompt ||
  [
    'Describe this image in detail, including:',
    'text content, UI layout structure, interface elements, color scheme.',
    'If there are code or technical details, list them thoroughly.',
  ].join(' ')

const DEFAULT_LIMIT = Number(process.env.limit) || 5
const MAX_LIMIT = Number(process.env.max_limit) || 20

let provider
try {
  provider = createProvider()
} catch (e) {
  console.error(`Failed to initialize provider: ${e.message}`)
  process.exit(1)
}

const server = new McpServer({
  name: 'image-vision',
  version: '1.0.0',
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
    const limit = userLimit || DEFAULT_LIMIT
    const analysisPrompt = prompt || DEFAULT_PROMPT

    let db
    try {
      db = getDatabase()
    } catch (e) {
      return {
        content: [{ type: 'text', text: `Failed to open database: ${e.message}` }],
        isError: true,
      }
    }

    try {
      const images = getImages(db, session_id, limit)
      if (!images.length) {
        return {
          content: [{ type: 'text', text: `No images found in session ${session_id}.` }],
        }
      }

      const results = []
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        try {
          const desc = await provider.analyze(img.base64, img.mime, analysisPrompt)
          results.push(`### Image ${i + 1}: ${img.filename}\n\n${desc}`)
        } catch (e) {
          results.push(`### Image ${i + 1}: ${img.filename}\n\n[Analysis failed: ${e.message}]`)
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Analyzed ${images.length} image(s):\n\n${results.join('\n\n---\n\n')}`,
          },
        ],
      }
    } finally {
      db.close()
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
