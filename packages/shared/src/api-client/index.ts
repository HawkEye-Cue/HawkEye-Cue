import type {
  Trade,
  User,
  GeneratedContent,
  ScheduledPost,
  PostStatus,
  Keyword,
  Opportunity,
  OpportunityStatus,
  OpportunityStats,
  DailyCue,
  Subscription,
  DeviceRegistration,
  SocialAccount,
  NetworkPost,
  NetworkReply,
  NetworkContact,
} from '../types/index.js';

import type {
  ContentGenerationRequest,
  CreateKeywordRequest,
  OpportunitySubmission,
  SchedulePostRequest,
  NotificationPreferencesInput,
} from '../validators/index.js';

// --- API Error ---

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// --- Device Registration Input (subset for registration request) ---

export interface DeviceRegistrationInput {
  platform: 'ios' | 'android';
  pushToken: string;
}

// --- API Client Config ---

export interface ApiClientConfig {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

// --- API Client ---

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string | null>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getToken = config.getToken;
  }

  public async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${path}`;

    const init: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      let code = 'UNKNOWN_ERROR';
      let message = `Request failed with status ${response.status}`;

      try {
        const errorBody = (await response.json()) as { error?: { code?: string; message?: string } };
        if (errorBody?.error) {
          code = errorBody.error.code || code;
          message = errorBody.error.message || message;
        }
      } catch {
        // If we can't parse the error body, use defaults
      }

      throw new ApiError(response.status, code, message);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // --- Trade ---

  async getTradeList(): Promise<Trade[]> {
    return this.request<Trade[]>('GET', '/trade/list');
  }

  async selectTrade(tradeId: string): Promise<User> {
    return this.request<User>('PUT', '/trade/select', { tradeId });
  }

  // --- Content ---

  async generateContent(
    req: ContentGenerationRequest,
  ): Promise<GeneratedContent> {
    return this.request<GeneratedContent>('POST', '/content/generate', req);
  }

  async getContentHistory(): Promise<GeneratedContent[]> {
    return this.request<GeneratedContent[]>('GET', '/content/history');
  }

  async getUploadUrl(
    filename: string,
    contentType: string,
  ): Promise<{ url: string; key: string }> {
    return this.request<{ url: string; key: string }>(
      'POST',
      '/content/upload-url',
      { filename, contentType },
    );
  }

  async deleteContent(id: string): Promise<void> {
    return this.request<void>('DELETE', `/content/${id}`);
  }

  // --- Posts ---

  async schedulePosts(req: SchedulePostRequest): Promise<ScheduledPost> {
    return this.request<ScheduledPost>('POST', '/posts/schedule', req);
  }

  async getPosts(params?: {
    status?: PostStatus;
    startDate?: string;
    endDate?: string;
  }): Promise<ScheduledPost[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);

    const query = searchParams.toString();
    const path = query ? `/posts?${query}` : '/posts';
    return this.request<ScheduledPost[]>('GET', path);
  }

  async updatePost(
    id: string,
    updates: Partial<SchedulePostRequest>,
  ): Promise<ScheduledPost> {
    return this.request<ScheduledPost>('PUT', `/posts/${id}`, updates);
  }

  async deletePost(id: string): Promise<void> {
    return this.request<void>('DELETE', `/posts/${id}`);
  }

  async publishPost(id: string): Promise<ScheduledPost> {
    return this.request<ScheduledPost>('POST', `/posts/${id}/publish`);
  }

  // --- Keywords ---

  async getKeywords(): Promise<Keyword[]> {
    return this.request<Keyword[]>('GET', '/keywords');
  }

  async addKeyword(req: CreateKeywordRequest): Promise<Keyword> {
    return this.request<Keyword>('POST', '/keywords', req);
  }

  async updateKeyword(id: string, keyword: string): Promise<Keyword> {
    return this.request<Keyword>('PUT', `/keywords/${id}`, { keyword });
  }

  async deleteKeyword(id: string): Promise<void> {
    return this.request<void>('DELETE', `/keywords/${id}`);
  }

  async getDefaultKeywords(tradeId: string): Promise<string[]> {
    return this.request<string[]>(
      'GET',
      `/keywords/defaults?tradeId=${encodeURIComponent(tradeId)}`,
    );
  }

  // --- Opportunities ---

  async getOpportunities(params?: {
    status?: OpportunityStatus;
    cursor?: string;
  }): Promise<{ items: Opportunity[]; nextCursor?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.cursor) searchParams.set('cursor', params.cursor);

    const query = searchParams.toString();
    const path = query ? `/opportunities?${query}` : '/opportunities';
    return this.request<{ items: Opportunity[]; nextCursor?: string }>(
      'GET',
      path,
    );
  }

  async createOpportunity(req: OpportunitySubmission): Promise<Opportunity> {
    return this.request<Opportunity>('POST', '/opportunities', req);
  }

  async updateOpportunityStatus(
    id: string,
    status: OpportunityStatus,
  ): Promise<Opportunity> {
    return this.request<Opportunity>('PUT', `/opportunities/${id}/status`, {
      status,
    });
  }

  async deleteOpportunity(id: string): Promise<void> {
    return this.request<void>('DELETE', `/opportunities/${id}`);
  }

  async getOpportunityStats(): Promise<OpportunityStats> {
    return this.request<OpportunityStats>('GET', '/opportunities/stats');
  }

  // --- Subscription ---

  async getSubscription(): Promise<Subscription> {
    return this.request<Subscription>('GET', '/subscription');
  }

  async createCheckout(
    tier: 'base' | 'growth' | 'soar' | 'team',
    couponCode?: string,
  ): Promise<{ checkoutUrl: string }> {
    const body: { tier: string; couponCode?: string } = { tier };
    if (couponCode) body.couponCode = couponCode;
    return this.request<{ checkoutUrl: string }>(
      'POST',
      '/subscription/checkout',
      body,
    );
  }

  async cancelSubscription(): Promise<void> {
    return this.request<void>('POST', '/subscription/cancel');
  }

  // --- Account ---

  async deleteAccount(): Promise<void> {
    return this.request<void>('DELETE', '/profile/delete');
  }

  // --- Daily Cues ---

  async getDailyCues(): Promise<DailyCue[]> {
    return this.request<DailyCue[]>('GET', '/cues');
  }

  async completeCue(id: string): Promise<DailyCue> {
    return this.request<DailyCue>('PUT', `/cues/${id}/complete`);
  }

  // --- Devices ---

  async registerDevice(
    req: DeviceRegistrationInput,
  ): Promise<DeviceRegistration> {
    return this.request<DeviceRegistration>('POST', '/devices/register', req);
  }

  async unregisterDevice(deviceId: string): Promise<void> {
    return this.request<void>('DELETE', `/devices/${deviceId}`);
  }

  async getDevices(): Promise<DeviceRegistration[]> {
    return this.request<DeviceRegistration[]>('GET', '/devices');
  }

  async updateNotificationPreferences(
    deviceId: string,
    prefs: NotificationPreferencesInput,
  ): Promise<void> {
    return this.request<void>(
      'PUT',
      `/devices/${deviceId}/preferences`,
      prefs,
    );
  }

  // --- Social Accounts ---

  async getSocialAccounts(): Promise<{
    accounts: SocialAccount[];
    teamId: string | null;
  }> {
    return this.request<{ accounts: SocialAccount[]; teamId: string | null }>(
      'GET',
      '/social/accounts',
    );
  }

  async getConnectLink(
    platforms?: string[],
  ): Promise<{ connectUrl: string }> {
    return this.request<{ connectUrl: string }>('POST', '/social/connect', {
      platforms,
    });
  }

  async disconnectSocialAccount(accountId: string): Promise<void> {
    return this.request<void>('DELETE', `/social/accounts/${accountId}`);
  }

  // --- Network ---

  async getNetworkPosts(params?: { trade?: string }): Promise<{ posts: NetworkPost[] }> {
    const searchParams = new URLSearchParams();
    if (params?.trade && params.trade !== 'all') searchParams.set('trade', params.trade);
    const query = searchParams.toString();
    const path = query ? `/network/posts?${query}` : '/network/posts';
    return this.request<{ posts: NetworkPost[] }>('GET', path);
  }

  async createNetworkPost(req: { content: string; type: string; tradeFilter: string }): Promise<NetworkPost> {
    return this.request<NetworkPost>('POST', '/network/posts', req);
  }

  async replyToNetworkPost(postId: string, content: string): Promise<NetworkReply> {
    return this.request<NetworkReply>('POST', `/network/posts/${postId}/reply`, { content });
  }

  async deleteNetworkPost(id: string): Promise<void> {
    return this.request<void>('DELETE', `/network/posts/${id}`);
  }

  async getNetworkContacts(): Promise<{ contacts: NetworkContact[] }> {
    return this.request<{ contacts: NetworkContact[] }>('GET', '/network/contacts');
  }

  async addNetworkContact(req: { name: string; trade: string; phone?: string; email?: string; notes?: string }): Promise<NetworkContact> {
    return this.request<NetworkContact>('POST', '/network/contacts', req);
  }

  async deleteNetworkContact(id: string): Promise<void> {
    return this.request<void>('DELETE', `/network/contacts/${id}`);
  }

  async getNetworkRegion(): Promise<{ regions: string[]; region: string | null }> {
    return this.request<{ regions: string[]; region: string | null }>('GET', '/network/region');
  }

  async setNetworkRegion(regions: string[]): Promise<{ regions: string[] }> {
    return this.request<{ regions: string[] }>('PUT', '/network/region', { regions });
  }
}
