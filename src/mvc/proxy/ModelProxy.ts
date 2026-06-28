import { Proxy } from '@puremvc/puremvc-js-multicore-framework'
import { NotificationNames } from '../AppFacade'

/**
 * Model Proxy - Single source of truth for model/provider state
 */
export class ModelProxy extends Proxy {
  static readonly NAME: string = 'ModelProxy'

  private _state = {
    provider: '',
    modelId: '',
    thinkingLevel: 'medium',
    availableModels: [] as Array<{ id: string; name: string; provider: string; reasoning?: boolean }>,
    currentModel: null as { id: string; name: string; provider: string } | null,
  }

  constructor() {
    super(ModelProxy.NAME, null)
    this.loadPersisted()
    console.log('[PureMVC] ModelProxy initialized')
  }

  private getState() {
    return this._state
  }

  get provider(): string {
    return this.getState().provider
  }

  get modelId(): string {
    return this.getState().modelId
  }

  get thinkingLevel(): string {
    return this.getState().thinkingLevel
  }

  get availableModels(): Array<{ id: string; name: string; provider: string; reasoning?: boolean }> {
    return this.getState().availableModels
  }

  get currentModel(): { id: string; name: string; provider: string } | null {
    return this.getState().currentModel
  }

  setProvider(provider: string): void {
    this.getState().provider = provider
    this.savePersisted()
    this.facade.sendNotification(NotificationNames.PROVIDER_CHANGED, { provider })
  }

  setModelId(modelId: string): void {
    this.getState().modelId = modelId
    this.savePersisted()
    this.facade.sendNotification(NotificationNames.MODEL_CHANGED, {
      provider: this.provider,
      model: modelId,
    })
  }

  setThinkingLevel(level: string): void {
    this.getState().thinkingLevel = level
    this.savePersisted()
  }

  setAvailableModels(models: Array<{ id: string; name: string; provider: string; reasoning?: boolean }>): void {
    this.getState().availableModels = models
  }

  setCurrentModel(model: { id: string; name: string; provider: string } | null): void {
    this.getState().currentModel = model
  }

  private savePersisted(): void {
    try {
      localStorage.setItem('pi-gui:model', JSON.stringify({
        provider: this.provider,
        modelId: this.modelId,
        thinkingLevel: this.thinkingLevel,
      }))
    } catch (e) {
      console.warn('[ModelProxy] Failed to save persisted state:', e)
    }
  }

  loadPersisted(): void {
    try {
      const saved = localStorage.getItem('pi-gui:model')
      if (saved) {
        const data = JSON.parse(saved)
        this.getState().provider = data.provider || ''
        this.getState().modelId = data.modelId || ''
        this.getState().thinkingLevel = data.thinkingLevel || 'medium'
      }
    } catch (e) {
      console.warn('[ModelProxy] Failed to load persisted state:', e)
    }
  }
}
