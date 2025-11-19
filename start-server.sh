#!/bin/bash

# Start Prisma Studio in the background on port 5555
echo "🚀 Starting Prisma Studio on port 5555..."
npx prisma studio --port 5555 --browser none &
PRISMA_PID=$!

# Give Prisma Studio a moment to start
sleep 3

# Start Next.js
echo "🚀 Starting Next.js application..."
npm start

# If Next.js exits, kill Prisma Studio
kill $PRISMA_PID 2>/dev/null
