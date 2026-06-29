import { db } from '@/db'
import { useSessionStore } from '@/stores/session'
import { useAppStore } from '@/stores/app'
import type { Archive, CharacterRole, Message, TokenUsage } from '@/types'

async function buildSystemPrompt(archiveId: number): Promise<string> {
  const archive = await db.archives.get(archiveId)
  if (!archive) return ''

  const parts: string[] = []

  if (archive.promptStory) parts.push(archive.promptStory)

  const systemConfigs = await db.systemConfigs.bulkGet(archive.referencedSystemConfigKeys)
  for (const sysCfg of systemConfigs) {
    if (sysCfg) {
      parts.push(`【${sysCfg.key}】\n${sysCfg.value}`)
    }
  }

  for (const cfg of archive.privateConfigs) {
    parts.push(`【${cfg.key}】\n${cfg.value}`)
  }

  if (archive.worldSetting) parts.push(`【初始世界观】\n${archive.worldSetting}`)

  for (const cfg of archive.worldConfigs) {
    parts.push(`【${cfg.key}】\n${cfg.value}`)
  }

  const roles: CharacterRole[] = []

  const referencedRolesResult = await db.characterRoles.bulkGet(archive.referencedSystemRoleIds)
  for (const role of referencedRolesResult) {
    if (role) roles.push(role)
  }

  const archiveRoles = await db.characterRoles.where({ archiveId }).toArray()
  archiveRoles.sort((a, b) => b.sortOrder - a.sortOrder)
  for (const role of archiveRoles) {
    if (!roles.some(r => r.id === role.id)) {
      roles.push(role)
    }
  }

  if (roles.length > 0) {
    const roleTexts: string[] = []
    for (const role of roles) {
      const fields: string[] = []
      fields.push(`【角色名称】${role.name}`)
      if (role.age) fields.push(`年龄：${role.age}`)
      if (role.gender) fields.push(`性别：${role.gender}`)
      if (role.identity) fields.push(`身份定位：${role.identity}`)
      if (role.background) fields.push(`背景故事：${role.background}`)
      if (role.appearance) fields.push(`形象与气质：${role.appearance}`)
      if (role.personalityPreferences) fields.push(`性格与喜好：${role.personalityPreferences}`)
      if (role.keyLines) fields.push(`关键台词意象：${role.keyLines}`)
      if (role.abilities) fields.push(`能力：${role.abilities}`)
      roleTexts.push(fields.join('\n'))
    }
    parts.push(`【角色设定】\n${roleTexts.join('\n\n')}`)
  }

  const mem = archive.memory
  if (mem.currentStatus || mem.plotLine || mem.characterRelations || mem.pendingIssues || mem.keyInfo) {
    parts.push(`【当前剧情记忆】
[当前状态]${mem.currentStatus}
[完整剧情进展]${mem.plotLine}
[完整角色关系]${mem.characterRelations}
[待解决问题]${mem.pendingIssues}
[关键信息]${mem.keyInfo}`)
  }

  return parts.join('\n\n')
}

async function buildHistory(archiveId: number) {
  const messages = await db.messages
    .where({ archiveId, summaryStatus: '未操作' })
    .sortBy('timestamp')

  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }))
}

export async function callLLM(
  archiveId: number,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  apiId?: number
): Promise<{ content: string; usage: TokenUsage }> {
  const sessionStore = useSessionStore()
  const resolvedApiId = apiId ?? (sessionStore.selectedApiId ?? undefined)
  const apiConfig = resolvedApiId !== undefined ? await db.apiConfigs.get(resolvedApiId) : undefined

  if (!apiConfig) throw new Error('未选择 API 配置')

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ]

  const response = await fetch(`${apiConfig.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      temperature: apiConfig.temperature,
      messages,
    }),
  })

  if (!response.ok) throw new Error(`API 请求失败: ${response.status}`)

  const data = await response.json()

  return {
    content: data.choices[0].message.content,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    },
  }
}

export function useLLM() {
  async function executeAiInference(archiveId: number, appendContent?: string) {
    const sessionStore = useSessionStore()
    const appStore = useAppStore()

    sessionStore.startGenerating()

    try {
      const systemPrompt = await buildSystemPrompt(archiveId)
      const history = await buildHistory(archiveId)
      if (appendContent) {
        history.push({ role: 'user', content: appendContent })
      }
      const result = await callLLM(archiveId, systemPrompt, history)

      const aiMsgId = await db.messages.add({
        archiveId,
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
        summaryStatus: '未操作',
      })

      const archive = await db.archives.get(archiveId)
      if (archive) {
        await db.archives.update(archiveId, {
          tokenStats: {
            missCost: archive.tokenStats.missCost + (result.usage.promptTokens - result.usage.cachedTokens),
            hitCost: archive.tokenStats.hitCost + result.usage.cachedTokens,
            outputCost: archive.tokenStats.outputCost + result.usage.completionTokens,
          }
        })
      }

      return aiMsgId
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI 请求失败，请重试'
      appStore.showToast(msg, 'error')
      throw error
    } finally {
      sessionStore.stopGenerating()
    }
  }

  async function callSummaryLLM(
    archiveId: number,
    selectedMessages: Message[],
    existingMemory: Archive['memory']
  ) {
    const archive = await db.archives.get(archiveId)
    const summaryPrompt = archive?.promptSummary || '请对以下内容进行总结。'

    const selectedContent = selectedMessages.map(m =>
      `[${m.role === 'user' ? '用户' : 'AI'}]: ${m.content}`
    ).join('\n\n')

    const existingMemoryText = `
[当前状态]${existingMemory.currentStatus}
[完整剧情进展]${existingMemory.plotLine}
[完整角色关系]${existingMemory.characterRelations}
[待解决问题]${existingMemory.pendingIssues}
[关键信息]${existingMemory.keyInfo}`

    const userContent = `【现有记忆】\n${existingMemoryText}\n\n【新对话内容】\n${selectedContent}`

    const sessionStore = useSessionStore()
    const appStore = useAppStore()
    sessionStore.startGenerating()

    try {
      const apiId = archive?.memoryApiId ?? (sessionStore.selectedApiId ?? undefined)
      const result = await callLLM(archiveId, summaryPrompt, [{ role: 'user', content: userContent }], apiId)
      sessionStore.stopGenerating()
      return parseSummaryResult(result.content)
    } catch (error) {
      sessionStore.stopGenerating()
      const msg = error instanceof Error ? error.message : '总结请求失败'
      appStore.showToast(msg, 'error')
      throw error
    }
  }

  async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })
    if (!response.ok) throw new Error('获取模型列表失败')
    const data = await response.json()
    return (data.data || []).map((m: { id: string }) => m.id)
  }

  return { executeAiInference, callSummaryLLM, fetchModels }
}

function parseSummaryResult(result: string): Archive['memory'] {
  const parts = result.split(/\n(?=\[当前状态\]|\[完整剧情进展\]|\[完整角色关系\]|\[待解决问题\]|\[关键信息\])/)
  const memory: Archive['memory'] = {
    currentStatus: '',
    plotLine: '',
    characterRelations: '',
    pendingIssues: '',
    keyInfo: '',
  }

  for (const part of parts) {
    if (part.startsWith('[当前状态]')) memory.currentStatus = part.replace('[当前状态]', '').trim()
    else if (part.startsWith('[完整剧情进展]')) memory.plotLine = part.replace('[完整剧情进展]', '').trim()
    else if (part.startsWith('[完整角色关系]')) memory.characterRelations = part.replace('[完整角色关系]', '').trim()
    else if (part.startsWith('[待解决问题]')) memory.pendingIssues = part.replace('[待解决问题]', '').trim()
    else if (part.startsWith('[关键信息]')) memory.keyInfo = part.replace('[关键信息]', '').trim()
  }

  return memory
}
