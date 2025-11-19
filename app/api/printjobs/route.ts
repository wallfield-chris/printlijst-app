import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.getAll("status")
    const userId = searchParams.get("userId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const missingFile = searchParams.get("missingFile")

    const where: any = {}
    
    if (statusParam.length > 0) {
      where.status = { in: statusParam }
    }
    
    if (missingFile === "true") {
      where.missingFile = true
    } else if (missingFile === "false") {
      where.missingFile = false
    }
    
    if (userId) {
      where.completedBy = userId
    }

    if (from || to) {
      where.completedAt = {}
      if (from) where.completedAt.gte = new Date(from)
      if (to) where.completedAt.lte = new Date(to)
    }

    const printJobs = await prisma.printJob.findMany({
      where,
      include: {
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { receivedAt: 'asc' },
      ],
    })

    return NextResponse.json(printJobs)

  } catch (error) {
    console.error("Error fetching printjobs:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van printjobs" },
      { status: 500 }
    )
  }
}
