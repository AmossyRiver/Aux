-- DropIndex
DROP INDEX "ListeningHistory_userId_spotifyTrackId_key";

-- AlterTable
ALTER TABLE "ListeningHistory" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ListeningHistory_userId_spotifyTrackId_idx" ON "ListeningHistory"("userId", "spotifyTrackId");
