import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RpcEvent } from '../ipc/types'

/**
 * Store for handling extension UI requests (select, confirm, input, editor).
 * When a request arrives, the store records it and resolves a promise when the UI
 * sends a response back via `piExtensionUiResponse`.
 */
export const useUiStore = defineStore('ui', () => {
  // Current active request (null when idle)
  const request = ref<any>(null)

  // Resolve function for the current request promise
  let resolveFn: ((value: any) => void) | null = null

  /**
   * Called by the Bridge when an `extension_ui_request` event is received.
   */
  function setRequest(evt: RpcEvent) {
    request.value = evt
    // Return a promise that will be resolved by UI actions
    return new Promise<any>((resolve) => {
      resolveFn = resolve
    })
  }

  /**
   * Called by UI components when user makes a choice.
   */
  function respond(value: any) {
    if (resolveFn) {
      resolveFn(value)
    }
    // Clear request after response
    request.value = null
    resolveFn = null
  }

  /**
   * Clear any pending request (e.g., on cancel or timeout).
   */
  function cancel() {
    if (resolveFn) {
      resolveFn(undefined)
    }
    request.value = null
    resolveFn = null
  }

  return {
    request,
    setRequest,
    respond,
    cancel,
  }
})
