import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Helper function to evaluate a condition
function evaluateCondition(fieldValue: string | null | undefined, condition: string, ruleValue: string): boolean {
  if (!fieldValue) return false
  
  const field = fieldValue.toLowerCase()
  const value = ruleValue.toLowerCase()
  
  switch (condition) {
    case "starts_with":
      return field.startsWith(value)
    case "ends_with":
      return field.endsWith(value)
    case "contains":
      return field.includes(value)
    case "not_contains":
      return !field.includes(value)
    case "equals":
      return field === value
    case "not_equals":
      return field !== value
    default:
      return false
  }
}

// Filter printjobs based on active condition rules
async function filterByConditionRules(jobs: any[]): Promise<any[]> {
  const conditionRules = await prisma.conditionRule.findMany({
    where: { active: true }
  })
  
  // If no rules exist, return all jobs (default behavior)
  if (conditionRules.length === 0) {
    return jobs
  }
  
  return jobs.filter(job => {
    // A job passes if it matches at least one active condition rule
    return conditionRules.some(rule => {
      const fieldValue = job[rule.field as keyof typeof job]
      return evaluateCondition(fieldValue, rule.condition, rule.value)
    })
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.getAll("status")
    const userId = searchParams.get("userId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const missingFile = searchParams.get("missingFile")

    const where: any = {}
    
    if (statusParam.length > 0) {
      where.printStatus = { in: statusParam }
    }
    
    if (missingFile === "true") {
      where.missingFile = true
    } else if (missingFile === "false") {
      where.missingFile = false
    }
    
    if (userId) {
      where.completedBy = userId
    }

    if (from || to) {
      where.completedAt = {}
      if (from) where.completedAt.gte = new Date(from)
      if (to) where.completedAt.lte = new Date(to)
    }

    let printJobs = await prisma.printJob.findMany({
      where,
      include: {
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { printStatus: 'asc' },
        { receivedAt: 'asc' },
      ],
    })

    // Apply condition rules filtering only for employee role
    if ((session.user as any).role === "employee") {
      printJobs = await filterByConditionRules(printJobs)
    }

    return NextResponse.json(printJobs)

  } catch (error) {
    console.error("Error fetching printjobs:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van printjobs" },
      { status: 500 }
    )
  }
}
