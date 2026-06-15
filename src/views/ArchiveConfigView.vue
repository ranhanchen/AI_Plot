<script setup lang="ts">
import { ref, onMounted, onUnmounted, toRaw } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import type { CustomConfigItem, SystemConfigItem } from '@/types'
import { ArrowLeft, Save, Plus, X, ChevronDown, Trash2 } from 'lucide-vue-next'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const archiveId = Number(route.params.id)
const activeTab = ref<'configs' | 'world'>('world')

const promptStory = ref('')
const promptSummary = ref('')
const worldSetting = ref('')
const writingStyle = ref('')
const outputLimit = ref('')
const privateConfigs = ref<CustomConfigItem[]>([])
const worldConfigs = ref<CustomConfigItem[]>([])
const referencedSystemConfigKeys = ref<string[]>([])

// 配置项 tab 内联新增
const showAddPrivateForm = ref(false)
const newPrivateKey = ref('')
const newPrivateValue = ref('')
const expandedPrivateIdx = ref<number | null>(null)
const deletePrivateIdx = ref<number | null>(null)

// 世界观 tab 内联新增
const showAddWorldForm = ref(false)
const newWorldKey = ref('')
const newWorldValue = ref('')
const expandedWorldIdx = ref<number | null>(null)
const deleteWorldIdx = ref<number | null>(null)

// 系统配置引用
const systemSearchInput = ref('')
const systemSearchResults = ref<SystemConfigItem[]>([])
const showSystemDropdown = ref(false)
const systemDropdownRef = ref<HTMLElement | null>(null)
const deleteSystemKey = ref<string | null>(null)

const dirty = ref(false)
const showLeaveConfirm = ref(false)
const leaving = ref(false)

onBeforeRouteLeave((to, from, next) => {
  if (leaving.value) {
    next()
    return
  }
  if (dirty.value) {
    showLeaveConfirm.value = true
    next(false)
  } else {
    next()
  }
})

async function confirmLeave() {
  leaving.value = true
  await loadData()
  router.back()
}

async function loadData() {
  const a = await db.archives.get(archiveId)
  if (!a) { router.replace('/'); return }

  promptStory.value = a.promptStory
  promptSummary.value = a.promptSummary
  worldSetting.value = a.worldSetting
  writingStyle.value = a.writingStyle
  outputLimit.value = a.outputLimit
  privateConfigs.value = a.privateConfigs ? [...a.privateConfigs] : []
  worldConfigs.value = a.worldConfigs ? [...a.worldConfigs] : []
  referencedSystemConfigKeys.value = a.referencedSystemConfigKeys ? [...a.referencedSystemConfigKeys] : []
  dirty.value = false
}

async function handleSave() {
  await db.archives.update(archiveId, {
    promptStory: promptStory.value,
    promptSummary: promptSummary.value,
    worldSetting: worldSetting.value,
    writingStyle: writingStyle.value,
    outputLimit: outputLimit.value,
    privateConfigs: JSON.parse(JSON.stringify(toRaw(privateConfigs.value))),
    worldConfigs: JSON.parse(JSON.stringify(toRaw(worldConfigs.value))),
    referencedSystemConfigKeys: toRaw(referencedSystemConfigKeys.value),
  })
  appStore.showToast('配置保存成功', 'success')
  dirty.value = false
}

function addPrivateConfig() {
  if (!newPrivateKey.value.trim()) return
  privateConfigs.value = [...privateConfigs.value, { key: newPrivateKey.value.trim(), value: newPrivateValue.value }]
  newPrivateKey.value = ''
  newPrivateValue.value = ''
  showAddPrivateForm.value = false
  dirty.value = true
}

function addWorldConfig() {
  if (!newWorldKey.value.trim()) return
  worldConfigs.value = [...worldConfigs.value, { key: newWorldKey.value.trim(), value: newWorldValue.value }]
  newWorldKey.value = ''
  newWorldValue.value = ''
  showAddWorldForm.value = false
  dirty.value = true
}

async function searchSystemConfigs() {
  const q = systemSearchInput.value.trim()
  let results: SystemConfigItem[]
  if (!q) {
    results = await db.systemConfigs.toArray()
  } else {
    results = await db.systemConfigs.filter(c => c.key.includes(q)).toArray()
  }
  results = results.filter(c => !referencedSystemConfigKeys.value.includes(c.key))
  systemSearchResults.value = results
  showSystemDropdown.value = results.length > 0
}

function selectSystemResult(item: SystemConfigItem) {
  systemSearchInput.value = item.key
  showSystemDropdown.value = false
}

async function addSystemConfig() {
  const key = systemSearchInput.value.trim()
  if (!key) return
  if (referencedSystemConfigKeys.value.includes(key)) {
    appStore.showToast('该配置项已引用', 'error')
    return
  }
  const sysCfg = await db.systemConfigs.where('key').equals(key).first()
  if (!sysCfg) { appStore.showToast('未找到该系统配置项', 'error'); return }
  referencedSystemConfigKeys.value = [...referencedSystemConfigKeys.value, key]
  systemSearchInput.value = ''
  showSystemDropdown.value = false
  dirty.value = true
}

function handleClickOutside(e: MouseEvent) {
  if (systemDropdownRef.value && !systemDropdownRef.value.contains(e.target as Node)) {
    showSystemDropdown.value = false
  }
}

function removeSystemConfig(key: string) {
  referencedSystemConfigKeys.value = referencedSystemConfigKeys.value.filter(k => k !== key)
  deleteSystemKey.value = null
  dirty.value = true
}

onMounted(() => {
  loadData()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex items-center gap-4 px-4 py-3 page-header shrink-0">
      <button class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors" @click="router.back()">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-lg font-semibold flex-1">存档配置</h1>
      <button class="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm hover:opacity-90 transition-colors" @click="handleSave">
        <Save :size="16" />
        <span class="hidden sm:inline">保存</span>
      </button>
    </header>

    <div class="flex border-b border-[var(--color-border)] shrink-0">
      <button v-for="tab in [{k:'world',l:'世界观'},{k:'configs',l:'存档配置项'}]" :key="tab.k"
        :class="['flex-1 py-2.5 font-medium transition-colors text-base', activeTab === tab.k ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]']"
        @click="activeTab = tab.k as any">{{ tab.l }}</button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4">

      <!-- 存档配置项 -->
      <template v-if="activeTab === 'configs'">
        <div>
          <div class="flex items-center justify-between mb-2 sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
            <label class="font-medium text-base">私有自定义配置项</label>
            <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-base"
              @click="showAddPrivateForm = true; expandedPrivateIdx = null"><Plus :size="14" />添加</button>
          </div>
          <div v-for="(cfg, i) in privateConfigs" :key="i" class="border border-[var(--color-border)] rounded-lg overflow-hidden mb-2">
            <div class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
              @click="expandedPrivateIdx = expandedPrivateIdx === i ? null : i">
              <span class="font-semibold text-sm">{{ cfg.key || '未命名配置' }}</span>
              <div class="flex items-center gap-2">
                <button class="text-red-400 hover:text-red-600 transition-colors" @click.stop="deletePrivateIdx = i"><Trash2 :size="16" /></button>
                <ChevronDown :size="16" class="text-[var(--color-text-muted)] transition-transform duration-200" :class="{ 'rotate-180': expandedPrivateIdx === i }" />
              </div>
            </div>
            <div v-if="expandedPrivateIdx === i" class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="cfg.key" type="text" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" @input="dirty = true" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="cfg.value" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" @input="dirty = true" />
              </div>
            </div>
          </div>
          <div v-if="privateConfigs.length === 0 && !showAddPrivateForm" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无自定义配置
          </div>
          <div v-if="showAddPrivateForm" class="border border-[var(--color-accent)] rounded-lg overflow-hidden mb-2">
            <div class="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg)]">
              <span class="font-semibold text-sm text-[var(--color-accent)]">新建配置</span>
              <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="showAddPrivateForm = false; newPrivateKey = ''; newPrivateValue = ''"><X :size="16" /></button>
            </div>
            <div class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="newPrivateKey" type="text" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="newPrivateValue" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs" @click="showAddPrivateForm = false; newPrivateKey = ''; newPrivateValue = ''">取消</button>
                <button class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-xs" :disabled="!newPrivateKey.trim()" @click="addPrivateConfig()">添加</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 引用系统配置项 -->
        <div ref="systemDropdownRef">
          <div class="flex items-center justify-between mb-2 sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
            <label class="font-medium shrink-0 text-base">引用系统配置项</label>
            <div class="flex items-center gap-1">
              <div class="relative">
                <input v-model="systemSearchInput" type="text" class="w-36 px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-sm focus:border-[var(--color-accent)] focus:outline-none" placeholder="搜索配置项" @keyup.enter="searchSystemConfigs()" />
                <div v-if="showSystemDropdown" class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                  <div v-for="item in systemSearchResults" :key="item.id" class="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors" @click="selectSystemResult(item)">{{ item.key }}</div>
                </div>
              </div>
              <button class="flex items-center justify-center px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-base" @click="searchSystemConfigs()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>&#8203;</button>
              <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-base" @click="addSystemConfig()"><Plus :size="14" />引用</button>
            </div>
          </div>
<div v-if="referencedSystemConfigKeys.length === 0" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无引用系统配置项
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <span v-for="key in referencedSystemConfigKeys" :key="key" class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
              {{ key }}
              <button class="hover:text-red-500 transition-colors" @click="deleteSystemKey = key"><X :size="10" /></button>
            </span>
          </div>
        </div>
      </template>

      <!-- 世界观 -->
      <template v-if="activeTab === 'world'">
        <div>
          <div class="pt-4 pb-2 mb-2">
            <label class="font-medium text-base">初始世界观</label>
          </div>
          <textarea v-model="worldSetting" class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="描述这个世界的背景设定、历史、地理、势力等..." @input="dirty = true" />
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="font-medium text-base">其他世界观</label>
            <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-base"
              @click="showAddWorldForm = true; expandedWorldIdx = null"><Plus :size="14" />添加</button>
          </div>
          <div v-for="(cfg, i) in worldConfigs" :key="i" class="border border-[var(--color-border)] rounded-lg overflow-hidden mb-2">
            <div class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
              @click="expandedWorldIdx = expandedWorldIdx === i ? null : i">
              <span class="font-semibold text-sm">{{ cfg.key || '未命名配置' }}</span>
              <div class="flex items-center gap-2">
                <button class="text-red-400 hover:text-red-600 transition-colors" @click.stop="deleteWorldIdx = i"><Trash2 :size="16" /></button>
                <ChevronDown :size="16" class="text-[var(--color-text-muted)] transition-transform duration-200" :class="{ 'rotate-180': expandedWorldIdx === i }" />
              </div>
            </div>
            <div v-if="expandedWorldIdx === i" class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="cfg.key" type="text" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" @input="dirty = true" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="cfg.value" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" @input="dirty = true" />
              </div>
            </div>
          </div>
          <div v-if="worldConfigs.length === 0 && !showAddWorldForm" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无其他世界观
          </div>
          <div v-if="showAddWorldForm" class="border border-[var(--color-accent)] rounded-lg overflow-hidden mb-2">
            <div class="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg)]">
              <span class="font-semibold text-sm text-[var(--color-accent)]">新建配置</span>
              <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="showAddWorldForm = false; newWorldKey = ''; newWorldValue = ''"><X :size="16" /></button>
            </div>
            <div class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="newWorldKey" type="text" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="newWorldValue" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs" @click="showAddWorldForm = false; newWorldKey = ''; newWorldValue = ''">取消</button>
                <button class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-xs" :disabled="!newWorldKey.trim()" @click="addWorldConfig()">添加</button>
              </div>
            </div>
          </div>
        </div>
      </template>

    </div>

    <ConfirmModal :visible="deletePrivateIdx !== null" title="删除自定义配置" :message="`确认删除自定义配置「${deletePrivateIdx !== null ? privateConfigs[deletePrivateIdx]?.key : ''}」？`" confirm-text="删除" :danger="true"
      @confirm="privateConfigs.splice(deletePrivateIdx!, 1); deletePrivateIdx = null; dirty = true" @cancel="deletePrivateIdx = null" />
    <ConfirmModal :visible="deleteWorldIdx !== null" title="删除自定义配置" :message="`确认删除自定义配置「${deleteWorldIdx !== null ? worldConfigs[deleteWorldIdx]?.key : ''}」？`" confirm-text="删除" :danger="true"
      @confirm="worldConfigs.splice(deleteWorldIdx!, 1); deleteWorldIdx = null; dirty = true" @cancel="deleteWorldIdx = null" />
    <ConfirmModal :visible="deleteSystemKey !== null" title="解除引用" :message="`确认解除对系统配置项「${deleteSystemKey}」的引用？`" confirm-text="解除"
      @confirm="deleteSystemKey !== null && removeSystemConfig(deleteSystemKey)" @cancel="deleteSystemKey = null" />

    <ConfirmModal
      :visible="showLeaveConfirm"
      title="未保存的更改"
      message="当前有未保存的更改，离开将丢失所有修改。确认离开？"
      confirm-text="确认离开"
      :danger="true"
      @confirm="confirmLeave()"
      @cancel="showLeaveConfirm = false"
    />
  </div>
</template>
