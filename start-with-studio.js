const { spawn } = require('child_process');

console.log('🚀 Starting Prisma Studio on port 5555...');

// Start Prisma Studio
const prismaStudio = spawn('npx', ['prisma', 'studio', '--port', '5555', '--browser', 'none'], {
  stdio: 'inherit',
  shell: true
});

// Give Prisma Studio time to start
setTimeout(() => {
  console.log('🚀 Starting Next.js application...');
  
  // Start Next.js
  const nextjs = spawn('npm', ['start'], {
    stdio: 'inherit',
    shell: true
  });

  // Handle Next.js exit
  nextjs.on('exit', (code) => {
    console.log(`Next.js exited with code ${code}`);
    prismaStudio.kill();
    process.exit(code);
  });

  // Handle errors
  nextjs.on('error', (err) => {
    console.error('Failed to start Next.js:', err);
    prismaStudio.kill();
    process.exit(1);
  });
}, 3000);

// Handle Prisma Studio errors
prismaStudio.on('error', (err) => {
  console.error('Failed to start Prisma Studio:', err);
  process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  prismaStudio.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  prismaStudio.kill();
  process.exit(0);
});
