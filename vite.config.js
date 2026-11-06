import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import path from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import viteOgp from 'vite-plugin-open-graph'
import { VitePWA } from 'vite-plugin-pwa'
import { generateLicenses } from './generateLicesnses'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const buildAt = Date.now()

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    generateLicenses(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Railway Timetable Studio',
        short_name: 'Timetable',
        description: '架空鉄道のダイヤと車両運用を編集するPWA',
        theme_color: '#fff',
        display: 'standalone',
        display_override: ['window-controls-overlay'],
        lang: 'ja-jp',
        icons: [
          {
            src: 'icons/128.png',
            sizes: '128x128',
            type: 'image/png'
          }, {
            src: 'icons/512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      // devOptions: {
      //   enabled: true
      // }
    }),
    viteOgp({
      basic: {
        title: 'Railway Timetable Studio',
        type: 'website',
        image: 'https://ramune314159265.github.io/ReactAppTemplate/icons/128.png',
        description: '架空鉄道のダイヤと車両運用を編集するPWA',
        url: 'https://ramune314159265.github.io/ReactAppTemplate/',
        locale: 'ja_JP'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_AT__: buildAt
  },
})
