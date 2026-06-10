import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClient, ApiError } from './index.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ApiClient', () => {
  let client: ApiClient;
  const mockGetToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue('test-jwt-token');
    client = new ApiClient({
      baseUrl: 'https://api.example.com',
      getToken: mockGetToken,
    });
  });

  function mockResponse(status: number, body?: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(body),
    };
  }

  describe('constructor', () => {
    it('strips trailing slash from baseUrl', () => {
      const c = new ApiClient({
        baseUrl: 'https://api.example.com/',
        getToken: mockGetToken,
      });
      mockFetch.mockResolvedValue(mockResponse(200, []));
      c.getTradeList();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/trade/list',
        expect.anything(),
      );
    });
  });

  describe('authorization', () => {
    it('includes Bearer token in Authorization header when token is available', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));
      await client.getTradeList();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/trade/list',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
        }),
      );
    });

    it('omits Authorization header when token is null', async () => {
      mockGetToken.mockResolvedValue(null);
      mockFetch.mockResolvedValue(mockResponse(200, []));
      await client.getTradeList();

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Authorization');
    });

    it('sets Content-Type to application/json', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));
      await client.getTradeList();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('throws ApiError with code, status, and message for non-2xx responses', async () => {
      mockFetch.mockResolvedValue(
        mockResponse(403, {
          error: {
            code: 'TIER_LIMIT_EXCEEDED',
            message: 'Free tier limit reached',
          },
        }),
      );

      await expect(client.getTradeList()).rejects.toThrow(ApiError);

      try {
        await client.getTradeList();
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe('TIER_LIMIT_EXCEEDED');
        expect(apiErr.message).toBe('Free tier limit reached');
      }
    });

    it('handles non-JSON error responses gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('not json')),
      });

      await expect(client.getTradeList()).rejects.toThrow(ApiError);

      try {
        await client.getTradeList();
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.code).toBe('UNKNOWN_ERROR');
        expect(apiErr.message).toBe('Request failed with status 500');
      }
    });

    it('handles 204 No Content responses', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      const result = await client.deleteContent('content-123');
      expect(result).toBeUndefined();
    });
  });

  describe('Trade endpoints', () => {
    it('getTradeList calls GET /trade/list', async () => {
      const trades = [{ id: 'roofing', name: 'Roofing' }];
      mockFetch.mockResolvedValue(mockResponse(200, trades));

      const result = await client.getTradeList();
      expect(result).toEqual(trades);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/trade/list',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('selectTrade calls PUT /trade/select with tradeId', async () => {
      const user = { id: 'user1', tradeId: 'roofing' };
      mockFetch.mockResolvedValue(mockResponse(200, user));

      const result = await client.selectTrade('roofing');
      expect(result).toEqual(user);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/trade/select',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ tradeId: 'roofing' }),
        }),
      );
    });
  });

  describe('Content endpoints', () => {
    it('generateContent calls POST /content/generate', async () => {
      const request = {
        tone: 'professional' as const,
        postType: 'tip',
        platforms: ['facebook' as const],
      };
      const content = { id: 'c1', content: 'Generated text' };
      mockFetch.mockResolvedValue(mockResponse(200, content));

      const result = await client.generateContent(request);
      expect(result).toEqual(content);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/content/generate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('getContentHistory calls GET /content/history', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));

      await client.getContentHistory();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/content/history',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('getUploadUrl calls POST /content/upload-url', async () => {
      const response = { url: 'https://s3.example.com/upload', key: 'media/file.jpg' };
      mockFetch.mockResolvedValue(mockResponse(200, response));

      const result = await client.getUploadUrl('file.jpg', 'image/jpeg');
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/content/upload-url',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ filename: 'file.jpg', contentType: 'image/jpeg' }),
        }),
      );
    });

    it('deleteContent calls DELETE /content/{id}', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      await client.deleteContent('content-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/content/content-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('Posts endpoints', () => {
    it('schedulePosts calls POST /posts/schedule', async () => {
      const request = {
        contentId: 'c1',
        content: 'Post text',
        platforms: ['facebook' as const],
        scheduledAt: '2025-01-01T12:00:00Z',
        mediaUrls: [],
      };
      const post = { id: 'p1', status: 'scheduled' };
      mockFetch.mockResolvedValue(mockResponse(200, post));

      const result = await client.schedulePosts(request);
      expect(result).toEqual(post);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts/schedule',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('getPosts with filters builds query string', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));

      await client.getPosts({ status: 'scheduled', startDate: '2024-01-01' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=scheduled'),
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2024-01-01'),
        expect.anything(),
      );
    });

    it('getPosts without params calls GET /posts', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));

      await client.getPosts();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts',
        expect.anything(),
      );
    });

    it('updatePost calls PUT /posts/{id}', async () => {
      const updates = { content: 'Updated text' };
      const post = { id: 'p1', content: 'Updated text' };
      mockFetch.mockResolvedValue(mockResponse(200, post));

      const result = await client.updatePost('p1', updates);
      expect(result).toEqual(post);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts/p1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        }),
      );
    });

    it('deletePost calls DELETE /posts/{id}', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      await client.deletePost('p1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts/p1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('publishPost calls POST /posts/{id}/publish', async () => {
      const post = { id: 'p1', status: 'published' };
      mockFetch.mockResolvedValue(mockResponse(200, post));

      const result = await client.publishPost('p1');
      expect(result).toEqual(post);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts/p1/publish',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('Keywords endpoints', () => {
    it('getKeywords calls GET /keywords', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));

      await client.getKeywords();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/keywords',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('addKeyword calls POST /keywords', async () => {
      const request = { keyword: 'roof leak', tradeId: 'roofing' };
      const keyword = { id: 'kw1', keyword: 'roof leak' };
      mockFetch.mockResolvedValue(mockResponse(200, keyword));

      const result = await client.addKeyword(request);
      expect(result).toEqual(keyword);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/keywords',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('updateKeyword calls PUT /keywords/{id}', async () => {
      const keyword = { id: 'kw1', keyword: 'updated keyword' };
      mockFetch.mockResolvedValue(mockResponse(200, keyword));

      const result = await client.updateKeyword('kw1', 'updated keyword');
      expect(result).toEqual(keyword);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/keywords/kw1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ keyword: 'updated keyword' }),
        }),
      );
    });

    it('deleteKeyword calls DELETE /keywords/{id}', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      await client.deleteKeyword('kw1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/keywords/kw1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('getDefaultKeywords calls GET /keywords/defaults with tradeId', async () => {
      const defaults = ['roof leak', 'roof repair', 'storm damage'];
      mockFetch.mockResolvedValue(mockResponse(200, defaults));

      const result = await client.getDefaultKeywords('roofing');
      expect(result).toEqual(defaults);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/keywords/defaults?tradeId=roofing',
        expect.anything(),
      );
    });
  });

  describe('Opportunities endpoints', () => {
    it('getOpportunities with cursor-based pagination', async () => {
      const response = { items: [], nextCursor: 'abc123' };
      mockFetch.mockResolvedValue(mockResponse(200, response));

      const result = await client.getOpportunities({
        cursor: 'prev-cursor',
        status: 'new',
      });
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('cursor=prev-cursor'),
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=new'),
        expect.anything(),
      );
    });

    it('getOpportunities without params calls GET /opportunities', async () => {
      const response = { items: [] };
      mockFetch.mockResolvedValue(mockResponse(200, response));

      const result = await client.getOpportunities();
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/opportunities',
        expect.anything(),
      );
    });

    it('createOpportunity calls POST /opportunities', async () => {
      const request = {
        keywordId: 'kw1',
        sourceContent: 'Need a roofer',
        sourcePlatform: 'facebook' as const,
        sourceUrl: 'https://facebook.com/post/123',
        sourceAuthor: 'John D.',
      };
      const opp = { id: 'opp1', ...request };
      mockFetch.mockResolvedValue(mockResponse(200, opp));

      const result = await client.createOpportunity(request);
      expect(result).toEqual(opp);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/opportunities',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('updateOpportunityStatus calls PUT /opportunities/{id}/status', async () => {
      const opp = { id: 'opp1', status: 'followed_up' };
      mockFetch.mockResolvedValue(mockResponse(200, opp));

      const result = await client.updateOpportunityStatus(
        'opp1',
        'followed_up',
      );
      expect(result).toEqual(opp);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/opportunities/opp1/status',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'followed_up' }),
        }),
      );
    });

    it('deleteOpportunity calls DELETE /opportunities/{id}', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      await client.deleteOpportunity('opp1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/opportunities/opp1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('getOpportunityStats calls GET /opportunities/stats', async () => {
      const stats = { total: 10, new: 5, followedUp: 3, converted: 2 };
      mockFetch.mockResolvedValue(mockResponse(200, stats));

      const result = await client.getOpportunityStats();
      expect(result).toEqual(stats);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/opportunities/stats',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('Subscription endpoints', () => {
    it('getSubscription calls GET /subscription', async () => {
      const sub = { tier: 'free', aiGenerationsUsed: 5, aiGenerationsLimit: 10 };
      mockFetch.mockResolvedValue(mockResponse(200, sub));

      const result = await client.getSubscription();
      expect(result).toEqual(sub);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/subscription',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('createCheckout calls POST /subscription/checkout with tier', async () => {
      const response = { checkoutUrl: 'https://stripe.com/checkout/123' };
      mockFetch.mockResolvedValue(mockResponse(200, response));

      const result = await client.createCheckout('growth');
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/subscription/checkout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tier: 'growth' }),
        }),
      );
    });

    it('cancelSubscription calls POST /subscription/cancel', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      await client.cancelSubscription();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/subscription/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('Daily Cues endpoints', () => {
    it('getDailyCues calls GET /cues', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));

      await client.getDailyCues();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/cues',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('completeCue calls PUT /cues/{id}/complete', async () => {
      const cue = { id: 'cue1', completed: true };
      mockFetch.mockResolvedValue(mockResponse(200, cue));

      const result = await client.completeCue('cue1');
      expect(result).toEqual(cue);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/cues/cue1/complete',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  describe('Devices endpoints', () => {
    it('registerDevice calls POST /devices/register', async () => {
      const request = { platform: 'ios' as const, pushToken: 'token-abc' };
      const response = { deviceId: 'dev1' };
      mockFetch.mockResolvedValue(mockResponse(200, response));

      const result = await client.registerDevice(request);
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/devices/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('unregisterDevice calls DELETE /devices/{deviceId}', async () => {
      mockFetch.mockResolvedValue(mockResponse(204));

      await client.unregisterDevice('dev1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/devices/dev1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('getDevices calls GET /devices', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, []));

      await client.getDevices();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/devices',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('updateNotificationPreferences calls PUT /devices/{deviceId}/preferences', async () => {
      const prefs = {
        opportunitiesEnabled: true,
        scheduledPostReminders: false,
        dailyCueReminders: true,
        marketingEnabled: false,
      };
      mockFetch.mockResolvedValue(mockResponse(204));

      const result = await client.updateNotificationPreferences('dev1', prefs);
      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/devices/dev1/preferences',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(prefs),
        }),
      );
    });
  });
});
