import type { INotification } from '@puremvc/puremvc-js-multicore-framework'
import { BaseMediator } from './BaseMediator'
import { NotificationNames } from '../AppFacade'

/**
 * ChatMediator
 * Handles chat events and updates ChatProxy
 */
export class ChatMediator extends BaseMediator {
  static readonly NAME: string = 'ChatMediator'

  private static listeners: Array<(event: string, data: any) => void> = []

  constructor() {
    super(ChatMediator.NAME, null)
  }

  static addListener(callback: (event: string, data: any) => void): () => void {
    ChatMediator.listeners.push(callback)
    return () => {
      ChatMediator.listeners = ChatMediator.listeners.filter((l) => l !== callback)
    }
  }

  listNotificationInterests(): string[] {
    return [
      NotificationNames.MODEL_CHANGED,
      NotificationNames.PROVIDER_CHANGED,
      NotificationNames.SESSION_CREATED,
      NotificationNames.SESSION_SWITCHED,
    ]
  }

  handleNotification(notification: INotification): void {
    const name = notification.name

    // Notify all listeners about these events
    for (const listener of ChatMediator.listeners) {
      listener(name, notification.body)
    }
  }
}
