<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { CharacterRole } from '@/types'
import { getBlobUrl, isPreheated } from '@/composables/useImagePreload'

const props = defineProps<{
  role: CharacterRole
  variant: 'system' | 'archive'
}>()

const emit = defineEmits<{
  click: [role: CharacterRole]
}>()

const hasImage = computed(() => props.role.images && props.role.images.length > 0)
const blobUrl = computed(() => hasImage.value ? getBlobUrl(props.role.images[0]) : '')
const imageLoaded = ref(!hasImage.value || isPreheated(props.role.images[0]))

onMounted(() => {
  if (imageLoaded.value) return
  if (!blobUrl.value) {
    imageLoaded.value = true
    return
  }
  const img = new Image()
  img.src = blobUrl.value
  img.decode().then(() => { imageLoaded.value = true }).catch(() => { imageLoaded.value = true })
})

const updatedDate = computed(() => {
  const d = new Date(props.role.updatedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const createdDate = computed(() => {
  const d = new Date(props.role.createdAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})
</script>

<template>
  <div
    class="role-card-wrapper"
    :class="[`variant-${variant}`, { 'has-image': role.images && role.images.length > 0 }]"
    @click="emit('click', role)"
  >
    <div class="role-card-inner" :class="{ '--no-image': !hasImage }">
      <img v-if="hasImage" class="role-card-image" :class="{ loaded: imageLoaded }" :src="blobUrl" />
      <div v-if="!hasImage" class="role-card-pattern" />
      <div class="role-card-overlay" />
      <div class="role-card-content">
        <div class="role-card-center">
          <span class="role-card-name">{{ role.name || '未命名角色' }}</span>
          <span class="role-card-updated">{{ updatedDate }}</span>
        </div>
        <span class="role-card-created">创建于 {{ createdDate }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.role-card-wrapper {
  position: relative;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  user-select: none;
}

.role-card-wrapper:hover {
  transform: translateY(-4px);
}

.role-card-wrapper:hover .role-card-inner {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.role-card-inner {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #b07840 0%, #c88a50 50%, #b07840 100%);
  background-size: cover;
  background-position: center;
  transition: box-shadow 0.25s ease;
}

.role-card-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  z-index: 0;
}
.role-card-image.loaded {
  opacity: 1;
}

/* 无图时的斜条纹纹理 */
.role-card-pattern {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 16px,
    rgba(252, 248, 244, 0.045) 16px,
    rgba(252, 248, 244, 0.045) 20px
  );
  pointer-events: none;
}

/* 暗色叠加层 */
.role-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.4) 0%,
    rgba(0, 0, 0, 0) 45%,
    rgba(0, 0, 0, 0) 55%,
    rgba(0, 0, 0, 0.1) 100%
  );
  z-index: 1;
}

/* 无图片时的占位图标 */
.role-card-inner.--no-image::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  z-index: 1;
}

/* 文字内容 */
.role-card-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.role-card-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.role-card-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.05em;
}

.role-card-updated {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.75);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.role-card-created {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.5);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

/* ========== 系统配置光效：暖金色 ========== */
.variant-system .role-card-inner {
  box-shadow: 0 0 0 1px rgba(200, 150, 80, 0.25), 0 4px 16px rgba(0, 0, 0, 0.12);
}

.variant-system::before {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: 24px;
  z-index: -1;
  background: linear-gradient(
    135deg,
    rgba(200, 150, 60, 0.35),
    rgba(255, 200, 100, 0.12) 30%,
    rgba(180, 120, 40, 0.04) 50%,
    rgba(255, 180, 60, 0.2) 70%,
    rgba(200, 140, 50, 0.35)
  );
  background-size: 300% 300%;
  animation: glowPulseSystem 5s ease-in-out infinite;
  filter: blur(12px);
}

.variant-system::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 13px;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
}

/* 光线扫过 — 对角方向（暖金色） */
.variant-system .role-card-inner::before {
  content: '';
  position: absolute;
  top: -80%;
  left: -80%;
  width: 50%;
  height: 180%;
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(255, 220, 140, 0.08) 42%,
    rgba(255, 240, 180, 0.2) 48%,
    rgba(255, 200, 100, 0.12) 52%,
    rgba(255, 220, 140, 0.04) 58%,
    transparent 70%
  );
  transform: skewX(-20deg);
  animation: lightSweepSystem 5s ease-in-out infinite;
  z-index: 3;
  pointer-events: none;
}

/* 光粒子（暖金色） */
.variant-system .role-card-inner::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(2px 2px at 15% 25%, rgba(255, 220, 140, 0.9), transparent),
    radial-gradient(1.5px 1.5px at 65% 70%, rgba(255, 200, 100, 0.7), transparent),
    radial-gradient(2px 2px at 80% 15%, rgba(255, 240, 180, 0.8), transparent),
    radial-gradient(1px 1px at 35% 75%, rgba(255, 180, 60, 0.6), transparent),
    radial-gradient(1.5px 1.5px at 55% 35%, rgba(255, 210, 130, 0.7), transparent),
    radial-gradient(2.5px 2.5px at 90% 55%, rgba(255, 200, 100, 0.5), transparent);
  background-size: 250% 250%;
  animation: particlesSystem 8s ease-in-out infinite;
  z-index: 4;
  pointer-events: none;
}

@keyframes lightSweepSystem {
  0% { top: -80%; left: -80%; opacity: 0; }
  10% { opacity: 1; }
  50% { top: 130%; left: 130%; opacity: 1; }
  60% { top: 130%; left: 130%; opacity: 0; }
  100% { opacity: 0; }
}

@keyframes particlesSystem {
  0% { background-position: 0% 0%; opacity: 0.4; }
  25% { background-position: 40% 30%; opacity: 0.9; }
  50% { background-position: 80% 60%; opacity: 0.5; }
  75% { background-position: 30% 80%; opacity: 1; }
  100% { background-position: 0% 0%; opacity: 0.4; }
}

@keyframes glowPulseSystem {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

/* ========== 存档配置光效：蓝白色（参数完全对齐系统） ========== */
.variant-archive .role-card-inner {
  box-shadow: 0 0 0 1px rgba(150, 190, 240, 0.25), 0 4px 16px rgba(0, 0, 0, 0.12);
}

.variant-archive::before {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: 24px;
  z-index: -1;
  background: linear-gradient(
    135deg,
    rgba(140, 170, 220, 0.35),
    rgba(180, 210, 255, 0.12) 30%,
    rgba(100, 140, 200, 0.04) 50%,
    rgba(160, 200, 255, 0.2) 70%,
    rgba(130, 160, 220, 0.35)
  );
  background-size: 300% 300%;
  animation: glowPulseSystem 5s ease-in-out infinite;
  filter: blur(12px);
}

.variant-archive::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 13px;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
}

/* 光线扫过 — 对角方向（蓝白色） */
.variant-archive .role-card-inner::before {
  content: '';
  position: absolute;
  top: -80%;
  left: -80%;
  width: 50%;
  height: 180%;
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(180, 200, 240, 0.08) 42%,
    rgba(200, 220, 255, 0.2) 48%,
    rgba(160, 190, 240, 0.12) 52%,
    rgba(180, 210, 255, 0.04) 58%,
    transparent 70%
  );
  transform: skewX(-20deg);
  animation: lightSweepSystem 5s ease-in-out infinite;
  z-index: 3;
  pointer-events: none;
}

/* 光粒子（蓝白色） */
.variant-archive .role-card-inner::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(2px 2px at 15% 25%, rgba(190, 210, 255, 0.9), transparent),
    radial-gradient(1.5px 1.5px at 65% 70%, rgba(160, 190, 240, 0.7), transparent),
    radial-gradient(2px 2px at 80% 15%, rgba(210, 225, 255, 0.8), transparent),
    radial-gradient(1px 1px at 35% 75%, rgba(140, 170, 230, 0.6), transparent),
    radial-gradient(1.5px 1.5px at 55% 35%, rgba(180, 205, 255, 0.7), transparent),
    radial-gradient(2.5px 2.5px at 90% 55%, rgba(160, 200, 240, 0.5), transparent);
  background-size: 250% 250%;
  animation: particlesSystem 8s ease-in-out infinite;
  z-index: 4;
  pointer-events: none;
}
</style>
