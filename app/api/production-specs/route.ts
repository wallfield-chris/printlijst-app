import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET: Haal alle production specs op
export async function GET() {
  try {
    const specs = await prisma.productionSpec.findMany({
      orderBy: {
        tag: 'asc'
      }
    })
    return NextResponse.json(specs)
  } catch (error) {
    console.error('Error fetching production specs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch production specs' },
      { status: 500 }
    )
  }
}

// POST: Maak nieuwe production spec aan
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tag, m2, time } = body

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag is required' },
        { status: 400 }
      )
    }

    const spec = await prisma.productionSpec.create({
      data: {
        tag,
        m2: m2 ? parseFloat(m2) : null,
        time: time ? parseFloat(time) : null,
      }
    })

    return NextResponse.json(spec)
  } catch (error) {
    console.error('Error creating production spec:', error)
    return NextResponse.json(
      { error: 'Failed to create production spec' },
      { status: 500 }
    )
  }
}
