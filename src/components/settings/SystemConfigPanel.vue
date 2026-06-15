<script setup lang="ts">
import { ref, onMounted, toRaw, nextTick, computed } from 'vue'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import type { SystemConfigItem } from '@/types'
import { Plus, Trash2, ChevronDown, X } from 'lucide-vue-next'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const appStore = useAppStore()
const items = ref<SystemConfigItem[]>([])

const DEFAULT_ITEM_KEYS = new Set(['AI 剧情推动提示词', 'AI 总结提示词'])

const DEFAULT_ITEMS: { key: string; value: string }[] = [
  {
    key: 'AI 剧情推动提示词',
    value: '你是一个专业的剧情跑团主持人（GM）。请根据用户的行动和选择，推进剧情发展。\n\n【回复格式要求】\n你的每次回复必须严格遵循以下格式来组织内容，不同类型的段落使用不同的前缀标记：\n\n1. 系统公告：以 [系统公告] 开头，用于提示重要的系统信息（如属性变化、状态异常、章节标题等）\n   示例：[系统公告]你的生命值减少了5点\n\n2. 角色对话：以 角色名说： 开头，用于角色的台词\n   示例：村长说：勇士们，前方就是龙穴了\n\n3. 动作描写：以 [动作] 开头，用于描述角色的具体行为\n   示例：[动作]他缓缓拔出腰间的长剑\n\n4. 场景旁白：不加任何前缀，用于环境描写、氛围渲染、剧情推进等叙述性内容\n   示例：夕阳将城堡染成了血红色，远处传来低沉的雷鸣\n\n【主持要求】\n1. 营造沉浸式的场景氛围，用生动的描写让玩家身临其境\n2. 合理控制剧情节奏，适时引入冲突、悬念和转折\n3. 扮演所有NPC角色，每个角色需有鲜明的性格和对话风格\n4. 对玩家的行动做出合理的反应，保持世界的逻辑自洽\n5. 在关键节点提供有意义的选择，让玩家推动故事走向',
  },
  {
    key: 'AI 总结提示词',
    value: '请对以下对话内容进行要点总结，按以下格式输出（每个字段以"当前状态："、"完整剧情脉络："、"出现过的角色："、"关键角色关系："、"关键信息："开头）：\n\n当前状态：简要描述当前场景和角色的即时状态\n完整剧情脉络：梳理剧情发展的关键节点\n出现过的角色：列出所有出场角色及其简要特征\n关键角色关系：记录角色之间的重要关系变化\n关键信息：提取可能影响后续剧情的重要情报',
  },
]

function isDefaultKey(key: string): boolean {
  return DEFAULT_ITEM_KEYS.has(key)
}

const expandedId = ref<number | null>(null)
const deleteTarget = ref<number | null>(null)
const pendingDeletes = ref<Set<number>>(new Set())
const dirty = ref(false)

const showAddForm = ref(false)
const newKey = ref('')
const newValue = ref('')
const pendingAdds = ref<SystemConfigItem[]>([])
const listBottom = ref<HTMLElement | null>(null)
let tempIdCounter = -1

async function loadItems() {
  let fromDb = await db.systemConfigs.toArray()

  for (const old of fromDb) {
    if (old.key === '大模型剧情推动提示词' || old.key === '大模型总结提示词') {
      if (old.id) await db.systemConfigs.delete(old.id)
    }
  }
  fromDb = fromDb.filter(i => i.key !== '大模型剧情推动提示词' && i.key !== '大模型总结提示词')

  for (const d of DEFAULT_ITEMS) {
    if (!fromDb.some(i => i.key === d.key)) {
      const id = await db.systemConfigs.add({
        key: d.key,
        value: d.value,
        createdAt: Date.now(),
      } as SystemConfigItem)
      fromDb.push({ id, key: d.key, value: d.value, createdAt: Date.now() } as SystemConfigItem)
    }
  }

  fromDb.sort((a, b) => {
    const aIsDefault = isDefaultKey(a.key) ? 1 : 0
    const bIsDefault = isDefaultKey(b.key) ? 1 : 0
    if (aIsDefault !== bIsDefault) return bIsDefault - aIsDefault
    return b.createdAt - a.createdAt
  })

  items.value = fromDb
  pendingDeletes.value = new Set()
  pendingAdds.value = []
  dirty.value = false
}

function addItem() {
  if (!newKey.value.trim()) return
  const newItem: SystemConfigItem = {
    id: tempIdCounter--,
    key: newKey.value.trim(),
    value: newValue.value,
    createdAt: Date.now(),
  }
  pendingAdds.value.push(newItem)
  items.value.push(newItem)
  dirty.value = true
  showAddForm.value = false
  newKey.value = ''
  newValue.value = ''
  expandedId.value = newItem.id!
  nextTick(() => {
    listBottom.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function updateItem(item: SystemConfigItem) {
  const idx = items.value.findIndex(i => i.id === item.id)
  if (idx !== -1) {
    items.value[idx] = { ...item }
    dirty.value = true
  }
}

function requestDelete(id: number) {
  deleteTarget.value = id
}

function confirmDelete() {
  if (deleteTarget.value === null) return
  const id = deleteTarget.value
  const targetItem = items.value.find(i => i.id === id)
  if (targetItem && isDefaultKey(targetItem.key)) {
    deleteTarget.value = null
    return
  }
  if (id < 0) {
    pendingAdds.value = pendingAdds.value.filter(c => c.id !== id)
  } else {
    pendingDeletes.value = new Set(pendingDeletes.value).add(id)
  }
  items.value = items.value.filter(i => i.id !== id)
  dirty.value = true
  if (expandedId.value === id) expandedId.value = null
  deleteTarget.value = null
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

async function save() {
  for (const id of pendingDeletes.value) {
    await db.systemConfigs.delete(id)
  }
  for (const item of items.value) {
    const raw = toRaw(item)
    if (raw.id! < 0) {
      const { id, ...rest } = raw
      await db.systemConfigs.add(JSON.parse(JSON.stringify(rest)) as SystemConfigItem)
    } else {
      await db.systemConfigs.update(raw.id!, { key: raw.key, value: raw.value })
    }
  }
  dirty.value = false
  await loadItems()
}

const isDirty = computed(() => dirty.value)

defineExpose({ save, loadItems, isDirty })

onMounted(() => {
  loadItems()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
      <h2 class="text-base font-semibold section-title">系统配置项</h2>
      <button
        class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-base"
        @click="showAddForm = true; expandedId = null"
      >
        <Plus :size="14" />
        添加
      </button>
    </div>

    <div v-if="items.length === 0 && !showAddForm" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
      暂无系统配置项
    </div>

    <div
      v-for="item in items"
      :key="item.id"
      :class="[
        'border rounded-lg overflow-hidden transition-shadow',
        expandedId === item.id ? 'border-[var(--color-accent)]/30 shadow-sm' : 'border-[var(--color-border)] hover:shadow-sm'
      ]"
    >
      <div
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
        @click="toggleExpand(item.id!)"
      >
        <span class="font-semibold text-sm">{{ item.key }}</span>
        <div class="flex items-center gap-2">
          <button
            v-if="!isDefaultKey(item.key)"
            class="text-red-400 hover:text-red-600 transition-colors"
            @click.stop="requestDelete(item.id!)"
          >
            <Trash2 :size="16" />
          </button>
          <ChevronDown
            :size="16"
            class="text-[var(--color-text-muted)] transition-transform duration-200"
            :class="{ 'rotate-180': expandedId === item.id }"
          />
        </div>
      </div>
      <div v-if="expandedId === item.id" class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3 bg-[var(--color-surface-hover)]/30">
        <div>
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
          <input
            :value="item.key"
            type="text"
            :readonly="isDefaultKey(item.key)"
            :class="['w-full rounded-lg px-3 py-1.5 border transition-shadow text-sm', isDefaultKey(item.key) ? 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] cursor-not-allowed border-[var(--color-border)]' : 'bg-[var(--color-bg)] border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none']"
            placeholder="配置名称"
            @input="(e) => { item.key = (e.target as HTMLInputElement).value; updateItem(item) }"
          />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
          <textarea
            :value="item.value"
            class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
            placeholder="配置内容"
            @input="(e) => { item.value = (e.target as HTMLTextAreaElement).value; updateItem(item) }"
          />
        </div>
      </div>
    </div>

    <div v-if="showAddForm" class="border border-[var(--color-accent)] rounded-lg overflow-hidden">
      <div class="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg)]">
        <span class="font-semibold text-sm text-[var(--color-accent)]">新建配置</span>
        <button
          class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          @click="showAddForm = false; newKey = ''; newValue = ''"
        >
          <X :size="16" />
        </button>
      </div>
      <div class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
        <div>
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
          <input
            v-model="newKey"
            type="text"
            class="w-full bg-[var(--color-surface)] rounded-lg px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none transition-shadow text-sm"
            placeholder="配置名称"
          />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
          <textarea
            v-model="newValue"
            class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize
            placeholder="配置内容"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs"
            @click="showAddForm = false; newKey = ''; newValue = ''"
          >
            取消
          </button>
          <button
            class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-xs"
            :disabled="!newKey.trim()"
            @click="addItem()"
          >
            添加
          </button>
        </div>
      </div>
    </div>

    <div ref="listBottom" />

    <ConfirmModal
      :visible="deleteTarget !== null"
      title="删除系统配置"
      message="确认删除此系统配置？此操作不可撤销。"
      confirm-text="删除"
      :danger="true"
      @confirm="confirmDelete()"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
