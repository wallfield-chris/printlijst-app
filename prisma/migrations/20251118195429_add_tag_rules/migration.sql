-- CreateTable
CREATE TABLE "TagRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "field" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TagRule_field_idx" ON "TagRule"("field");

-- CreateIndex
CREATE INDEX "TagRule_active_idx" ON "TagRule"("active");
