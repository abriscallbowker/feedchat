import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      insertTypesEntry: true,
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Feedchat',
      formats: ['es'],
      fileName: () => 'feedchat.js',
    },
    sourcemap: true,
    minify: true,
  },
  root: '.',
  publicDir: false,
  server: {
    open: '/demo/index.html',
  },
})
