import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Check if Prisma Studio is running
    const response = await fetch('http://localhost:5555', {
      method: 'HEAD',
    })
    
    if (response.ok) {
      return NextResponse.json({ status: 'healthy' })
    } else {
      return NextResponse.json({ status: 'unhealthy' }, { status: 503 })
    }
  } catch (error) {
    return NextResponse.json({ status: 'unhealthy' }, { status: 503 })
  }
}
