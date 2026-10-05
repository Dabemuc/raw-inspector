<script setup lang="ts">
import CameraPanel from '../components/CameraPanel.vue'
import DecodePanel from '../components/DecodePanel.vue'
import PlaceholderPanel from '../components/PlaceholderPanel.vue'
import PreviewGallery from '../components/PreviewGallery.vue'
import { useInspection } from '../composables/useInspection'

const { reader, fileName, file, decoder } = useInspection()
</script>

<template>
  <div class="overview" data-testid="overview-view">
    <PlaceholderPanel title="Previews">
      <PreviewGallery v-if="reader" :reader="reader" :file-name="fileName" />
    </PlaceholderPanel>
    <PlaceholderPanel title="Decoded image">
      <DecodePanel
        :status="decoder.status.value"
        :progress="decoder.progress.value"
        :image="decoder.image.value"
        :error="decoder.error.value"
        :file-name="fileName"
        @decode="(options) => file && decoder.decode(file, options)"
        @cancel="decoder.cancel()"
      />
    </PlaceholderPanel>
    <PlaceholderPanel title="Camera & colour">
      <CameraPanel :metadata="decoder.metadata.value" />
    </PlaceholderPanel>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
</style>
