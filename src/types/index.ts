// ============ 存档主表 ============
export interface Archive {
  id?: number
  title: string
  createdAt: number
  selectedApiId?: number
  memoryApiId?: number
  promptStory: string
  promptSummary: string
  worldSetting: string
  writingStyle: string
  outputLimit: string
  privateConfigs: CustomConfigItem[]
  worldConfigs: CustomConfigItem[]
  referencedSystemConfigKeys: number[]
  referencedSystemRoleIds: number[]
  memory: MemoryData
  tokenStats: TokenStats
}

export interface MemoryData {
  currentStatus: string
  plotLine: string
  characterRelations: string
  pendingIssues: string
  keyInfo: string
}

export interface TokenStats {
  missCost: number
  hitCost: number
  outputCost: number
}

export interface CustomConfigItem {
  key: string
  value: string
  remark: string
}

// ============ 消息表 ============
export interface Message {
  id?: number
  archiveId: number
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  summaryStatus: '未操作' | '已总结' | '已跳过'
}

// ============ API配置表 ============
export interface ApiConfig {
  id?: number
  name: string
  baseUrl: string
  apiKey: string
  model: string
  modelsList: string[]
  temperature: number
  sortOrder: number
}

// ============ 系统配置表 ============
export interface SystemConfigItem {
  id?: number
  key: string
  value: string
  remark: string
  sortOrder: number
  createdAt: number
}

// ============ 渲染相关 ============
export interface ParsedBlock {
  type: 'announcement' | 'dialog' | 'narration' | 'action'
  content: string
  speaker?: string
}

export interface RenderedSegment {
  type: 'hidden' | 'dialog' | 'normal'
  content: string
}

export interface TokenUsage {
  promptTokens: number
  cachedTokens: number
  completionTokens: number
}

// ============ 角色表 ============
export interface CharacterRole {
  id?: number
  name: string
  age: string
  gender: string
  personality: string
  specialAbilities: string
  preferences: string
  intro: string
  family: string
  specialNotes: string
  images: string[]
  createdAt: number
  updatedAt: number
  sortOrder: number
  archiveId?: number
}
