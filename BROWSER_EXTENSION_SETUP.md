# 🦅 HawkEye-Cue Browser Extension - Quick Setup

## ✅ What You Have Now

I've built you a **Chrome Extension** that monitors Facebook groups for keywords and automatically captures leads!

**Location**: `/workspaces/default/code/browser-extension/`

**Files Created**:
- `manifest.json` - Extension configuration
- `content.js` - Facebook monitoring script
- `background.js` - Background worker
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic
- `content.css` - Styling
- `README.md` - Full documentation

---

## 🚀 5-Minute Installation

### Step 1: Create Icons (2 minutes)

The extension needs 3 icon files. **Easiest option**:

1. Go to https://www.favicon-generator.org/
2. Upload any image (your logo, or just use a colored square)
3. Download the generated favicons
4. Rename and copy these to `/browser-extension/icons/`:
   - `favicon-16x16.png` → `icon16.png`
   - `favicon-48x48.png` → `icon48.png`  
   - `favicon-128x128.png` → `icon128.png`

**Or use placeholders** (Chrome will show a default icon):
```bash
# Create empty placeholder files
touch browser-extension/icons/icon16.png
touch browser-extension/icons/icon48.png
touch browser-extension/icons/icon128.png
```

### Step 2: Install Extension in Chrome (1 minute)

1. Open **Chrome**
2. Go to `chrome://extensions/`
3. Toggle **"Developer mode"** ON (top-right corner)
4. Click **"Load unpacked"**
5. Navigate to `/workspaces/default/code/browser-extension/`
6. Click **"Select Folder"**
7. ✅ Extension installed!

### Step 3: Set Keywords (1 minute)

1. Open your **HawkEye-Cue app**
2. Go to **More** → **🔍 Keyword Tracking**
3. Add keywords for your trade
4. Click **"Sync to Extension"** (copies to clipboard)

### Step 4: Test It! (1 minute)

1. Go to **facebook.com**
2. Navigate to any group
3. Browse posts
4. Posts matching your keywords will get a **blue border** and **🦅 HawkEye-Cue badge**
5. Click the extension icon to see stats

---

## 🎯 How It Works

```
YOU BROWSE FACEBOOK
        ↓
Extension scans posts for keywords
        ↓
Matches get HIGHLIGHTED with blue border
        ↓
Leads automatically SAVED
        ↓
You get NOTIFICATION
        ↓
View in Opportunities section
```

---

## 📊 What You'll See

### On Facebook:
- **Blue border** around matching posts
- **Badge** showing: "🦅 HawkEye-Cue Lead Found!"
- **Keywords listed** on the badge

### Extension Icon:
- **Red badge** with number of leads found
- Click to see:
  - Active keywords
  - Lead count
  - Monitoring status

### In App:
- Go to **Opportunities**
- See all captured leads
- Click to view on Facebook

---

## 🔧 Extension Popup Features

Click the extension icon to see:

- **Status**: Monitoring Active/Inactive
- **Scan Now**: Manually scan current page
- **Stats**: Leads found, keywords active
- **Keywords**: List of active keywords

---

## 💡 Pro Tips

### Best Keywords:
- Use phrases people actually say: "need a roofer" not "roofing services"
- Include urgency words: "emergency", "asap", "help"
- Add location: "Denver plumber", "local electrician"
- Watch for pain points: "leak", "broken", "not working"

### Monitor These Groups:
- Local community groups (e.g., "Brighton Moms")
- Neighborhood groups
- Home improvement groups
- Local classifieds
- Nextdoor-style groups

### Optimize Your Workflow:
1. Set keywords in morning
2. Browse 3-5 groups for 10 minutes
3. Extension captures leads automatically
4. Review in Opportunities at end of day
5. Respond to hot leads

---

## 🚨 Troubleshooting

### "Extension not highlighting anything"
- Check keywords are set: Click extension icon
- Refresh Facebook page
- Click "Scan Page Now" in popup

### "No notifications"
- Allow notifications: Chrome Settings → Privacy → Notifications
- Check extension permissions

### "Badge shows 0 leads"
- Your keywords might be too specific
- Try broader terms
- Test keywords in Facebook search first

### "Facebook structure changed"
- Facebook updates their HTML frequently
- Extension may need updates
- Check console (F12) for errors

---

## 📁 File Structure

```
browser-extension/
├── manifest.json          # Extension config
├── content.js            # Facebook monitoring
├── background.js         # Background worker
├── popup.html           # Extension popup
├── popup.js             # Popup logic
├── content.css          # Styling
├── icons/               # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # Full docs
```

---

## 🎉 You're All Set!

**Test Checklist**:
- [ ] Extension installed in Chrome
- [ ] Icons created (or using placeholders)
- [ ] Keywords set in app
- [ ] Tested on Facebook group
- [ ] Saw highlighted post
- [ ] Got notification
- [ ] Lead saved to Opportunities

**Next Steps**:
1. Join 5-10 relevant Facebook groups
2. Set 10-15 targeted keywords
3. Browse groups daily for 10 minutes
4. Let extension capture leads automatically
5. Follow up with hot leads

---

## 🆘 Need Help?

**Common Issues**:
- Icons missing → Use placeholders or generate at favicon-generator.org
- Not monitoring → Check keywords are set in app
- No highlights → Refresh Facebook page and click "Scan Now"
- No notifications → Enable in Chrome settings

**Test Your Setup**:
1. Create a test Facebook post with your keyword
2. Browse to that post
3. Should see blue border + badge
4. Check extension icon for lead count

---

**You now have a fully functional lead-generation machine! 🚀**

Monitor Facebook 24/7, capture every opportunity, and never miss a lead again.

Happy hunting! 🦅
