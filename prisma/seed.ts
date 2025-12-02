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
