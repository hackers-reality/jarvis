/**
 * Spotify Web API Integration
 * 
 * Manages OAuth2 tokens and provides methods for playback control,
 * searching, and track history.
 */

export type SpotifyTokens = {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
};

export class SpotifyClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken: string | null = null;
  private expiryDate: number = 0;

  private static BASE_URL = 'https://api.spotify.com/v1';

  private redirectUri: string;

  private static AUTH_BASE_URL = 'https://accounts.spotify.com/authorize';
  private static TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
  private static BASE_URL = 'https://api.spotify.com/v1';

  constructor(clientId: string, clientSecret: string, refreshToken: string = '', redirectUri: string = 'http://localhost:3142/api/auth/spotify/callback') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.redirectUri = redirectUri;
  }

  /**
   * Generate Spotify Authorization URL.
   */
  getAuthUrl(scopes: string[]): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      show_dialog: 'true',
    });
    return `${SpotifyClient.AUTH_BASE_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeCode(code: string): Promise<SpotifyTokens> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const resp = await fetch(SpotifyClient.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Spotify token exchange failed: ${err}`);
    }

    const data = await resp.json() as any;
    this.refreshToken = data.refresh_token;
    this.accessToken = data.access_token;
    this.expiryDate = Date.now() + (data.expires_in * 1000);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: this.expiryDate,
    };
  }

  /**
   * Ensure we have a valid access token.
   */
  async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiryDate - 60000) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const resp = await fetch(SpotifyClient.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Spotify token refresh failed: ${err}`);
    }

    const data = await resp.json() as any;
    this.accessToken = data.access_token;
    this.expiryDate = Date.now() + (data.expires_in * 1000);
    return this.accessToken!;
  }

  /**
   * Search for a track and return the first result's URI.
   */
  async searchTrack(query: string): Promise<{ uri: string; name: string; artist: string } | null> {
    const token = await this.ensureToken();
    const url = `${SpotifyClient.BASE_URL}/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
    
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!resp.ok) return null;

    const data = await resp.json() as any;
    const track = data.tracks?.items?.[0];
    if (!track) return null;

    return {
      uri: track.uri,
      name: track.name,
      artist: track.artists[0]?.name || 'Unknown',
    };
  }

  /**
   * Start or resume playback.
   */
  async play(contextUri?: string): Promise<void> {
    const token = await this.ensureToken();
    const body: any = {};
    if (contextUri) {
      if (contextUri.includes(':track:')) {
        body.uris = [contextUri];
      } else {
        body.context_uri = contextUri;
      }
    }

    const resp = await fetch(`${SpotifyClient.BASE_URL}/me/player/play`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok && resp.status !== 204) {
      const err = await resp.text();
      // Status 404 might mean no active device
      if (resp.status === 404) {
        throw new Error("No active Spotify device found. Please open Spotify on one of your devices.");
      }
      throw new Error(`Spotify play failed: ${err}`);
    }
  }

  /**
   * Pause playback.
   */
  async pause(): Promise<void> {
    const token = await this.ensureToken();
    await fetch(`${SpotifyClient.BASE_URL}/me/player/pause`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  /**
   * Skip to next track.
   */
  async next(): Promise<void> {
    const token = await this.ensureToken();
    await fetch(`${SpotifyClient.BASE_URL}/me/player/next`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  /**
   * Skip to previous track.
   */
  async previous(): Promise<void> {
    const token = await this.ensureToken();
    await fetch(`${SpotifyClient.BASE_URL}/me/player/previous`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  /**
   * Set volume (0-100).
   */
  async setVolume(percent: number): Promise<void> {
    const token = await this.ensureToken();
    await fetch(`${SpotifyClient.BASE_URL}/me/player/volume?volume_percent=${percent}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  /**
   * Get currently playing track.
   */
  async getCurrentTrack(): Promise<any> {
    const token = await this.ensureToken();
    const resp = await fetch(`${SpotifyClient.BASE_URL}/me/player/currently-playing`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (resp.status === 204) return null;
    return await resp.json();
  }
}
