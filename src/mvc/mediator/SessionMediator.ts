import type { INotification } from '@puremvc/puremvc-js-multicore-framework'
import { BaseMediator } from './BaseMediator'
import { NotificationNames } from '../AppFacade'

/**
 * SessionMediator
 * Handles session-related notifications and notifies listeners
 */
export class SessionMediator extends BaseMediator {
  static readonly NAME: string = 'SessionMediator'

  private static listeners: Array<() => void> = []

  constructor() {
    super(SessionMediator.NAME, null)
  }

  static addSessionCreatedListener(callback: () => void): () => void {
    SessionMediator.listeners.push(callback)
    return () => {
      SessionMediator.listeners = SessionMediator.listeners.filter((l) => l !== callback)
    }
  }

  listNotificationInterests(): string[] {
    return [
      NotificationNames.SESSION_CREATED,
      NotificationNames.SESSION_SWITCHED,
    ]
  }

  handleNotification(notification: INotification): void {
    switch (notification.name) {
      case NotificationNames.SESSION_CREATED:
        // Notify all listeners to reload sessions
        for (const listener of SessionMediator.listeners) {
          listener()
        }
        break
    }
  }
}
