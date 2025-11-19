import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH - Update een tag rule
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

    const tagRule = await prisma.tagRule.update({
      where: { id },
      data: body
    })

    return NextResponse.json(tagRule)
  } catch (error) {
    console.error("Error updating tag rule:", error)
    return NextResponse.json(
      { error: "Failed to update tag rule" },
      { status: 500 }
    )
  }
}

// DELETE - Verwijder een tag rule
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

    await prisma.tagRule.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting tag rule:", error)
    return NextResponse.json(
      { error: "Failed to delete tag rule" },
      { status: 500 }
    )
  }
}
