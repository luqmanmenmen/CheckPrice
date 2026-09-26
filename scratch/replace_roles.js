const fs = require('fs');
const path = require('path');

const files = [
  'src/middleware.ts',
  'src/components/LayoutWrapper.tsx',
  'src/app/login/page.tsx',
  'src/app/super-admin/users/page.tsx',
  'src/app/super-admin/page.tsx',
  'src/app/api/auth/login/route.ts',
  'src/app/api/admin/users/route.ts',
  'src/app/api/admin/shift/route.ts',
  'src/app/api/admin/sync/route.ts'
];

for (const file of files) {
  const filePath = path.join('c:\\Max Display\\price-checker', file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace SUPER_ADMIN with SUPERVISOR
  content = content.replace(/"SUPER_ADMIN"/g, '"SUPERVISOR"');
  content = content.replace(/'SUPER_ADMIN'/g, "'SUPERVISOR'");
  content = content.replace(/SUPER_ADMIN/g, 'SUPERVISOR');
  
  // Replace SA with CREW_STORE
  content = content.replace(/"SA"/g, '"CREW_STORE"');
  content = content.replace(/'SA'/g, "'CREW_STORE'");
  // Careful with SA regex so it doesn't match other things
  // E.g. role === 'SA'
  content = content.replace(/role === 'SA'/g, "role === 'CREW_STORE'");
  content = content.replace(/role === "SA"/g, 'role === "CREW_STORE"');
  content = content.replace(/role !== 'SA'/g, "role !== 'CREW_STORE'");
  content = content.replace(/role !== "SA"/g, 'role !== "CREW_STORE"');
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
}
