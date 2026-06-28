import { SimpleCommand } from '@puremvc/puremvc-js-multicore-framework'
import type { INotification } from '@puremvc/puremvc-js-multicore-framework'
import { NotificationNames } from '../AppFacade'
import type { PiAgentSettings, PiAgentAuth } from '../../ipc/bridge'

// ConfigProxy name constant (avoids circular import issues)
const CONFIG_PROXY = 'ConfigProxy'

/**
 * Load Config Command
 */
export class LoadConfigCommand extends SimpleCommand {
  async execute(_notification: INotification): Promise<void> {
    console.log('[PureMVC] Executing LoadConfigCommand')
    const configProxy = this.facade.retrieveProxy(CONFIG_PROXY) as any

    try {
      await configProxy.loadConfig()
      this.facade.sendNotification(NotificationNames.CONFIG_LOADED, {
        settings: configProxy.settings,
        auth: configProxy.auth,
      })
    } catch (e) {
      console.error('[PureMVC] LoadConfigCommand failed:', e)
      this.facade.sendNotification(NotificationNames.CONFIG_LOAD_ERROR, { error: String(e) })
    }
  }
}

/**
 * Save Settings Command
 */
export class SaveConfigCommand extends SimpleCommand {
  async execute(notification: INotification): Promise<void> {
    console.log('[PureMVC] Executing SaveConfigCommand')
    const settings = notification.body as PiAgentSettings
    const configProxy = this.facade.retrieveProxy(CONFIG_PROXY) as any

    try {
      await configProxy.saveSettings(settings)
      this.facade.sendNotification(NotificationNames.SETTINGS_SAVED, {
        settings: configProxy.settings,
      })
    } catch (e) {
      console.error('[PureMVC] SaveConfigCommand failed:', e)
    }
  }
}

/**
 * Save Auth Command
 */
export class SaveAuthCommand extends SimpleCommand {
  async execute(notification: INotification): Promise<void> {
    console.log('[PureMVC] Executing SaveAuthCommand')
    const auth = notification.body as PiAgentAuth
    const configProxy = this.facade.retrieveProxy(CONFIG_PROXY) as any

    try {
      await configProxy.saveAuth(auth)
      this.facade.sendNotification(NotificationNames.AUTH_SAVED, {
        auth: configProxy.auth,
      })
    } catch (e) {
      console.error('[PureMVC] SaveAuthCommand failed:', e)
    }
  }
}
