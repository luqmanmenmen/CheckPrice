const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const total = await p.product.count();
  const agg = await p.product.aggregate({
    _sum:{ stok:true, eoh_retail:true, day_sales_unit:true, sales_mtd:true }
  });
  const samples = await p.product.findMany({
    take:3, orderBy:{stok:"desc"},
    select:{sku:true,stok:true,eoh_retail:true,day_sales_unit:true,sales_mtd:true}
  });
  const zeroStok = await p.product.count({where:{stok:0}});
  console.log("Total produk:", total);
  console.log("Stok nol:", zeroStok);
  console.log("SUM stok:", agg._sum.stok, "| eoh_retail:", agg._sum.eoh_retail);
  console.log("SUM day_sales:", agg._sum.day_sales_unit, "| mtd:", agg._sum.sales_mtd);
  console.log("Sample top stok:", JSON.stringify(samples));
}
main().catch(e=>console.error(e.message)).finally(()=>p.$disconnect());
