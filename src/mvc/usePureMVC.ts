import { AppFacade, NotificationNames } from './AppFacade'
import { ConfigProxy } from './proxy/ConfigProxy'
import type { PiAgentSettings, PiAgentAuth } from '../ipc/bridge'

/**
 * Vue Composable for PureMVC integration
 * Provides easy access to the facade and common operations
 */
export function usePureMVC() {
  const facade = AppFacade.getInstance()

  // Startup the facade if not already started
  function startup() {
    facade.startup()
  }

  // Get config proxy
  function getConfigProxy(): ConfigProxy {
    return facade.retrieveProxy(ConfigProxy.NAME) as ConfigProxy
  }

  // Convenience methods
  function loadConfig() {
    facade.sendNotification(NotificationNames.LOAD_CONFIG)
  }

  function saveSettings(settings: PiAgentSettings) {
    facade.sendNotification(NotificationNames.SAVE_SETTINGS, settings)
  }

  function saveAuth(auth: PiAgentAuth) {
    facade.sendNotification(NotificationNames.SAVE_AUTH, auth)
  }

  function getSettings(): PiAgentSettings {
    return getConfigProxy().settings
  }

  function getAuth(): PiAgentAuth {
    return getConfigProxy().auth
  }

  function registerMediator(mediator: any) {
    if (!facade.hasMediator(mediator.mediatorName)) {
      facade.registerMediator(mediator)
    }
  }

  function removeMediator(name: string) {
    if (facade.hasMediator(name)) {
      facade.removeMediator(name)
    }
  }

  return {
    facade,
    startup,
    loadConfig,
    saveSettings,
    saveAuth,
    getSettings,
    getAuth,
    getConfigProxy,
    registerMediator,
    removeMediator,
    NotificationNames,
  }
}

/**
 * Helper to create and manage a mediator lifecycle in a component
 */
export function useMediator<T>(
  createMediator: () => T,
  onMountedCallback?: (mediator: T) => void
) {
  const { facade } = usePureMVC()

  // Create mediator
  const mediator = createMediator()
  
  // Register mediator (this calls initializeNotifier internally)
  const mediatorName = (mediator as any).mediatorName
  if (!facade.hasMediator(mediatorName)) {
    facade.registerMediator(mediator as any)
  }

  // Call callback after registration (now multitonKey is set)
  if (onMountedCallback) {
    onMountedCallback(mediator)
  }

  return { mediator }
}
