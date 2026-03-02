import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Lightweight endpoint voor real-time polling
 * Geeft alleen count + hash terug zodat de frontend snel kan checken of er iets veranderd is
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const baseWhere = {
      AND: [
        {
          OR: [
            { orderStatus: null },
            { orderStatus: { notIn: ["completed", "cancelled", "shipped"] } },
          ],
        },
        {
          printStatus: { not: "pushed" },
        },
      ],
    }

    // Tel actieve printjobs + per status (zo detecteren we ook statuswijzigingen)
    const [total, pending, inProgress, completed] = await Promise.all([
      prisma.printJob.count({ where: baseWhere }),
      prisma.printJob.count({ where: { ...baseWhere, printStatus: "pending" } }),
      prisma.printJob.count({ where: { ...baseWhere, printStatus: "in_progress" } }),
      prisma.printJob.count({ where: { ...baseWhere, printStatus: "completed" } }),
    ])

    // Haal de meest recente receivedAt op
    const latest = await prisma.printJob.findFirst({
      where: baseWhere,
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true, id: true },
    })

    // Combineer alles tot een hash die verandert bij elke wijziging
    const latestTime = latest?.receivedAt?.getTime() || 0
    const hash = `${total}-${pending}-${inProgress}-${completed}-${latestTime}`

    return NextResponse.json({
      count: total,
      hash,
      latestId: latest?.id || null,
    })
  } catch (error) {
    console.error("Error in printjobs/poll:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
