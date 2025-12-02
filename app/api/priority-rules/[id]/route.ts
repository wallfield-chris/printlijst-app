import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH - Update een priority rule
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const params = await context.params
    const id = params.id
    const body = await request.json()

    const priorityRule = await prisma.priorityRule.update({
      where: { id },
      data: body
    })

    return NextResponse.json(priorityRule)
  } catch (error) {
    console.error("Error updating priority rule:", error)
    return NextResponse.json(
      { error: "Failed to update priority rule" },
      { status: 500 }
    )
  }
}

// DELETE - Verwijder een priority rule
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const params = await context.params
    const id = params.id

    await prisma.priorityRule.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting priority rule:", error)
    return NextResponse.json(
      { error: "Failed to delete priority rule" },
      { status: 500 }
    )
  }
}
