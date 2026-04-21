import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getSpotifyClient, refreshAccessToken } from '@/lib/spotify';

export async function GET() {
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

    // Fetch now playing data for all other users in parallel
    const nowPlayingTracks: any[] = [];

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
          const currentlyPlaying = await client.me.getPlaybackState().catch(() => null);

          if (currentlyPlaying?.item && currentlyPlaying.is_playing) {
            nowPlayingTracks.push({
              id: `now-playing-${user.id}`,
              spotifyTrackId: currentlyPlaying.item.id,
              trackName: currentlyPlaying.item.name,
              artistNames: currentlyPlaying.item.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
              albumImageUrl: currentlyPlaying.item.album?.images?.[0]?.url || '',
              playedAt: new Date().toISOString(),
              isNowPlaying: true,
              user: {
                id: user.id,
                spotifyId: user.spotifyId,
                displayName: user.displayName || 'Unknown User',
                profileImageUrl: user.profileImageUrl || ''
              }
            });
          }
        } catch (error) {
          console.error(`[FRIENDS-FEED] Error fetching now playing for user ${user.id}:`, error);
        }
      })
    );

    // Fetch listening history from all users except the current user
    const allListeningHistory = await prisma.listeningHistory.findMany({
      where: {
        user: {
          id: {
            not: currentUser.id
          }
        }
      },
      include: {
        user: {
          select: {
            id: true,
            spotifyId: true,
            displayName: true,
            profileImageUrl: true
          }
        }
      },
      orderBy: {
        playedAt: 'desc'
      },
      take: 500
    });

    // Deduplicate listening history - keep only the most recent listen of each unique track per user
    const seenTracks = new Map<string, any>();
    const uniqueItems: any[] = [];

    for (const entry of allListeningHistory) {
      const key = `${entry.userId}-${entry.spotifyTrackId}`;
      if (!seenTracks.has(key)) {
        seenTracks.set(key, true);
        uniqueItems.push({
          id: entry.id,
          spotifyTrackId: entry.spotifyTrackId,
          trackName: entry.trackName,
          artistNames: entry.artistNames,
          albumImageUrl: entry.albumImageUrl,
          playedAt: entry.playedAt.toISOString(),
          isNowPlaying: false,
          user: {
            id: entry.user.id,
            spotifyId: entry.user.spotifyId,
            displayName: entry.user.displayName || 'Unknown User',
            profileImageUrl: entry.user.profileImageUrl || ''
          }
        });
      }
    }

    // Combine now playing tracks with listening history
    const allItems = [...nowPlayingTracks, ...uniqueItems];

    // Sort by most recent playedAt
    allItems.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

    // Limit to top 100 after sorting
    const items = allItems.slice(0, 100);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching friends feed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch friends feed' },
      { status: 500 }
    );
  }
}

