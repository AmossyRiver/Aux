// app/api/login/route.ts
import { NextResponse } from 'next/server';
import { CLIENT_ID, REDIRECT_URI } from '@/lib/spotify';

export async function GET() {
    const scope = 'user-read-private user-read-email user-top-read user-read-currently-playing user-read-playback-state user-read-recently-played streaming user-modify-playback-state';

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI
    });

    return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
