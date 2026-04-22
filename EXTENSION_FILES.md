# HawkEye-Cue Extension - Copy These Files

Create a folder called `HawkEye-Extension` on your Desktop, then copy these files into it:

---

## FILE 1: manifest.json

```json
{
  "manifest_version": 3,
  "name": "HawkEye-Cue Lead Tracker",
  "version": "1.0.0",
  "description": "Monitor Facebook for keywords",
  "permissions": ["storage", "notifications"],
  "host_permissions": ["https://*.facebook.com/*"],
  "content_scripts": [{
    "matches": ["https://*.facebook.com/*"],
    "js": ["content.js"],
    "css": ["content.css"]
  }]
}
```

---

## FILE 2: content.js

```javascript
let keywords = ['need a roofer', 'roof repair', 'roof leak'];
let processedPosts = new Set();

function containsKeywords(text) {
  if (!text) return { found: false, matches: [] };
  const lowerText = text.toLowerCase();
  const matches = keywords.filter(k => lowerText.includes(k.toLowerCase()));
  return { found: matches.length > 0, matches };
}

function extractPostInfo(postElement) {
  try {
    const textElements = postElement.querySelectorAll('[dir="auto"]');
    let postText = '';
    textElements.forEach(el => { postText += ' ' + el.innerText; });
    
    let authorName = 'Unknown';
    const authorLinks = postElement.querySelectorAll('a[role="link"]');
    if (authorLinks.length > 0) authorName = authorLinks[0].innerText || 'Unknown';
    
    return { text: postText.trim(), author: authorName.trim() };
  } catch (error) {
    return null;
  }
}

function highlightPost(postElement, matches) {
  if (postElement.classList.contains('hawkeye-highlighted')) return;
  
  postElement.classList.add('hawkeye-highlighted');
  postElement.style.border = '3px solid #1D4ED8';
  postElement.style.borderRadius = '8px';
  
  const badge = document.createElement('div');
  badge.innerHTML = `
    <div style="background: linear-gradient(135deg, #1D4ED8 0%, #22C55E 100%); color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: bold; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
      🦅 HawkEye-Cue Lead Found!
      <div style="font-size: 10px; font-weight: normal; margin-top: 2px;">
        Keywords: ${matches.join(', ')}
      </div>
    </div>
  `;
  postElement.insertBefore(badge, postElement.firstChild);
  
  console.log('🎯 Lead found!', matches);
}

async function scanPosts() {
  const posts = document.querySelectorAll('[role="article"]');
  
  posts.forEach((post, index) => {
    if (!post.getAttribute('data-hawkeye-id')) {
      post.setAttribute('data-hawkeye-id', `post-${Date.now()}-${index}`);
    }
  });
  
  for (const post of posts) {
    const postId = post.getAttribute('data-hawkeye-id');
    if (processedPosts.has(postId)) continue;
    
    const postInfo = extractPostInfo(post);
    if (!postInfo || !postInfo.text) continue;
    
    const { found, matches } = containsKeywords(postInfo.text);
    
    if (found) {
      highlightPost(post, matches);
      processedPosts.add(postId);
    }
  }
}

console.log('🦅 HawkEye-Cue monitoring started!');
scanPosts();

const observer = new MutationObserver(() => scanPosts());
observer.observe(document.body, { childList: true, subtree: true });

setInterval(scanPosts, 5000);
```

---

## FILE 3: content.css

```css
.hawkeye-highlighted {
  animation: hawkeyePulse 2s ease-in-out infinite;
}

@keyframes hawkeyePulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(29, 78, 216, 0.4);
  }
  50% {
    box-shadow: 0 0 20px 5px rgba(29, 78, 216, 0.2);
  }
}
```

---

## INSTALL IN CHROME:

1. Save all 3 files in `HawkEye-Extension` folder
2. Open Chrome → `chrome://extensions/`
3. Turn ON "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select your `HawkEye-Extension` folder
6. Done!

---

## TEST IT:

1. Go to facebook.com
2. Browse any group
3. Posts with keywords will have BLUE BORDER
4. Look for "🦅 HawkEye-Cue Lead Found!" badge

---

## CHANGE KEYWORDS:

Edit `content.js` line 1:
```javascript
let keywords = ['your', 'keywords', 'here'];
```

Save and reload extension in Chrome!
