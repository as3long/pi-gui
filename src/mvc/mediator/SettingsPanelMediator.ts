import type { INotification } from '@puremvc/puremvc-js-multicore-framework'
import { BaseMediator } from './BaseMediator'
import { NotificationNames } from '../AppFacade'
import type { PiAgentSettings, PiAgentAuth } from '../../ipc/bridge'

/**
 * SettingsPanelMediator
 * Connects SettingsPanel component with PureMVC framework
 */
export class SettingsPanelMediator extends BaseMediator {
  static readonly NAME: string = 'SettingsPanelMediator'

  private get agentSettings(): { value: PiAgentSettings } {
    return this.vm.agentSettings
  }

  private get agentAuth(): { value: PiAgentAuth } {
    return this.vm.agentAuth
  }

  private get isLoadingAgent(): { value: boolean } {
    return this.vm.isLoadingAgent
  }

  constructor(viewComponent: any) {
    super(SettingsPanelMediator.NAME, viewComponent)
  }

  listNotificationInterests(): string[] {
    return [
      NotificationNames.CONFIG_LOADED,
      NotificationNames.CONFIG_LOAD_ERROR,
      NotificationNames.SETTINGS_SAVED,
      NotificationNames.AUTH_SAVED,
    ]
  }

  handleNotification(notification: INotification): void {
    const name = notification.name
    const body = notification.body

    switch (name) {
      case NotificationNames.CONFIG_LOADED:
        this.onConfigLoaded(body)
        break

      case NotificationNames.CONFIG_LOAD_ERROR:
        this.onConfigLoadError()
        break

      case NotificationNames.SETTINGS_SAVED:
        this.onSettingsSaved(body)
        break

      case NotificationNames.AUTH_SAVED:
        this.onAuthSaved(body)
        break
    }
  }

  private onConfigLoaded(data: { settings: PiAgentSettings; auth: PiAgentAuth }): void {
    console.log('[PureMVC] SettingsPanelMediator: Config loaded', data)
    this.updateRef(this.agentSettings, data.settings)
    this.updateRef(this.agentAuth, data.auth)
    this.updateRef(this.isLoadingAgent, false)
  }

  private onConfigLoadError(): void {
    console.error('[PureMVC] SettingsPanelMediator: Config load error')
    this.updateRef(this.isLoadingAgent, false)
  }

  private onSettingsSaved(data: { settings: PiAgentSettings }): void {
    console.log('[PureMVC] SettingsPanelMediator: Settings saved', data)
    this.updateRef(this.agentSettings, data.settings)
  }

  private onAuthSaved(data: { auth: PiAgentAuth }): void {
    console.log('[PureMVC] SettingsPanelMediator: Auth saved', data)
    this.updateRef(this.agentAuth, data.auth)
  }

  // These methods are called by the Vue component

  loadConfig(): void {
    this.updateRef(this.isLoadingAgent, true)
    this.facade.sendNotification(NotificationNames.LOAD_CONFIG)
  }

  saveSettings(settings: PiAgentSettings): void {
    this.facade.sendNotification(NotificationNames.SAVE_SETTINGS, settings)
  }

  saveAuth(auth: PiAgentAuth): void {
    this.facade.sendNotification(NotificationNames.SAVE_AUTH, auth)
  }
}
