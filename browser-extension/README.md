# 🦅 HawkEye-Cue Browser Extension

Monitor Facebook groups for keywords related to your trade and capture leads automatically.

## ✨ Features

- **Real-time Monitoring**: Automatically scans Facebook group posts as you browse
- **Keyword Highlighting**: Posts matching your keywords are highlighted with a blue border
- **Lead Capture**: Matching posts are automatically saved as opportunities
- **Desktop Notifications**: Get notified when leads are found
- **Syncs with App**: Keywords managed in the HawkEye-Cue web app

---

## 📦 Installation

### Step 1: Prepare Icons (Required)

The extension needs icons. Create or download 3 PNG files:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Place them in the `icons/` folder.

**Quick Option**: Use a simple colored square with "HE" text or the 🦅 emoji as a temporary icon.

### Step 2: Load Extension in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right)
4. Click **"Load unpacked"**
5. Select the `browser-extension` folder
6. ✅ Extension is now installed!

---

## 🚀 Usage

### 1. Set Keywords in HawkEye-Cue App

1. Open your HawkEye-Cue web app
2. Go to **More** → **Keyword Tracking**
3. Add keywords for your trade (e.g., "need a roofer", "roof leak")
4. Click **"Sync to Extension"**
5. Keywords are copied to clipboard

### 2. Sync Keywords to Extension

**Option A: Automatic (Recommended)**
- Keywords are synced via localStorage if app and extension share the same domain

**Option B: Manual**
1. Click the HawkEye-Cue extension icon
2. Click "Import Keywords"
3. Paste the keywords JSON
4. Done!

### 3. Browse Facebook

1. Go to facebook.com
2. Join your target groups (e.g., "Brighton Moms Group")
3. Browse posts normally
4. Extension automatically:
   - Scans posts for keywords
   - Highlights matches with blue border
   - Saves leads to storage
   - Shows badge count

### 4. View Leads

**In Extension Popup:**
- Click extension icon
- See lead count and keywords
- Click "Scan Page Now" to manually scan

**In Main App:**
- Go to **Opportunities**
- See all captured leads
- Click links to view posts on Facebook

---

## 🎯 How It Works

```
1. You set keywords in HawkEye-Cue app
   ↓
2. Keywords sync to Chrome Extension
   ↓
3. Extension monitors Facebook as you browse
   ↓
4. When post contains keyword:
   - Post gets blue border + badge
   - Lead saved to storage
   - Notification sent
   - Badge updated
   ↓
5. Leads appear in Opportunities section
```

---

## 🔧 Configuration

### Keywords Storage

Keywords are stored in Chrome's sync storage:
```javascript
chrome.storage.sync.get(['keywords', 'monitoringActive'])
```

### Opportunities Storage

Leads are stored in local storage:
```javascript
chrome.storage.local.get(['opportunities'])
```

### Turn Monitoring On/Off

In extension popup:
- Toggle monitoring on/off
- Pause temporarily without losing keywords

---

## 🎨 Customization

### Change Highlight Color

Edit `content.css`:
```css
.hawkeye-highlighted {
  border: 3px solid #YOUR_COLOR !important;
}
```

### Modify Badge Text

Edit `content.js`:
```javascript
badge.innerHTML = `YOUR_CUSTOM_HTML`;
```

### Adjust Scan Frequency

Edit `content.js` (line ~200):
```javascript
setInterval(scanPosts, 5000); // Change 5000 to desired milliseconds
```

---

## 🐛 Troubleshooting

### Extension Not Finding Posts

**Problem**: Posts aren't being highlighted

**Solutions**:
1. Check keywords are set: Click extension icon → Check keyword count
2. Refresh Facebook page
3. Click "Scan Page Now" in extension popup
4. Check browser console (F12) for errors

### No Notifications

**Problem**: Not getting notifications for leads

**Solutions**:
1. Allow notifications: `chrome://settings/content/notifications`
2. Check extension has notification permission
3. Reload extension

### Highlighting Wrong Posts

**Problem**: Non-relevant posts are highlighted

**Solutions**:
1. Refine keywords - be more specific
2. Use exact phrases in quotes
3. Remove overly broad keywords

### Facebook Structure Changed

**Problem**: Extension stopped working after Facebook update

**Solutions**:
1. Facebook often changes HTML structure
2. Update selectors in `content.js`:
   ```javascript
   const postSelectors = [
     '[role="article"]',
     // Add new selectors here
   ];
   ```

---

## 📊 Performance

- **Lightweight**: ~50KB total
- **Efficient**: Only scans visible posts
- **Battery Friendly**: Minimal CPU usage
- **Privacy First**: All data stored locally

---

## 🔐 Privacy & Security

### What Data is Collected?

- **Keywords**: Your search terms (stored locally)
- **Matched Posts**: Post content, author, URL (stored locally)
- **NO personal data**, passwords, or private messages

### Where is Data Stored?

- **Chrome Sync Storage**: Keywords only
- **Chrome Local Storage**: Opportunities/leads
- **No external servers**: Everything stays on your device

### Permissions Explained

- **storage**: Save keywords and leads
- **notifications**: Alert you to new leads
- **activeTab**: Access current Facebook tab
- **facebook.com**: Only runs on Facebook

---

## 🆘 Support

**Extension Issues:**
- Check browser console (F12) for errors
- Reload extension: `chrome://extensions/`
- Report bugs with screenshots

**Keyword Issues:**
- Test keywords manually in Facebook search
- Try variations and synonyms
- Use trade-specific terminology

**Integration Issues:**
- Ensure app and extension are both updated
- Clear Chrome storage and re-sync
- Check localStorage in DevTools

---

## 🚀 Advanced Features

### Export Leads

```javascript
// In browser console
chrome.storage.local.get(['opportunities'], (result) => {
  console.log(JSON.stringify(result.opportunities, null, 2));
});
```

### Bulk Import Keywords

```javascript
// In browser console
chrome.storage.sync.set({
  keywords: ['keyword1', 'keyword2', 'keyword3']
});
```

### Monitor Multiple Groups

Extension works across all Facebook pages:
- Group feeds
- Personal timeline
- Marketplace
- Events

---

## 📈 Roadmap

- [ ] Instagram monitoring
- [ ] LinkedIn support
- [ ] AI-powered lead scoring
- [ ] Automated responses
- [ ] CRM integration
- [ ] Team collaboration

---

## 📝 License

Proprietary - HawkEye-Cue Extension

---

## 🎉 You're Ready!

1. ✅ Extension installed
2. ✅ Keywords set
3. ✅ Browse Facebook
4. ✅ Capture leads automatically

**Happy hunting! 🦅**
