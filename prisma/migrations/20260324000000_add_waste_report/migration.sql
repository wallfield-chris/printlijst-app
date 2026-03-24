-- CreateTable
CREATE TABLE "WasteReport" (
    "id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WasteReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WasteReport_createdAt_idx" ON "WasteReport"("createdAt");

-- CreateIndex
CREATE INDEX "WasteReport_size_idx" ON "WasteReport"("size");

-- CreateIndex
CREATE INDEX "WasteReport_userId_idx" ON "WasteReport"("userId");

-- AddForeignKey
ALTER TABLE "WasteReport" ADD CONSTRAINT "WasteReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
