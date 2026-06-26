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

  // Timeout timer for auto-cancelling stale requests
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Clear any existing timeout.
   */
  function clearTimeoutTimer() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  /**
   * Called by the Bridge when an `extension_ui_request` event is received.
   */
  function setRequest(evt: RpcEvent) {
    // Cancel any existing request first
    cancel()
    
    request.value = evt
    
    // Auto-cancel after 5 minutes to prevent permanent UI block
    clearTimeoutTimer()
    timeoutTimer = setTimeout(() => {
      console.warn('[UiStore] Request timed out, auto-cancelling')
      cancel()
    }, 5 * 60 * 1000)
    
    // Return a promise that will be resolved by UI actions
    return new Promise<any>((resolve) => {
      resolveFn = resolve
    })
  }

  /**
   * Called by UI components when user makes a choice.
   */
  function respond(value: any) {
    clearTimeoutTimer()
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
    clearTimeoutTimer()
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
