import { defineConfig } from 'tsdown'

const id = 'dsh-remote-server'

// Host: DSH packages come from the runtime; the plugin's own dependencies
// are installed into the profile. Keep every @deepseek-ai package external.
const hostExternal = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-tools',
]

// Browser: React and the DSH platform modules are provided by the host's
// module loader; everything else is bundled.
const clientExternal = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig([
  {
    name: id,
    entry: { index: 'src/index.js', agent: 'src/agent.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: true,
    deps: { neverBundle: hostExternal },
  },
  {
    name: `${id}/client`,
    entry: { client: 'src/client.jsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    deps: { neverBundle: clientExternal, onlyBundle: false },
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
