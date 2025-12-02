# Cloudflare Protection Issue

## Problem
The page builder cannot capture sites protected by Cloudflare because:
1. Cloudflare blocks automated browsers (403 error)
2. Headless browsers are detected and blocked
3. Headed browsers consume too much memory causing OOM errors

## Solutions

### Option 1: Use localhost (RECOMMENDED)
```javascript
const targetUrl = 'http://localhost:3001/builder';
```
This is the default and works perfectly.

### Option 2: Use sites without Cloudflare
Test with sites that don't use Cloudflare protection:
- Your own website
- Development/staging servers
- Sites without bot protection

### Option 3: Manual Workaround
1. Open the target site in your regular browser
2. Complete the Cloudflare challenge manually
3. Save the page as HTML (Ctrl+S)
4. Use the saved HTML file instead

### Option 4: Use Proxies/Services (Advanced)
- Use a proxy service like ScraperAPI or Bright Data
- These services handle Cloudflare challenges
- Costs money but works reliably

### Option 5: Contact Site Owner
Request API access or permission to scrape

## Current Configuration
The app is optimized for memory efficiency:
- Limited to 20 images
- Limited to 10 scripts
- Scripts limited to 500KB each
- 3-second timeouts
- Browser closes immediately after capture

## Error Messages
- **403 Error**: Site is blocking automated access
- **Out of Memory**: Too many resources being downloaded
- **Cannot read 'lang'**: Browser context initialization error

## Recommendation
**Use localhost or non-Cloudflare protected sites only.**
