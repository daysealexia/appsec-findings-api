-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('SAST', 'SCA');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'FIXED', 'IGNORED');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5');

-- CreateTable
CREATE TABLE "findings" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "type" "FindingType" NOT NULL,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commit" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "FindingStatus" NOT NULL,
    "classification" "Classification" NOT NULL,
    "author" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "vendor_updated_at" TIMESTAMP(3) NOT NULL,
    "first_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "findings_external_id_key" ON "findings"("external_id");

-- CreateIndex
CREATE INDEX "findings_repository_idx" ON "findings"("repository");

-- CreateIndex
CREATE INDEX "findings_type_idx" ON "findings"("type");

-- CreateIndex
CREATE INDEX "findings_status_idx" ON "findings"("status");

-- CreateIndex
CREATE INDEX "findings_classification_idx" ON "findings"("classification");
