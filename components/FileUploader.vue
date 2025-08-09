<template>
  <!-- Contenedor para centrar vertical y horizontalmente -->
  <div class="flex justify-center p-4">
    <!-- Contenedor principal con degradado en el fondo -->
    <div class="p-6 max-w-2xl w-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-zinc-700 dark:to-zinc-800 shadow-md rounded-md">
      <h2 class="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">Subir Archivo</h2>

      <!-- Área para seleccionar el archivo con efecto drag & drop -->
      <label
        for="fileInput"
        class="block w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
      >
        <div v-if="!selectedFile" class="text-gray-500 dark:text-gray-300">
          <span class="block mb-2">Arrastra y suelta un archivo aquí</span>
          <span class="text-sm">O haz clic para seleccionar uno</span>
        </div>
        <div v-else class="text-gray-700 dark:text-gray-200">
          <span class="block mb-2">Archivo seleccionado:</span>
          <span class="font-medium">{{ selectedFile.name }}</span>
        </div>
        <input id="fileInput" type="file" class="hidden" @change="handleFileChange" />
      </label>

      <!-- Botón para subir el archivo (verde) -->
      <button
        @click="uploadFile"
        :disabled="!selectedFile || uploading"
        class="mt-4 w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-semibold py-2 px-4 rounded transition-colors"
      >
        {{ uploading ? 'Subiendo...' : 'Subir Archivo' }}
      </button>

      <!-- Mensajes de feedback -->
      <div v-if="error" class="mt-4 p-3 bg-red-100 text-red-700 rounded">
        Error: {{ error }}
      </div>
      <div v-if="success" class="mt-4 p-3 bg-green-100 text-green-700 rounded">
        Archivo subido con éxito.
      </div>

      <!-- Lista de archivos subidos -->
      <div class="mt-6">
        <h3 class="text-xl font-bold mb-3 text-gray-800 dark:text-gray-100">Archivos Subidos:</h3>
        <div v-if="materiales.length > 0">
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            <li
              v-for="material in materiales"
              :key="material.id"
              class="py-3 flex items-center justify-between"
            >
              <div>
                <a
                  :href="material.url"
                  target="_blank"
                  class="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  {{ material.nombre }}
                </a>
                <p class="text-sm text-gray-500 dark:text-gray-400">({{ material.tipo }})</p>
              </div>
              <UButton
                @click="deleteMaterial(material.id)"
                color="red"
                variant="ghost"
                icon="i-heroicons-trash"
                :loading="deleting === material.id"
              >
                Eliminar
              </UButton>
            </li>
          </ul>
        </div>
        <div v-else class="mt-4 text-center text-gray-500 dark:text-gray-400">
          No hay archivos subidos aún.
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { createClient } from '@supabase/supabase-js'

export default {
  props: {
    idAsignatura: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      selectedFile: null,
      uploading: false,
      success: false,
      error: null,
      materiales: [],
      deleting: null,
      supabase: null,
    };
  },
  mounted() {
    const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
    const supabaseAnon = process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
    this.supabase = createClient(supabaseUrl, supabaseAnon)
    this.fetchMateriales();
  },
  methods: {
    handleFileChange(event) {
      this.selectedFile = event.target.files[0];
    },
    async fetchMateriales() {
      try {
        const response = await fetch(`/api/materials/${this.idAsignatura}`);
        if (!response.ok) {
          throw new Error('Error al obtener los materiales.');
        }
        this.materiales = await response.json();
      } catch (err) {
        this.error = err.message;
      }
    },
    async uploadFile() {
      if (!this.selectedFile || !this.supabase) return;
      this.uploading = true;
      this.success = false;
      this.error = null;
      try {
        const fileName = `${Date.now()}-${this.selectedFile.name}`
        const { data, error } = await this.supabase.storage
          .from('files')
          .upload(fileName, this.selectedFile, { upsert: true, contentType: this.selectedFile.type })
        if (error) throw error

        const { data: publicUrlData } = this.supabase.storage.from('files').getPublicUrl(data.path)
        const publicUrl = publicUrlData.publicUrl

        // Guardar metadatos en la base de datos
        const res = await fetch('/api/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idAsignatura: this.idAsignatura,
            nombre: this.selectedFile.name,
            tipo: this.selectedFile.type || 'application/octet-stream',
            url: publicUrl,
          })
        })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          throw new Error(e.message || 'Error al registrar el material')
        }

        this.success = true;
        await this.fetchMateriales();
      } catch (err) {
        this.error = err.message || 'Error de subida'
      } finally {
        this.uploading = false;
      }
    },
    async deleteMaterial(idMaterial) {
      this.deleting = idMaterial;
      try {
        const response = await fetch(`/api/materials/${idMaterial}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Error al eliminar el archivo.');
        }
        await this.fetchMateriales();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.deleting = null;
      }
    },
  },
};
</script>
