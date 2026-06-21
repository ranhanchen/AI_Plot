<script setup lang="ts">
import { ref, onMounted, toRaw, nextTick, computed } from 'vue'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import { useDefaultConfigs } from '@/composables/useDefaultConfigs'
import type { SystemConfigItem } from '@/types'
import { Plus, Trash2, ChevronDown, X } from 'lucide-vue-next'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const appStore = useAppStore()
const { defaultIds, isDefaultId, loadDefaultIds } = useDefaultConfigs()
const items = ref<SystemConfigItem[]>([])

const DEFAULT_ITEMS: { key: string; value: string; remark: string }[] = [
  {
    key: '底层设定与核心身份',
    remark: 'AI 剧情推动提示词',
    value: '你是一个专业的文字冒险游戏叙述者。请严格遵循设定来构建沉浸式的互动故事体验。\n用户输入代表主角的行动和对话或者剧情的发展。请根据用户的行动和选择，推进剧情发展。\n\n【回复格式要求】\n你的每次回复必须严格遵循以下格式来组织内容，不同类型的段落使用不同的前缀标记。并非每一类型都必须输出，需按照情况而定：\n\n1. 系统公告：以 [系统公告] 开头，用于提示重要的系统信息（如属性变化、状态异常、章节标题等）\n   示例：[系统公告]你的生命值减少了5点\n\n2. 角色对话：以 角色名说： 开头，用于角色的台词\n   示例：村长说：勇士们，前方就是龙穴了\n\n3. 动作描写：以 [动作] 开头，用于描述角色的具体行为\n   示例：[动作]他缓缓拔出腰间的长剑\n\n4. 场景旁白：不加任何前缀，用于环境描写、氛围渲染、剧情推进等叙述性内容\n   示例：夕阳将城堡染成了血红色，远处传来低沉的雷鸣\n\n你应该自然描述用户描述的动作。【铁则】\n1. 需要注意你要输出的各个角色的状态、位置等。比如已故的人、其他位置的人，不要突然没有前言的出现，必须有Ta出现的过程和合理的剧情。\n2. 且剧情不要推动的太快，每次回复中，都应该只包括有限的事情。\n3. 若用户没有要求只描述此段剧情，则自动在最后继续向后推动你所扮演角色的行为。\n4. 但用户的行为不要推动，应当让用户自己提出和执行。\n5. 每次结尾都应该是需要用户做出反应的位置，引导用户做出决断。\n5. 禁止额外操作：禁止进行要求以外的内容。禁止发出任何无关的冗余文本、废话、前缀等。禁止使用json格式、markdown形式\n6.用中文输出。',
  },
  {
    key: '底层设定与核心身份',
    remark: 'AI 总结提示词',
    value: '你是一个专业的角色扮演游戏记忆压缩引擎，采用"累积式记忆"原则工作。你需要将【前次摘要】与【最新对话】进行全量合并，生成一份覆盖从故事开始到现在的完整结构化摘要。旧摘要里的信息必须被完全保留，绝不能因为是历史而被丢弃。\n\n【输出格式要求】\n请将【前次摘要】与【最新对话】两部分融为一体，输出一个全新的摘要。你的回复必须严格遵循以下格式来完整地组织内容，不同类型的段落使用不同的前缀标记：\n\n1. 当前状态：以 [当前状态] 开头，用于描述主角当前的位置、状态、持有的物品（需结合前次摘要与最新进展）\n   示例：[当前状态]主角位于村长家中，手持生锈的铁剑，生命值健康\n\n2. 完整剧情进展：以 [完整剧情进展] 开头，按时间顺序将从故事开端至今的所有关键事件、转折点和重要对话全部列出\n   - 必须把前次摘要中已记录的剧情节点重新写入，前次摘要禁止省略、修改、删除、改变\n   - 再将最新对话中的新事件无缝续接其后，形成连贯的完整剧情链\n   - 绝不允许只写新事件而让历史剧情消失\n   - 新事件必须保持简洁，禁止直接使用原文，并保证关键信息完整。每一段剧情总结不可超过200个汉字\n   示例：[完整剧情进展]1.主角在酒馆遇到神秘老人，接受了寻找龙鳞的任务。2.主角前往迷雾森林，在途中击败了狼群。\n\n3. 完整角色关系：以 [完整角色关系] 开头，列出主角与所有已出场NPC之间的关系\n   - 必须将前次摘要中出现过的所有NPC及其关系完整迁移到新摘要中\n   - 并根据最新对话更新关系变化或补充新角色。任何在前次摘要中出现过的NPC都不允许遗漏\n   示例：[完整角色关系]主角与村长是委托关系，与铁匠是朋友关系，与神秘老人是任务委托关系\n\n4. 待解决问题：以 [待解决问题] 开头，继承前次摘要中所有未解决的任务、谜题或冲突，并结合最新对话更新其状态（如已解决、新增、进展等）\n   示例：[待解决问题]寻找龙鳞（进行中）、调查村庄失踪事件（未开始）\n\n5. 关键信息：以 [关键信息] 开头，合并前次摘要中已记录的重要细节，以及最新对话里揭示的可能影响未来剧情的信息\n   示例：[关键信息]龙鳞位于迷雾森林深处，由一只远古巨龙守护；村长似乎隐瞒了某些真相\n\n【铁则】\n1. 全量合并，禁止删史：新摘要必须像从未压缩过一样完整。前次摘要里的任何剧情、人物、线索都禁止丢弃或精简，只能更新或补充\n2. 重写而非追加：不是在旧摘要后面贴上新对话内容，而是以全部已知信息重新组织成一份连贯摘要。但是旧剧情禁止修改，必须完全保持之前的描述，禁止精简、删减、修改\n3. 保持简洁但信息完整：可根据最新消息中各部分剧情的实际篇幅适度调整详略，但不得因此遗漏关键信息\n4. 禁止额外操作：禁止进行要求以外的内容。禁止发出任何无关的冗余文本、废话、前缀等。禁止使用json格式、markdown形式\n5.用中文输出。',
  },
  {
    key: '底层设定与核心身份',
    remark: 'AI 角色生成提示词',
    value: '你是一个角色设定生成器。根据用户的描述，生成一个完整的角色设定。\n请严格按照以下JSON格式返回，不要包含任何其他内容（不要markdown代码块标记）：\n\n{\n  "name": "角色名字",\n  "age": "年龄",\n  "gender": "性别",\n  "identity": "身份定位",\n  "background": "背景故事",\n  "appearance": "形象与气质",\n  "personalityPreferences": "性格与喜好",\n  "keyLines": "关键台词意象",\n  "abilities": "能力"\n}\n\n如果某个字段用户描述中没有相关信息，请根据上下文合理推断并填写，不要留空。',
  },
]

function isDefaultItem(id: number | undefined): boolean {
  return id != null && isDefaultId(id)
}

const expandedId = ref<number | null>(null)
const deleteTarget = ref<number | null>(null)
const restoreTarget = ref<SystemConfigItem | null>(null)

const showAddForm = ref(false)
const newKey = ref('')
const newValue = ref('')
const newRemark = ref('')
const listBottom = ref<HTMLElement | null>(null)

const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dirtyIds = ref(new Set<number>())

async function loadItems() {
  let fromDb = await db.systemConfigs.toArray()

  const oldKeys = ['大模型剧情推动提示词', '大模型总结提示词', 'AI 剧情推动提示词', 'AI 总结提示词', 'AI 角色生成提示词']
  for (const old of fromDb) {
    if (oldKeys.includes(old.key) && old.id) {
      await db.systemConfigs.delete(old.id)
    }
  }
  fromDb = fromDb.filter(i => !oldKeys.includes(i.key))

  const existingDefaults = fromDb
    .filter(i => i.key === '底层设定与核心身份')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  for (let idx = existingDefaults.length; idx < DEFAULT_ITEMS.length; idx++) {
    const d = DEFAULT_ITEMS[idx]
    const ts = Date.now()
    const id = await db.systemConfigs.add({
      key: d.key,
      value: d.value,
      remark: d.remark,
      sortOrder: ts,
      createdAt: ts,
    } as SystemConfigItem)
    fromDb.push({ id, key: d.key, value: d.value, remark: d.remark, sortOrder: ts, createdAt: ts } as SystemConfigItem)
  }

  for (const item of fromDb) {
    if (!item.remark) item.remark = item.key
    if (item.sortOrder === undefined || item.sortOrder === null) item.sortOrder = item.createdAt
  }

  await loadDefaultIds()

  fromDb.sort((a, b) => {
    const aDef = isDefaultItem(a.id) ? 1 : 0
    const bDef = isDefaultItem(b.id) ? 1 : 0
    if (aDef !== bDef) return bDef - aDef
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return b.createdAt - a.createdAt
  })

  items.value = fromDb
  dirtyIds.value.clear()
}

async function addItem() {
  if (!newKey.value.trim()) return
  const remark = newRemark.value.trim() || newKey.value.trim()
  const ts = Date.now()
  const newItem = {
    key: newKey.value.trim(),
    value: newValue.value,
    remark,
    sortOrder: ts,
    createdAt: ts,
  }
  const newId = await db.systemConfigs.add(JSON.parse(JSON.stringify(newItem)) as SystemConfigItem)
  const saved: SystemConfigItem = { ...newItem, id: newId }
  items.value.push(saved)
  showAddForm.value = false
  newKey.value = ''
  newValue.value = ''
  newRemark.value = ''
  expandedId.value = newId
  nextTick(() => {
    listBottom.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function updateItem(item: SystemConfigItem) {
  const idx = items.value.findIndex(i => i.id === item.id)
  if (idx !== -1) {
    items.value[idx] = { ...item }
    dirtyIds.value.add(item.id!)
  }
}

async function handleSaveItem(item: SystemConfigItem) {
  const raw = toRaw(item)
  if (raw.id! < 0) {
    const { id, ...rest } = raw
    const clean = JSON.parse(JSON.stringify(rest))
    const newId = await db.systemConfigs.add(clean as SystemConfigItem)
    const idx = items.value.findIndex(i => i.id === raw.id)
    if (idx !== -1) items.value[idx] = { ...clean, id: newId }
    if (expandedId.value === raw.id) expandedId.value = newId
  } else {
    await db.systemConfigs.update(raw.id!, { key: raw.key, value: raw.value, remark: raw.remark, sortOrder: raw.sortOrder })
  }
  dirtyIds.value.delete(raw.id!)
  appStore.showToast('配置已保存', 'success')
}

function requestRestore(item: SystemConfigItem) {
  restoreTarget.value = item
}

async function confirmRestore() {
  if (!restoreTarget.value) return
  const id = restoreTarget.value.id
  let defIndex = -1
  if (id != null && id === defaultIds.value.story) defIndex = 0
  else if (id != null && id === defaultIds.value.summary) defIndex = 1
  else if (id != null && id === defaultIds.value.character) defIndex = 2
  if (defIndex >= 0) {
    restoreTarget.value.value = DEFAULT_ITEMS[defIndex].value
    await handleSaveItem(restoreTarget.value)
  }
  restoreTarget.value = null
}

function requestDelete(id: number) {
  deleteTarget.value = id
}

async function confirmDelete() {
  if (deleteTarget.value === null) return
  const id = deleteTarget.value
  const targetItem = items.value.find(i => i.id === id)
  if (targetItem && isDefaultItem(targetItem.id)) {
    deleteTarget.value = null
    return
  }
  if (id > 0) await db.systemConfigs.delete(id)
  items.value = items.value.filter(i => i.id !== id)
  if (expandedId.value === id) expandedId.value = null
  dirtyIds.value.delete(id)
  deleteTarget.value = null
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

function onDragStart(e: DragEvent, idx: number) {
  const item = items.value[idx]
  if (isDefaultItem(item.id)) {
    e.preventDefault()
    return
  }
  if (expandedId.value === item.id!) {
    expandedId.value = null
  }
  dragIndex.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}

async function onDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  if (targetIdx < 2 || dragIndex.value === null || dragIndex.value === targetIdx) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const oldIdx = dragIndex.value
  const moved = items.value.splice(oldIdx, 1)[0]
  items.value.splice(targetIdx, 0, moved)
  for (let i = 0; i < items.value.length; i++) {
    items.value[i].sortOrder = i
    if (items.value[i].id! > 0) {
      await db.systemConfigs.update(items.value[i].id!, { sortOrder: i })
    }
  }
  const newSet = new Set<number>()
  for (const id of dirtyIds.value) {
    const oldItemIdx = items.value.findIndex(item => item.id === id)
    if (oldItemIdx !== -1) newSet.add(id)
  }
  dirtyIds.value = newSet
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function save() {}

const isDirty = computed(() => dirtyIds.value.size > 0)

defineExpose({ save, loadItems, isDirty })

onMounted(() => {
  loadItems()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between sticky top-0 z-10 bg-[var(--color-bg)] pt-8 pb-2">
      <h2 class="text-sm sm:text-base font-semibold section-title">系统配置项</h2>
      <button
        class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base"
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
      v-for="(item, idx) in items"
      :key="item.id"
      :class="[
        'border rounded-lg overflow-hidden transition-shadow',
        expandedId === item.id ? 'border-[var(--color-accent)]/30 shadow-sm' : 'border-[var(--color-border)] hover:shadow-sm',
        dragOverIndex === idx && dragIndex !== idx ? 'border-t-2 border-t-[var(--color-accent)]' : '',
      ]"
    >
      <div
        :draggable="!isDefaultItem(item.id)"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
        :class="{ 'cursor-grab': !isDefaultItem(item.id) && !dragIndex, 'cursor-grabbing': dragIndex === idx }"
        @click="toggleExpand(item.id!)"
        @dragstart="onDragStart($event, idx)"
        @dragover="onDragOver($event, idx)"
        @drop="onDrop($event, idx)"
        @dragend="onDragEnd"
      >
        <span class="font-semibold text-sm">{{ item.remark || item.key }}</span>
        <div class="flex items-center gap-2">
          <button
            v-if="isDefaultItem(item.id)"
            class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            title="恢复默认"
            @click.stop="requestRestore(item)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
          <button
            v-if="!isDefaultItem(item.id)"
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
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
          <input
            :value="item.remark"
            type="text"
            class="w-full bg-[var(--color-bg)] rounded-lg px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none transition-shadow text-sm"
            placeholder="备注"
            @input="(e) => { item.remark = (e.target as HTMLInputElement).value; updateItem(item) }"
          />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
          <input
            :value="item.key"
            type="text"
            :readonly="isDefaultItem(item.id)"
            :class="['w-full rounded-lg px-3 py-1.5 border transition-shadow text-sm', isDefaultItem(item.id) ? 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] cursor-not-allowed border-[var(--color-border)]' : 'bg-[var(--color-bg)] border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none']"
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
        <button
          style="width: 95%" class="py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm block mx-auto"
          :disabled="!dirtyIds.has(item.id!)"
          @click="handleSaveItem(item)"
        >
          保存
        </button>
      </div>
    </div>

    <div v-if="showAddForm" class="border border-[var(--color-accent)] rounded-lg overflow-hidden">
      <div class="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg)]">
        <span class="font-semibold text-sm text-[var(--color-accent)]">新建配置</span>
        <button
          class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          @click="showAddForm = false; newKey = ''; newValue = ''; newRemark = ''"
        >
          <X :size="16" />
        </button>
      </div>
      <div class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
        <div>
          <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
          <input
            v-model="newRemark"
            type="text"
            class="w-full bg-[var(--color-surface)] rounded-lg px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none transition-shadow text-sm"
            placeholder="备注"
          />
        </div>
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
            @click="showAddForm = false; newKey = ''; newValue = ''; newRemark = ''"
          >
            取消
          </button>
          <button
            class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-xs"
            :disabled="!newKey.trim()"
            @click="addItem()"
          >
            保存
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

    <ConfirmModal
      :visible="restoreTarget !== null"
      title="恢复默认"
      :message="restoreTarget ? `确认将「${restoreTarget.remark || restoreTarget.key}」恢复为默认内容？当前修改将丢失。` : ''"
      confirm-text="确认"
      @confirm="confirmRestore()"
      @cancel="restoreTarget = null"
    />
  </div>
</template>
