<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { ArrowLeft, Download, Upload } from 'lucide-vue-next'
import ApiConfigPanel from '@/components/settings/ApiConfigPanel.vue'
import SystemConfigPanel from '@/components/settings/SystemConfigPanel.vue'
import RoleManager from '@/components/role/RoleManager.vue'
import { useAppStore } from '@/stores/app'
import { db } from '@/db'
import type { CharacterRole } from '@/types'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { preloadImages } from '@/composables/useImagePreload'

const router = useRouter()
const appStore = useAppStore()
const activeTab = ref<'api' | 'system' | 'roles'>('roles')

const apiPanelRef = ref<InstanceType<typeof ApiConfigPanel> | null>(null)
const systemPanelRef = ref<InstanceType<typeof SystemConfigPanel> | null>(null)
const roleManagerRef = ref<InstanceType<typeof RoleManager> | null>(null)

const systemRoles = ref<CharacterRole[]>([])

async function loadSystemRoles() {
  const all = await db.characterRoles.toArray()
  const roles = all.filter(r => !r.archiveId).sort((a, b) => a.sortOrder - b.sortOrder)
  systemRoles.value = roles
  preloadImages(roles.flatMap(r => r.images || []))
}

onMounted(() => {
  loadSystemRoles()
})

function handleRoleClick(role: CharacterRole) {
  router.push(`/character/${role.id}`)
}

function handleRoleAdd() {
  router.push('/character/new')
}

async function handleRoleDelete(role: CharacterRole) {
  await db.characterRoles.delete(role.id!)
  await loadSystemRoles()
  appStore.showToast('角色已删除', 'success')
}

async function handleRoleReorder(payload: { fromIndex: number; toIndex: number }) {
  const { fromIndex, toIndex } = payload
  const moved = systemRoles.value.splice(fromIndex, 1)[0]
  systemRoles.value.splice(toIndex, 0, moved)
  for (let i = 0; i < systemRoles.value.length; i++) {
    const role = systemRoles.value[i]
    role.sortOrder = i
    if (role.id != null) {
      await db.characterRoles.update(role.id, { sortOrder: i })
    }
  }
}

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
  ;(apiPanelRef.value as any)?.loadConfigs?.()
  ;(systemPanelRef.value as any)?.loadItems?.()
  pendingImportData.value = null
  showImportConfirm.value = false
  appStore.showToast('配置已导入', 'success')
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
      <h1 class="text-base font-semibold flex-1">系统配置</h1>
      <button
        class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-black/[0.06] transition-colors"
        @click="handleImportClick"
      >
        <Upload :size="16" />
        <span class="hidden md:inline">导入配置</span>
      </button>
      <button
        class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-black/[0.06] transition-colors"
        @click="handleExport"
      >
        <Download :size="16" />
        <span class="hidden md:inline">导出配置</span>
      </button>
    </header>

    <div class="flex gap-1 px-4 py-2 border-b border-[var(--color-border)] shrink-0">
      <button
        :class="[
          'flex-1 py-2 rounded-md font-medium transition-all text-sm sm:text-base',
          activeTab === 'api'
            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] shadow-sm'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-black/[0.06]'
        ]"
        @click="activeTab = 'api'"
      >
        API 配置
      </button>
      <button
        :class="[
          'flex-1 py-2 rounded-md font-medium transition-all text-sm sm:text-base',
          activeTab === 'roles'
            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] shadow-sm'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-black/[0.06]'
        ]"
        @click="activeTab = 'roles'"
      >
        角色管理
      </button>
      <button
        :class="[
          'flex-1 py-2 rounded-md font-medium transition-all text-sm sm:text-base',
          activeTab === 'system'
            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] shadow-sm'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-black/[0.06]'
        ]"
        @click="activeTab = 'system'"
      >
        系统配置项
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 pt-4">
      <RoleManager
        v-show="activeTab === 'roles'"
        ref="roleManagerRef"
        :roles="systemRoles"
        variant="system"
        empty-text="暂无系统角色"
        :draggable="true"
        @add="handleRoleAdd"
        @click="handleRoleClick"
        @delete="handleRoleDelete"
        @reorder="handleRoleReorder"
      />
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
