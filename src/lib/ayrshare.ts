// Ayrshare API Integration
// Handles social media posting to Facebook, Instagram, LinkedIn, Twitter, TikTok

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY || '6EAC4DA5-158C4A8E-902FCB0B-AC8A01A6';
const AYRSHARE_API_URL = 'https://app.ayrshare.com/api';

// Ayrshare expects: Bearer API_KEY (no angle brackets)
const getAuthHeader = () => `Bearer ${AYRSHARE_API_KEY}`;

export interface AyrsharePost {
  post: string;
  platforms: string[];
  mediaUrls?: string[];
  scheduleDate?: string; // ISO 8601 format: "2026-04-24T09:00:00Z"
  profileKey?: string; // For multi-user accounts
  facebookOptions?: {
    published?: boolean; // true = publish immediately, false = draft
  };
  instagramOptions?: {
    posted?: boolean; // true = post to feed, false = create only
  };
}

export interface AyrshareResponse {
  status: string;
  id?: string;
  postIds?: Record<string, string>;
  errors?: any[];
  refId?: string;
}

// Post to social media (immediately or scheduled)
export async function createPost(postData: AyrsharePost): Promise<AyrshareResponse> {
  try {
    console.log('Creating post with data:', postData);
    console.log('Using API key:', AYRSHARE_API_KEY);

    const response = await fetch(`${AYRSHARE_API_URL}/post`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });

    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);

    // Try to get the error details from the response
    const responseText = await response.text();
    console.log('Response body:', responseText);

    if (!response.ok) {
      let errorMessage = `Ayrshare API error (${response.status}): ${response.statusText}`;

      try {
        const errorData = JSON.parse(responseText);
        console.log('Error data:', errorData);
        if (errorData.message) {
          errorMessage += `\n${errorData.message}`;
        }
        if (errorData.errors) {
          errorMessage += `\nErrors: ${JSON.stringify(errorData.errors)}`;
        }
      } catch (e) {
        errorMessage += `\nResponse: ${responseText}`;
      }

      throw new Error(errorMessage);
    }

    const data = JSON.parse(responseText);
    console.log('Success! Post created:', data);
    return data;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
}

// Get post history
export async function getHistory(platform?: string) {
  try {
    const url = platform
      ? `${AYRSHARE_API_URL}/history?platform=${platform}`
      : `${AYRSHARE_API_URL}/history`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Ayrshare API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting history:', error);
    throw error;
  }
}

// Delete a scheduled post
export async function deletePost(postId: string) {
  try {
    const response = await fetch(`${AYRSHARE_API_URL}/delete/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Ayrshare API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
}

// Get user's social media profiles/connections
export async function getUserProfiles() {
  try {
    console.log('Getting user profiles...');
    console.log('API URL:', `${AYRSHARE_API_URL}/user`);
    console.log('API Key:', AYRSHARE_API_KEY);

    const response = await fetch(`${AYRSHARE_API_URL}/user`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
      },
    });

    console.log('User profiles response status:', response.status);

    const responseText = await response.text();
    console.log('User profiles response:', responseText);

    if (!response.ok) {
      let errorMessage = `Ayrshare API error (${response.status}): ${response.statusText}`;

      try {
        const errorData = JSON.parse(responseText);
        if (errorData.message) {
          errorMessage += `\n${errorData.message}`;
        }
      } catch (e) {
        errorMessage += `\nResponse: ${responseText}`;
      }

      throw new Error(errorMessage);
    }

    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error getting user profiles:', error);
    throw error;
  }
}

// Generate JWT for user to connect accounts
export async function generateJWT(domain?: string) {
  try {
    const body: any = { domain: domain || window.location.origin };

    const response = await fetch(`${AYRSHARE_API_URL}/profiles/generateJWT`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Ayrshare API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating JWT:', error);
    throw error;
  }
}

// Upload media file
export async function uploadMedia(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${AYRSHARE_API_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Ayrshare API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url; // Returns the URL of the uploaded file
  } catch (error) {
    console.error('Error uploading media:', error);
    throw error;
  }
}

// Analytics for a specific post
export async function getPostAnalytics(postId: string) {
  try {
    const response = await fetch(`${AYRSHARE_API_URL}/analytics/post/${postId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Ayrshare API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting analytics:', error);
    throw error;
  }
}

// Check if user has connected social accounts
export async function getConnectedAccounts() {
  try {
    const userProfiles = await getUserProfiles();

    const connected: Record<string, boolean> = {
      facebook: false,
      instagram: false,
      linkedin: false,
      twitter: false,
      tiktok: false,
    };

    if (userProfiles.activeSocialAccounts) {
      userProfiles.activeSocialAccounts.forEach((account: string) => {
        const platform = account.toLowerCase();
        if (platform in connected) {
          connected[platform] = true;
        }
      });
    }

    return connected;
  } catch (error) {
    console.error('Error checking connected accounts:', error);
    return {
      facebook: false,
      instagram: false,
      linkedin: false,
      twitter: false,
      tiktok: false,
    };
  }
}

// Test API connection - for debugging
export async function testConnection() {
  try {
    console.log('Testing Ayrshare connection...');
    console.log('API Key being used:', AYRSHARE_API_KEY);
    console.log('API URL:', AYRSHARE_API_URL);

    const response = await fetch(`${AYRSHARE_API_URL}/user`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
      },
    });

    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);

    const data = await response.json();
    console.log('Response data:', data);

    return {
      success: response.ok,
      status: response.status,
      data: data
    };
  } catch (error) {
    console.error('Connection test failed:', error);
    return {
      success: false,
      error: error
    };
  }
}
