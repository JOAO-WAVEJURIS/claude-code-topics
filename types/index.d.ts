export type Caminho = string

declare module 'claude-code' {
  interface PluginState {
    topicos: { path: string; open: number; rev: number; hit: string }
  }
}
