import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { status, missingFile } = body

    const updateData: any = {}
    
    if (status) {
      updateData.status = status
    }
    
    if (missingFile !== undefined) {
      updateData.missingFile = missingFile
    }

    if (status === "in_progress" && !body.startedAt) {
      updateData.startedAt = new Date()
    }

    if (status === "completed") {
      updateData.completedAt = new Date()
      updateData.completedBy = (session.user as any).id
    }

    const printJob = await prisma.printJob.update({
      where: { id },
      data: updateData,
      include: {
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(printJob)

  } catch (error) {
    console.error("Error updating printjob:", error)
    return NextResponse.json(
      { error: "Fout bij updaten van printjob" },
      { status: 500 }
    )
  }
}
