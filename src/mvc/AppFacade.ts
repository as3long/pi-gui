import { Facade } from '@puremvc/puremvc-js-multicore-framework'
import { ConfigProxy } from './proxy/ConfigProxy'
import { ModelProxy } from './proxy/ModelProxy'
import { SessionProxy } from './proxy/SessionProxy'
import { ChatProxy } from './proxy/ChatProxy'
import { LoadConfigCommand, SaveConfigCommand, SaveAuthCommand } from './command/ConfigCommands'
import { ModelMediator } from './mediator/ModelMediator'
import { ChatMediator } from './mediator/ChatMediator'
import { SessionMediator } from './mediator/SessionMediator'

/**
 * Application Facade - the single entry point for PureMVC framework
 */
export class AppFacade extends Facade {
  static readonly KEY: string = 'PiGuiApp'

  constructor(key: string = AppFacade.KEY) {
    super(key)
  }

  /**
   * Get the singleton instance of the AppFacade
   */
  static getInstance(key: string = AppFacade.KEY): AppFacade {
    // Ensure instanceMap is initialized before creating any Facade
    // This must be done before calling new AppFacade() because Facade constructor
    // accesses Facade.instanceMap[key]
    if (!Facade.instanceMap) {
      Facade.instanceMap = new Map();
    }
    
    // Check if already exists
    if (!Facade.instanceMap.get(key)) {
      // Create new instance - Facade constructor handles registration
      new AppFacade(key)
    }
    return Facade.instanceMap.get(key) as AppFacade
  }

  /**
   * Register all proxies, commands, and mediators
   */
  initializeController(): void {
    super.initializeController()

    // Register commands (must be factory functions, not classes)
    this.registerCommand(NotificationNames.LOAD_CONFIG, () => new LoadConfigCommand())
    this.registerCommand(NotificationNames.SAVE_SETTINGS, () => new SaveConfigCommand())
    this.registerCommand(NotificationNames.SAVE_AUTH, () => new SaveAuthCommand())
  }

  initializeModel(): void {
    super.initializeModel()

    // Register proxies
    this.registerProxy(new ConfigProxy())
    this.registerProxy(new ModelProxy())
    this.registerProxy(new SessionProxy())
    this.registerProxy(new ChatProxy())
  }

  initializeView(): void {
    super.initializeView()

    // Register global mediators
    this.registerMediator(new ModelMediator())
    this.registerMediator(new ChatMediator())
    this.registerMediator(new SessionMediator())
  }

  /**
   * Start the application
   */
  startup(): void {
    console.log('[PureMVC] AppFacade starting up...')
    
    // Load persisted model state
    const modelProxy = this.retrieveProxy(ModelProxy.NAME) as ModelProxy
    modelProxy.loadPersisted()
    
    this.sendNotification(NotificationNames.LOAD_CONFIG)
  }
}

/**
 * Notification names - centralized event definitions
 */
export enum NotificationNames {
  // Config related
  LOAD_CONFIG = 'loadConfig',
  CONFIG_LOADED = 'configLoaded',
  CONFIG_LOAD_ERROR = 'configLoadError',

  SAVE_SETTINGS = 'saveSettings',
  SETTINGS_SAVED = 'settingsSaved',

  SAVE_AUTH = 'saveAuth',
  AUTH_SAVED = 'authSaved',

  // Model related
  MODEL_CHANGED = 'modelChanged',
  PROVIDER_CHANGED = 'providerChanged',

  // Session related
  SESSION_CREATED = 'sessionCreated',
  SESSION_SWITCHED = 'sessionSwitched',
  SESSIONS_RELOAD = 'sessionsReload',
  SESSION_LOADING = 'sessionLoading',
  SESSION_LOADED = 'sessionLoaded',

  // UI related
  SHOW_NOTIFICATION = 'showNotification',
}
