import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated and is admin
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get the path that should be proxied
    const url = new URL(request.url)
    const path = url.searchParams.get('path') || ''
    
    // Proxy the request to Prisma Studio
    const prismaUrl = `http://localhost:5555${path}`
    
    const response = await fetch(prismaUrl, {
      method: 'GET',
      headers: {
        'Accept': request.headers.get('Accept') || '*/*',
      },
    })

    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else if (contentType?.includes('text/html')) {
      let html = await response.text()
      
      // Rewrite URLs in the HTML to go through our proxy
      html = html.replace(/href="\//g, 'href="/api/prisma-studio/proxy?path=/')
      html = html.replace(/src="\//g, 'src="/api/prisma-studio/proxy?path=/')
      
      return new NextResponse(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html',
        },
      })
    } else {
      const blob = await response.blob()
      return new NextResponse(blob, {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
        },
      })
    }
  } catch (error) {
    console.error("Error proxying to Prisma Studio:", error)
    return NextResponse.json(
      { error: "Kon geen verbinding maken met Prisma Studio" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const path = url.searchParams.get('path') || ''
    const prismaUrl = `http://localhost:5555${path}`
    
    const body = await request.text()
    
    const response = await fetch(prismaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
      body,
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error("Error proxying POST to Prisma Studio:", error)
    return NextResponse.json(
      { error: "Kon POST request niet proxyen" },
      { status: 500 }
    )
  }
}
