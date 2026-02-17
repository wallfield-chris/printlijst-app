import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Get API key
  const apiKeySetting = await prisma.setting.findUnique({ where: { key: 'goedgepickt_api_key' } })
  if (!apiKeySetting) {
    console.log('No API key found')
    return
  }

  // Find a job with a productUuid
  const job = await prisma.printJob.findFirst({ 
    where: { productUuid: { not: null } } 
  })
  
  if (!job || !job.productUuid) {
    console.log('No jobs with productUuid found')
    return
  }

  // Check a few products for picture fields
  const jobs = await prisma.printJob.findMany({ 
    where: { productUuid: { not: null } },
    take: 5,
    distinct: ['productUuid']
  })
  
  for (const job of jobs) {
    if (!job.productUuid) continue
    
    const response = await fetch(`https://account.goedgepickt.nl/api/v1/products/${job.productUuid}`, {
      headers: {
        Authorization: `Bearer ${apiKeySetting.value}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
    
    const data = await response.json()
    console.log(`${job.productName}: picture = ${data.picture}`)
  }
  
  await prisma.$disconnect()
}

main()
