import { NextRequest, NextResponse } from 'next/server';
import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } from '@/lib/spotify';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');

    if (!code) {
        return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    try {
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });

        const data = await tokenResponse.json();

        if (!data.access_token) {
            console.error('Token response error:', data);
            return NextResponse.json({ error: 'Failed to get access token', details: data }, { status: 400 });
        }

        const profileRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });
        const profile = await profileRes.json();

        await prisma.user.upsert({
            where: { spotifyId: profile.id },
            update: {
                displayName: profile.display_name,
                email: profile.email,
                profileImageUrl: profile.images?.[0]?.url,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000)
            },
            create: {
                spotifyId: profile.id,
                displayName: profile.display_name,
                email: profile.email,
                profileImageUrl: profile.images?.[0]?.url,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000)
            }
        });

        const redirectBaseUrl = REDIRECT_URI.replace('/api/callback', '');
        const response = NextResponse.redirect(`${redirectBaseUrl}/`);
        response.cookies.set('spotify_access_token', data.access_token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        response.cookies.set('spotify_refresh_token', data.refresh_token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        response.cookies.set('spotify_user_id', profile.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

        return response;
    } catch (error) {
        console.error('Auth Error:', error);
        return NextResponse.json({ error: 'Authentication failed', details: String(error) }, { status: 500 });
    }
}
