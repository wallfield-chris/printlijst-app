import { NextRequest } from "next/server"
import { webhookLogger } from "@/lib/webhook-logger"
import { auth } from "@/lib/auth"

export const dynamic = 'force-dynamic'

// GET endpoint voor Server-Sent Events
export async function GET(request: NextRequest) {
  // Check authentication
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 })
  }

  // Set up SSE
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial logs
      const existingLogs = webhookLogger.getLogs()
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'initial', logs: existingLogs })}\n\n`)
      )

      // Subscribe to new logs
      const unsubscribe = webhookLogger.subscribe((log) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'new', log })}\n\n`)
        )
      })

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        unsubscribe()
        controller.close()
      })

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'))
      }, 30000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// POST endpoint to clear logs
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 })
  }

  webhookLogger.clear()
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
