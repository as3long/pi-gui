import { Proxy } from '@puremvc/puremvc-js-multicore-framework'

/**
 * Session state data
 */
interface SessionData {
  currentSessionId: string | null
  currentSessionFile: string | null
  sessionName: string | null
  stats: {
    sessionFile: string
    sessionId: string
    userMessages: number
    assistantMessages: number
    toolCalls: number
    toolResults: number
    totalMessages: number
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
    cost: number
    contextUsage: { tokens: number; contextWindow: number; percent: number }
  } | null
  sessionStatus: 'idle' | 'running' | 'failed' | 'paused'
}

/**
 * Session Proxy - Single source of truth for session state
 */
export class SessionProxy extends Proxy {
  static readonly NAME: string = 'SessionProxy'

  private _state: SessionData = {
    currentSessionId: null,
    currentSessionFile: null,
    sessionName: null,
    stats: null,
    sessionStatus: 'idle',
  }

  constructor() {
    super(SessionProxy.NAME, null)
    this._state = this.loadPersisted() || this._state
    console.log('[PureMVC] SessionProxy initialized')
  }

  private getState(): SessionData {
    return this._state
  }

  get currentSessionId(): string | null {
    return this.getState().currentSessionId
  }

  get currentSessionFile(): string | null {
    return this.getState().currentSessionFile
  }

  get sessionName(): string | null {
    return this.getState().sessionName
  }

  get stats() {
    return this.getState().stats
  }

  get sessionStatus(): string {
    return this.getState().sessionStatus
  }

  setCurrentSession(id: string | null, file: string | null, name: string | null): void {
    this.getState().currentSessionId = id
    this.getState().currentSessionFile = file
    this.getState().sessionName = name
    this.savePersisted()
  }

  setStats(stats: any): void {
    this.getState().stats = {
      sessionFile: stats?.sessionFile || '',
      sessionId: stats?.sessionId || '',
      userMessages: stats?.userMessages || 0,
      assistantMessages: stats?.assistantMessages || 0,
      toolCalls: stats?.toolCalls || 0,
      toolResults: stats?.toolResults || 0,
      totalMessages: stats?.totalMessages || 0,
      tokens: {
        input: stats?.tokens?.input || 0,
        output: stats?.tokens?.output || 0,
        cacheRead: stats?.tokens?.cacheRead || 0,
        cacheWrite: stats?.tokens?.cacheWrite || 0,
        total: stats?.tokens?.total || 0,
      },
      cost: stats?.cost || 0,
      contextUsage: {
        tokens: stats?.contextUsage?.tokens || 0,
        contextWindow: stats?.contextUsage?.contextWindow || 0,
        percent: stats?.contextUsage?.percent || 0,
      },
    }
  }

  setSessionStatus(status: 'idle' | 'running' | 'failed' | 'paused'): void {
    this.getState().sessionStatus = status
  }

  private savePersisted(): void {
    try {
      localStorage.setItem('pi-gui:currentSession', JSON.stringify({
        sessionId: this.getState().currentSessionId,
        sessionFile: this.getState().currentSessionFile,
        sessionName: this.getState().sessionName,
      }))
    } catch (e) {
      console.warn('[SessionProxy] Failed to save persisted state:', e)
    }
  }

  private loadPersisted(): SessionData | null {
    try {
      const saved = localStorage.getItem('pi-gui:currentSession')
      if (saved) {
        const data = JSON.parse(saved)
        return {
          currentSessionId: data.sessionId || null,
          currentSessionFile: data.sessionFile || null,
          sessionName: data.sessionName || null,
          stats: null,
          sessionStatus: 'idle',
        }
      }
    } catch (e) {
      console.warn('[SessionProxy] Failed to load persisted state:', e)
    }
    return null
  }
}
