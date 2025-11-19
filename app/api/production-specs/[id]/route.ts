import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// PATCH: Update production spec
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    
    const updateData: {
      tag?: string
      m2?: number | null
      time?: number | null
    } = {}

    if (body.tag !== undefined) updateData.tag = body.tag
    if (body.m2 !== undefined) updateData.m2 = body.m2 ? parseFloat(body.m2) : null
    if (body.time !== undefined) updateData.time = body.time ? parseFloat(body.time) : null

    const spec = await prisma.productionSpec.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(spec)
  } catch (error) {
    console.error('Error updating production spec:', error)
    return NextResponse.json(
      { error: 'Failed to update production spec' },
      { status: 500 }
    )
  }
}

// DELETE: Verwijder production spec
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    await prisma.productionSpec.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting production spec:', error)
    return NextResponse.json(
      { error: 'Failed to delete production spec' },
      { status: 500 }
    )
  }
}
