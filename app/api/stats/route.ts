import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const userId = searchParams.get("userId")

    const where: any = {}
    
    if (userId) {
      where.completedBy = userId
    }

    if (from || to) {
      where.completedAt = {}
      if (from) where.completedAt.gte = new Date(from)
      if (to) where.completedAt.lte = new Date(to)
    }

    // Totaal aantal jobs per status
    const statusCounts = await prisma.printJob.groupBy({
      by: ['printStatus'],
      _count: true,
    })

    // Completed jobs met details
    const completedJobs = await prisma.printJob.findMany({
      where: {
        ...where,
        printStatus: 'completed',
      },
      include: {
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    })

    // Gemiddelde verwerkingstijd
    const jobsWithTime = completedJobs.filter(
      job => job.startedAt && job.completedAt
    )

    const avgProcessingTime = jobsWithTime.length > 0
      ? jobsWithTime.reduce((sum, job) => {
          const time = job.completedAt!.getTime() - job.startedAt!.getTime()
          return sum + time
        }, 0) / jobsWithTime.length
      : 0

    // Jobs per werknemer
    const jobsByEmployee = await prisma.printJob.groupBy({
      by: ['completedBy'],
      where: {
        ...where,
        printStatus: 'completed',
        completedBy: { not: null },
      },
      _count: true,
    })

    const employeeStats = await Promise.all(
      jobsByEmployee.map(async (item) => {
        const user = await prisma.user.findUnique({
          where: { id: item.completedBy! },
          select: { id: true, name: true, email: true },
        })
        return {
          user,
          count: item._count,
        }
      })
    )

    return NextResponse.json({
      statusCounts,
      completedJobs,
      avgProcessingTimeMs: Math.round(avgProcessingTime),
      employeeStats,
    })

  } catch (error) {
    console.error("Error fetching stats:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van statistieken" },
      { status: 500 }
    )
  }
}
