// app/api/enhanced-preview/route.ts
import { NextRequest, NextResponse } from 'next/server';
// @ts-expect-error no type declaration
import spotifyPreviewFinder from 'spotify-preview-finder';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const songName = searchParams.get('songName');
    const artistName = searchParams.get('artistName');
    const trackId = searchParams.get('trackId');

    if (!songName || !artistName || !trackId) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        const result = await spotifyPreviewFinder(songName, artistName, 5);
        let previewUrl: string | null = null;

        if (result.success) {
            for (const song of result.results) {
                if (trackId === song.trackId && song.previewUrls.length > 0) {
                    previewUrl = song.previewUrls[0];
                    break;
                }
            }
            if (!previewUrl && result.results.length > 0 && result.results[0].previewUrls.length > 0) {
                previewUrl = result.results[0].previewUrls[0];
            }
        }

        return NextResponse.json({ previewUrl });
    } catch (error) {
        console.error('Error in enhanced search:', error);
        return NextResponse.json({ error: 'Failed to find enhanced preview' }, { status: 500 });
    }
}
