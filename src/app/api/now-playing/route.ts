// app/api/now-playing/route.ts
import { NextResponse } from 'next/server';
import { getSpotifyClient, refreshAccessToken } from '@/lib/spotify';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET() {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

    if (!spotifyUserId) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        // Get user and their access token from database
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId },
            select: { id: true, accessToken: true, tokenExpiresAt: true, refreshToken: true }
        });

        if (!user || !user.accessToken) {
            return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
        }

        // Check if token needs refresh
        let accessToken = user.accessToken;
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            console.log(`[NOW-PLAYING] Token expired, refreshing...`);
            const newToken = await refreshAccessToken(user.id);
            if (!newToken) {
                return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
            }
            accessToken = newToken;
        }

        const client = getSpotifyClient(accessToken);
        const currentlyPlaying = await client.me.getPlaybackState();

        if (!currentlyPlaying || !currentlyPlaying.item) {
            return NextResponse.json({ isPlaying: false });
        }

        return NextResponse.json({
            isPlaying: currentlyPlaying.is_playing,
            item: currentlyPlaying.item,
            progress_ms: currentlyPlaying.progress_ms
        });
    } catch (error) {
        console.error('Error fetching now playing:', error);
        return NextResponse.json({ error: 'Failed to fetch currently playing' }, { status: 500 });
    }
}
