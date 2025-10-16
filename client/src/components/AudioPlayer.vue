<template>
  <div v-if="audioSegments.length > 0" class="audio-player">
    <div class="audio-player-header">
      <span class="audio-icon">🔊</span>
      <span class="audio-title">Audio Playback</span>
      <button @click="toggleMinimize" class="minimize-btn">
        {{ isMinimized ? '▼' : '▲' }}
      </button>
    </div>

    <div v-if="!isMinimized" class="audio-player-body">
      <!-- Current segment info -->
      <div v-if="currentSegment" class="current-segment">
        <div class="speaker-name">
          {{ getSpeakerDisplayName(currentSegment.speaker) }}
        </div>
        <div class="segment-text">{{ currentSegment.text }}</div>
      </div>

      <!-- Playback progress -->
      <div class="playback-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: playbackProgress + '%' }"
          ></div>
        </div>
        <div class="time-display">
          {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
        </div>
      </div>

      <!-- Playback controls -->
      <div class="playback-controls">
        <button
          @click="previousSegment"
          :disabled="currentSegmentIndex === 0"
          class="control-btn"
        >
          ⏮️
        </button>
        <button @click="togglePlayback" class="control-btn play-btn">
          {{ isPlaying ? '⏸️' : '▶️' }}
        </button>
        <button
          @click="nextSegment"
          :disabled="currentSegmentIndex >= audioSegments.length - 1"
          class="control-btn"
        >
          ⏭️
        </button>
        <button @click="stopPlayback" class="control-btn">⏹️</button>
      </div>

      <!-- Segment list -->
      <div class="segment-list">
        <div
          v-for="(segment, index) in audioSegments"
          :key="segment.id"
          @click="playSegment(index)"
          :class="[
            'segment-item',
            { 'segment-active': index === currentSegmentIndex },
            { 'segment-played': index < currentSegmentIndex }
          ]"
        >
          <span class="segment-speaker">{{
            getSpeakerDisplayName(segment.speaker)
          }}</span>
          <span class="segment-duration">{{ formatTime(segment.duration) }}</span>
        </div>
      </div>
    </div>

    <!-- Hidden audio element -->
    <audio
      ref="audioElement"
      @ended="onAudioEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
    ></audio>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';

interface AudioSegment {
  id: string;
  speaker: string;
  url: string;
  text: string;
  duration: number;
}

interface Props {
  segments?: AudioSegment[];
  autoPlay?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  segments: () => [],
  autoPlay: false
});

// Component state
const audioSegments = ref<AudioSegment[]>([]);
const currentSegmentIndex = ref(-1);
const isPlaying = ref(false);
const isMinimized = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const audioElement = ref<HTMLAudioElement | null>(null);

// Computed properties
const currentSegment = computed(() => {
  if (currentSegmentIndex.value >= 0 && currentSegmentIndex.value < audioSegments.value.length) {
    return audioSegments.value[currentSegmentIndex.value];
  }
  return null;
});

const totalDuration = computed(() => {
  return audioSegments.value.reduce((sum, seg) => sum + seg.duration, 0);
});

const playbackProgress = computed(() => {
  if (duration.value === 0) return 0;
  return (currentTime.value / duration.value) * 100;
});

// Watch for new segments
watch(
  () => props.segments,
  (newSegments) => {
    if (newSegments && newSegments.length > 0) {
      audioSegments.value = [...newSegments];

      // Auto-play if enabled and not already playing
      if (props.autoPlay && !isPlaying.value) {
        playSegment(0);
      }
    }
  },
  { immediate: true }
);

// Methods
function getSpeakerDisplayName(speaker: string): string {
  if (speaker === 'narrator') {
    return 'Narrator';
  }
  // Capitalize first letter of each word
  return speaker
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playSegment(index: number): void {
  if (index < 0 || index >= audioSegments.value.length) return;

  const segment = audioSegments.value[index];
  currentSegmentIndex.value = index;

  if (audioElement.value) {
    audioElement.value.src = segment.url;
    audioElement.value.load();
    audioElement.value.play().then(() => {
      isPlaying.value = true;
    }).catch(error => {
      console.error('[AudioPlayer] Failed to play segment:', error);
      isPlaying.value = false;
    });
  }
}

function togglePlayback(): void {
  if (!audioElement.value) return;

  if (isPlaying.value) {
    audioElement.value.pause();
    isPlaying.value = false;
  } else {
    // If no segment is loaded, play the first one
    if (currentSegmentIndex.value === -1 && audioSegments.value.length > 0) {
      playSegment(0);
    } else {
      audioElement.value.play().then(() => {
        isPlaying.value = true;
      }).catch(error => {
        console.error('[AudioPlayer] Failed to resume playback:', error);
      });
    }
  }
}

function stopPlayback(): void {
  if (audioElement.value) {
    audioElement.value.pause();
    audioElement.value.currentTime = 0;
  }
  isPlaying.value = false;
  currentSegmentIndex.value = -1;
  currentTime.value = 0;
}

function previousSegment(): void {
  if (currentSegmentIndex.value > 0) {
    playSegment(currentSegmentIndex.value - 1);
  }
}

function nextSegment(): void {
  if (currentSegmentIndex.value < audioSegments.value.length - 1) {
    playSegment(currentSegmentIndex.value + 1);
  }
}

function onAudioEnded(): void {
  // Auto-play next segment if available
  if (currentSegmentIndex.value < audioSegments.value.length - 1) {
    playSegment(currentSegmentIndex.value + 1);
  } else {
    // All segments played
    isPlaying.value = false;
    currentSegmentIndex.value = -1;
  }
}

function onTimeUpdate(): void {
  if (audioElement.value) {
    currentTime.value = audioElement.value.currentTime;
  }
}

function onLoadedMetadata(): void {
  if (audioElement.value) {
    duration.value = audioElement.value.duration;
  }
}

function toggleMinimize(): void {
  isMinimized.value = !isMinimized.value;
}

// Cleanup
onUnmounted(() => {
  if (audioElement.value) {
    audioElement.value.pause();
    audioElement.value.src = '';
  }
});

// Expose methods for parent component
defineExpose({
  loadSegments: (segments: AudioSegment[]) => {
    audioSegments.value = segments;
  },
  play: () => togglePlayback(),
  stop: stopPlayback,
  clear: () => {
    stopPlayback();
    audioSegments.value = [];
  }
});
</script>

<style scoped>
.audio-player {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 350px;
  background: var(--color-backgroundAlt, #1a1a1a);
  border: 2px solid var(--color-border, #00ff00);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  font-family: 'Courier New', monospace;
}

.audio-player-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-background, #000);
  border-bottom: 1px solid var(--color-border, #00ff00);
  border-radius: 6px 6px 0 0;
}

.audio-icon {
  font-size: 20px;
  margin-right: 8px;
}

.audio-title {
  flex: 1;
  font-weight: bold;
  color: var(--color-primary, #00ff00);
  font-size: 14px;
}

.minimize-btn {
  background: none;
  border: none;
  color: var(--color-text, #00ff00);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  transition: opacity 0.2s;
}

.minimize-btn:hover {
  opacity: 0.7;
}

.audio-player-body {
  padding: 16px;
}

.current-segment {
  margin-bottom: 16px;
}

.speaker-name {
  font-weight: bold;
  color: var(--color-primary, #00ff00);
  font-size: 14px;
  margin-bottom: 6px;
}

.segment-text {
  color: var(--color-text, #00ff00);
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.9;
}

.playback-progress {
  margin-bottom: 12px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(0, 255, 0, 0.2);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--color-primary, #00ff00),
    var(--color-secondary, #00aa00)
  );
  transition: width 0.1s linear;
  border-radius: 3px;
}

.time-display {
  font-size: 11px;
  color: var(--color-textAlt, #00aa00);
  text-align: center;
  opacity: 0.8;
}

.playback-controls {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.control-btn {
  background: var(--color-background, #000);
  border: 1px solid var(--color-border, #00ff00);
  color: var(--color-text, #00ff00);
  cursor: pointer;
  font-size: 16px;
  padding: 8px 12px;
  border-radius: 4px;
  transition: all 0.2s;
}

.control-btn:hover:not(:disabled) {
  background: var(--color-primary, #00ff00);
  color: var(--color-background, #000);
  box-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.play-btn {
  font-size: 18px;
  padding: 8px 16px;
}

.segment-list {
  max-height: 150px;
  overflow-y: auto;
  border-top: 1px solid rgba(0, 255, 0, 0.3);
  padding-top: 8px;
}

.segment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.segment-item:hover {
  background: rgba(0, 255, 0, 0.1);
  border-color: var(--color-border, #00ff00);
}

.segment-active {
  background: rgba(0, 255, 0, 0.2);
  border-color: var(--color-primary, #00ff00);
}

.segment-played {
  opacity: 0.5;
}

.segment-speaker {
  font-size: 12px;
  color: var(--color-text, #00ff00);
  font-weight: bold;
}

.segment-duration {
  font-size: 11px;
  color: var(--color-textAlt, #00aa00);
  opacity: 0.7;
}

/* Custom scrollbar for segment list */
.segment-list::-webkit-scrollbar {
  width: 6px;
}

.segment-list::-webkit-scrollbar-track {
  background: rgba(0, 255, 0, 0.1);
  border-radius: 3px;
}

.segment-list::-webkit-scrollbar-thumb {
  background: var(--color-primary, #00ff00);
  border-radius: 3px;
}

.segment-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-secondary, #00aa00);
}
</style>
