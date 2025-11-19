import { NextRequest, NextResponse } from "next/server"

/**
 * Test endpoint om webhook te simuleren
 * Gebruik dit om te testen zonder echte GoedeGepickt webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderUuid } = body

    if (!orderUuid) {
      return NextResponse.json(
        { error: "orderUuid is required in request body" },
        { status: 400 }
      )
    }

    const webhookUrl = `${request.nextUrl.origin}/api/webhook`

    console.log("🧪 Versturen test webhook naar:", webhookUrl)
    console.log("📦 Test orderUuid:", orderUuid)

    // Verstuur naar de webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderUuid }),
    })

    const result = await response.json()

    return NextResponse.json({
      success: true,
      message: "Test webhook verstuurd",
      testData: { orderUuid },
      webhookResponse: {
        status: response.status,
        data: result
      }
    })

  } catch (error: any) {
    console.error("❌ Test webhook fout:", error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message 
      },
      { status: 500 }
    )
  }
}

// GET endpoint voor info
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "Webhook Test Endpoint",
    usage: "POST naar /api/webhook/test met { orderUuid: '...' }",
    example: {
      orderUuid: "802b2103-9695-41ff-a7a2-60fe6b87e466"
    },
    info: "Dit simuleert een webhook van GoedeGepickt door een orderUuid te versturen"
  })
}
