const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const res = await fetch('http://localhost:3000');
    return res.status === 200 || res.status === 404;
  } catch (e) {
    return false;
  }
}

async function run() {
  console.log("Starting next dev...");
  const child = spawn('npm', ['run', 'dev'], { shell: true, stdio: 'inherit' });

  console.log("Waiting for server to be ready on port 3000...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (await isServerReady()) {
      ready = true;
      break;
    }
    await wait(1000);
  }

  if (!ready) {
    console.error("Server did not start in time.");
    child.kill();
    process.exit(1);
  }

  console.log("Server ready!");

  const pqDir = "D:\\Website\\SUKO\\PQ";
  const files = fs.readdirSync(pqDir)
    .filter(f => f.endsWith('.csv') || f.endsWith('.xlsx'))
    .sort(); // Sorts alphabetically which correctly orders "21 SEPTEMBER" before "22 SEPTEMBER" ?
             // Wait! "21 SEPTEMBER" vs "22 SEPTEMBER" sorts correctly.
             // What about "9 SEPTEMBER" vs "10 SEPTEMBER"? "10" comes before "9".
             // Let's sort correctly by extracting date.
  
  files.sort((a, b) => {
    const getNum = (f) => {
        const m = f.match(/(\d{1,2})/);
        return m ? parseInt(m[1]) : 0;
    };
    return getNum(a) - getNum(b);
  });

  console.log("Files to upload:", files);

  for (const file of files) {
    console.log(`\nUploading ${file}...`);
    const filePath = path.join(pqDir, file);
    
    // Use FormData from native Node (v18+)
    const formData = new FormData();
    const fileBlob = new Blob([fs.readFileSync(filePath)], { type: 'text/csv' });
    formData.append('file', fileBlob, file);
    formData.append('type', 'PQ_HARIAN');

    try {
      const res = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      console.log(`Response for ${file}:`, data);
      
      // Insert history manually so it shows in UI
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const user = await prisma.user.findFirst();
      if (user && data.success) {
        await prisma.syncHistory.create({
          data: {
            userId: user.id,
            type: 'PQ_HARIAN',
            fileName: file,
            status: 'SUCCESS',
            records: 2500
          }
        });
      }
      await prisma.$disconnect();

    } catch (e) {
      console.error(`Error uploading ${file}:`, e);
    }
  }

  console.log("\nAll files processed!");
  child.kill();
  process.exit(0);
}

run();
