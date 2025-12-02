import { NextRequest } from "next/server"
import { syncStatusLogger } from "@/lib/sync-status-logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // Set up SSE
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to sync status logs
      const unsubscribe = syncStatusLogger.subscribe((log) => {
        const data = `data: ${log}\n\n`
        controller.enqueue(encoder.encode(data))
      })

      // Clean up when connection closes
      request.signal.addEventListener("abort", () => {
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
