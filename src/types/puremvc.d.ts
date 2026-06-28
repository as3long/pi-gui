declare module '@puremvc/puremvc-js-multicore-framework' {
  export class Facade {
    static instanceMap: Map<string, Facade>
    static getInstance(key: string): Facade
    constructor(key: string)
    initializeController(): void
    initializeModel(): void
    initializeView(): void
    registerCommand(notificationName: string, commandClass: any): void
    removeCommand(notificationName: string): void
    hasCommand(notificationName: string): boolean
    registerProxy(proxy: Proxy): void
    removeProxy(proxyName: string): Proxy
    retrieveProxy(proxyName: string): Proxy
    hasProxy(proxyName: string): boolean
    registerMediator(mediator: Mediator): void
    removeMediator(mediatorName: string): Mediator
    retrieveMediator(mediatorName: string): Mediator
    hasMediator(mediatorName: string): boolean
    sendNotification(notificationName: string, body?: any, type?: string): void
    notifyObservers(notification: INotification): void
    hasCore(key: string): boolean
    removeCore(key: string): void
  }

  export class Proxy {
    static readonly NAME: string
    constructor(proxyName?: string, data?: any)
    getProxyName(): string
    setData(data: any): void
    readonly data: any
    onRegister(): void
    onRemove(): void
    facade: Facade
  }

  export class Mediator {
    static readonly NAME: string
    constructor(mediatorName?: string, viewComponent?: any)
    readonly mediatorName: string
    setViewComponent(viewComponent: any): void
    getViewComponent(): any
    listNotificationInterests(): string[]
    handleNotification(notification: INotification): void
    onRegister(): void
    onRemove(): void
    facade: Facade
  }

  export class SimpleCommand {
    execute(notification: INotification): void
    facade: Facade
  }

  export class MacroCommand extends SimpleCommand {
    constructor()
    initializeMacroCommand(): void
    addSubCommand(commandClassRef: new () => SimpleCommand): void
    execute(notification: INotification): void
  }

  export interface INotification {
    readonly name: string
    body: any
    readonly type: string
  }

  export class Notification implements INotification {
    constructor(name: string, body?: any, type?: string)
    readonly name: string
    body: any
    readonly type: string
  }

  export class Observer {
    constructor(notifyMethod: (notification: INotification) => void, notifyContext: any)
    setNotifyMethod(notifyMethod: (notification: INotification) => void): void
    getNotifyMethod(): (notification: INotification) => void
    setNotifyContext(notifyContext: any): void
    getNotifyContext(): any
    notifyObserver(notification: INotification): void
    compareNotifyContext(object: any): boolean
  }

  export class View {
    static getInstance(key: string): View
    constructor(key: string)
    initializeView(): void
    registerMediator(mediator: Mediator): void
    removeMediator(mediatorName: string): Mediator
    retrieveMediator(mediatorName: string): Mediator
    hasMediator(mediatorName: string): boolean
    registerObserver(notificationName: string, observer: Observer): void
    removeObserver(notificationName: string, notifyContext: any): void
    notifyObservers(notification: INotification): void
    static removeView(key: string): void
  }

  export class Controller {
    static getInstance(key: string): Controller
    constructor(key: string)
    initializeController(): void
    registerCommand(notificationName: string, commandClassRef: new () => SimpleCommand): void
    executeCommand(notification: INotification): void
    removeCommand(notificationName: string): void
    hasCommand(notificationName: string): boolean
    static removeController(key: string): void
  }

  export class Model {
    static getInstance(key: string): Model
    constructor(key: string)
    initializeModel(): void
    registerProxy(proxy: Proxy): void
    removeProxy(proxyName: string): Proxy
    retrieveProxy(proxyName: string): Proxy
    hasProxy(proxyName: string): boolean
    static removeModel(key: string): void
  }
}
