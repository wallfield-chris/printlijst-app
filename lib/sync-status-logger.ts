// In-memory logger for sync status operations
type LogSubscriber = (log: string) => void

class SyncStatusLogger {
  private subscribers: Set<LogSubscriber> = new Set()
  
  log(message: string) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    const logMessage = `[${timestamp}] ${message}`
    
    // Also log to console
    console.log(logMessage)
    
    // Notify all subscribers
    this.subscribers.forEach(subscriber => {
      subscriber(logMessage)
    })
  }

  subscribe(callback: LogSubscriber) {
    this.subscribers.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback)
    }
  }

  clear() {
    this.subscribers.clear()
  }
}

export const syncStatusLogger = new SyncStatusLogger()
