import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getSpotifyClient, refreshAccessToken } from '@/lib/spotify';

export async function POST() {
  const cookieStore = await cookies();
  const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

  if (!spotifyUserId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { spotifyId: spotifyUserId },
      select: { id: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all other users with access tokens
    const allUsers = await prisma.user.findMany({
      where: {
        id: {
          not: currentUser.id
        },
        accessToken: {
          not: null
        }
      },
      select: {
        id: true,
        spotifyId: true,
        displayName: true,
        profileImageUrl: true,
        accessToken: true,
        tokenExpiresAt: true,
        refreshToken: true
      }
    });

    let syncedCount = 0;

    // Fetch recently played tracks for each other user and save to database
    await Promise.all(
      allUsers.map(async (user) => {
        try {
          let accessToken = user.accessToken;

          // Check if token needs refresh
          if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            const newToken = await refreshAccessToken(user.id);
            if (newToken) {
              accessToken = newToken;
            }
          }

          if (!accessToken) {
            return;
          }

          const client = getSpotifyClient(accessToken);
          const recentlyPlayed = await client.me.recentlyPlayed({ limit: 50 }).catch(() => null);

          if (!recentlyPlayed?.items || recentlyPlayed.items.length === 0) {
            return;
          }

          // Save each track to listening history
          for (const item of recentlyPlayed.items) {
            const track = item.track;
            // Normalize the timestamp to remove milliseconds for consistent comparison
            const playedAt = new Date(item.played_at);
            playedAt.setMilliseconds(0);

            try {
              // Check if this exact play already exists
              const existing = await prisma.listeningHistory.findFirst({
                where: {
                  userId: user.id,
                  spotifyTrackId: track.id,
                  playedAt: playedAt
                }
              });

              // Only create if it doesn't already exist
              if (!existing) {
                await prisma.listeningHistory.create({
                  data: {
                    userId: user.id,
                    spotifyTrackId: track.id,
                    trackName: track.name,
                    artistNames: track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
                    albumImageUrl: track.album?.images?.[0]?.url || '',
                    playedAt: playedAt
                  }
                });
                syncedCount++;
              }
            } catch (err: any) {
              // Skip if there's any error
              if (err.code !== 'P2002') {
                console.error(`[SYNC] Error saving track for user ${user.id}:`, err);
              }
            }
          }
        } catch (error) {
          console.error(`[SYNC] Error syncing listening history for user ${user.id}:`, error);
        }
      })
    );

    return NextResponse.json({
      success: true,
      message: `Synced listening history for ${allUsers.length} users`,
      syncedTracks: syncedCount
    });
  } catch (error) {
    console.error('[SYNC] Error syncing friends listening history:', error);
    return NextResponse.json(
      { error: 'Failed to sync friends listening history' },
      { status: 500 }
    );
  }
}

