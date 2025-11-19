import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const PRISMA_STUDIO_URL = "http://europe-west4-001.proxy.kinsta.app:30244"

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated and is admin
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    // Get the path that should be proxied
    const url = new URL(request.url)
    const path = url.pathname.replace('/api/prisma-studio/proxy', '') || '/'
    const search = url.search
    
    // Proxy the request to Prisma Studio via TCP proxy
    const prismaUrl = `${PRISMA_STUDIO_URL}${path}${search}`
    
    console.log(`Proxying GET to: ${prismaUrl}`)
    
    const response = await fetch(prismaUrl, {
      method: 'GET',
      headers: {
        'Accept': request.headers.get('Accept') || '*/*',
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
      },
    })

    if (!response.ok) {
      console.error(`Proxy error: ${response.status} ${response.statusText}`)
      return new NextResponse(`Proxy error: ${response.statusText}`, { status: response.status })
    }

    const contentType = response.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else if (contentType.includes('text/html')) {
      let html = await response.text()
      
      // Rewrite URLs in the HTML to go through our proxy
      html = html.replace(/href="\//g, 'href="/api/prisma-studio/proxy/')
      html = html.replace(/src="\//g, 'src="/api/prisma-studio/proxy/')
      html = html.replace(/fetch\('\/([^']+)'\)/g, "fetch('/api/prisma-studio/proxy/$1')")
      html = html.replace(/fetch\("\/([^"]+)"\)/g, 'fetch("/api/prisma-studio/proxy/$1")')
      
      return new NextResponse(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html',
        },
      })
    } else if (contentType.includes('javascript') || contentType.includes('css')) {
      const text = await response.text()
      return new NextResponse(text, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
        },
      })
    } else {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
        },
      })
    }
  } catch (error) {
    console.error("Error proxying to Prisma Studio:", error)
    return new NextResponse(
      `Kon geen verbinding maken met Prisma Studio: ${error}`,
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace('/api/prisma-studio/proxy', '') || '/'
    const search = url.search
    const prismaUrl = `${PRISMA_STUDIO_URL}${path}${search}`
    
    console.log(`Proxying POST to: ${prismaUrl}`)
    
    const body = await request.text()
    
    const response = await fetch(prismaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
      body,
    })

    const data = await response.text()
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (error) {
    console.error("Error proxying POST to Prisma Studio:", error)
    return new NextResponse(
      `Kon POST request niet proxyen: ${error}`,
      { status: 500 }
    )
  }
}
