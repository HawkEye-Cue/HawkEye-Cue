// Popup script for HawkEye-Cue extension

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  
  document.getElementById('scanNow').addEventListener('click', scanNow);
  document.getElementById('openApp').addEventListener('click', openApp);
  document.getElementById('syncKeywords').addEventListener('click', () => {
    document.getElementById('syncModal').classList.add('active');
  });
  document.getElementById('cancelBtn').addEventListener('click', () => {
    document.getElementById('syncModal').classList.remove('active');
  });
  document.getElementById('importBtn').addEventListener('click', importKeywords);
});

async function loadStatus() {
  try {
    const result = await chrome.storage.sync.get(['keywords', 'monitoringActive', 'tradeId']);
    const keywords = result.keywords || [];
    const active = result.monitoringActive !== false;
    const tradeId = result.tradeId || 'default';

    // Update status
    const statusDiv = document.getElementById('status');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (active && keywords.length > 0) {
      statusDiv.className = 'status active';
      statusDot.className = 'dot';
      statusText.textContent = `✓ Monitoring Active (${tradeId})`;
    } else {
      statusDiv.className = 'status inactive';
      statusDot.className = 'dot inactive';
      statusText.textContent = keywords.length === 0 ? 'No keywords set' : 'Monitoring Paused';
    }

    // Update keyword count
    document.getElementById('keywordCount').textContent = keywords.length;

    // Display keywords
    const keywordList = document.getElementById('keywordList');
    keywordList.innerHTML = '';

    if (keywords.length === 0) {
      keywordList.innerHTML = '<div style="color: #64748B; font-size: 12px; font-style: italic;">No keywords set yet</div>';
    } else {
      keywords.forEach(keyword => {
        const tag = document.createElement('div');
        tag.className = 'keyword-tag';
        tag.textContent = keyword;
        keywordList.appendChild(tag);
      });
    }

    // Load opportunity count (check current trade's opportunities)
    const storageKey = `opportunities_${tradeId}`;
    const opps = await chrome.storage.local.get([storageKey]);
    const opportunities = opps[storageKey] || [];
    document.getElementById('opportunityCount').textContent = opportunities.length;

  } catch (error) {
    console.error('Error loading status:', error);
  }
}

async function importKeywords() {
  const input = document.getElementById('keywordInput').value.trim();
  
  if (!input) {
    alert('Please enter some keywords!');
    return;
  }

  // Parse keywords (split by comma, trim, lowercase, remove duplicates)
  const keywords = [...new Set(
    input.split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0)
  )];

  if (keywords.length === 0) {
    alert('No valid keywords found!');
    return;
  }

  // Prompt for trade ID
  const tradeId = prompt('Enter trade ID (e.g., roofer, plumber, electrician):') || 'default';

  try {
    // Save to chrome.storage.sync
    await chrome.storage.sync.set({
      keywords: keywords,
      monitoringActive: true,
      tradeId: tradeId.toLowerCase()
    });

    // Notify all content scripts
    chrome.runtime.sendMessage({
      type: 'UPDATE_KEYWORDS',
      keywords: keywords,
      active: true,
      tradeId: tradeId.toLowerCase()
    });

    // Close modal and refresh
    document.getElementById('syncModal').classList.remove('active');
    document.getElementById('keywordInput').value = '';
    
    alert(`✅ Successfully imported ${keywords.length} keywords for ${tradeId}!`);
    await loadStatus();

  } catch (error) {
    console.error('Error importing keywords:', error);
    alert('Failed to import keywords. Please try again.');
  }
}

async function scanNow() {
  const button = document.getElementById('scanNow');
  button.textContent = '⏳ Scanning...';
  button.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('facebook.com')) {
      alert('Please navigate to Facebook first!');
      return;
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_NOW' });

    button.textContent = '✅ Scanned!';
    setTimeout(() => {
      button.textContent = '🔍 Scan Page Now';
      button.disabled = false;
      loadStatus(); // Refresh stats
    }, 2000);

  } catch (error) {
    console.error('Error scanning:', error);
    button.textContent = '❌ Error';
    setTimeout(() => {
      button.textContent = '🔍 Scan Page Now';
      button.disabled = false;
    }, 2000);
  }
}

function openApp() {
  // Open HawkEye-Cue web app
  chrome.tabs.create({ url: 'https://claude.ai/code' }); // Replace with actual app URL
}
