import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { refreshAccessToken, getSpotifyClient } from '@/lib/spotify';

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;
    const timeRange = request.nextUrl.searchParams.get('timeRange') || 'medium_term';

    if (!spotifyUserId) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        // Get user from database
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId },
            select: { id: true, accessToken: true, tokenExpiresAt: true, refreshToken: true }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if we have cached data in the database
        const cachedTracks = await prisma.userTopTrack.findMany({
            where: { userId: user.id, timeRange: timeRange },
            orderBy: { rank: 'asc' }
        });

        // If we have cached data and it's recent (less than 1 hour old), return it
        if (cachedTracks.length > 0) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const isRecent = cachedTracks[0].fetchedAt > oneHourAgo;

            if (isRecent) {
                // Convert database format to Spotify API format
                return NextResponse.json({
                    items: cachedTracks.map((track, index) => ({
                        id: track.spotifyTrackId,
                        name: track.trackName,
                        artists: track.artistNames.split(', ').map(name => ({ name })),
                        album: { images: track.albumImageUrl ? [{ url: track.albumImageUrl }] : [] }
                    }))
                });
            }
        }

        // If no recent cache, fetch from Spotify API and update database
        if (!user.accessToken) {
            // Return what we have in cache even if old
            if (cachedTracks.length > 0) {
                return NextResponse.json({
                    items: cachedTracks.map(track => ({
                        id: track.spotifyTrackId,
                        name: track.trackName,
                        artists: track.artistNames.split(', ').map(name => ({ name })),
                        album: { images: track.albumImageUrl ? [{ url: track.albumImageUrl }] : [] }
                    }))
                });
            }
            return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
        }

        // Check if token needs refresh
        let accessToken = user.accessToken;
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            console.log(`[TOP-TRACKS] Token expired, refreshing...`);
            const newToken = await refreshAccessToken(user.id);
            if (!newToken) {
                // Return cached data if refresh fails
                if (cachedTracks.length > 0) {
                    return NextResponse.json({
                        items: cachedTracks.map(track => ({
                            id: track.spotifyTrackId,
                            name: track.trackName,
                            artists: track.artistNames.split(', ').map(name => ({ name })),
                            album: { images: track.albumImageUrl ? [{ url: track.albumImageUrl }] : [] }
                        }))
                    });
                }
                return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
            }
            accessToken = newToken;
        }

        const client = getSpotifyClient(accessToken);
        const topTracks = await client.me.top('tracks', { limit: 10, offset: 0, timeRange: timeRange as any });

        // Fetch recently played tracks to keep listening history fresh
        // Fetch in larger batches to get more comprehensive history
        try {
            const recentlyPlayedBatches = await Promise.all([
                client.me.recentlyPlayed({ limit: 50, offset: 0 }),
                client.me.recentlyPlayed({ limit: 50, offset: 50 }),
                client.me.recentlyPlayed({ limit: 50, offset: 100 })
            ]);

            const allRecentlyPlayed = recentlyPlayedBatches.flatMap(batch => batch.items || []);

            for (const item of allRecentlyPlayed) {
                const track = item.track;
                const playedAt = new Date(item.played_at);

                await prisma.listeningHistory.create({
                    data: {
                        userId: user.id,
                        spotifyTrackId: track.id,
                        trackName: track.name,
                        artistNames: track.artists.map((a: any) => a.name).join(', '),
                        albumImageUrl: track.album.images?.[0]?.url,
                        playedAt: playedAt
                    }
                }).catch((error) => {
                    // Silently ignore duplicate entries
                    if (error.code !== 'P2002') {
                        throw error;
                    }
                });
            }
        } catch (error) {
            console.log('[TOP-TRACKS] Could not fetch recently played for stream count:', error);
        }

        // Update database with fresh data
        if (topTracks.items) {
            await prisma.userTopTrack.deleteMany({
                where: { userId: user.id, timeRange: timeRange }
            });

            await prisma.userTopTrack.createMany({
                data: topTracks.items.map((track: any, index: number) => ({
                    userId: user.id,
                    spotifyTrackId: track.id,
                    trackName: track.name,
                    artistNames: track.artists.map((a: any) => a.name).join(', '),
                    albumImageUrl: track.album.images?.[0]?.url,
                    rank: index + 1,
                    timeRange: timeRange
                }))
            });
        }

        // Calculate streams and minutes listened for each track
        // This queries ALL historical listening data in the database, not just recent plays
        const tracksWithStats = await Promise.all(
            topTracks.items.map(async (track: any) => {
                // Count ALL streams (listens) for this track from entire listening history
                const streams = await prisma.listeningHistory.count({
                    where: {
                        userId: user.id,
                        spotifyTrackId: track.id
                    }
                });

                // Calculate total minutes using Spotify API duration_ms
                const totalMinutes = (streams * (track.duration_ms || 0)) / 60000;

                return {
                    ...track,
                    streamsCount: streams,
                    minutesListened: Math.round(totalMinutes * 100) / 100
                };
            })
        );

        return NextResponse.json({ items: tracksWithStats });
    } catch (error) {
        console.error('Error fetching top tracks:', error);
        return NextResponse.json({ error: 'Failed to fetch top tracks' }, { status: 500 });
    }
}
