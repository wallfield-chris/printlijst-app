import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// PATCH - Update een exclusion rule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { field, condition, value, reason, active } = body

    const exclusionRule = await prisma.exclusionRule.update({
      where: { id },
      data: {
        ...(field !== undefined && { field }),
        ...(condition !== undefined && { condition }),
        ...(value !== undefined && { value }),
        ...(reason !== undefined && { reason }),
        ...(active !== undefined && { active }),
      },
    })

    return NextResponse.json(exclusionRule)
  } catch (error) {
    console.error("Error updating exclusion rule:", error)
    return NextResponse.json(
      { error: "Failed to update exclusion rule" },
      { status: 500 }
    )
  }
}

// DELETE - Verwijder een exclusion rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.exclusionRule.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting exclusion rule:", error)
    return NextResponse.json(
      { error: "Failed to delete exclusion rule" },
      { status: 500 }
    )
  }
}
