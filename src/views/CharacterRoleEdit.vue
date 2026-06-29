<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import { callLLM } from '@/composables/useLLM'
import { useDefaultConfigs } from '@/composables/useDefaultConfigs'
import type { CharacterRole, ApiConfig, SystemConfigItem, CustomConfigItem } from '@/types'
import { ArrowLeft, Plus, X, Sparkles, Search } from 'lucide-vue-next'
import { getBlobUrl, preloadImages } from '@/composables/useImagePreload'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { defaultIds, loadDefaultIds, isDefaultId } = useDefaultConfigs()

const isNew = computed(() => route.params.id === 'new')
const archiveId = computed(() => {
  const q = route.query.archiveId
  return q ? Number(q) : undefined
})

const remark = ref('')
const name = ref('')
const age = ref('')
const gender = ref('')
const identity = ref('')
const background = ref('')
const appearance = ref('')
const personalityPreferences = ref('')
const keyLines = ref('')
const abilities = ref('')
const images = ref<string[]>([])
const roleId = ref<number | null>(null)
const createdAt = ref(Date.now())
const sortOrder = ref(Date.now())
const saving = ref(false)

const showLeaveConfirm = ref(false)
const leaving = ref(false)
const originalData = ref<string>('')

const isDirty = computed(() => {
  const current = JSON.stringify({
    remark: remark.value.trim(),
    name: name.value.trim(),
    age: age.value.trim(),
    gender: gender.value.trim(),
    identity: identity.value,
    background: background.value,
    appearance: appearance.value,
    personalityPreferences: personalityPreferences.value,
    keyLines: keyLines.value,
    abilities: abilities.value,
    images: images.value,
    archiveId: archiveId.value,
  })
  return current !== originalData.value
})

// AI 生成相关
const showAiModal = ref(false)
const aiDescription = ref('')
const aiGenerating = ref(false)
const aiApiId = ref<number | null>(Number(localStorage.getItem('characterGenApiId')) || null)
const apiConfigs = ref<ApiConfig[]>([])
const referExistingRole = ref(false)

// 引用配置项
const referencedSystemConfigIds = ref<number[]>([])
const referencedPrivateConfigKeys = ref<string[]>([])
const systemConfigCache = ref<Map<number, { key: string; remark: string; value: string }>>(new Map())
const systemSearchInput = ref('')
const systemSearchResults = ref<SystemConfigItem[]>([])
const privateSearchResults = ref<CustomConfigItem[]>([])
const showSystemDropdown = ref(false)
const systemDropdownRef = ref<HTMLElement | null>(null)
const selectedSystemConfigId = ref<number | null>(null)
const selectedPrivateConfigKey = ref<string | null>(null)
const viewSystemConfigId = ref<number | null>(null)
const deleteSystemId = ref<number | null>(null)
const viewPrivateConfig = ref<CustomConfigItem | null>(null)
const deletePrivateKey = ref<string | null>(null)
const archivePrivateConfigs = ref<CustomConfigItem[]>([])

const viewSystemConfig = computed(() => {
  if (viewSystemConfigId.value === null) return null
  return systemConfigCache.value.get(viewSystemConfigId.value) ?? null
})

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

async function searchSystemConfigs() {
  selectedSystemConfigId.value = null
  selectedPrivateConfigKey.value = null
  const q = systemSearchInput.value.trim()
  let results: SystemConfigItem[]
  if (!q) {
    results = await db.systemConfigs.toArray()
  } else {
    results = await db.systemConfigs.filter(c => c.key.includes(q) || (c.remark ? c.remark.includes(q) : false)).toArray()
  }
  results = results.filter(c => !referencedSystemConfigIds.value.includes(c.id!) && !isDefaultId(c.id!))
  systemSearchResults.value = results
  if (archiveId.value) {
    privateSearchResults.value = archivePrivateConfigs.value.filter(c =>
      !referencedPrivateConfigKeys.value.includes(c.key) &&
      (!q || c.key.includes(q) || (c.remark ? c.remark.includes(q) : false))
    )
  } else {
    privateSearchResults.value = []
  }
  showSystemDropdown.value = true
}

function selectSystemResult(item: SystemConfigItem) {
  systemSearchInput.value = item.key
  selectedSystemConfigId.value = item.id!
  selectedPrivateConfigKey.value = null
  showSystemDropdown.value = false
}

function selectPrivateResult(item: CustomConfigItem) {
  systemSearchInput.value = item.key
  selectedSystemConfigId.value = null
  selectedPrivateConfigKey.value = item.key
  showSystemDropdown.value = false
}

async function addSystemConfig() {
  if (selectedSystemConfigId.value !== null) {
    const id = selectedSystemConfigId.value
    const sysCfg = await db.systemConfigs.get(id)
    if (!sysCfg) { appStore.showToast('该系统配置项已被删除', 'error'); return }
    if (referencedSystemConfigIds.value.includes(id)) {
      appStore.showToast('该配置项已引用', 'error')
      return
    }
    referencedSystemConfigIds.value = [...referencedSystemConfigIds.value, id]
    systemSearchInput.value = ''
    selectedSystemConfigId.value = null
    showSystemDropdown.value = false
    await persistSystemReferences()
    await refreshSystemConfigCache()
    appStore.showToast('已引用系统配置项', 'success')
    return
  }
  if (selectedPrivateConfigKey.value !== null) {
    const key = selectedPrivateConfigKey.value
    if (referencedPrivateConfigKeys.value.includes(key)) {
      appStore.showToast('该私有配置项已引用', 'error')
      return
    }
    referencedPrivateConfigKeys.value = [...referencedPrivateConfigKeys.value, key]
    systemSearchInput.value = ''
    selectedPrivateConfigKey.value = null
    showSystemDropdown.value = false
    await persistPrivateReferences()
    appStore.showToast('已引用私有配置项', 'success')
    return
  }
  const q = systemSearchInput.value.trim()
  if (!q) { appStore.showToast('请输入或搜索配置项名称', 'error'); return }
  const sysCfg = await db.systemConfigs.where('key').equals(q).first()
  if (sysCfg) {
    if (isDefaultId(sysCfg.id!)) { appStore.showToast('默认配置项无需引用', 'error'); return }
    if (referencedSystemConfigIds.value.includes(sysCfg.id!)) {
      appStore.showToast('该配置项已引用', 'error')
      return
    }
    referencedSystemConfigIds.value = [...referencedSystemConfigIds.value, sysCfg.id!]
    systemSearchInput.value = ''
    showSystemDropdown.value = false
    await persistSystemReferences()
    await refreshSystemConfigCache()
    appStore.showToast('已引用系统配置项', 'success')
    return
  }
  if (archiveId.value) {
    const privateCfg = archivePrivateConfigs.value.find(c => c.key === q)
    if (privateCfg && !referencedPrivateConfigKeys.value.includes(privateCfg.key)) {
      referencedPrivateConfigKeys.value = [...referencedPrivateConfigKeys.value, privateCfg.key]
      systemSearchInput.value = ''
      showSystemDropdown.value = false
      await persistPrivateReferences()
      appStore.showToast('已引用私有配置项', 'success')
      return
    }
  }
  appStore.showToast('未找到可引用的配置项', 'error')
}

async function persistSystemReferences() {
  if (archiveId.value) {
    await db.archives.update(archiveId.value, { referencedSystemConfigKeys: referencedSystemConfigIds.value })
  } else {
    localStorage.setItem('characterGenReferencedSystemConfigIds', JSON.stringify(referencedSystemConfigIds.value))
  }
}

async function persistPrivateReferences() {
  if (archiveId.value) {
    await db.archives.update(archiveId.value, { referencedPrivateConfigKeys: referencedPrivateConfigKeys.value })
  } else {
    localStorage.setItem('characterGenReferencedPrivateConfigKeys', JSON.stringify(referencedPrivateConfigKeys.value))
  }
}

async function removeSystemConfig(id: number) {
  referencedSystemConfigIds.value = referencedSystemConfigIds.value.filter(x => x !== id)
  deleteSystemId.value = null
  await persistSystemReferences()
  await refreshSystemConfigCache()
  appStore.showToast('已解除引用', 'success')
}

async function removePrivateConfig(key: string) {
  referencedPrivateConfigKeys.value = referencedPrivateConfigKeys.value.filter(x => x !== key)
  deletePrivateKey.value = null
  await persistPrivateReferences()
  appStore.showToast('已解除引用', 'success')
}

function handleClickOutside(e: MouseEvent) {
  if (systemDropdownRef.value && !systemDropdownRef.value.contains(e.target as Node)) {
    showSystemDropdown.value = false
    selectedSystemConfigId.value = null
    selectedPrivateConfigKey.value = null
  }
}

async function openAiModal() {
  apiConfigs.value = await db.apiConfigs.toArray()
  if (!apiConfigs.value.length) {
    appStore.showToast('请先在全局配置中添加 API 配置', 'error')
    return
  }
  const [, , archive] = await Promise.all([
    loadDefaultIds(),
    refreshSystemConfigCache(),
    archiveId.value ? db.archives.get(archiveId.value) : Promise.resolve(null),
  ])
  if (!aiApiId.value || !apiConfigs.value.some(a => a.id === aiApiId.value)) {
    aiApiId.value = apiConfigs.value[0]?.id ?? null
  }
  if (archive) {
    referencedSystemConfigIds.value = [...archive.referencedSystemConfigKeys]
    referencedPrivateConfigKeys.value = [...(archive.referencedPrivateConfigKeys || [])]
    archivePrivateConfigs.value = archive.privateConfigs || []
  } else if (!archiveId.value) {
    referencedSystemConfigIds.value = JSON.parse(localStorage.getItem('characterGenReferencedSystemConfigIds') || '[]')
    referencedPrivateConfigKeys.value = JSON.parse(localStorage.getItem('characterGenReferencedPrivateConfigKeys') || '[]')
    archivePrivateConfigs.value = []
  }
  aiDescription.value = ''
  systemSearchInput.value = ''
  showSystemDropdown.value = false
  showAiModal.value = true
}

async function generateCharacter() {
  if (!aiDescription.value.trim()) {
    appStore.showToast('请输入角色简介', 'error')
    return
  }
  const apiConfig = apiConfigs.value.find(a => a.id === aiApiId.value)
  if (!apiConfig) {
    appStore.showToast('请选择 API', 'error')
    return
  }
  aiGenerating.value = true
  try {
    const defaultSystemPrompt = `你是一个角色设定生成器。根据用户的描述，生成一个完整的角色设定。
请严格按照以下JSON格式返回，不要包含任何其他内容（不要markdown代码块标记）：

{
  "remark": "备注信息",
  "name": "角色名字",
  "age": "年龄",
  "gender": "性别",
  "identity": "身份定位",
  "background": "背景故事",
  "appearance": "形象与气质",
  "personalityPreferences": "性格与喜好",
  "keyLines": "关键台词意象",
  "abilities": "能力"
}

如果某个字段用户描述中没有相关信息，请根据上下文合理推断并填写，不要留空。`

    const config = defaultIds.value.character ? await db.systemConfigs.get(defaultIds.value.character) : undefined
    let systemPrompt = config?.value || defaultSystemPrompt

    const systemConfigs = await db.systemConfigs.bulkGet(referencedSystemConfigIds.value)
    for (const sysCfg of systemConfigs) {
      if (sysCfg) {
        systemPrompt += `\n\n【${sysCfg.key}】\n${sysCfg.value}`
      }
    }
    for (const key of referencedPrivateConfigKeys.value) {
      const cfg = archivePrivateConfigs.value.find(c => c.key === key)
      if (cfg) {
        systemPrompt += `\n\n【${cfg.key}】\n${cfg.value}`
      }
    }

    let userContent = aiDescription.value.trim()
    if (referExistingRole.value) {
      const existingFields: string[] = []
      const add = (label: string, val: string) => { if (val.trim()) existingFields.push(`${label}：${val.trim()}`) }
      add('备注', remark.value)
      add('名字', name.value)
      add('年龄', age.value)
      add('性别', gender.value)
      add('身份定位', identity.value)
      add('背景故事', background.value)
      add('形象与气质', appearance.value)
      add('性格与喜好', personalityPreferences.value)
      add('关键台词意象', keyLines.value)
      add('能力', abilities.value)
      if (existingFields.length > 0) {
        userContent = `当前角色已有配置：\n${existingFields.join('\n')}\n\n更新要求：${userContent}`
      }
    }

    const result = await callLLM(0, systemPrompt, [
      { role: 'user', content: userContent }
    ], aiApiId.value!)

    let jsonStr = result.content.trim()
    // 去除可能的 markdown 代码块标记
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI 返回内容不包含有效 JSON')
    jsonStr = jsonMatch[0]

    const parsed = JSON.parse(jsonStr)
    name.value = parsed.name || ''
    remark.value = parsed.remark || ''
    age.value = parsed.age || ''
    gender.value = parsed.gender || ''
    identity.value = parsed.identity || ''
    background.value = parsed.background || ''
    appearance.value = parsed.appearance || ''
    personalityPreferences.value = parsed.personalityPreferences || ''
    keyLines.value = parsed.keyLines || ''
    abilities.value = parsed.abilities || ''

    localStorage.setItem('characterGenApiId', String(aiApiId.value))
    showAiModal.value = false
    appStore.showToast('角色信息已生成', 'success')
  } catch (error) {
    const msg = error instanceof Error ? error.message : '生成失败'
    appStore.showToast(msg, 'error')
  } finally {
    aiGenerating.value = false
  }
}

onBeforeRouteLeave((to, from, next) => {
  if (leaving.value) {
    next()
    return
  }
  if (isDirty.value) {
    showLeaveConfirm.value = true
    next(false)
  } else {
    next()
  }
})

function handleBack() {
  if (isDirty.value) {
    showLeaveConfirm.value = true
  } else {
    router.back()
  }
}

function confirmLeave() {
  leaving.value = true
  router.back()
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  if (!isNew.value) {
    const id = Number(route.params.id)
    const role = await db.characterRoles.get(id)
    if (!role) {
      appStore.showToast('角色不存在', 'error')
      leaving.value = true
      router.back()
      return
    }
    roleId.value = role.id!
    name.value = role.name
    remark.value = role.remark || ''
    age.value = role.age
    gender.value = role.gender
    identity.value = role.identity
    background.value = role.background
    appearance.value = role.appearance
    personalityPreferences.value = role.personalityPreferences
    keyLines.value = role.keyLines
    abilities.value = role.abilities
    preloadImages(role.images)
    images.value = [...role.images]
    createdAt.value = role.createdAt
    sortOrder.value = role.sortOrder
  }
  originalData.value = JSON.stringify({
    remark: remark.value.trim(),
    name: name.value.trim(),
    age: age.value.trim(),
    gender: gender.value.trim(),
    identity: identity.value,
    background: background.value,
    appearance: appearance.value,
    personalityPreferences: personalityPreferences.value,
    keyLines: keyLines.value,
    abilities: abilities.value,
    images: images.value,
    archiveId: archiveId.value,
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const fileInputRef = ref<HTMLInputElement | null>(null)
const imageDropZone = ref<HTMLElement | null>(null)

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFiles(files: FileList | null) {
  if (!files) return
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      if (dataUrl) {
        images.value = [...images.value, dataUrl]
      }
    }
    reader.readAsDataURL(file)
  }
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  handleFiles(input.files)
  input.value = ''
}

function removeImage(idx: number) {
  images.value = images.value.filter((_, i) => i !== idx)
}

async function save() {
  if (!name.value.trim()) {
    appStore.showToast('请输入角色名称', 'error')
    return
  }
  saving.value = true
  try {
    const data: Omit<CharacterRole, 'id'> = {
      remark: remark.value.trim(),
      name: name.value.trim(),
      age: age.value.trim(),
      gender: gender.value.trim(),
      identity: identity.value,
      background: background.value,
      appearance: appearance.value,
      personalityPreferences: personalityPreferences.value,
      keyLines: keyLines.value,
      abilities: abilities.value,
      images: [...images.value],
      createdAt: createdAt.value,
      updatedAt: Date.now(),
      sortOrder: sortOrder.value,
      archiveId: archiveId.value,
    }

    if (isNew.value) {
      let maxOrder = 0
      if (archiveId.value) {
        const roles = await db.characterRoles.where('archiveId').equals(archiveId.value).toArray()
        maxOrder = roles.reduce((max, r) => Math.max(max, r.sortOrder || 0), 0)
      } else {
        const all = await db.characterRoles.toArray()
        const sysRoles = all.filter(r => !r.archiveId)
        maxOrder = sysRoles.reduce((max, r) => Math.max(max, r.sortOrder || 0), 0)
      }
      data.sortOrder = maxOrder + 1
      await db.characterRoles.add({ ...data })
      appStore.showToast('角色已创建', 'success')
    } else {
      await db.characterRoles.update(roleId.value!, data)
      appStore.showToast('角色已保存', 'success')
    }
    leaving.value = true
    router.back()
  } catch {
    appStore.showToast('保存失败', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 page-header shrink-0">
      <button
        class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        @click="handleBack"
      >
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-base font-semibold flex-1">{{ isNew ? '新建角色' : '编辑角色' }}</h1>
      <button
        class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white text-sm hover:opacity-90 transition-colors"
        @click="openAiModal"
      >
        <Sparkles :size="16" />
        <span>AI 生成</span>
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      <!-- 图片上传 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">角色图片</label>
        <div ref="imageDropZone" class="flex flex-wrap gap-3">
          <div
            v-for="(img, idx) in images"
            :key="idx"
            class="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--color-border)] shrink-0 group"
          >
            <img :src="getBlobUrl(img)" class="w-full h-full object-cover" />
            <button
              class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              @click="removeImage(idx)"
            >
              <X :size="12" />
            </button>
          </div>
          <button
            class="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center gap-1 text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors shrink-0"
            @click="triggerFileInput"
          >
            <Plus :size="20" />
            <span class="text-xs">添加</span>
          </button>
        </div>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="handleFileChange"
        />
      </div>

      <!-- 备注 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">备注</label>
        <input
          v-model="remark"
          type="text"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          placeholder="角色备注"
        />
      </div>

      <!-- 名字 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">名字</label>
        <input
          v-model="name"
          type="text"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          placeholder="角色名字"
        />
      </div>

      <!-- 年龄 + 性别 同行 -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm sm:text-base font-medium mb-1">年龄</label>
          <input
            v-model="age"
            type="text"
            class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
            placeholder="年龄"
          />
        </div>
        <div>
          <label class="block text-sm sm:text-base font-medium mb-1">性别</label>
          <input
            v-model="gender"
            type="text"
            class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
            placeholder="性别"
          />
        </div>
      </div>

      <!-- 身份定位 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">身份定位</label>
        <textarea
          v-model="identity"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的身份定位"
        />
      </div>

      <!-- 背景故事 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">背景故事</label>
        <textarea
          v-model="background"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="3"
          v-auto-resize
          placeholder="角色的背景故事"
        />
      </div>

      <!-- 形象与气质 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">形象与气质</label>
        <textarea
          v-model="appearance"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的形象与气质"
        />
      </div>

      <!-- 性格与喜好 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">性格与喜好</label>
        <textarea
          v-model="personalityPreferences"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的性格与喜好"
        />
      </div>

      <!-- 关键台词意象 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">关键台词意象</label>
        <textarea
          v-model="keyLines"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的关键台词意象"
        />
      </div>

      <!-- 能力 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">能力</label>
        <textarea
          v-model="abilities"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的能力"
        />
      </div>

      <!-- 保存按钮 -->
      <button
        style="width: 95%" class="py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm block mx-auto"
        :disabled="saving || !name.trim()"
        @click="save"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </div>

    <!-- AI 生成弹窗 -->
    <Teleport to="body">
      <div
        v-if="showAiModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showAiModal = false"
      >
        <div class="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-[90vw] max-w-lg h-[80vh] flex flex-col mx-4 pb-3">
          <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
            <span class="font-semibold text-base">AI 生成角色</span>
            <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="showAiModal = false">
              <X :size="18" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4 flex flex-col space-y-3">
            <div class="shrink-0">
              <label class="block text-xs text-[var(--color-text-secondary)] mb-1">选择 API</label>
              <select
                v-model="aiApiId"
                class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
              >
                <option v-for="api in apiConfigs" :key="api.id" :value="api.id">{{ api.name }}</option>
              </select>
            </div>
            <!-- 引用配置项 -->
            <div ref="systemDropdownRef">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <label class="font-medium shrink-0 text-xs text-[var(--color-text-secondary)]">引用配置项</label>
                  <div class="flex items-center gap-0.5">
                    <div class="relative">
                      <input
                        v-model="systemSearchInput"
                        type="text"
                        class="w-36 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:border-[var(--color-accent)] focus:outline-none"
                        :placeholder="archiveId ? '搜索系统或私有配置项' : '搜索系统配置项'"
                        @keyup.enter="searchSystemConfigs()"
                      />
                      <div v-if="showSystemDropdown" class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                        <div v-for="item in systemSearchResults" :key="'sys-'+item.id" class="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors" @click="selectSystemResult(item)">{{ item.remark || item.key }}</div>
                        <div v-for="item in privateSearchResults" :key="'priv-'+item.key" class="px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-accent)]" @click="selectPrivateResult(item)">[私有] {{ item.remark || item.key }}</div>
                      </div>
                    </div>
                    <button class="flex items-center gap-1 px-2 py-1 self-stretch rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs" @click="searchSystemConfigs()"><Search :size="14" /></button>
                    <button class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-xs" @click="addSystemConfig()"><Plus :size="14" />引用</button>
                  </div>
                </div>
              </div>
              <div v-if="referencedSystemConfigIds.length === 0 && referencedPrivateConfigKeys.length === 0" class="text-center py-4 text-xs text-[var(--color-text-muted)] empty-state rounded-lg">
                暂无引用配置项
              </div>
              <div v-else class="flex flex-wrap gap-2">
                <span
                  v-for="id in referencedSystemConfigIds"
                  :key="'ref-sys-'+id"
                  class="inline-flex items-center gap-3 pl-4 pr-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-xs text-[var(--color-accent)] border border-[var(--color-accent)]/20 cursor-pointer hover:bg-[var(--color-accent)]/20 transition-colors select-none"
                  @click="viewSystemConfigId = id"
                >
                  {{ getSystemConfigDisplay(id) }}
                  <button class="hover:text-red-500 transition-colors" @click.stop="deleteSystemId = id"><X :size="10" /></button>
                </span>
                <span
                  v-for="key in referencedPrivateConfigKeys"
                  :key="'ref-priv-'+key"
                  class="inline-flex items-center gap-3 pl-4 pr-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-xs text-[var(--color-accent)] border border-[var(--color-accent)]/20 cursor-pointer hover:bg-[var(--color-accent)]/20 transition-colors select-none"
                  @click="viewPrivateConfig = archivePrivateConfigs.find(c => c.key === key) ?? null"
                >
                  {{ key }}
                  <button class="hover:text-red-500 transition-colors" @click.stop="deletePrivateKey = key"><X :size="10" /></button>
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <input id="referExistingRole" v-model="referExistingRole" type="checkbox" class="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]" />
              <label for="referExistingRole" class="text-xs text-[var(--color-text-secondary)] cursor-pointer select-none">是否参考已有角色配置</label>
            </div>
            <div class="flex-1 flex flex-col min-h-0">
              <label class="block text-xs text-[var(--color-text-secondary)] mb-1 shrink-0">{{ referExistingRole ? '更新要求' : '角色简介' }}</label>
              <textarea
                v-model="aiDescription"
                class="w-full flex-1 px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm resize-none"
                :placeholder="referExistingRole ? '输入更新要求，例如：将年龄改为30岁，增加游泳能力...' : '输入角色描述，例如：一个来自北方的年轻剑客，性格冷峻但内心善良...'"
                :disabled="aiGenerating"
              />
            </div>
          </div>
          <div class="flex justify-end gap-3 px-5 pt-2 shrink-0">
            <button
              class="px-4 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm"
              :disabled="aiGenerating"
              @click="showAiModal = false"
            >
              取消
            </button>
            <button
              class="px-4 py-2 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-colors disabled:opacity-50 text-sm"
              :disabled="aiGenerating || !aiDescription.trim()"
              @click="generateCharacter"
            >
              {{ aiGenerating ? '生成中...' : '生成' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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

    <!-- 查看私有配置项详情弹窗 -->
    <Teleport to="body">
      <div
        v-if="viewPrivateConfig !== null"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="viewPrivateConfig = null"
      >
        <div class="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-[90vw] max-w-lg h-[80vh] flex flex-col mx-4 pb-3">
          <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
            <span class="font-semibold text-base">私有配置项详情</span>
            <button class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" @click="viewPrivateConfig = null">
              <X :size="18" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div>
              <label class="block text-xs text-[var(--color-text-secondary)] mb-1">备注</label>
              <div class="text-sm text-[var(--color-text-primary)] px-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">{{ viewPrivateConfig.remark || viewPrivateConfig.key }}</div>
            </div>
            <div class="mt-3">
              <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
              <div class="text-sm text-[var(--color-text-primary)] px-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">{{ viewPrivateConfig.key }}</div>
            </div>
            <div class="mt-3">
              <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置内容</label>
              <div class="text-sm text-[var(--color-text-primary)] px-3 py-2 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] whitespace-pre-wrap max-h-60 overflow-y-auto">{{ viewPrivateConfig.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmModal :visible="deleteSystemId !== null" title="解除引用" :message="`确认解除对系统配置项「${deleteSystemId !== null ? getSystemConfigDisplay(deleteSystemId) : ''}」的引用？`" confirm-text="解除"
      @confirm="deleteSystemId !== null && removeSystemConfig(deleteSystemId)" @cancel="deleteSystemId = null" />

    <ConfirmModal :visible="deletePrivateKey !== null" title="解除引用" :message="`确认解除对私有配置项「${deletePrivateKey}」的引用？`" confirm-text="解除"
      @confirm="deletePrivateKey !== null && removePrivateConfig(deletePrivateKey)" @cancel="deletePrivateKey = null" />

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
