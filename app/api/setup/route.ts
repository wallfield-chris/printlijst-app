import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

/**
 * GET /api/setup
 * Eenmalig setup-endpoint: maakt admin + werknemer accounts aan.
 * Werkt alleen als er GEEN gebruikers in de database bestaan.
 * Na aanmaken is dit endpoint automatisch uitgeschakeld.
 */
export async function GET() {
  try {
    // Check of er al gebruikers bestaan
    const existingUsers = await prisma.user.count()
    if (existingUsers > 0) {
      return NextResponse.json(
        {
          error: "Setup al uitgevoerd",
          message: `Er bestaan al ${existingUsers} gebruiker(s). Dit endpoint is uitgeschakeld.`,
        },
        { status: 403 }
      )
    }

    // Maak admin gebruiker
    const adminPassword = await bcrypt.hash("admin123", 10)
    const admin = await prisma.user.create({
      data: {
        email: "admin@printlijst.nl",
        password: adminPassword,
        name: "Admin Gebruiker",
        role: "admin",
      },
    })

    // Maak werknemer gebruikers
    const employeePassword = await bcrypt.hash("werknemer123", 10)
    const employee1 = await prisma.user.create({
      data: {
        email: "jan@printlijst.nl",
        password: employeePassword,
        name: "Jan Jansen",
        role: "employee",
      },
    })

    const employee2 = await prisma.user.create({
      data: {
        email: "marie@printlijst.nl",
        password: employeePassword,
        name: "Marie Peters",
        role: "employee",
      },
    })

    // Maak standaard instellingen aan
    const defaultSettings = [
      { key: "goedgepickt_api_key", value: "" },
      { key: "goedgepickt_webshop_uuid", value: "" },
      { key: "shiftbase_api_key", value: "" },
    ]

    for (const setting of defaultSettings) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        update: {},
        create: setting,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Setup voltooid! Gebruikers aangemaakt.",
      users: [
        { email: admin.email, role: admin.role, password: "admin123" },
        { email: employee1.email, role: employee1.role, password: "werknemer123" },
        { email: employee2.email, role: employee2.role, password: "werknemer123" },
      ],
      note: "Dit endpoint werkt nu niet meer (er bestaan gebruikers). Wijzig de wachtwoorden na eerste login!",
    })
  } catch (error) {
    console.error("Setup error:", error)
    return NextResponse.json(
      { error: "Setup mislukt", details: String(error) },
      { status: 500 }
    )
  }
}
