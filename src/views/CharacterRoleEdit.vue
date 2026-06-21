<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import { callLLM } from '@/composables/useLLM'
import type { CharacterRole, ApiConfig } from '@/types'
import { ArrowLeft, Plus, X, Sparkles } from 'lucide-vue-next'
import { getBlobUrl, preloadImages } from '@/composables/useImagePreload'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const isNew = computed(() => route.params.id === 'new')
const archiveId = computed(() => {
  const q = route.query.archiveId
  return q ? Number(q) : undefined
})

const name = ref('')
const age = ref('')
const gender = ref('')
const personality = ref('')
const specialAbilities = ref('')
const preferences = ref('')
const intro = ref('')
const family = ref('')
const specialNotes = ref('')
const images = ref<string[]>([])
const roleId = ref<number | null>(null)
const createdAt = ref(Date.now())
const sortOrder = ref(Date.now())
const saving = ref(false)

// AI 生成相关
const showAiModal = ref(false)
const aiDescription = ref('')
const aiGenerating = ref(false)
const aiApiId = ref<number | null>(Number(localStorage.getItem('characterGenApiId')) || null)
const apiConfigs = ref<ApiConfig[]>([])

async function openAiModal() {
  apiConfigs.value = await db.apiConfigs.toArray()
  if (!apiConfigs.value.length) {
    appStore.showToast('请先在全局配置中添加 API 配置', 'error')
    return
  }
  if (!aiApiId.value || !apiConfigs.value.some(a => a.id === aiApiId.value)) {
    aiApiId.value = apiConfigs.value[0]?.id ?? null
  }
  aiDescription.value = ''
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
  "name": "角色名字",
  "age": "年龄",
  "gender": "性别",
  "personality": "性格描述",
  "specialAbilities": "特殊能力",
  "preferences": "喜好",
  "intro": "角色简介",
  "family": "家庭背景",
  "specialNotes": "特殊备注"
}

如果某个字段用户描述中没有相关信息，请根据上下文合理推断并填写，不要留空。`

    const config = await db.systemConfigs.where('key').equals('AI 角色生成提示词').first()
    const systemPrompt = config?.value || defaultSystemPrompt

    const result = await callLLM(0, systemPrompt, [
      { role: 'user', content: aiDescription.value.trim() }
    ], aiApiId.value!)

    let jsonStr = result.content.trim()
    // 去除可能的 markdown 代码块标记
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI 返回内容不包含有效 JSON')
    jsonStr = jsonMatch[0]

    const parsed = JSON.parse(jsonStr)
    name.value = parsed.name || ''
    age.value = parsed.age || ''
    gender.value = parsed.gender || ''
    personality.value = parsed.personality || ''
    specialAbilities.value = parsed.specialAbilities || ''
    preferences.value = parsed.preferences || ''
    intro.value = parsed.intro || ''
    family.value = parsed.family || ''
    specialNotes.value = parsed.specialNotes || ''

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

onMounted(async () => {
  if (!isNew.value) {
    const id = Number(route.params.id)
    const role = await db.characterRoles.get(id)
    if (!role) {
      appStore.showToast('角色不存在', 'error')
      router.back()
      return
    }
    roleId.value = role.id!
    name.value = role.name
    age.value = role.age
    gender.value = role.gender
    personality.value = role.personality
    specialAbilities.value = role.specialAbilities
    preferences.value = role.preferences
    intro.value = role.intro
    family.value = role.family
    specialNotes.value = role.specialNotes
    await preloadImages(role.images)
    images.value = [...role.images]
    createdAt.value = role.createdAt
    sortOrder.value = role.sortOrder
  }
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
      name: name.value.trim(),
      age: age.value.trim(),
      gender: gender.value.trim(),
      personality: personality.value,
      specialAbilities: specialAbilities.value,
      preferences: preferences.value,
      intro: intro.value,
      family: family.value,
      specialNotes: specialNotes.value,
      images: [...images.value],
      createdAt: createdAt.value,
      updatedAt: Date.now(),
      sortOrder: sortOrder.value,
      archiveId: archiveId.value,
    }

    if (isNew.value) {
      await db.characterRoles.add({ ...data })
      appStore.showToast('角色已创建', 'success')
    } else {
      await db.characterRoles.update(roleId.value!, data)
      appStore.showToast('角色已保存', 'success')
    }
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
        @click="router.back()"
      >
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-base font-semibold flex-1">{{ isNew ? '新建角色' : '编辑角色' }}</h1>
      <button
        v-if="isNew"
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

      <!-- 性格 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">性格</label>
        <textarea
          v-model="personality"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的性格特征"
        />
      </div>

      <!-- 特殊能力 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">特殊能力</label>
        <textarea
          v-model="specialAbilities"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的特殊能力"
        />
      </div>

      <!-- 喜好 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">喜好</label>
        <textarea
          v-model="preferences"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的喜好"
        />
      </div>

      <!-- 简介 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">简介</label>
        <textarea
          v-model="intro"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="3"
          v-auto-resize
          placeholder="角色的简要介绍"
        />
      </div>

      <!-- 家庭 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">家庭</label>
        <textarea
          v-model="family"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="角色的家庭背景"
        />
      </div>

      <!-- 特殊标注 -->
      <div>
        <label class="block text-sm sm:text-base font-medium mb-1">特殊标注</label>
        <textarea
          v-model="specialNotes"
          class="w-full px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
          rows="2"
          v-auto-resize
          placeholder="需要特别标注的信息"
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
            <div class="flex-1 flex flex-col min-h-0">
              <label class="block text-xs text-[var(--color-text-secondary)] mb-1 shrink-0">角色简介</label>
              <textarea
                v-model="aiDescription"
                class="w-full flex-1 px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-[var(--color-accent)] focus:outline-none text-sm resize-none"
                placeholder="输入角色描述，例如：一个来自北方的年轻剑客，性格冷峻但内心善良..."
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
  </div>
</template>
