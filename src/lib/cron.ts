import cron from 'node-cron';
import { prisma } from './db';
import { getSpotifyClient, refreshAccessToken } from './spotify';

export function initializeCronJobs() {
    // Token refresh - every 59 minutes
    cron.schedule('*/59 * * * *', async () => {
        console.log('[CRON] Running token refresh for all users...');

        try {
            const users = await prisma.user.findMany({
                where: {
                    refreshToken: { not: null }
                }
            });

            console.log(`[CRON] Found ${users.length} users to refresh tokens for`);

            for (const user of users) {
                if (!user.refreshToken) continue;

                const newAccessToken = await refreshAccessToken(user.id);
                if (newAccessToken) {
                    console.log(`[CRON] Token refreshed successfully for user ${user.spotifyId}`);
                } else {
                    console.error(`[CRON] Failed to refresh token for user ${user.spotifyId}`);
                }
            }

            console.log('[CRON] Token refresh completed');
        } catch (error) {
            console.error('[CRON] Error in token refresh cron job:', error);
        }
    });

    // Data refresh - every 50 minutes
    cron.schedule('*/50 * * * *', async () => {
        console.log('[CRON] Running data refresh for all users...');

        try {
            // Get all users
            const users = await prisma.user.findMany({
                where: {
                    accessToken: { not: null }
                }
            });

            console.log(`[CRON] Found ${users.length} users to update`);

            for (const user of users) {
                if (!user.accessToken) continue;

                try {
                    const client = getSpotifyClient(user.accessToken);
                    const timeRanges = ['short_term', 'medium_term', 'long_term'];

                    // Refresh top tracks for all time ranges
                    for (const timeRange of timeRanges) {
                        const topTracks = await client.me.top('tracks', {
                            limit: 10,
                            offset: 0,
                            timeRange: timeRange as any
                        });

                        if (topTracks.items) {
                            // Use upsert to avoid unique constraint errors
                            for (const track of topTracks.items) {
                                const index = topTracks.items.indexOf(track);
                                await prisma.userTopTrack.upsert({
                                    where: {
                                        userId_spotifyTrackId_timeRange: {
                                            userId: user.id,
                                            spotifyTrackId: track.id,
                                            timeRange
                                        }
                                    },
                                    update: {
                                        trackName: track.name,
                                        artistNames: track.artists.map((a: any) => a.name).join(', '),
                                        albumImageUrl: track.album.images?.[0]?.url,
                                        rank: index + 1
                                    },
                                    create: {
                                        userId: user.id,
                                        spotifyTrackId: track.id,
                                        trackName: track.name,
                                        artistNames: track.artists.map((a: any) => a.name).join(', '),
                                        albumImageUrl: track.album.images?.[0]?.url,
                                        rank: index + 1,
                                        timeRange
                                    }
                                });
                            }

                            console.log(`[CRON] Updated top tracks (${timeRange}) for user ${user.spotifyId}`);
                        }
                    }

                    // Refresh top artists for all time ranges
                    for (const timeRange of timeRanges) {
                        const topArtists = await client.me.top('artists', {
                            limit: 10,
                            offset: 0,
                            timeRange: timeRange as any
                        });

                        if (topArtists.items) {
                            // Use upsert to avoid unique constraint errors
                            for (const artist of topArtists.items) {
                                const index = topArtists.items.indexOf(artist);
                                await prisma.userTopArtist.upsert({
                                    where: {
                                        userId_spotifyArtistId_timeRange: {
                                            userId: user.id,
                                            spotifyArtistId: artist.id,
                                            timeRange
                                        }
                                    },
                                    update: {
                                        artistName: artist.name,
                                        imageUrl: artist.images?.[0]?.url,
                                        genres: artist.genres || [],
                                        rank: index + 1
                                    },
                                    create: {
                                        userId: user.id,
                                        spotifyArtistId: artist.id,
                                        artistName: artist.name,
                                        imageUrl: artist.images?.[0]?.url,
                                        genres: artist.genres || [],
                                        rank: index + 1,
                                        timeRange
                                    }
                                });
                            }

                            console.log(`[CRON] Updated top artists (${timeRange}) for user ${user.spotifyId}`);
                        }
                    }

                    // Refresh recently played - add new entries every time
                    const recentlyPlayed = await client.me.recentlyPlayed({ limit: 50 });

                    if (recentlyPlayed.items) {
                        for (const item of recentlyPlayed.items) {
                            const track = item.track;

                            // Always create a new entry - never update
                            // This way we capture every single play
                            await prisma.listeningHistory.create({
                                data: {
                                    userId: user.id,
                                    spotifyTrackId: track.id,
                                    trackName: track.name,
                                    artistNames: track.artists.map((a: any) => a.name).join(', '),
                                    albumImageUrl: track.album.images?.[0]?.url,
                                    playedAt: new Date(item.played_at)
                                }
                            }).catch((error) => {
                                // Silently ignore duplicate play entries that occur in the same refresh
                                if (error.code !== 'P2002') {
                                    throw error;
                                }
                            });
                        }

                        console.log(`[CRON] Updated listening history for user ${user.spotifyId}`);
                    }
                } catch (userError) {
                    console.error(`[CRON] Error updating user ${user.spotifyId}:`, userError);
                    // Continue with next user even if one fails
                }
            }

            console.log('[CRON] Data refresh completed successfully');
        } catch (error) {
            console.error('[CRON] Error in data refresh cron job:', error);
        }
    });

    console.log('[CRON] Cron jobs initialized:');
    console.log('[CRON] - Token refresh: Every 59 minutes');
    console.log('[CRON] - Data refresh: Every 50 minutes');
}

