import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH - Update een list view
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

    const listView = await prisma.listView.update({
      where: { id },
      data: body
    })

    return NextResponse.json(listView)
  } catch (error) {
    console.error("Error updating list view:", error)
    return NextResponse.json(
      { error: "Failed to update list view" },
      { status: 500 }
    )
  }
}

// DELETE - Verwijder een list view
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

    await prisma.listView.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting list view:", error)
    return NextResponse.json(
      { error: "Failed to delete list view" },
      { status: 500 }
    )
  }
}
