import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Bezig met seeden van database...')

  // Maak admin gebruiker
  const adminPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@printlijst.nl' },
    update: {},
    create: {
      email: 'admin@printlijst.nl',
      password: adminPassword,
      name: 'Admin Gebruiker',
      role: 'admin',
    },
  })

  console.log('✅ Admin aangemaakt:', admin.email)

  // Maak werknemer gebruikers
  const employeePassword = await bcrypt.hash('werknemer123', 10)
  
  const employee1 = await prisma.user.upsert({
    where: { email: 'jan@printlijst.nl' },
    update: {},
    create: {
      email: 'jan@printlijst.nl',
      password: employeePassword,
      name: 'Jan Jansen',
      role: 'employee',
    },
  })

  const employee2 = await prisma.user.upsert({
    where: { email: 'marie@printlijst.nl' },
    update: {},
    create: {
      email: 'marie@printlijst.nl',
      password: employeePassword,
      name: 'Marie Peters',
      role: 'employee',
    },
  })

  console.log('✅ Werknemers aangemaakt:', employee1.email, employee2.email)

  // Maak test printjobs
  const testJobs = [
    {
      orderNumber: 'ORD-001',
      productName: 'T-Shirt Zwart - Maat L',
      quantity: 5,
      priority: 'normal',
      printStatus: 'pending',
    },
    {
      orderNumber: 'ORD-002',
      productName: 'Hoodie Grijs - Maat M',
      quantity: 3,
      priority: 'high',
      printStatus: 'pending',
    },
    {
      orderNumber: 'ORD-003',
      productName: 'Cap Rood',
      quantity: 10,
      priority: 'urgent',
      printStatus: 'pending',
    },
  ]

  for (const job of testJobs) {
    await prisma.printJob.create({
      data: job,
    })
  }

  console.log(`✅ ${testJobs.length} test printjobs aangemaakt`)

  // Maak standaard list views
  const listViews = [
    {
      name: '40x60 cm',
      tags: '40x60',
      order: 1,
      active: true,
    },
    {
      name: '60x90 cm',
      tags: '60x90',
      order: 2,
      active: true,
    },
    {
      name: '80x120 cm',
      tags: '80x120',
      order: 3,
      active: true,
    },
    {
      name: '100x150 cm',
      tags: '100x150',
      order: 4,
      active: true,
    },
  ]

  for (const view of listViews) {
    const existing = await prisma.listView.findFirst({
      where: { name: view.name },
    })
    
    if (!existing) {
      await prisma.listView.create({
        data: view,
      })
    }
  }

  console.log(`✅ ${listViews.length} standaard list views aangemaakt`)

  // Maak standaard tag rules
  const tagRules = [
    {
      field: 'sku',
      condition: 'ends_with',
      value: '10',
      tag: 'Salontafel',
      operator: 'AND',
      scope: 'product',
      active: true,
    },
    {
      field: 'sku',
      condition: 'ends_with',
      value: '15',
      tag: '100x150',
      operator: 'AND',
      scope: 'product',
      active: true,
    },
    {
      field: 'sku',
      condition: 'ends_with',
      value: '16',
      tag: '80x120',
      operator: 'AND',
      scope: 'product',
      active: true,
    },
    {
      field: 'sku',
      condition: 'ends_with',
      value: '13',
      tag: '60x90',
      operator: 'AND',
      scope: 'product',
      active: true,
    },
    {
      field: 'sku',
      condition: 'ends_with',
      value: '11',
      tag: '40x60',
      operator: 'AND',
      scope: 'product',
      active: true,
    },
  ]

  for (const rule of tagRules) {
    const existing = await prisma.tagRule.findFirst({
      where: { 
        field: rule.field,
        condition: rule.condition,
        value: rule.value,
        tag: rule.tag,
      },
    })
    
    if (!existing) {
      await prisma.tagRule.create({
        data: rule,
      })
    }
  }

  console.log(`✅ ${tagRules.length} standaard tag rules aangemaakt`)

  // Maak standaard priority rules
  const priorityRules = [
    {
      field: 'sku',
      condition: 'contains',
      value: 'SHIPPING-NEXT-DAY',
      priority: 'urgent',
      operator: 'AND',
      scope: 'order',
      active: true,
    },
  ]

  for (const rule of priorityRules) {
    const existing = await prisma.priorityRule.findFirst({
      where: { 
        field: rule.field,
        condition: rule.condition,
        value: rule.value,
      },
    })
    
    if (!existing) {
      await prisma.priorityRule.create({
        data: rule,
      })
    }
  }

  console.log(`✅ ${priorityRules.length} standaard priority rules aangemaakt`)

  // Maak standaard condition rules
  const conditionRules = [
    {
      field: 'orderStatus',
      condition: 'equals',
      value: 'backorder',
      operator: 'AND',
      scope: 'product',
      active: true,
    },
  ]

  for (const rule of conditionRules) {
    const existing = await prisma.conditionRule.findFirst({
      where: { 
        field: rule.field,
        condition: rule.condition,
        value: rule.value,
      },
    })
    
    if (!existing) {
      await prisma.conditionRule.create({
        data: rule,
      })
    }
  }

  console.log(`✅ ${conditionRules.length} standaard condition rules aangemaakt`)

  // Maak standaard exclusion rules
  const exclusionRules = [
    {
      field: 'sku',
      condition: 'starts_with',
      value: '11',
      reason: 'Zijlstra',
      operator: 'AND',
      active: true,
    },
    {
      field: 'sku',
      condition: 'starts_with',
      value: '18',
      reason: 'Probo',
      operator: 'AND',
      active: true,
    },
    {
      field: 'sku',
      condition: 'contains',
      value: 'SHIPPING-NEXT-DAY',
      reason: 'Verzendproduct',
      operator: 'AND',
      active: true,
    },
  ]

  for (const rule of exclusionRules) {
    const existing = await prisma.exclusionRule.findFirst({
      where: { 
        field: rule.field,
        condition: rule.condition,
        value: rule.value,
      },
    })
    
    if (!existing) {
      await prisma.exclusionRule.create({
        data: rule,
      })
    }
  }

  console.log(`✅ ${exclusionRules.length} standaard exclusion rules aangemaakt`)

  // Maak standaard production specs
  const productionSpecs = [
    {
      tag: '100 x 150 cm',
      m2: 1.5,
      time: null,
    },
    {
      tag: '40 x 60 cm',
      m2: 0.24,
      time: null,
    },
    {
      tag: '60 x 90 cm',
      m2: 0.54,
      time: null,
    },
    {
      tag: '80 x 120 cm',
      m2: 0.96,
      time: null,
    },
  ]

  for (const spec of productionSpecs) {
    const existing = await prisma.productionSpec.findUnique({
      where: { tag: spec.tag },
    })
    
    if (!existing) {
      await prisma.productionSpec.create({
        data: spec,
      })
    }
  }

  console.log(`✅ ${productionSpecs.length} standaard production specs aangemaakt`)

  console.log('\n📋 Login credentials:')
  console.log('Admin: admin@printlijst.nl / admin123')
  console.log('Werknemer 1: jan@printlijst.nl / werknemer123')
  console.log('Werknemer 2: marie@printlijst.nl / werknemer123')
}

main()
  .catch((e) => {
    console.error('❌ Fout bij seeden:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
