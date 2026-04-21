import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { refreshAccessToken, getSpotifyClient } from '@/lib/spotify';

const LASTFM_API_KEY = process.env.lastfm_api_key;
const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;
    const type = request.nextUrl.searchParams.get('type') || 'tracks';
    const selectedTracksParam = request.nextUrl.searchParams.get('tracks'); // comma-separated track IDs
    const selectedArtistsParam = request.nextUrl.searchParams.get('artists'); // comma-separated artist IDs

    console.log(`[RECOMMENDATIONS] Request received - Type: ${type}, SelectedTracks: ${selectedTracksParam || 'none'}, SelectedArtists: ${selectedArtistsParam || 'none'}`);

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

        // Determine seed artists
        let seedArtists: any[] = [];

        if (selectedArtistsParam) {
            // If specific artists are selected, fetch them from Spotify REST API
            const selectedArtistIds = selectedArtistsParam.split(',').filter(id => id.length > 0);
            console.log(`[RECOMMENDATIONS] Using selected artist IDs: ${selectedArtistIds.join(',')}`);
            
            try {
                const artistsUrl = `https://api.spotify.com/v1/artists?ids=${selectedArtistIds.join(',')}`;
                const artistsRes = await fetch(artistsUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (artistsRes.ok) {
                    const artistsData = await artistsRes.json();
                    seedArtists = artistsData.artists || [];
                } else {
                    console.error('[RECOMMENDATIONS] Error fetching selected artists:', artistsRes.status);
                    return NextResponse.json({ error: 'Error fetching selected artists' }, { status: 400 });
                }
            } catch (error) {
                console.error('[RECOMMENDATIONS] Error fetching selected artists:', error);
                return NextResponse.json({ error: 'Error fetching selected artists' }, { status: 400 });
            }
        } else {
            // Otherwise use user's top artists from Spotify
            const topArtists = await client.me.top('artists', { limit: 5, offset: 0, timeRange: 'medium_term' });
            seedArtists = topArtists.items?.slice(0, 3) || [];
        }

        if (type === 'artists') {
            if (seedArtists.length === 0) {
                return NextResponse.json({ error: 'Not enough data' }, { status: 400 });
            }

            console.log('[RECOMMENDATIONS] Getting similar artists for:', seedArtists.map(a => a.name).join(', '));

            const similarArtistsSet = new Map();

            // For each top artist, get similar artists from Last.fm
            for (const artist of seedArtists) {
                try {
                    const url = new URL(LASTFM_BASE_URL);
                    url.searchParams.append('method', 'artist.getSimilar');
                    url.searchParams.append('artist', artist.name);
                    url.searchParams.append('limit', '10');
                    url.searchParams.append('api_key', LASTFM_API_KEY || '');
                    url.searchParams.append('format', 'json');

                    const response = await fetch(url.toString());

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`[RECOMMENDATIONS] Found ${data.similarartists?.artist?.length || 0} similar artists for ${artist.name}`);

                        if (data.similarartists?.artist) {
                            const similarArtists = Array.isArray(data.similarartists.artist)
                                ? data.similarartists.artist
                                : [data.similarartists.artist];

                            for (const similarArtist of similarArtists) {
                                if (!similarArtistsSet.has(similarArtist.name)) {
                                    similarArtistsSet.set(similarArtist.name, {
                                        id: similarArtist.name,
                                        name: similarArtist.name,
                                        images: similarArtist.image?.[2]?.['#text'] ? [{ url: similarArtist.image[2]['#text'] }] : [],
                                        genres: [],
                                        url: similarArtist.url
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.log(`[RECOMMENDATIONS] Error fetching similar artists for ${artist.name}:`, error);
                }
            }

            const recommendedArtists = Array.from(similarArtistsSet.values()).slice(0, 20);
            console.log(`[RECOMMENDATIONS] Returning ${recommendedArtists.length} recommended artists`);

            // Enrich artist data with Spotify information
             const enrichedArtists = await Promise.all(
                 recommendedArtists.map(async (artist: any) => {
                     try {
                         // Search for artist on Spotify
                         const searchUrl = new URL('https://api.spotify.com/v1/search');
                         searchUrl.searchParams.append('q', artist.name);
                         searchUrl.searchParams.append('type', 'artist');
                         searchUrl.searchParams.append('limit', '1');

                         const searchRes = await fetch(searchUrl.toString(), {
                             headers: { 'Authorization': `Bearer ${accessToken}` }
                         });

                         if (searchRes.ok) {
                             const searchData = await searchRes.json();
                             if (searchData.artists?.items?.[0]) {
                                 const spotifyArtist = searchData.artists.items[0];
                                 return {
                                     id: spotifyArtist.id,
                                     name: spotifyArtist.name,
                                     images: spotifyArtist.images || [],
                                     genres: spotifyArtist.genres || [],
                                     external_urls: spotifyArtist.external_urls || {},
                                     popularity: spotifyArtist.popularity || 0
                                 };
                             }
                         }
                     } catch (error) {
                         console.log(`[RECOMMENDATIONS] Error enriching artist ${artist.name}`);
                     }
                     return artist;
                 })
             );

             // Deduplicate artists by ID
             const deduplicatedArtists = Array.from(
                 new Map(enrichedArtists.map(artist => [artist.id, artist])).values()
             );

             console.log(`[RECOMMENDATIONS] After deduplication: ${deduplicatedArtists.length} artists (was ${enrichedArtists.length})`);

             return NextResponse.json({
                 type: 'artists',
                 items: deduplicatedArtists
             });

        } else {
            // Determine seed tracks
            let seedTracks: any[] = [];

            if (selectedTracksParam) {
                // If specific tracks are selected, fetch them from Spotify REST API
                const selectedTrackIds = selectedTracksParam.split(',').filter(id => id.length > 0);
                console.log(`[RECOMMENDATIONS] Using selected track IDs: ${selectedTrackIds.join(',')}`);
                
                try {
                    const tracksUrl = `https://api.spotify.com/v1/tracks?ids=${selectedTrackIds.join(',')}`;
                    const tracksRes = await fetch(tracksUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    if (tracksRes.ok) {
                        const tracksData = await tracksRes.json();
                        seedTracks = tracksData.tracks || [];
                    } else {
                        console.error('[RECOMMENDATIONS] Error fetching selected tracks:', tracksRes.status);
                        return NextResponse.json({ error: 'Error fetching selected tracks' }, { status: 400 });
                    }
                } catch (error) {
                    console.error('[RECOMMENDATIONS] Error fetching selected tracks:', error);
                    return NextResponse.json({ error: 'Error fetching selected tracks' }, { status: 400 });
                }
            } else {
                // Otherwise use user's top tracks from Spotify
                const topTracks = await client.me.top('tracks', { limit: 5, offset: 0, timeRange: 'medium_term' });
                seedTracks = topTracks.items?.slice(0, 3) || [];
            }

            if (seedTracks.length === 0) {
                return NextResponse.json({ error: 'Not enough data' }, { status: 400 });
            }

            console.log('[RECOMMENDATIONS] Getting similar tracks for:', seedTracks.map(t => `${t.name} by ${t.artists[0]?.name}`).join(', '));

            const similarTracksSet = new Map();

            // For each top track, get similar tracks from Last.fm
            for (const track of seedTracks) {
                try {
                    const artistName = track.artists[0]?.name || '';
                    const trackName = track.name;

                    const url = new URL(LASTFM_BASE_URL);
                    url.searchParams.append('method', 'track.getSimilar');
                    url.searchParams.append('artist', artistName);
                    url.searchParams.append('track', trackName);
                    url.searchParams.append('limit', '10');
                    url.searchParams.append('api_key', LASTFM_API_KEY || '');
                    url.searchParams.append('format', 'json');

                    const response = await fetch(url.toString());

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`[RECOMMENDATIONS] Found ${data.similartracks?.track?.length || 0} similar tracks for ${trackName}`);

                        if (data.similartracks?.track) {
                            const similarTracks = Array.isArray(data.similartracks.track)
                                ? data.similartracks.track
                                : [data.similartracks.track];

                            for (const similarTrack of similarTracks) {
                                const trackKey = `${similarTrack.name}-${similarTrack.artist.name}`;
                                if (!similarTracksSet.has(trackKey)) {
                                    similarTracksSet.set(trackKey, {
                                        id: similarTrack.url,
                                        name: similarTrack.name,
                                        artists: [{ name: similarTrack.artist.name }],
                                        album: {
                                            images: similarTrack.image?.[2]?.['#text'] ? [{ url: similarTrack.image[2]['#text'] }] : []
                                        },
                                        preview_url: null,
                                        url: similarTrack.url
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.log(`[RECOMMENDATIONS] Error fetching similar tracks:`, error);
                }
            }

            const recommendedTracks = Array.from(similarTracksSet.values()).slice(0, 20);
            console.log(`[RECOMMENDATIONS] Returning ${recommendedTracks.length} recommended tracks`);

            // Enrich track data with Spotify information
            const enrichedTracks = await Promise.all(
                recommendedTracks.map(async (track: any) => {
                    try {
                        // Search for track on Spotify
                        const searchQuery = `${track.name} ${track.artists[0].name}`;
                        const searchUrl = new URL('https://api.spotify.com/v1/search');
                        searchUrl.searchParams.append('q', searchQuery);
                        searchUrl.searchParams.append('type', 'track');
                        searchUrl.searchParams.append('limit', '1');

                        const searchRes = await fetch(searchUrl.toString(), {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });

                        if (searchRes.ok) {
                            const searchData = await searchRes.json();
                            if (searchData.tracks?.items?.[0]) {
                                const spotifyTrack = searchData.tracks.items[0];
                                console.log(`[RECOMMENDATIONS] Enriched track: ${spotifyTrack.name}, preview_url: ${spotifyTrack.preview_url ? 'available' : 'null'}`);
                                return {
                                    id: spotifyTrack.id,
                                    name: spotifyTrack.name,
                                    artists: spotifyTrack.artists || [],
                                    album: spotifyTrack.album || {},
                                    preview_url: spotifyTrack.preview_url || null,
                                    external_urls: spotifyTrack.external_urls || {},
                                    popularity: spotifyTrack.popularity || 0
                                };
                            }
                        }
                    } catch (error) {
                        console.log(`[RECOMMENDATIONS] Error enriching track ${track.name}`);
                    }
                    return track;
                })
            );

             console.log(`[RECOMMENDATIONS] Returning ${enrichedTracks.length} tracks. Preview URLs available:`, enrichedTracks.filter(t => t.preview_url).length);

             // Deduplicate tracks by ID before fetching enhanced previews
             const deduplicatedTracks = Array.from(
                 new Map(enrichedTracks.map(track => [track.id, track])).values()
             );

             console.log(`[RECOMMENDATIONS] After deduplication: ${deduplicatedTracks.length} tracks (was ${enrichedTracks.length})`);

             // Fetch enhanced previews for tracks that don't have a preview URL
             const tracksWithEnhancedPreviews = await Promise.all(
                 deduplicatedTracks.map(async (track: any) => {
                     if (track.preview_url) {
                         return track;
                     }

                     try {
                         const artistName = track.artists?.[0]?.name || 'Unknown';
                         const params = new URLSearchParams();
                         params.append('songName', track.name);
                         params.append('artistName', artistName);
                         params.append('trackId', track.id);

                         const baseUrl = process.env.VERCEL_URL 
                             ? `https://${process.env.VERCEL_URL}`
                             : 'http://localhost:3000';

                         const previewResponse = await fetch(
                             `${baseUrl}/api/enhanced-preview?${params.toString()}`,
                             { method: 'GET' }
                         );

                         if (previewResponse.ok) {
                             const previewData = await previewResponse.json();
                             if (previewData.previewUrl) {
                                 console.log(`[RECOMMENDATIONS] Found enhanced preview for ${track.name}`);
                                 return {
                                     ...track,
                                     preview_url: previewData.previewUrl
                                 };
                             }
                         }
                     } catch (error) {
                         console.error(`[RECOMMENDATIONS] Failed to fetch enhanced preview for track ${track.id}:`, error);
                     }

                     return track;
                 })
             );

             return NextResponse.json({
                 type: 'tracks',
                 items: tracksWithEnhancedPreviews
             });
        }
    } catch (error) {
        console.error('[RECOMMENDATIONS] Error fetching recommendations:', error);
        return NextResponse.json(
            { error: 'Failed to fetch recommendations' },
            { status: 500 }
        );
    }
}

