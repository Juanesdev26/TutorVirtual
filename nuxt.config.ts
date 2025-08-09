export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  features: {
    devLogs: false, // Reducir logs en producción
  },
  ssr: false,
  css: ["~/assets/css/main.css"],
  modules: [
    "@nuxt/ui",
    "@nuxtjs/tailwindcss",
    ["@prisma/nuxt", {
      studio: false, // Desactivar Prisma Studio en desarrollo
      client: {
        autoRegister: false,
        prismaPath: "node_modules/.prisma/client",
      },
    }],
  ],
  components: [
    {
      path: "~/components",
      pathPrefix: false, // Mejor organización según docs
      extensions: [".vue"], // Limitar a extensiones necesarias
    },
  ],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  runtimeConfig: {
    jwtSecret: process.env.JWT_SECRET,
    geminiApiKey: process.env.GEMINI_API_KEY,
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || "/api",
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
  app: {
    head: {
      link: [
        {
          rel: "preload",
          href: "/_nuxt/@nuxt/ui-templates/dist/templates.min.css",
          as: "style",
        },
      ],
    },
  },
  colorMode: {
    preference: "system",
    fallback: "light",
  },
  vite: {
    build: {
      cssMinify: "esbuild",
      minify: "esbuild",
      // terserOptions are ignored when using esbuild; keeping minimal terser config commented
      // terserOptions: {
      //   compress: {
      //     drop_console: process.env.NODE_ENV === "production",
      //     drop_debugger: process.env.NODE_ENV === "production",
      //   },
      //   format: {
      //     comments: false,
      //   },
      // },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["vue", "vue-router", "@supabase/supabase-js"],
            prisma: ["@prisma/client"],
          },
        },
      },
    },
    optimizeDeps: {
      include: ["vue", "vue-router", "@google/generative-ai", "jwt-decode"],
    },
    css: {
      preprocessorMaxWorkers: true,
    },
  },
  experimental: {
    asyncEntry: true, // Habilitar carga async
    componentIslands: true, // Islands architecture
    viewTransition: true,
    renderJsonPayloads: false,
    clientFallback: true,
  },
  nitro: {
    compressPublicAssets: {
      gzip: true,
      brotli: true,
    },
    prerender: {
      crawlLinks: true,
      routes: ["/"],
    },
    moduleSideEffects: [], // Mejorar tree-shaking
    minify: true,
    routeRules: {
      "/api/": {
        cors: true
      },
      "/api/news": { swr: 1800 },
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  build: {
    transpile: ["@google/generative-ai", "cookie"],
  },
  tailwindcss: {
    configPath: "~/tailwind.config.js",
    exposeConfig: true,
    viewer: false,
  },
});