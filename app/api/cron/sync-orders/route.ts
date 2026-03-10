import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/cron/sync-orders
 * Automatische order sync — draait elk uur via externe cron (bijv. cron-job.org).
 * Beveiligd met CRON_SECRET header.
 *
 * Configuratie in cron-job.org:
 *   URL:    https://printapp.wallfield.com/api/cron/sync-orders
 *   Method: GET
 *   Header: x-cron-secret: <CRON_SECRET env var>
 *   Interval: elk uur
 */
export async function GET(request: NextRequest) {
  // Verificeer cron secret
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get("x-cron-secret")

  if (cronSecret && headerSecret !== cronSecret) {
    console.warn("[CRON-ORDERS] Ongeautoriseerde toegang")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[CRON-ORDERS] Automatische order sync gestart...")

  try {
    // Roep de bestaande sync-orders route intern aan (geen stream, gewone JSON)
    const baseUrl = process.env.NEXTAUTH_URL || "https://printapp.wallfield.com"
    const apiKey = process.env.CRON_SECRET // hergebruik hetzelfde secret voor interne calls

    const response = await fetch(`${baseUrl}/api/goedgepickt/sync-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Voeg een interne-cron marker toe zodat auth bypass werkt
        "x-internal-cron": process.env.CRON_SECRET || "internal",
        // Stuur een geldige session cookie mee is niet mogelijk (server-side)
        // Daarom maken we sync-orders intern aanroepbaar via deze header
      },
      body: JSON.stringify({ reset: false }),
    })

    let result
    try {
      result = await response.json()
    } catch {
      result = { error: "Geen JSON response" }
    }

    if (!response.ok) {
      console.error("[CRON-ORDERS] Sync mislukt:", result)
      return NextResponse.json({
        success: false,
        message: "Sync mislukt",
        error: result?.error,
        status: response.status,
        timestamp: new Date().toISOString(),
      }, { status: 500 })
    }

    console.log("[CRON-ORDERS] Sync succesvol:", result?.stats || result?.message)

    return NextResponse.json({
      success: true,
      message: "Order sync uitgevoerd",
      stats: result?.stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[CRON-ORDERS] Fout:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Onbekende fout",
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
