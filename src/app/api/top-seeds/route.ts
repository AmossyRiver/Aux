import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { refreshAccessToken, getSpotifyClient } from '@/lib/spotify';

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;
    const timeRange = request.nextUrl.searchParams.get('timeRange') || 'medium_term';

    if (!spotifyUserId) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId },
            select: { id: true, accessToken: true, tokenExpiresAt: true, refreshToken: true }
        });

        if (!user || !user.accessToken) {
            return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
        }

        let accessToken = user.accessToken;
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            const newToken = await refreshAccessToken(user.id);
            if (!newToken) {
                return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
            }
            accessToken = newToken;
        }

        const client = getSpotifyClient(accessToken);

        // Get user's top tracks and artists for the selected time range
        const [topTracksRes, topArtistsRes] = await Promise.all([
            client.me.top('tracks', { limit: 10, offset: 0, timeRange: timeRange as any }),
            client.me.top('artists', { limit: 10, offset: 0, timeRange: timeRange as any })
        ]);

        const topTracks = topTracksRes.items?.map((track: any) => ({
            id: track.id,
            name: track.name,
            artists: track.artists || [],
            album: track.album || {},
            preview_url: track.preview_url
        })) || [];

        const topArtists = topArtistsRes.items?.map((artist: any) => ({
            id: artist.id,
            name: artist.name,
            images: artist.images || [],
            genres: artist.genres || []
        })) || [];

        return NextResponse.json({
            topTracks,
            topArtists
        });
    } catch (error) {
        console.error('[TOP-SEEDS] Error fetching seeds:', error);
        return NextResponse.json(
            { error: 'Failed to fetch seeds' },
            { status: 500 }
        );
    }
}

