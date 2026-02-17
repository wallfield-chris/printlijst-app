import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Get API key
  const apiKeySetting = await prisma.setting.findUnique({ where: { key: 'goedgepickt_api_key' } })
  if (!apiKeySetting) {
    console.log('No API key found')
    return
  }

  // Find all jobs without imageUrl but with productUuid
  const jobs = await prisma.printJob.findMany({
    where: {
      imageUrl: null,
      productUuid: { not: null },
    },
  })

  console.log(`Found ${jobs.length} jobs without imageUrl`)

  let updated = 0
  let skipped = 0
  const seen = new Map<string, string | null>()

  for (const job of jobs) {
    if (!job.productUuid) continue

    // Cache: don't fetch same product twice
    let imageUrl: string | null = null
    if (seen.has(job.productUuid)) {
      imageUrl = seen.get(job.productUuid) || null
    } else {
      try {
        const response = await fetch(`https://account.goedgepickt.nl/api/v1/products/${job.productUuid}`, {
          headers: {
            Authorization: `Bearer ${apiKeySetting.value}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
        const data = await response.json()
        
        if (data.picture && !data.picture.includes('image_placeholder')) {
          imageUrl = data.picture
        }
        seen.set(job.productUuid, imageUrl)
      } catch (error) {
        console.warn(`  Could not fetch product ${job.productUuid}`)
        seen.set(job.productUuid, null)
      }
    }

    if (imageUrl) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: { imageUrl },
      })
      updated++
      console.log(`✅ ${job.orderNumber} - ${job.productName}: ${imageUrl.substring(0, 60)}...`)
    } else {
      skipped++
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped (no image): ${skipped}`)
  await prisma.$disconnect()
}

main()
