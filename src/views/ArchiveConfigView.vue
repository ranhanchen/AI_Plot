<script setup lang="ts">
import { ref, onMounted, onUnmounted, toRaw, computed } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import type { CustomConfigItem, SystemConfigItem, CharacterRole } from '@/types'
import { ArrowLeft, Plus, X, ChevronDown, Trash2, Search } from 'lucide-vue-next'
import RoleManager from '@/components/role/RoleManager.vue'
import RoleCard from '@/components/role/RoleCard.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { preloadImages } from '@/composables/useImagePreload'
import { useDefaultConfigs } from '@/composables/useDefaultConfigs'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { isDefaultId, loadDefaultIds } = useDefaultConfigs()

const archiveId = Number(route.params.id)
const activeTab = ref<'configs' | 'world' | 'roles'>('roles')

const promptStory = ref('')
const promptSummary = ref('')
const worldSetting = ref('')
const writingStyle = ref('')
const outputLimit = ref('')
const privateConfigs = ref<CustomConfigItem[]>([])
const worldConfigs = ref<CustomConfigItem[]>([])
const referencedSystemConfigIds = ref<number[]>([])

// 配置项 tab 内联新增
const showAddPrivateForm = ref(false)
const newPrivateKey = ref('')
const newPrivateValue = ref('')
const newPrivateRemark = ref('')
const expandedPrivateIdx = ref<number | null>(null)
const deletePrivateIdx = ref<number | null>(null)
const privateDragIdx = ref<number | null>(null)
const privateDragOverIdx = ref<number | null>(null)
// 世界观 tab 内联新增
const showAddWorldForm = ref(false)
const newWorldKey = ref('')
const newWorldValue = ref('')
const newWorldRemark = ref('')
const expandedWorldIdx = ref<number | null>(null)
const deleteWorldIdx = ref<number | null>(null)
const worldDragIdx = ref<number | null>(null)
const worldDragOverIdx = ref<number | null>(null)
// 系统配置引用
const systemSearchInput = ref('')
const systemSearchResults = ref<SystemConfigItem[]>([])
const showSystemDropdown = ref(false)
const systemDropdownRef = ref<HTMLElement | null>(null)
const deleteSystemId = ref<number | null>(null)
const selectedSystemConfigId = ref<number | null>(null)
const viewSystemConfigId = ref<number | null>(null)
const systemConfigDragIdx = ref<number | null>(null)
const systemConfigDragOverIdx = ref<number | null>(null)

const viewSystemConfig = computed(() => {
  if (viewSystemConfigId.value === null) return null
  return systemConfigCache.value.get(viewSystemConfigId.value) ?? null
})

const systemConfigCache = ref<Map<number, { key: string; remark: string; value: string }>>(new Map())

async function refreshSystemConfigCache() {
  const all = await db.systemConfigs.toArray()
  const map = new Map<number, { key: string; remark: string; value: string }>()
  for (const item of all) {
    map.set(item.id!, { key: item.key, remark: item.remark || item.key, value: item.value })
  }
  systemConfigCache.value = map
}

function getSystemConfigDisplay(id: number): string {
  const info = systemConfigCache.value.get(id)
  return info ? info.remark : `已删除配置 (ID:${id})`
}

const dirtyPrivateIdx = ref(new Set<number>())
const dirtyWorldIdx = ref(new Set<number>())
const dirtyWorldSetting = ref(false)

// ---- 角色管理 ----
const archiveRoles = ref<CharacterRole[]>([])
const referencedSystemRoleIds = ref<number[]>([])
const referencedRolesCache = ref<Map<number, CharacterRole>>(new Map())

const systemRoleSearchInput = ref('')
const systemRoleSearchResults = ref<CharacterRole[]>([])
const showSystemRoleDropdown = ref(false)
const systemRoleDropdownRef = ref<HTMLElement | null>(null)
const removeSystemRoleId = ref<number | null>(null)
const selectedSystemRoleId = ref<number | null>(null)

const systemRoleDragIdx = ref<number | null>(null)
const systemRoleDragOverIdx = ref<number | null>(null)

async function loadArchiveRoles() {
  const roles = await db.characterRoles.where('archiveId').equals(archiveId).sortBy('sortOrder')
  archiveRoles.value = roles
  preloadImages(roles.flatMap(r => r.images || []))
}

async function loadReferencedSystemRoles() {
  const map = new Map<number, CharacterRole>()
  for (const id of referencedSystemRoleIds.value) {
    const role = await db.characterRoles.get(id)
    if (role) map.set(id, role)
  }
  referencedRolesCache.value = map
  preloadImages([...map.values()].flatMap(r => r.images || []))
}

function handleArchiveRoleClick(role: CharacterRole) {
  router.push(`/character/${role.id}`)
}

function handleArchiveRoleAdd() {
  router.push(`/character/new?archiveId=${archiveId}`)
}

async function handleArchiveRoleDelete(role: CharacterRole) {
  await db.characterRoles.delete(role.id!)
  await loadArchiveRoles()
  appStore.showToast('角色已删除', 'success')
}

async function onArchiveRolesReorder(payload: { fromIndex: number; toIndex: number }) {
  const { fromIndex, toIndex } = payload
  const moved = archiveRoles.value.splice(fromIndex, 1)[0]
  archiveRoles.value.splice(toIndex, 0, moved)
  for (let i = 0; i < archiveRoles.value.length; i++) {
    const role = archiveRoles.value[i]
    role.sortOrder = i
    if (role.id != null) {
      await db.characterRoles.update(role.id, { sortOrder: i })
    }
  }
}

async function searchSystemRoles() {
  selectedSystemRoleId.value = null
  const all = await db.characterRoles.toArray()
  const systemRoles = all.filter(r => !r.archiveId)
  const q = systemRoleSearchInput.value.trim().toLowerCase()
  if (!q) {
    systemRoleSearchResults.value = systemRoles.filter(r => !referencedSystemRoleIds.value.includes(r.id!))
  } else {
    systemRoleSearchResults.value = systemRoles.filter(r =>
      !referencedSystemRoleIds.value.includes(r.id!) &&
      (r.name.toLowerCase().includes(q))
    )
  }
  showSystemRoleDropdown.value = true
}

function selectSystemRoleResult(role: CharacterRole) {
  systemRoleSearchInput.value = role.name
  selectedSystemRoleId.value = role.id!
  showSystemRoleDropdown.value = false
}

async function addSystemRoleReference() {
  const id = selectedSystemRoleId.value
  if (id !== null) {
    const role = await db.characterRoles.get(id)
    if (!role) { appStore.showToast('该系统角色已被删除', 'error'); return }
    if (referencedSystemRoleIds.value.includes(id)) {
      appStore.showToast('该角色已引用', 'error')
      return
    }
    referencedSystemRoleIds.value = [...referencedSystemRoleIds.value, id]
    await db.archives.update(archiveId, {
      referencedSystemRoleIds: toRaw(referencedSystemRoleIds.value),
    })
    await loadReferencedSystemRoles()
    systemRoleSearchInput.value = ''
    selectedSystemRoleId.value = null
    showSystemRoleDropdown.value = false
    appStore.showToast('已引用系统角色', 'success')
    return
  }
  const q = systemRoleSearchInput.value.trim()
  if (!q) { appStore.showToast('请输入或搜索角色名称', 'error'); return }
  const all = await db.characterRoles.toArray()
  const systemRoles = all.filter(r => !r.archiveId)
  const role = systemRoles.find(r => r.name === q && !referencedSystemRoleIds.value.includes(r.id!))
  if (!role) { appStore.showToast('未找到该系统角色', 'error'); return }
  referencedSystemRoleIds.value = [...referencedSystemRoleIds.value, role.id!]
  await db.archives.update(archiveId, {
    referencedSystemRoleIds: toRaw(referencedSystemRoleIds.value),
  })
  await loadReferencedSystemRoles()
  systemRoleSearchInput.value = ''
  showSystemRoleDropdown.value = false
  appStore.showToast('已引用系统角色', 'success')
}

async function removeSystemRoleReference(id: number) {
  referencedSystemRoleIds.value = referencedSystemRoleIds.value.filter(x => x !== id)
  removeSystemRoleId.value = null
  await db.archives.update(archiveId, {
    referencedSystemRoleIds: toRaw(referencedSystemRoleIds.value),
  })
  await loadReferencedSystemRoles()
  appStore.showToast('已解除引用', 'success')
}

function handleSystemRoleClickOutside(e: MouseEvent) {
  if (systemRoleDropdownRef.value && !systemRoleDropdownRef.value.contains(e.target as Node)) {
    showSystemRoleDropdown.value = false
    selectedSystemRoleId.value = null
  }
}

function onSystemRoleDragStart(e: DragEvent, idx: number) {
  systemRoleDragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', 'sysrole-' + idx)
  }
}
function onSystemRoleDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  systemRoleDragOverIdx.value = idx
}
async function onSystemRoleDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  if (systemRoleDragIdx.value === null || systemRoleDragIdx.value === targetIdx) {
    systemRoleDragIdx.value = null
    systemRoleDragOverIdx.value = null
    return
  }
  const oldIdx = systemRoleDragIdx.value
  const moved = referencedSystemRoleIds.value.splice(oldIdx, 1)[0]
  referencedSystemRoleIds.value.splice(targetIdx, 0, moved)
  systemRoleDragIdx.value = null
  systemRoleDragOverIdx.value = null
  await db.archives.update(archiveId, {
    referencedSystemRoleIds: toRaw(referencedSystemRoleIds.value),
  })
}
function onSystemRoleDragEnd() {
  systemRoleDragIdx.value = null
  systemRoleDragOverIdx.value = null
}

const showLeaveConfirm = ref(false)
const leaving = ref(false)

onBeforeRouteLeave((to, from, next) => {
  if (leaving.value) {
    next()
    return
  }
  if (dirtyPrivateIdx.value.size > 0 || dirtyWorldIdx.value.size > 0 || dirtyWorldSetting.value) {
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
  privateConfigs.value = a.privateConfigs ? a.privateConfigs.map(c => ({ ...c, remark: c.remark || c.key })) : []
  worldConfigs.value = a.worldConfigs ? a.worldConfigs.map(c => ({ ...c, remark: c.remark || c.key })) : []
  if (a.referencedSystemConfigKeys && a.referencedSystemConfigKeys.length > 0) {
    const raw = a.referencedSystemConfigKeys
    if (typeof raw[0] === 'string') {
      const ids: number[] = []
      for (const key of raw as unknown as string[]) {
        const sysCfg = await db.systemConfigs.where('key').equals(key).first()
        if (sysCfg) ids.push(sysCfg.id!)
      }
      referencedSystemConfigIds.value = ids
    } else {
      referencedSystemConfigIds.value = [...raw as number[]]
    }
  } else {
    referencedSystemConfigIds.value = []
  }
  if (a.referencedSystemRoleIds && a.referencedSystemRoleIds.length > 0) {
    referencedSystemRoleIds.value = [...a.referencedSystemRoleIds]
  } else {
    referencedSystemRoleIds.value = []
  }
  await refreshSystemConfigCache()
  await loadDefaultIds()
  await loadArchiveRoles()
  await loadReferencedSystemRoles()
  dirtyPrivateIdx.value.clear()
  dirtyWorldIdx.value.clear()
  dirtyWorldSetting.value = false
}

async function savePrivateConfigs(idx: number) {
  await db.archives.update(archiveId, {
    privateConfigs: JSON.parse(JSON.stringify(toRaw(privateConfigs.value))),
  })
  dirtyPrivateIdx.value.delete(idx)
  appStore.showToast('私有配置已保存', 'success')
}

async function saveWorldConfigs(idx: number) {
  await db.archives.update(archiveId, {
    worldConfigs: JSON.parse(JSON.stringify(toRaw(worldConfigs.value))),
  })
  dirtyWorldIdx.value.delete(idx)
  appStore.showToast('世界观配置已保存', 'success')
}

async function saveWorldSetting() {
  await db.archives.update(archiveId, {
    worldSetting: worldSetting.value,
  })
  dirtyWorldSetting.value = false
  appStore.showToast('初始世界观已保存', 'success')
}

function addPrivateConfig() {
  if (!newPrivateKey.value.trim()) return
  const remark = newPrivateRemark.value.trim() || newPrivateKey.value.trim()
  privateConfigs.value = [...privateConfigs.value, {
    key: newPrivateKey.value.trim(),
    value: newPrivateValue.value,
    remark,
  }]
  newPrivateKey.value = ''
  newPrivateValue.value = ''
  newPrivateRemark.value = ''
  showAddPrivateForm.value = false
  db.archives.update(archiveId, {
    privateConfigs: JSON.parse(JSON.stringify(toRaw(privateConfigs.value))),
  }).then(() => {
    dirtyPrivateIdx.value.clear()
  })
}

function addWorldConfig() {
  if (!newWorldKey.value.trim()) return
  const remark = newWorldRemark.value.trim() || newWorldKey.value.trim()
  worldConfigs.value = [...worldConfigs.value, {
    key: newWorldKey.value.trim(),
    value: newWorldValue.value,
    remark,
  }]
  newWorldKey.value = ''
  newWorldValue.value = ''
  newWorldRemark.value = ''
  showAddWorldForm.value = false
  db.archives.update(archiveId, {
    worldConfigs: JSON.parse(JSON.stringify(toRaw(worldConfigs.value))),
  }).then(() => {
    dirtyWorldIdx.value.clear()
  })
}

async function searchSystemConfigs() {
  selectedSystemConfigId.value = null
  const q = systemSearchInput.value.trim()
  let results: SystemConfigItem[]
  if (!q) {
    results = await db.systemConfigs.toArray()
  } else {
    results = await db.systemConfigs.filter(c => c.key.includes(q) || (c.remark ? c.remark.includes(q) : false)).toArray()
  }
  results = results.filter(c => !referencedSystemConfigIds.value.includes(c.id!) && !isDefaultId(c.id!))
  systemSearchResults.value = results
  showSystemDropdown.value = true
}

function selectSystemResult(item: SystemConfigItem) {
  systemSearchInput.value = item.key
  selectedSystemConfigId.value = item.id!
  showSystemDropdown.value = false
}

async function addSystemConfig() {
  const id = selectedSystemConfigId.value
  if (id !== null) {
    const sysCfg = await db.systemConfigs.get(id)
    if (!sysCfg) { appStore.showToast('该系统配置项已被删除', 'error'); return }
    if (referencedSystemConfigIds.value.includes(id)) {
      appStore.showToast('该配置项已引用', 'error')
      return
    }
    referencedSystemConfigIds.value = [...referencedSystemConfigIds.value, id]
    await db.archives.update(archiveId, {
      referencedSystemConfigKeys: toRaw(referencedSystemConfigIds.value),
    })
    await refreshSystemConfigCache()
    systemSearchInput.value = ''
    selectedSystemConfigId.value = null
    showSystemDropdown.value = false
    appStore.showToast('已引用系统配置项', 'success')
    return
  }
  const key = systemSearchInput.value.trim()
  if (!key) { appStore.showToast('请输入或搜索配置项名称', 'error'); return }
  const sysCfg = await db.systemConfigs.where('key').equals(key).first()
  if (!sysCfg) { appStore.showToast('未找到该系统配置项', 'error'); return }
  if (referencedSystemConfigIds.value.includes(sysCfg.id!)) {
    appStore.showToast('该配置项已引用', 'error')
    return
  }
  referencedSystemConfigIds.value = [...referencedSystemConfigIds.value, sysCfg.id!]
  await db.archives.update(archiveId, {
    referencedSystemConfigKeys: toRaw(referencedSystemConfigIds.value),
  })
  await refreshSystemConfigCache()
  systemSearchInput.value = ''
  showSystemDropdown.value = false
  appStore.showToast('已引用系统配置项', 'success')
}

function handleClickOutside(e: MouseEvent) {
  if (systemDropdownRef.value && !systemDropdownRef.value.contains(e.target as Node)) {
    showSystemDropdown.value = false
    selectedSystemConfigId.value = null
  }
}

async function removeSystemConfig(id: number) {
  referencedSystemConfigIds.value = referencedSystemConfigIds.value.filter(x => x !== id)
  deleteSystemId.value = null
  await db.archives.update(archiveId, {
    referencedSystemConfigKeys: toRaw(referencedSystemConfigIds.value),
  })
  await refreshSystemConfigCache()
  appStore.showToast('已解除引用', 'success')
}

function onSystemConfigDragStart(e: DragEvent, idx: number) {
  systemConfigDragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', 'syscfg-' + idx)
  }
}
function onSystemConfigDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  systemConfigDragOverIdx.value = idx
}
async function onSystemConfigDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  if (systemConfigDragIdx.value === null || systemConfigDragIdx.value === targetIdx) {
    systemConfigDragIdx.value = null
    systemConfigDragOverIdx.value = null
    return
  }
  const oldIdx = systemConfigDragIdx.value
  const moved = referencedSystemConfigIds.value.splice(oldIdx, 1)[0]
  referencedSystemConfigIds.value.splice(targetIdx, 0, moved)
  systemConfigDragIdx.value = null
  systemConfigDragOverIdx.value = null
  await db.archives.update(archiveId, {
    referencedSystemConfigKeys: toRaw(referencedSystemConfigIds.value),
  })
}
function onSystemConfigDragEnd() {
  systemConfigDragIdx.value = null
  systemConfigDragOverIdx.value = null
}

async function confirmDeletePrivate() {
  const idx = deletePrivateIdx.value!
  privateConfigs.value.splice(idx, 1)
  const newSet = new Set<number>()
  for (const i of dirtyPrivateIdx.value) {
    if (i < idx) newSet.add(i)
    else if (i > idx) newSet.add(i - 1)
  }
  dirtyPrivateIdx.value = newSet
  deletePrivateIdx.value = null
  await db.archives.update(archiveId, {
    privateConfigs: JSON.parse(JSON.stringify(toRaw(privateConfigs.value))),
  })
  dirtyPrivateIdx.value.clear()
}

async function confirmDeleteWorld() {
  const idx = deleteWorldIdx.value!
  worldConfigs.value.splice(idx, 1)
  const newSet = new Set<number>()
  for (const i of dirtyWorldIdx.value) {
    if (i < idx) newSet.add(i)
    else if (i > idx) newSet.add(i - 1)
  }
  dirtyWorldIdx.value = newSet
  deleteWorldIdx.value = null
  await db.archives.update(archiveId, {
    worldConfigs: JSON.parse(JSON.stringify(toRaw(worldConfigs.value))),
  })
  dirtyWorldIdx.value.clear()
}

// ---- 私有配置拖拽 ----
function onPrivateDragStart(e: DragEvent, idx: number) {
  if (expandedPrivateIdx.value === idx) expandedPrivateIdx.value = null
  privateDragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', 'private-' + idx)
  }
}
function onPrivateDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  privateDragOverIdx.value = idx
}
function onPrivateDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  if (privateDragIdx.value === null || privateDragIdx.value === targetIdx) {
    privateDragIdx.value = null
    privateDragOverIdx.value = null
    return
  }
  const oldIdx = privateDragIdx.value
  const moved = privateConfigs.value.splice(oldIdx, 1)[0]
  privateConfigs.value.splice(targetIdx, 0, moved)
  const newSet = new Set<number>()
  for (const i of dirtyPrivateIdx.value) {
    if (i === oldIdx) {
      newSet.add(targetIdx)
    } else if (oldIdx < targetIdx) {
      if (i > oldIdx && i <= targetIdx) newSet.add(i - 1)
      else newSet.add(i)
    } else {
      if (i >= targetIdx && i < oldIdx) newSet.add(i + 1)
      else newSet.add(i)
    }
  }
  dirtyPrivateIdx.value = newSet
  privateDragIdx.value = null
  privateDragOverIdx.value = null
  db.archives.update(archiveId, {
    privateConfigs: JSON.parse(JSON.stringify(toRaw(privateConfigs.value))),
  }).then(() => {
    dirtyPrivateIdx.value.clear()
  })
}
function onPrivateDragEnd() {
  privateDragIdx.value = null
  privateDragOverIdx.value = null
}

// ---- 世界观配置拖拽 ----
function onWorldDragStart(e: DragEvent, idx: number) {
  if (expandedWorldIdx.value === idx) expandedWorldIdx.value = null
  worldDragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', 'world-' + idx)
  }
}
function onWorldDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  worldDragOverIdx.value = idx
}
function onWorldDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  if (worldDragIdx.value === null || worldDragIdx.value === targetIdx) {
    worldDragIdx.value = null
    worldDragOverIdx.value = null
    return
  }
  const oldIdx = worldDragIdx.value
  const moved = worldConfigs.value.splice(oldIdx, 1)[0]
  worldConfigs.value.splice(targetIdx, 0, moved)
  const newSet = new Set<number>()
  for (const i of dirtyWorldIdx.value) {
    if (i === oldIdx) {
      newSet.add(targetIdx)
    } else if (oldIdx < targetIdx) {
      if (i > oldIdx && i <= targetIdx) newSet.add(i - 1)
      else newSet.add(i)
    } else {
      if (i >= targetIdx && i < oldIdx) newSet.add(i + 1)
      else newSet.add(i)
    }
  }
  dirtyWorldIdx.value = newSet
  worldDragIdx.value = null
  worldDragOverIdx.value = null
  db.archives.update(archiveId, {
    worldConfigs: JSON.parse(JSON.stringify(toRaw(worldConfigs.value))),
  }).then(() => {
    dirtyWorldIdx.value.clear()
  })
}
function onWorldDragEnd() {
  worldDragIdx.value = null
  worldDragOverIdx.value = null
}

onMounted(() => {
  loadData()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('click', handleSystemRoleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('click', handleSystemRoleClickOutside)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex items-center gap-4 px-4 py-3 page-header shrink-0">
      <button class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors" @click="router.back()">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-base font-semibold flex-1">存档配置</h1>
    </header>

    <div class="flex border-b border-[var(--color-border)] shrink-0">
      <button v-for="tab in [{k:'world',l:'世界观'},{k:'roles',l:'角色管理'},{k:'configs',l:'存档配置项'}]" :key="tab.k"
        :class="['flex-1 py-2.5 transition-colors duration-75 h-11 sm:h-12', activeTab === tab.k ? 'text-[var(--color-accent)] font-semibold text-base sm:text-lg shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] font-medium text-sm sm:text-base']"
        @click="activeTab = tab.k as any">{{ tab.l }}</button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4 bg-[var(--color-bg)]">

      <!-- 角色管理 -->
      <template v-if="activeTab === 'roles'">
        <div class="pt-4">
          <RoleManager
            :roles="archiveRoles"
            variant="archive"
            empty-text="暂无存档角色"
            :draggable="true"
            @add="handleArchiveRoleAdd"
            @click="handleArchiveRoleClick"
            @delete="handleArchiveRoleDelete"
            @reorder="onArchiveRolesReorder"
          />
        </div>

        <!-- 引用系统角色 -->
        <div ref="systemRoleDropdownRef">
          <div class="flex items-center justify-between mb-2 sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
            <div class="flex items-center gap-2">
              <label class="font-medium shrink-0 text-sm sm:text-base">引用系统角色</label>
              <div class="flex items-center gap-0.5">
                <div class="relative">
                  <input
                    v-model="systemRoleSearchInput"
                    type="text"
                    class="w-32 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:border-[var(--color-accent)] focus:outline-none"
                    placeholder="搜索系统角色"
                    @keyup.enter="searchSystemRoles()"
                  />
                  <div v-if="showSystemRoleDropdown" class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                    <div v-for="role in systemRoleSearchResults" :key="role.id" class="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors" @click="selectSystemRoleResult(role)">{{ role.name }}</div>
                  </div>
                </div>
                <button class="flex items-center gap-1 px-2 py-1 self-stretch rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base" @click="searchSystemRoles()"><Search :size="14" /></button>
                <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base" @click="addSystemRoleReference()"><Plus :size="14" />引用</button>
              </div>
            </div>
          </div>
          <div v-if="referencedSystemRoleIds.length === 0" class="text-center py-8 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无引用系统角色
          </div>
          <div v-else class="grid gap-3 sm:gap-4" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));">
            <template v-for="(id, idx) in referencedSystemRoleIds" :key="id">
              <div
                v-if="referencedRolesCache.has(id)"
                draggable="true"
                :class="[
                  systemRoleDragIdx === idx ? 'opacity-40' : '',
                  systemRoleDragOverIdx === idx && systemRoleDragIdx !== idx ? 'ring-2 ring-[var(--color-accent)] rounded-xl' : ''
                ]"
                @dragstart="onSystemRoleDragStart($event, idx)"
                @dragover="onSystemRoleDragOver($event, idx)"
                @drop="onSystemRoleDrop($event, idx)"
                @dragend="onSystemRoleDragEnd"
              >
                <RoleCard
                  :role="referencedRolesCache.get(id)!"
                  variant="system"
                  @click="router.push(`/character/${id}`)"
                  @contextmenu.prevent="removeSystemRoleId = id"
                />
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- 存档配置项 -->
      <template v-if="activeTab === 'configs'">
        <div>
          <div class="flex items-center justify-between mb-2 sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
            <label class="font-medium text-sm sm:text-base">私有自定义配置项</label>
            <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base"
              @click="showAddPrivateForm = true; expandedPrivateIdx = null"><Plus :size="14" />添加</button>
          </div>
          <div v-for="(cfg, i) in privateConfigs" :key="i"
            :class="['border rounded-lg overflow-hidden mb-2', privateDragOverIdx === i && privateDragIdx !== i ? 'border-t-2 border-t-[var(--color-accent)]' : 'border-[var(--color-border)]']">
            <div
              draggable="true"
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
              :class="{ 'cursor-grab': privateDragIdx === null, 'cursor-grabbing': privateDragIdx === i }"
              @click="expandedPrivateIdx = expandedPrivateIdx === i ? null : i"
              @dragstart="onPrivateDragStart($event, i)"
              @dragover="onPrivateDragOver($event, i)"
              @drop="onPrivateDrop($event, i)"
              @dragend="onPrivateDragEnd">
              <span class="font-semibold text-sm">{{ cfg.remark || cfg.key || '未命名配置' }}</span>
              <div class="flex items-center gap-2">
                <button class="text-red-400 hover:text-red-600 transition-colors" @click.stop="deletePrivateIdx = i"><Trash2 :size="16" /></button>
                <ChevronDown :size="16" class="text-[var(--color-text-muted)] transition-transform duration-200" :class="{ 'rotate-180': expandedPrivateIdx === i }" />
              </div>
            </div>
            <div v-if="expandedPrivateIdx === i" class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
                <input v-model="cfg.remark" type="text" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="备注" @input="dirtyPrivateIdx.add(i)" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="cfg.key" type="text" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" @input="dirtyPrivateIdx.add(i)" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="cfg.value" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" @input="dirtyPrivateIdx.add(i)" />
              </div>
              <button
                style="width: 95%" class="py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm block mx-auto"
                :disabled="!dirtyPrivateIdx.has(i)"
                @click="savePrivateConfigs(i)"
              >
                保存
              </button>
            </div>
          </div>
          <div v-if="privateConfigs.length === 0 && !showAddPrivateForm" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无自定义配置
          </div>
          <div v-if="showAddPrivateForm" class="border border-[var(--color-accent)] rounded-lg overflow-hidden mb-2">
            <div class="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg)]">
              <span class="font-semibold text-sm text-[var(--color-accent)]">新建配置</span>
              <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="showAddPrivateForm = false; newPrivateKey = ''; newPrivateValue = ''; newPrivateRemark = ''"><X :size="16" /></button>
            </div>
            <div class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
                <input v-model="newPrivateRemark" type="text" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="备注" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="newPrivateKey" type="text" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="newPrivateValue" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs" @click="showAddPrivateForm = false; newPrivateKey = ''; newPrivateValue = ''; newPrivateRemark = ''">取消</button>
                <button class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-xs" :disabled="!newPrivateKey.trim()" @click="addPrivateConfig()">添加</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 引用系统配置项 -->
        <div ref="systemDropdownRef">
          <div class="flex items-center justify-between mb-2 sticky top-0 z-10 bg-[var(--color-bg)] pt-4 pb-2">
            <div class="flex items-center gap-2">
              <label class="font-medium shrink-0 text-sm sm:text-base">引用系统配置项</label>
              <div class="flex items-center gap-0.5">
                <div class="relative">
                  <input v-model="systemSearchInput" type="text" class="w-36 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:border-[var(--color-accent)] focus:outline-none" placeholder="搜索配置项" @keyup.enter="searchSystemConfigs()" />
                  <div v-if="showSystemDropdown" class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                    <div v-for="item in systemSearchResults" :key="item.id" class="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors" @click="selectSystemResult(item)">{{ item.remark || item.key }}</div>
                  </div>
                </div>
                <button class="flex items-center gap-1 px-2 py-1 self-stretch rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base" @click="searchSystemConfigs()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>&#8203;</button>
                <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base" @click="addSystemConfig()"><Plus :size="14" />引用</button>
              </div>
            </div>
          </div>
          <div v-if="referencedSystemConfigIds.length === 0" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无引用系统配置项
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <span
              v-for="(id, idx) in referencedSystemConfigIds"
              :key="id"
              draggable="true"
              :class="[
                'inline-flex items-center gap-3 pl-4 pr-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 cursor-pointer hover:bg-[var(--color-accent)]/20 transition-colors select-none',
                systemConfigDragIdx === idx ? 'opacity-40' : '',
                systemConfigDragOverIdx === idx && systemConfigDragIdx !== idx ? 'ring-2 ring-[var(--color-accent)]' : ''
              ]"
              @click="viewSystemConfigId = id"
              @dragstart="onSystemConfigDragStart($event, idx)"
              @dragover="onSystemConfigDragOver($event, idx)"
              @drop="onSystemConfigDrop($event, idx)"
              @dragend="onSystemConfigDragEnd"
            >
              {{ getSystemConfigDisplay(id) }}
              <button class="hover:text-red-500 transition-colors" @click.stop="deleteSystemId = id"><X :size="10" /></button>
            </span>
          </div>
        </div>
      </template>

      <!-- 世界观 -->
      <template v-if="activeTab === 'world'">
        <div>
          <div class="flex items-center justify-between pt-4 pb-2 mb-2">
            <label class="font-medium text-sm sm:text-base">初始世界观</label>
            <button
              class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm"
              :disabled="!dirtyWorldSetting"
              @click="saveWorldSetting()"
            >
              保存
            </button>
          </div>
          <textarea v-model="worldSetting" class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="描述这个世界的背景设定、历史、地理、势力等..." @input="dirtyWorldSetting = true" />
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="font-medium text-sm sm:text-base">其他世界观</label>
            <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm sm:text-base"
              @click="showAddWorldForm = true; expandedWorldIdx = null"><Plus :size="14" />添加</button>
          </div>
          <div v-for="(cfg, i) in worldConfigs" :key="i"
            :class="['border rounded-lg overflow-hidden mb-2', worldDragOverIdx === i && worldDragIdx !== i ? 'border-t-2 border-t-[var(--color-accent)]' : 'border-[var(--color-border)]']">
            <div
              draggable="true"
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
              :class="{ 'cursor-grab': worldDragIdx === null, 'cursor-grabbing': worldDragIdx === i }"
              @click="expandedWorldIdx = expandedWorldIdx === i ? null : i"
              @dragstart="onWorldDragStart($event, i)"
              @dragover="onWorldDragOver($event, i)"
              @drop="onWorldDrop($event, i)"
              @dragend="onWorldDragEnd">
              <span class="font-semibold text-sm">{{ cfg.remark || cfg.key || '未命名配置' }}</span>
              <div class="flex items-center gap-2">
                <button class="text-red-400 hover:text-red-600 transition-colors" @click.stop="deleteWorldIdx = i"><Trash2 :size="16" /></button>
                <ChevronDown :size="16" class="text-[var(--color-text-muted)] transition-transform duration-200" :class="{ 'rotate-180': expandedWorldIdx === i }" />
              </div>
            </div>
            <div v-if="expandedWorldIdx === i" class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
                <input v-model="cfg.remark" type="text" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="备注" @input="dirtyWorldIdx.add(i)" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="cfg.key" type="text" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" @input="dirtyWorldIdx.add(i)" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="cfg.value" class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" @input="dirtyWorldIdx.add(i)" />
              </div>
              <button
                style="width: 95%" class="py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm block mx-auto"
                :disabled="!dirtyWorldIdx.has(i)"
                @click="saveWorldConfigs(i)"
              >
                保存
              </button>
            </div>
          </div>
          <div v-if="worldConfigs.length === 0 && !showAddWorldForm" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
            暂无其他世界观
          </div>
          <div v-if="showAddWorldForm" class="border border-[var(--color-accent)] rounded-lg overflow-hidden mb-2">
            <div class="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg)]">
              <span class="font-semibold text-sm text-[var(--color-accent)]">新建配置</span>
              <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="showAddWorldForm = false; newWorldKey = ''; newWorldValue = ''; newWorldRemark = ''"><X :size="16" /></button>
            </div>
            <div class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
                <input v-model="newWorldRemark" type="text" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="备注" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <input v-model="newWorldKey" type="text" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" placeholder="配置名称" />
              </div>
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <textarea v-model="newWorldValue" class="w-full bg-[var(--color-surface)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm" rows="2" v-auto-resize placeholder="配置内容" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs" @click="showAddWorldForm = false; newWorldKey = ''; newWorldValue = ''; newWorldRemark = ''">取消</button>
                <button class="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-xs" :disabled="!newWorldKey.trim()" @click="addWorldConfig()">添加</button>
              </div>
            </div>
          </div>
        </div>
      </template>

    </div>

    <ConfirmModal :visible="deletePrivateIdx !== null" title="删除自定义配置" :message="`确认删除自定义配置「${deletePrivateIdx !== null ? privateConfigs[deletePrivateIdx]?.remark || privateConfigs[deletePrivateIdx]?.key : ''}」？`" confirm-text="删除" :danger="true"
      @confirm="confirmDeletePrivate()" @cancel="deletePrivateIdx = null" />
    <ConfirmModal :visible="deleteWorldIdx !== null" title="删除自定义配置" :message="`确认删除自定义配置「${deleteWorldIdx !== null ? worldConfigs[deleteWorldIdx]?.remark || worldConfigs[deleteWorldIdx]?.key : ''}」？`" confirm-text="删除" :danger="true"
      @confirm="confirmDeleteWorld()" @cancel="deleteWorldIdx = null" />
    <ConfirmModal :visible="deleteSystemId !== null" title="解除引用" :message="`确认解除对系统配置项「${deleteSystemId !== null ? getSystemConfigDisplay(deleteSystemId) : ''}」的引用？`" confirm-text="解除"
      @confirm="deleteSystemId !== null && removeSystemConfig(deleteSystemId)" @cancel="deleteSystemId = null" />

    <ConfirmModal :visible="removeSystemRoleId !== null" title="解除引用" :message="`确认解除对系统角色「${removeSystemRoleId !== null ? referencedRolesCache.get(removeSystemRoleId)?.name || '' : ''}」的引用？`" confirm-text="解除"
      @confirm="removeSystemRoleId !== null && removeSystemRoleReference(removeSystemRoleId)" @cancel="removeSystemRoleId = null" />

    <ConfirmModal
      :visible="showLeaveConfirm"
      title="未保存的更改"
      message="当前有未保存的更改，离开将丢失所有修改。确认离开？"
      confirm-text="确认离开"
      :danger="true"
      @confirm="confirmLeave()"
      @cancel="showLeaveConfirm = false"
    />

    <!-- 查看系统配置项详情弹窗 -->
    <Teleport to="body">
      <div
        v-if="viewSystemConfigId !== null"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="viewSystemConfigId = null"
      >
        <div class="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-[90vw] max-w-lg h-[80vh] flex flex-col mx-4 pb-3">
          <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
            <span class="font-semibold text-base">系统配置项详情</span>
            <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="viewSystemConfigId = null">
              <X :size="18" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div v-if="viewSystemConfig">
              <div>
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
                <div class="text-sm text-[var(--color-text-primary)] px-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">{{ viewSystemConfig.remark }}</div>
              </div>
              <div class="mt-3">
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
                <div class="text-sm text-[var(--color-text-primary)] px-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">{{ viewSystemConfig.key }}</div>
              </div>
              <div class="mt-3">
                <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
                <div class="text-sm text-[var(--color-text-primary)] px-3 py-2 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] whitespace-pre-wrap max-h-60 overflow-y-auto">{{ viewSystemConfig.value }}</div>
              </div>
            </div>
            <div v-else class="text-center py-8 text-sm text-[var(--color-text-muted)]">
              该配置项已被删除
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
