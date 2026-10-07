import { list } from '@vercel/blob';

async function test() {
  const listResult = await list({
    prefix: `PROMO/`,
    limit: 10,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  
  console.log("Found:", listResult.blobs.length);
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - 3);
  
  for (const blob of listResult.blobs) {
    const d = new Date(blob.uploadedAt);
    console.log(blob.pathname, "|", d.toISOString(), "| < threshold:", d < thresholdDate);
  }
}
test().catch(console.error);
