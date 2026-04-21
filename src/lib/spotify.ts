// lib/spotify.ts
import { SpotifyAPI } from '@statsfm/spotify.js';
import { cookies } from 'next/headers';
import { prisma } from './db';

export const CLIENT_ID = process.env.CLIENT_ID!;
export const CLIENT_SECRET = process.env.CLIENT_SECRET!;
export const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/api/callback';

export async function getAccessToken(): Promise<string | null> {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('spotify_access_token')?.value;
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

    if (!accessToken || !spotifyUserId) {
        return null;
    }

    try {
        // Check if token is expired by looking at the user's tokenExpiresAt in database
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId },
            select: { id: true, tokenExpiresAt: true, refreshToken: true, accessToken: true }
        });

        if (!user) {
            return null;
        }

        // If token is expired or expiring soon (within 5 minutes), refresh it
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            console.log(`[TOKEN] Token expired or expiring soon for user ${spotifyUserId}, refreshing...`);
            const newToken = await refreshAccessTokenAndUpdateCookie(user.id, spotifyUserId);
            return newToken;
        }

        return accessToken;
    } catch (error) {
        console.error('Error checking token expiry:', error);
        return accessToken; // Return the cached token if we can't check
    }
}

export async function refreshAccessTokenAndUpdateCookie(userId: number, spotifyUserId: string): Promise<string | null> {
    const newToken = await refreshAccessToken(userId);
    if (newToken) {
        try {
            const cookieStore = await cookies();
            cookieStore.set('spotify_access_token', newToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        } catch (error) {
            console.error('Error updating cookie after token refresh:', error);
        }
    }
    return newToken;
}

export async function refreshAccessToken(userId: number): Promise<string | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user || !user.refreshToken) {
            console.error(`[TOKEN REFRESH] No refresh token found for user ${userId}`);
            return null;
        }

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: user.refreshToken
            })
        });

        const data = await response.json();

        if (!data.access_token) {
            console.error(`[TOKEN REFRESH] Failed to refresh token for user ${userId}:`, data);
            return null;
        }

        // Update user in database with new token and expiry
        await prisma.user.update({
            where: { id: userId },
            data: {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || user.refreshToken, // Spotify doesn't always return new refresh token
                tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000)
            }
        });


        console.log(`[TOKEN REFRESH] Successfully refreshed token for user ${userId}`);
        return data.access_token;
    } catch (error) {
        console.error(`[TOKEN REFRESH] Error refreshing token for user ${userId}:`, error);
        return null;
    }
}

export function getSpotifyClient(accessToken: string): SpotifyAPI {
    return new SpotifyAPI({
        clientCredentials: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET
        },
        accessToken
    });
}
