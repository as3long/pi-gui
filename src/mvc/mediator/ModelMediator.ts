import type { INotification } from '@puremvc/puremvc-js-multicore-framework'
import { BaseMediator } from './BaseMediator'
import { NotificationNames } from '../AppFacade'
import { ModelProxy } from '../proxy/ModelProxy'

/**
 * ModelMediator
 * Centralized handler for model/provider changes
 * Ensures all components stay in sync
 */
export class ModelMediator extends BaseMediator {
  static readonly NAME: string = 'ModelMediator'

  // Callbacks that components can register
  private static listeners: Array<(model: { provider: string; modelId: string }) => void> = []

  constructor() {
    super(ModelMediator.NAME, null)
  }

  static addModelChangeListener(callback: (model: { provider: string; modelId: string }) => void): () => void {
    ModelMediator.listeners.push(callback)
    return () => {
      ModelMediator.listeners = ModelMediator.listeners.filter((l) => l !== callback)
    }
  }

  listNotificationInterests(): string[] {
    return [
      NotificationNames.MODEL_CHANGED,
      NotificationNames.PROVIDER_CHANGED,
    ]
  }

  handleNotification(notification: INotification): void {
    const modelProxy = this.facade.retrieveProxy(ModelProxy.NAME) as ModelProxy

    switch (notification.name) {
      case NotificationNames.MODEL_CHANGED:
      case NotificationNames.PROVIDER_CHANGED:
        // Notify all listeners
        for (const listener of ModelMediator.listeners) {
          listener({
            provider: modelProxy.provider,
            modelId: modelProxy.modelId,
          })
        }
        break
    }
  }
}
