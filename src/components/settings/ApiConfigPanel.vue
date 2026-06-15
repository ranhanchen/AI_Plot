<script setup lang="ts">
import { ref, onMounted, toRaw, nextTick, computed } from 'vue'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import { useLLM } from '@/composables/useLLM'
import type { ApiConfig } from '@/types'
import { Plus } from 'lucide-vue-next'
import ApiConfigItem from './ApiConfigItem.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const appStore = useAppStore()
const { fetchModels } = useLLM()

const configs = ref<ApiConfig[]>([])
const expandedId = ref<number | null>(null)
const deleteTarget = ref<number | null>(null)
const pendingDeletes = ref<Set<number>>(new Set())
const pendingAdds = ref<ApiConfig[]>([])
const fetchingModelId = ref<number | null>(null)
const testingModelId = ref<number | null>(null)
const listBottom = ref<HTMLElement | null>(null)
const dirty = ref(false)
let tempIdCounter = -1

async function loadConfigs() {
  const fromDb = await db.apiConfigs.toArray()
  configs.value = fromDb
  pendingDeletes.value = new Set()
  pendingAdds.value = []
  dirty.value = false
}

function addConfig() {
  const newCfg: ApiConfig = {
    id: tempIdCounter--,
    name: '新配置',
    baseUrl: '',
    apiKey: '',
    model: '',
    modelsList: [],
    temperature: 0.8,
  }
  pendingAdds.value.push(newCfg)
  configs.value.push(newCfg)
  dirty.value = true
  expandedId.value = newCfg.id!
  nextTick(() => {
    listBottom.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function updateConfig(config: ApiConfig) {
  const idx = configs.value.findIndex(c => c.id === config.id)
  if (idx !== -1) {
    configs.value[idx] = { ...config }
    dirty.value = true
  }
}

function requestDelete(id: number) {
  deleteTarget.value = id
}

function confirmDelete() {
  if (deleteTarget.value === null) return
  const id = deleteTarget.value
  if (id < 0) {
    pendingAdds.value = pendingAdds.value.filter(c => c.id !== id)
  } else {
    pendingDeletes.value = new Set(pendingDeletes.value).add(id)
  }
  configs.value = configs.value.filter(c => c.id !== id)
  dirty.value = true
  if (expandedId.value === id) expandedId.value = null
  deleteTarget.value = null
}

async function handleFetchModels(config: ApiConfig) {
  if (!config.baseUrl || !config.apiKey) {
    appStore.showToast('请先填写 Base URL 和 API Key', 'error')
    return
  }
  fetchingModelId.value = config.id!
  try {
    const models = await fetchModels(config.baseUrl, config.apiKey)
    const idx = configs.value.findIndex(c => c.id === config.id)
    if (idx !== -1) {
      configs.value[idx] = { ...configs.value[idx], modelsList: models, model: models[0] || config.model }
    }
    appStore.showToast('模型列表已更新', 'success')
  } catch {
    appStore.showToast('获取模型列表失败', 'error')
  } finally {
    fetchingModelId.value = null
  }
}

async function handleTest(config: ApiConfig) {
  if (!config.baseUrl || !config.apiKey) {
    appStore.showToast('请先填写 Base URL 和 API Key', 'error')
    return
  }
  testingModelId.value = config.id!
  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    })
    if (response.ok) {
      appStore.showToast('连接测试成功', 'success')
    } else {
      const err = await response.text()
      appStore.showToast(`连接失败: ${response.status} ${err.substring(0, 80)}`, 'error')
    }
  } catch {
    appStore.showToast('网络请求失败，请检查 Base URL', 'error')
  } finally {
    testingModelId.value = null
  }
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

async function save() {
  for (const id of pendingDeletes.value) {
    await db.apiConfigs.delete(id)
  }
  for (const cfg of configs.value) {
    const raw = toRaw(cfg)
    if (raw.id! < 0) {
      const { id, ...rest } = raw
      await db.apiConfigs.add(JSON.parse(JSON.stringify(rest)) as ApiConfig)
    } else {
      await db.apiConfigs.update(raw.id!, JSON.parse(JSON.stringify(raw)))
    }
  }
  dirty.value = false
  await loadConfigs()
}

const isDirty = computed(() => dirty.value)

defineExpose({ save, loadConfigs, isDirty })

onMounted(() => {
  loadConfigs()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
      <h2 class="text-base font-semibold section-title">API 配置</h2>
      <button
        class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-base"
        @click="addConfig"
      >
        <Plus :size="14" />
        新增
      </button>
    </div>

    <div v-if="configs.length === 0" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
      暂无 API 配置
    </div>

    <ApiConfigItem
      v-for="config in configs"
      :key="config.id"
      :config="config"
      :expanded="expandedId === config.id"
      :fetching="fetchingModelId === config.id"
      :testing="testingModelId === config.id"
      @toggle="toggleExpand(config.id!)"
      @update="updateConfig"
      @delete="(id) => requestDelete(id)"
      @fetch-models="handleFetchModels"
      @test="handleTest"
    />

    <div ref="listBottom" />

    <ConfirmModal
      :visible="deleteTarget !== null"
      title="删除 API 配置"
      message="确认删除此 API 配置？此操作不可撤销。"
      confirm-text="删除"
      :danger="true"
      @confirm="confirmDelete()"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
