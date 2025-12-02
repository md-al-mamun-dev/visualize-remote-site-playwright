# Page Builder Setup Guide

## What This Does

This Next.js application captures a complete webpage (including all images, fonts, CSS, and styles) from `http://localhost:3001/builder` and renders it pixel-perfect.

## Key Features

✅ **Pixel-perfect rendering** - Captures the exact visual appearance  
✅ **All images loaded** - Proxies and loads all image resources  
✅ **Fonts preserved** - Waits for and captures all web fonts  
✅ **CSS included** - Captures all stylesheets and computed styles  
✅ **Network idle detection** - Waits for all resources to fully load  

## How It Works

1. **Playwright browser** launches headless Chrome
2. **Waits for network idle** - ensures all resources are loaded
3. **Waits for fonts** - uses `document.fonts.ready`
4. **Waits for images** - ensures all images are loaded
5. **Captures all CSS** - extracts all stylesheet rules
6. **Proxies resources** - rewrites URLs to proxy through `/api/proxy/resource`
7. **Renders HTML** - displays the captured page

## Prerequisites

Make sure you have:
- Node.js installed
- `http://localhost:3001/builder` running and accessible

## Running the Application

```bash
# Install dependencies (if not already done)
npm install

# Run the development server
npm run dev
```

Then open `http://localhost:3000` in your browser.

## How Resource Proxying Works

All external resources (images, CSS, fonts) are proxied through:
```
/api/proxy/resource?url=<encoded-url>
```

This ensures:
- CORS issues are avoided
- All resources load from the same origin
- Fonts and images display correctly

## Troubleshooting

### Page takes long to load
- Increase the timeout in `page.js` (currently 30 seconds)
- Check if `http://localhost:3001/builder` is responding

### Images not loading
- Check browser console for failed requests
- Verify the proxy endpoint is working: `/api/proxy/resource`

### Fonts not rendering
- The app waits for `document.fonts.ready`
- Check if fonts are being blocked by CORS (they're proxied to avoid this)

### Styles missing
- The app captures inline styles and all CSS rules
- Check browser console for CSS loading errors

## Configuration

To change the target URL, edit `app/page.js`:
```javascript
const targetUrl = 'http://localhost:3001/builder'; // Change this
```

## Technical Details

- **Framework**: Next.js 16
- **Browser Automation**: Playwright
- **Rendering**: Server-side with dangerouslySetInnerHTML
- **Resource Handling**: Custom proxy API routes
