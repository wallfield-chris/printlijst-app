// In-memory webhook logger voor debug modus
type WebhookLogEntry = {
  timestamp: Date
  orderUuid?: string
  status?: string
  payload: any
}

class WebhookLogger {
  private logs: WebhookLogEntry[] = []
  private maxLogs = 50 // Bewaar laatste 50 logs
  private listeners: Set<(log: WebhookLogEntry) => void> = new Set()

  log(orderUuid: string | undefined, status: string | undefined, payload: any) {
    const entry: WebhookLogEntry = {
      timestamp: new Date(),
      orderUuid,
      status,
      payload
    }

    this.logs.push(entry)
    
    // Beperk aantal logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(entry))
  }

  getLogs(): WebhookLogEntry[] {
    return [...this.logs]
  }

  subscribe(listener: (log: WebhookLogEntry) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear() {
    this.logs = []
  }
}

// Singleton instance
export const webhookLogger = new WebhookLogger()
