import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.product.count()
  console.log(`TOTAL_SKU_COUNT=${count}`)
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())
