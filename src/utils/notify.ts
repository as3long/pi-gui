/**
 * Non-blocking notification utility
 * Replaces alert() calls to avoid UI blocking
 */

type NotifyType = 'success' | 'error' | 'warning' | 'info'

// Global notify function set by ToastContainer
let globalNotify: ((type: NotifyType, message: string, duration?: number) => void) | null = null

export function setNotifyFn(fn: (type: NotifyType, message: string, duration?: number) => void) {
  globalNotify = fn
}

export function notify(type: NotifyType, message: string, duration = 3000) {
  if (globalNotify) {
    globalNotify(type, message, duration)
  } else {
    // Fallback to console if toast not mounted yet
    console.log(`[Toast ${type}] ${message}`)
  }
}

// Convenience functions
export function notifySuccess(message: string, duration?: number) {
  notify('success', message, duration)
}

export function notifyError(message: string, duration?: number) {
  notify('error', message, duration)
}

export function notifyWarning(message: string, duration?: number) {
  notify('warning', message, duration)
}

export function notifyInfo(message: string, duration?: number) {
  notify('info', message, duration)
}
