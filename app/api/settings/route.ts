import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Haal alle settings op
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await prisma.setting.findMany()

    // Converteer naar object voor makkelijkere toegang
    const settingsObject: Record<string, string> = {}
    settings.forEach((setting) => {
      settingsObject[setting.key] = setting.value
    })

    return NextResponse.json(settingsObject)
  } catch (error) {
    console.error("Settings GET error:", error)
    return NextResponse.json(
      { error: "Error fetching settings" },
      { status: 500 }
    )
  }
}

// POST - Update een setting
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json(
        { error: "Key is required" },
        { status: 400 }
      )
    }

    // Upsert (update of insert)
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: value || "" },
      create: { key, value: value || "" },
    })

    return NextResponse.json({
      success: true,
      setting,
    })
  } catch (error) {
    console.error("Settings POST error:", error)
    return NextResponse.json(
      { error: "Error saving setting" },
      { status: 500 }
    )
  }
}

// DELETE - Verwijder een setting
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const key = searchParams.get("key")

    if (!key) {
      return NextResponse.json(
        { error: "Key is required" },
        { status: 400 }
      )
    }

    await prisma.setting.delete({
      where: { key },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Settings DELETE error:", error)
    return NextResponse.json(
      { error: "Error deleting setting" },
      { status: 500 }
    )
  }
}
