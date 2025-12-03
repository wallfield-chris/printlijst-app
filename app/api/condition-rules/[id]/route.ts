import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH - Update een condition rule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { field, condition, value, active, operator, scope } = body

    const conditionRule = await prisma.conditionRule.update({
      where: { id },
      data: {
        ...(field !== undefined && { field }),
        ...(condition !== undefined && { condition }),
        ...(value !== undefined && { value }),
        ...(active !== undefined && { active }),
        ...(operator !== undefined && { operator }),
        ...(scope !== undefined && { scope })
      }
    })

    return NextResponse.json(conditionRule)
  } catch (error) {
    console.error("Error updating condition rule:", error)
    return NextResponse.json(
      { error: "Failed to update condition rule" },
      { status: 500 }
    )
  }
}

// DELETE - Verwijder een condition rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id } = await params

    await prisma.conditionRule.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting condition rule:", error)
    return NextResponse.json(
      { error: "Failed to delete condition rule" },
      { status: 500 }
    )
  }
}
