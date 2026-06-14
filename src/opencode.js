import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Provider ID → base URL mapping
// Future providers can be added here
const PROVIDER_REGISTRY = {
  'zhipuai-coding-plan': { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
  'zai-coding-plan':     { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
  'z-ai':                { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
  'zhipuai':             { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
};

export function resolveProviderConfig(providerId, modelId) {
  // 从 account.json 中读取 API key
  const accountPath = join(homedir(), '.local', 'share', 'opencode', 'account.json');
  const accountJson = JSON.parse(readFileSync(accountPath, 'utf-8'));
  const accountId = accountJson.active?.[providerId];
  if (!accountId) throw new Error(`Provider "${providerId}" not found in account.json active list`);
  const account = accountJson.accounts?.[accountId];
  if (!account) throw new Error(`Account ${accountId} not found for provider "${providerId}"`);
  const apiKey = account.credential?.key;
  if (!apiKey) throw new Error(`No API key found for provider "${providerId}"`);

  // 从注册表中查找 base URL
  const registry = PROVIDER_REGISTRY[providerId];
  if (!registry) throw new Error(`Provider "${providerId}" not in PROVIDER_REGISTRY. Available: ${Object.keys(PROVIDER_REGISTRY).join(', ')}. Please add it to src/opencode.js`);

  return {
    apiKey,
    baseUrl: registry.baseUrl,
    model: modelId,
  };
}
