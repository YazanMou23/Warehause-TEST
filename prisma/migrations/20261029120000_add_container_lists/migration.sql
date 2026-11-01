-- CreateTable
CREATE TABLE "ContainerList" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "title" TEXT,
    "date" TIMESTAMP(3),
    "rawFileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerListRow" (
    "id" TEXT NOT NULL,
    "containerListId" TEXT NOT NULL,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT,
    "containerNumber" TEXT,
    "fuss" TEXT,
    "artikel" TEXT,
    "kartons" INTEGER,
    "termin" TEXT,
    "ankunft" TEXT,
    "start" TEXT,
    "ende" TEXT,
    "personal" INTEGER,
    "wartezeitVon" TEXT,
    "wartezeitBis" TEXT,
    "wartezeitStd" TEXT,
    "wickel" TEXT,
    "preis" DOUBLE PRECISION,
    "ps" TEXT,
    "extraTeam" TEXT,
    "bemerkung" TEXT,
    "warnings" JSONB,
    "uncertainFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerListRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContainerList_site_idx" ON "ContainerList"("site");

-- CreateIndex
CREATE INDEX "ContainerList_date_idx" ON "ContainerList"("date");

-- CreateIndex
CREATE INDEX "ContainerList_createdById_idx" ON "ContainerList"("createdById");

-- CreateIndex
CREATE INDEX "ContainerList_createdAt_idx" ON "ContainerList"("createdAt");

-- CreateIndex
CREATE INDEX "ContainerListRow_containerListId_idx" ON "ContainerListRow"("containerListId");

-- CreateIndex
CREATE INDEX "ContainerListRow_containerNumber_idx" ON "ContainerListRow"("containerNumber");

-- CreateIndex
CREATE INDEX "ContainerListRow_rowOrder_idx" ON "ContainerListRow"("rowOrder");

-- AddForeignKey
ALTER TABLE "ContainerList" ADD CONSTRAINT "ContainerList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerListRow" ADD CONSTRAINT "ContainerListRow_containerListId_fkey" FOREIGN KEY ("containerListId") REFERENCES "ContainerList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
