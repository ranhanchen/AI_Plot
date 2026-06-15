<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { ArrowLeft, Save, Download, Upload } from 'lucide-vue-next'
import ApiConfigPanel from '@/components/settings/ApiConfigPanel.vue'
import SystemConfigPanel from '@/components/settings/SystemConfigPanel.vue'
import { useAppStore } from '@/stores/app'
import { db } from '@/db'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const router = useRouter()
const appStore = useAppStore()
const activeTab = ref<'api' | 'system'>('api')

const apiPanelRef = ref<InstanceType<typeof ApiConfigPanel> | null>(null)
const systemPanelRef = ref<InstanceType<typeof SystemConfigPanel> | null>(null)

const showLeaveConfirm = ref(false)
const leaving = ref(false)

onBeforeRouteLeave((to, from, next) => {
  if (leaving.value) {
    next()
    return
  }
  const dirty = apiPanelRef.value?.isDirty || systemPanelRef.value?.isDirty
  if (dirty) {
    showLeaveConfirm.value = true
    next(false)
  } else {
    next()
  }
})

async function confirmLeave() {
  leaving.value = true
  await apiPanelRef.value?.loadConfigs()
  await systemPanelRef.value?.loadItems()
  router.back()
}
const showImportConfirm = ref(false)
const pendingImportData = ref<{ apiConfigs: any[]; systemConfigs: any[] } | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

async function handleExport() {
  const apiConfigs = await db.apiConfigs.toArray()
  const systemConfigs = await db.systemConfigs.toArray()
  const data = {
    apiConfigs,
    systemConfigs,
    exportDate: new Date().toISOString(),
    version: 1,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `narrative-forge-config-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  appStore.showToast('配置已导出', 'success')
}

function handleImportClick() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)
      if (!data.apiConfigs || !data.systemConfigs) {
        appStore.showToast('配置文件格式不正确', 'error')
        return
      }
      pendingImportData.value = data
      showImportConfirm.value = true
    } catch {
      appStore.showToast('无法解析配置文件', 'error')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

async function confirmImport() {
  if (!pendingImportData.value) return
  await db.apiConfigs.clear()
  await db.systemConfigs.clear()
  const apiConfigsToImport = pendingImportData.value.apiConfigs.map(({ id, ...rest }: any) => JSON.parse(JSON.stringify(rest)))
  const systemConfigsToImport = pendingImportData.value.systemConfigs.map(({ id, ...rest }: any) => JSON.parse(JSON.stringify(rest)))
  await db.apiConfigs.bulkAdd(apiConfigsToImport)
  await db.systemConfigs.bulkAdd(systemConfigsToImport)
  if (activeTab.value === 'api') {
    ;(apiPanelRef.value as any)?.loadConfigs?.()
  } else {
    ;(systemPanelRef.value as any)?.loadItems?.()
  }
  pendingImportData.value = null
  showImportConfirm.value = false
  appStore.showToast('配置已导入', 'success')
}

async function handleSave() {
  const panel = activeTab.value === 'api' ? apiPanelRef.value : systemPanelRef.value
  if (panel) {
    await panel.save()
    appStore.showToast('配置已保存', 'success')
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 page-header shrink-0">
      <button
        class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        @click="router.back()"
      >
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-lg font-semibold flex-1">系统配置</h1>
      <button
        class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
        @click="handleImportClick"
      >
        <Upload :size="16" />
        <span class="hidden md:inline">导入配置</span>
      </button>
      <button
        class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
        @click="handleExport"
      >
        <Download :size="16" />
        <span class="hidden md:inline">导出配置</span>
      </button>
      <button
        class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm hover:opacity-90 transition-colors"
        @click="handleSave"
      >
        <Save :size="16" />
        <span class="hidden sm:inline">保存</span>
      </button>
    </header>

    <div class="flex gap-1 px-4 py-2 border-b border-[var(--color-border)] shrink-0">
      <button
        :class="[
          'flex-1 py-2 rounded-md font-medium transition-all text-base',
          activeTab === 'api'
            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] shadow-sm'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
        ]"
        @click="activeTab = 'api'"
      >
        API 配置
      </button>
      <button
        :class="[
          'flex-1 py-2 rounded-md font-medium transition-all text-base',
          activeTab === 'system'
            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] shadow-sm'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
        ]"
        @click="activeTab = 'system'"
      >
        系统配置项
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4">
      <ApiConfigPanel v-show="activeTab === 'api'" ref="apiPanelRef" />
      <SystemConfigPanel v-show="activeTab === 'system'" ref="systemPanelRef" />
    </div>

    <input type="file" accept=".json" ref="fileInputRef" class="hidden" @change="handleFileChange" />

    <ConfirmModal
      :visible="showImportConfirm"
      title="导入配置"
      message="导入将覆盖当前所有 API 配置和系统配置项，此操作不可撤销。确认继续？"
      confirm-text="确认导入"
      :danger="true"
      @confirm="confirmImport()"
      @cancel="showImportConfirm = false"
    />

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
