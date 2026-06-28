import { Proxy } from '@puremvc/puremvc-js-multicore-framework'
import type { PiAgentSettings, PiAgentAuth } from '../../ipc/bridge'

/**
 * Config Proxy - Single Source of Truth for all config data
 */
export class ConfigProxy extends Proxy {
  static readonly NAME: string = 'ConfigProxy'

  private _state = {
    settings: {} as PiAgentSettings,
    auth: {} as PiAgentAuth,
    isLoading: false,
    error: null as string | null,
    lastUpdated: 0,
  }

  constructor() {
    super(ConfigProxy.NAME, null)
    console.log('[PureMVC] ConfigProxy initialized')
  }

  private getState() {
    return this._state
  }

  get settings(): PiAgentSettings {
    return this.getState().settings
  }

  get auth(): PiAgentAuth {
    return this.getState().auth
  }

  get isLoading(): boolean {
    return this.getState().isLoading
  }

  get error(): string | null {
    return this.getState().error
  }

  private async readJsonFile(path: string): Promise<any> {
    try {
      const { readTextFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')
      
      // Get actual home directory
      const home = await homeDir()
      console.log(`[ConfigProxy] Home directory: ${home}`)
      
      // Try with full path first
      const fullPath = `${home}/${path}`
      console.log(`[ConfigProxy] Trying full path: ${fullPath}`)
      
      try {
        const content = await readTextFile(fullPath)
        console.log(`[ConfigProxy] Read with full path, content (first 200 chars):`, content.substring(0, 200))
        if (content && content.trim()) {
          return JSON.parse(content)
        }
      } catch (e) {
        console.log(`[ConfigProxy] Full path failed:`, e)
      }
      
      // Fallback to BaseDirectory
      const fileExists = await exists(path, { baseDir: BaseDirectory.Home })
      console.log(`[ConfigProxy] File ${path} exists (BaseDirectory): ${fileExists}`)
      if (!fileExists) {
        console.log(`[ConfigProxy] File not found: ${path}`)
        return {}
      }
      const content = await readTextFile(path, { baseDir: BaseDirectory.Home })
      console.log(`[ConfigProxy] Read ${path}, raw content (first 200 chars):`, content.substring(0, 200))
      if (!content || content.trim() === '') {
        console.log(`[ConfigProxy] File is empty: ${path}`)
        return {}
      }
      try {
        const parsed = JSON.parse(content)
        console.log(`[ConfigProxy] Parsed JSON for ${path}:`, parsed)
        return parsed
      } catch (e) {
        console.error(`[ConfigProxy] Failed to parse JSON for ${path}:`, e)
        console.error(`[ConfigProxy] Raw content was:`, content)
        return {}
      }
    } catch (e) {
      console.error(`[ConfigProxy] Failed to read ${path}:`, e)
      return {}
    }
  }

  private async writeJsonFile(path: string, data: any): Promise<void> {
    try {
      const { writeTextFile, BaseDirectory, mkdir } = await import('@tauri-apps/plugin-fs')
      try {
        await mkdir('.pi', { baseDir: BaseDirectory.Home, recursive: true })
      } catch (e) {
        console.log('[ConfigProxy] Directory exists or error:', e)
      }
      await writeTextFile(path, JSON.stringify(data, null, 2), { baseDir: BaseDirectory.Home })
      console.log(`[ConfigProxy] Successfully wrote ${path}`)
    } catch (e) {
      console.error(`[ConfigProxy] Failed to write ${path}:`, e)
      throw e
    }
  }

  async loadConfig(): Promise<void> {
    console.log('[ConfigProxy] Loading config from files...')
    this.getState().isLoading = true
    this.getState().error = null
    try {
      const [settings, auth] = await Promise.all([
        this.readJsonFile('.pi/agent/settings.json'),
        this.readJsonFile('.pi/agent/auth.json'),
      ])
      this.getState().settings = this.normalizeSettings(settings)
      this.getState().auth = this.normalizeAuth(auth)
      this.getState().lastUpdated = Date.now()
      console.log('[ConfigProxy] Config loaded successfully')
    } catch (e) {
      console.error('[ConfigProxy] Failed to load config:', e)
      this.getState().error = String(e)
      throw e
    } finally {
      this.getState().isLoading = false
    }
  }

  async saveSettings(settings: PiAgentSettings): Promise<void> {
    console.log('[ConfigProxy] Saving settings:', settings)
    await this.writeJsonFile('.pi/agent/settings.json', settings)
    this.getState().settings = this.normalizeSettings(settings)
    this.getState().lastUpdated = Date.now()
  }

  async saveAuth(auth: PiAgentAuth): Promise<void> {
    console.log('[ConfigProxy] Saving auth with keys:', Object.keys(auth))
    await this.writeJsonFile('.pi/agent/auth.json', auth)
    this.getState().auth = this.normalizeAuth(auth)
    this.getState().lastUpdated = Date.now()
  }

  private normalizeSettings(settings: any): PiAgentSettings {
    return {
      defaultProvider: settings?.defaultProvider || '',
      defaultModel: settings?.defaultModel || '',
      defaultThinkingLevel: settings?.defaultThinkingLevel || 'medium',
      shellPath: settings?.shellPath || '',
      terminal: settings?.terminal || { showTerminalProgress: false },
      lastChangelogVersion: settings?.lastChangelogVersion || '',
    }
  }

  private normalizeAuth(auth: any): PiAgentAuth {
    if (!auth || typeof auth !== 'object') return {}
    return auth as PiAgentAuth
  }
}
