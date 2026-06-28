import { Mediator, INotification } from '@puremvc/puremvc-js-multicore-framework'

/**
 * Base Mediator class with Vue reactive support
 * Provides common functionality for all Vue component mediators
 */
export abstract class BaseMediator extends Mediator {
  protected isRegistered: boolean = false
  protected vm: any

  constructor(name: string, viewComponent: any) {
    super(name, viewComponent)
    this.vm = viewComponent
    console.log(`[PureMVC] ${name} created`)
  }

  /**
   * Called when mediator is registered with the facade
   */
  onRegister(): void {
    console.log(`[PureMVC] ${this.mediatorName} registered`)
    this.isRegistered = true
    this.setup()
  }

  /**
   * Called when mediator is removed from the facade
   */
  onRemove(): void {
    console.log(`[PureMVC] ${this.mediatorName} removed`)
    this.isRegistered = false
    this.cleanup()
  }

  /**
   * Setup - override in subclasses
   */
  protected setup(): void {
    // Override in subclasses
  }

  /**
   * Cleanup - override in subclasses
   */
  protected cleanup(): void {
    // Override in subclasses
  }

  /**
   * Handle notifications
   */
  handleNotification(_notification: INotification): void {
    // Override in subclasses to handle specific notifications
  }

  /**
   * List of notification interests
   */
  listNotificationInterests(): string[] {
    // Override in subclasses to specify interests
    return []
  }

  /**
   * Helper to update Vue ref safely - direct value assignment
   */
  protected updateRef<T>(refObj: { value: T }, value: T): void {
    if (refObj) {
      refObj.value = value
    }
  }

  /**
   * Get view component with proper typing
   */
  getViewComponent(): any {
    return this.vm
  }
}
