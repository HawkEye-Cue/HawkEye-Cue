# Ayrshare Integration Setup Guide

## 🎯 What is Ayrshare?

Ayrshare is a social media API that handles posting to Facebook, Instagram, LinkedIn, Twitter/X, and TikTok. It manages all the OAuth complexity for you.

---

## 📋 Step-by-Step Setup

### 1. Create Ayrshare Account

1. Go to **https://www.ayrshare.com**
2. Click "Sign Up" or "Get Started"
3. Choose a plan:
   - **Starter**: $49/month (5 profiles, 100 posts/month)
   - **Growth**: $99/month (15 profiles, 500 posts/month)
   - **Business**: $199/month (50 profiles, 2000 posts/month)

**Recommendation:** Start with Starter plan ($49/month) for testing

### 2. Get Your API Key

1. Log in to your Ayrshare dashboard
2. Go to **Settings** → **API Keys**
3. Click "Create New API Key"
4. Copy your API key (starts with `ak_`)
5. **IMPORTANT:** Save this key securely - you'll only see it once!

### 3. Add API Key to Your App

**Option A: Local Development (Browser)**

For testing in Figma Make or local dev:

```javascript
// In /workspaces/default/code/src/lib/ayrshare.ts
// Replace line 4:
const AYRSHARE_API_KEY = 'ak_YOUR_ACTUAL_API_KEY_HERE';
```

**Option B: Production Deployment (Environment Variables)**

When deploying to Vercel/Netlify:

```bash
# Add to your .env.local file:
AYRSHARE_API_KEY=ak_YOUR_ACTUAL_API_KEY_HERE
```

Then deploy:
```bash
vercel env add AYRSHARE_API_KEY
# Paste your API key when prompted
```

### 4. Connect Your Social Media Accounts

1. In your Ayrshare dashboard, click **"Add Social Account"**
2. Choose a platform (Facebook, Instagram, LinkedIn, etc.)
3. Click "Connect"
4. Log in to that social media platform
5. Grant permissions
6. Account is now connected!

**Repeat for each platform you want to use.**

---

## 🔧 Testing the Integration

### Test 1: Check Connection Status

In your HawkEye-Cue app:

1. Go to **More** → **Platform Connections**
2. Click **"Refresh Status"** on any platform
3. Connected platforms should show ✓ green checkmark

### Test 2: Create a Test Post

1. Go to **Create Post**
2. Write: "Test post from HawkEye-Cue! 🦅"
3. Select platforms: Facebook, Instagram, LinkedIn
4. Click **"🤖 Adapt for Platforms"**
5. Click **"Schedule"**
6. Set date/time for 5 minutes from now
7. Click **"Confirm Schedule"**

**What happens:**
- Post is sent to Ayrshare
- Ayrshare schedules it
- At the scheduled time, it posts to all selected platforms
- Check your Calendar to see status updates

### Test 3: Post Immediately

1. Create a post
2. Select platforms
3. Don't set a schedule date
4. Click "Post Now"
5. Post goes live immediately on all platforms!

---

## 📊 Pricing Breakdown

### Ayrshare Costs

| Plan | Price/Month | Profiles | Posts/Month | Best For |
|------|-------------|----------|-------------|----------|
| Starter | $49 | 5 | 100 | 1-10 users |
| Growth | $99 | 15 | 500 | 10-50 users |
| Business | $199 | 50 | 2000 | 50+ users |
| Enterprise | Custom | Unlimited | Unlimited | Agencies |

**What counts as a "post"?**
- Posting to 3 platforms = 3 posts used
- Scheduling = same as posting immediately
- Failed posts still count

### Cost Per User Math

**Scenario 1: 10 Paying Customers @ $29/month each**
- Revenue: $290/month
- Ayrshare cost: $49/month (Starter)
- Your profit: $241/month
- **Margin: 83%** ✅

**Scenario 2: 50 Paying Customers @ $29/month each**
- Revenue: $1,450/month
- Ayrshare cost: $99/month (Growth)
- Your profit: $1,351/month
- **Margin: 93%** ✅

**Scenario 3: 200 Paying Customers @ $29/month each**
- Revenue: $5,800/month
- Ayrshare cost: $199/month (Business)
- Your profit: $5,601/month
- **Margin: 97%** ✅

---

## 🔄 How Posts Flow Through the System

### User Creates a Post:

```
1. User writes post in HawkEye-Cue
   ↓
2. Clicks "Adapt for Platforms"
   ↓
3. AI generates versions for each platform
   ↓
4. User clicks "Schedule"
   ↓
5. HawkEye-Cue sends to Ayrshare API:
   {
     post: "Your content here...",
     platforms: ["facebook", "instagram", "linkedin"],
     scheduleDate: "2026-04-24T09:00:00Z",
     mediaUrls: ["https://..."]
   }
   ↓
6. Ayrshare receives request
   ↓
7. Ayrshare stores scheduled post
   ↓
8. At scheduled time:
   - Ayrshare posts to Facebook
   - Ayrshare posts to Instagram
   - Ayrshare posts to LinkedIn
   ↓
9. Ayrshare sends status webhook to your app
   ↓
10. HawkEye-Cue updates post status to "Posted"
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "Invalid API Key"

**Solution:**
- Check you copied the entire key (starts with `ak_`)
- Make sure no extra spaces before/after
- Verify key in Ayrshare dashboard is still active
- Try generating a new key

### Issue 2: "No Social Accounts Connected"

**Solution:**
- Go to Ayrshare dashboard
- Click "Add Social Account"
- Connect at least one platform
- Refresh status in HawkEye-Cue

### Issue 3: "Post Failed to Publish"

**Solution:**
- Check platform is still connected in Ayrshare
- Verify you haven't hit your post limit
- Check if post content violates platform policies
- Try posting to one platform at a time to isolate issue

### Issue 4: Instagram Posts Failing

**Common causes:**
- Instagram account must be Business or Creator account (not personal)
- Image must be publicly accessible URL
- Image must meet Instagram size requirements
- Account must be linked to Facebook Page

**Solution:**
- Convert Instagram to Business account
- Link to Facebook Page in Instagram settings
- Use proper image formats (JPG, PNG)

---

## 📱 Platform-Specific Requirements

### Facebook
- ✅ Works with personal profiles
- ✅ Works with pages you manage
- ✅ Can post to groups you're admin of
- ⚠️ Groups require posting permissions

### Instagram
- ⚠️ **Must be Business or Creator account**
- ⚠️ Must be linked to Facebook Page
- ✅ Photos and videos supported
- ⚠️ Stories require additional setup

### LinkedIn
- ✅ Works with personal profiles
- ✅ Works with company pages
- ✅ Easy setup
- ⚠️ Rate limits: 100 posts/day

### Twitter/X
- ✅ Included in Ayrshare (no extra $100/month!)
- ✅ Text, images, videos supported
- ⚠️ Tweet length limits still apply

### TikTok
- ⚠️ Requires TikTok Business account
- ⚠️ Video only (no text posts)
- ✅ Supported by Ayrshare

---

## 🔐 Security Best Practices

### Protect Your API Key

**DO:**
- ✅ Store in environment variables
- ✅ Never commit to GitHub
- ✅ Rotate keys every 90 days
- ✅ Use different keys for dev/prod

**DON'T:**
- ❌ Hardcode in source code
- ❌ Share in public repos
- ❌ Email or message keys
- ❌ Store in frontend code (visible to users)

### Revoke Access

If your API key is compromised:
1. Go to Ayrshare dashboard
2. Click "Revoke" on the compromised key
3. Generate a new key
4. Update your app with new key
5. Redeploy

---

## 📞 Support

**Ayrshare Support:**
- Email: support@ayrshare.com
- Docs: https://docs.ayrshare.com
- Dashboard: https://app.ayrshare.com

**HawkEye-Cue Integration Issues:**
- Check AYRSHARE_SETUP.md (this file)
- Verify API key is correct
- Test in Ayrshare dashboard first
- Check browser console for errors

---

## ✅ Checklist

Before going live, verify:

- [ ] Ayrshare account created
- [ ] API key obtained and added to app
- [ ] At least one social platform connected
- [ ] Test post sent successfully
- [ ] Scheduled post works correctly
- [ ] Status updates showing in Calendar
- [ ] Environment variables set for production
- [ ] API key NOT in source code
- [ ] All platforms you need are connected

---

## 🎯 Next Steps

1. **Set up Ayrshare account** (15 minutes)
2. **Add API key to your app** (5 minutes)
3. **Connect your social accounts** (10 minutes)
4. **Test a post** (5 minutes)
5. **Deploy to production** with environment variables

**Total setup time: ~35 minutes** ⏱️

Once setup is complete, your HawkEye-Cue app will have **full social media posting capabilities** across all major platforms! 🚀
