<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import { useLLM } from '@/composables/useLLM'
import type { ApiConfig, Archive, Message } from '@/types'
import { ArrowLeft, ChevronDown, Save } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { callSummaryLLM } = useLLM()

const archiveId = Number(route.params.id)
const archive = ref<Archive | null>(null)

// 记忆编辑框
const currentStatus = ref('')
const plotLine = ref('')
const characterRelations = ref('')
const pendingIssues = ref('')
const keyInfo = ref('')

// 记忆 API 选择器
const apiConfigs = ref<ApiConfig[]>([])
const memoryApiName = ref('未选择 API')
const showApiDropdown = ref(false)

async function loadApiConfigs() {
  apiConfigs.value = await db.apiConfigs.toArray()
  if (archive.value?.memoryApiId) {
    const cfg = apiConfigs.value.find(c => c.id === archive.value!.memoryApiId)
    if (cfg) memoryApiName.value = cfg.name
  }
}

function selectMemoryApi(config: ApiConfig) {
  memoryApiName.value = config.name
  showApiDropdown.value = false
  db.archives.update(archiveId, { memoryApiId: config.id })
}

function toggleApiDropdown() {
  showApiDropdown.value = !showApiDropdown.value
  if (showApiDropdown.value) loadApiConfigs()
}

function onApiBlur() {
  setTimeout(() => { showApiDropdown.value = false }, 200)
}

// 未操作消息列表
const messages = ref<Message[]>([])
const selectedIndices = ref<Set<number>>(new Set())
const summarizing = ref(false)

async function loadData() {
  const a = await db.archives.get(archiveId)
  if (!a) { router.replace('/'); return }
  archive.value = a
  await loadApiConfigs()

  currentStatus.value = a.memory.currentStatus
  plotLine.value = a.memory.plotLine
  characterRelations.value = a.memory.characterRelations
  pendingIssues.value = a.memory.pendingIssues
  keyInfo.value = a.memory.keyInfo

  messages.value = await db.messages
    .where('[archiveId+summaryStatus]')
    .equals([archiveId, '未操作'])
    .sortBy('timestamp')
}

function toggleMessage(index: number) {
  const newSet = new Set(selectedIndices.value)
  if (newSet.has(index)) {
    // 仅取消选中该消息
    newSet.delete(index)
  } else {
    // 选中该消息及之前所有未选中的消息
    for (let i = 0; i <= index; i++) {
      newSet.add(i)
    }
  }
  selectedIndices.value = newSet
}

function isSkipped(index: number): boolean {
  if (selectedIndices.value.has(index)) return false
  return [...selectedIndices.value].some(si => si > index)
}

async function handleSummarize() {
  if (selectedIndices.value.size === 0) {
    appStore.showToast('请先选择需要总结的消息', 'error')
    return
  }

  const selectedMsgs = [...selectedIndices.value]
    .sort((a, b) => a - b)
    .map(i => messages.value[i])

  summarizing.value = true
  try {
    const result = await callSummaryLLM(archiveId, selectedMsgs, {
      currentStatus: currentStatus.value,
      plotLine: plotLine.value,
      characterRelations: characterRelations.value,
      pendingIssues: pendingIssues.value,
      keyInfo: keyInfo.value,
    })

    currentStatus.value = result.currentStatus || currentStatus.value
    plotLine.value = result.plotLine || plotLine.value
    characterRelations.value = result.characterRelations || characterRelations.value
    pendingIssues.value = result.pendingIssues || pendingIssues.value
    keyInfo.value = result.keyInfo || keyInfo.value

    appStore.showToast('AI 总结完成，请检查并保存', 'success')
  } catch {
    // 错误已在 callSummaryLLM 中处理
  } finally {
    summarizing.value = false
  }
}

async function handleSave() {
  if (!archive.value) return

  // 保存记忆
  await db.archives.update(archiveId, {
    memory: {
      currentStatus: currentStatus.value,
      plotLine: plotLine.value,
      characterRelations: characterRelations.value,
      pendingIssues: pendingIssues.value,
      keyInfo: keyInfo.value,
    }
  })

  // 状态转换
  const selectedIndicesSet = selectedIndices.value
  for (let i = 0; i < messages.value.length; i++) {
    const msg = messages.value[i]
    if (selectedIndicesSet.has(i)) {
      await db.messages.update(msg.id!, { summaryStatus: '已总结' })
    } else if ([...selectedIndicesSet].some(si => si > i)) {
      await db.messages.update(msg.id!, { summaryStatus: '已跳过' })
    }
  }

  appStore.showToast('记忆保存成功', 'success')
  await loadData()
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 顶部栏 -->
    <header class="flex items-center gap-4 px-4 py-3 page-header shrink-0">
      <button
        class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        @click="router.back()"
      >
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-base font-semibold flex-1">存档记忆</h1>
      <button
        class="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm hover:opacity-90 transition-colors"
        @click="handleSave"
      >
        <Save :size="16" />
        <span class="hidden sm:inline">保存</span>
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- 记忆编辑区 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">当前状态</label>
        <textarea
          v-model="currentStatus"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
        />
      </div>
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">完整剧情进展</label>
        <textarea
          v-model="plotLine"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
        />
      </div>
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">完整角色关系</label>
        <textarea
          v-model="characterRelations"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
        />
      </div>
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">待解决问题</label>
        <textarea
          v-model="pendingIssues"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
        />
      </div>
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">关键信息</label>
        <textarea
          v-model="keyInfo"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
        />
      </div>

      <!-- 总结模型选择 -->
      <div class="flex items-center gap-3">
        <label class="text-sm sm:text-base font-medium shrink-0">总结模型</label>
        <div class="relative flex-1">
          <button
            class="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] hover:border-[var(--color-accent)] transition-colors"
            @click="toggleApiDropdown"
            @blur="onApiBlur"
          >
            <span class="flex-1 text-left truncate">{{ memoryApiName }}</span>
            <ChevronDown :size="14" class="shrink-0 text-[var(--color-text-muted)]" />
          </button>
          <Transition name="dropdown">
            <div
              v-if="showApiDropdown"
              class="absolute left-0 right-0 top-full mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto"
            >
              <div
                v-for="cfg in apiConfigs"
                :key="cfg.id"
                :class="[
                  'px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors',
                  cfg.id === archive?.memoryApiId ? 'text-[var(--color-accent)] font-medium bg-[var(--color-accent)]/5' : 'text-[var(--color-text-primary)]'
                ]"
                @click="selectMemoryApi(cfg)"
              >
                {{ cfg.name }}
              </div>
              <div v-if="apiConfigs.length === 0" class="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
                暂无 API 配置
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- AI 总结按钮 -->
      <button
        style="width: 95%" class="py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm block mx-auto"
        :disabled="summarizing"
        @click="handleSummarize"
      >
        {{ summarizing ? '总结中...' : 'AI 总结' }}
      </button>

      <!-- 对话消息选择列表 -->
      <div>
        <h3 class="text-sm sm:text-base font-medium mb-2">
          对话消息（未操作: {{ messages.length }} | 已选中: {{ selectedIndices.size }}）
        </h3>
        <div v-if="messages.length === 0" class="text-sm sm:text-base text-[var(--color-text-muted)] text-center py-8">
          暂无未操作的消息
        </div>
        <div
          v-for="(msg, i) in messages"
          :key="msg.id"
          :class="[
            'px-3 py-2 rounded-md text-xs border cursor-pointer transition-colors mb-1',
            selectedIndices.has(i)
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
              : isSkipped(i)
                ? 'border-[#c5c1ba] bg-[#f2f0ed] text-[#b0a9a3]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
          ]"
          @click="toggleMessage(i)"
        >
          <span class="text-xs text-[var(--color-text-muted)] mr-2">{{ msg.role === 'user' ? '用户' : 'AI' }}</span>
          {{ msg.content.substring(0, 50) }}{{ msg.content.length > 50 ? '...' : '' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
