import { NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/**
 * GET /api/migrate
 * Voert "prisma db push" uit om database tabellen aan te maken/updaten.
 * Dit is nodig omdat Sevalla geen prisma db push in de build stap ondersteunt.
 */
export async function GET() {
  try {
    const { stdout, stderr } = await execAsync("npx prisma db push --skip-generate --accept-data-loss", {
      timeout: 30000,
      env: { ...process.env },
    })

    return NextResponse.json({
      success: true,
      message: "Database schema gesynchroniseerd!",
      stdout: stdout || "",
      stderr: stderr || "",
      next: "Ga nu naar /api/setup om gebruikers aan te maken (als dat nog niet gedaan is).",
    })
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    console.error("Migrate error:", error)
    return NextResponse.json(
      {
        error: "Migratie mislukt",
        stdout: err.stdout || "",
        stderr: err.stderr || "",
        details: err.message || String(error),
      },
      { status: 500 }
    )
  }
}
