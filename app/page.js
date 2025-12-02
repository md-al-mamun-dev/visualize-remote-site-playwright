import { chromium } from "playwright";

export default async function ViewPage({ searchParams }) {
  const targetUrl = 'http://localhost:3001/builder';
  const origin = new URL(targetUrl).origin;

  let browser;

  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Prevent navigation when clicking elements
    await page.route('**/*', (route) => {
      const url = route.request().url();
      // Only allow the target URL and its resources
      if (url === targetUrl || url.startsWith(origin + '/') || url.startsWith('data:')) {
        route.continue();
      } else if (route.request().resourceType() === 'document') {
        // Block navigation to other pages
        console.log('Blocked navigation to:', url);
        route.abort();
      } else {
        // Allow resources (CSS, JS, images, fonts)
        route.continue();
      }
    });
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
    
    console.log('Waiting for network idle...');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('Network idle timeout');
    });
    
    console.log('Waiting for fonts...');
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    
    console.log('Waiting for images...');
    const imageInfo = await page.evaluate(async () => {
      const images = Array.from(document.images);
      const imageData = [];
      
      await Promise.all(
        images.map((img, index) => {
          if (img.complete && img.naturalHeight !== 0) {
            imageData.push({ index: index + 1, src: img.src, status: 'loaded' });
            return Promise.resolve();
          }
          
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              imageData.push({ index: index + 1, src: img.src, status: 'timeout' });
              resolve();
            }, 8000);
            
            img.onload = () => {
              clearTimeout(timeout);
              imageData.push({ index: index + 1, src: img.src, status: 'success' });
              resolve();
            };
            
            img.onerror = () => {
              clearTimeout(timeout);
              imageData.push({ index: index + 1, src: img.src, status: 'error' });
              resolve();
            };
          });
        })
      );
      
      return imageData;
    });
    
    console.log('Image loading summary:', imageInfo.length, 'images');
    imageInfo.forEach(img => {
      console.log(`  Image ${img.index}: ${img.status} - ${img.src}`);
    });
    
    console.log('Getting HTML...');
    let outerHTML = await page.content();
    
    console.log('Getting CSS...');
    let capturedStyles = await page.evaluate(() => {
      return Array.from(document.styleSheets).map(sheet => {
        try {
          return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
        } catch(e) {
          return '';
        }
      }).join('\n');
    }).catch(() => '');
    
    console.log('Getting inline scripts...');
    const inlineScripts = await page.evaluate(() => {
      return Array.from(document.scripts)
        .filter(script => script.textContent && !script.src)
        .map(script => script.textContent)
        .join('\n');
    });
    
    console.log('HTML length:', outerHTML.length);
    console.log('CSS length:', capturedStyles.length);
    
    // Download all images and convert to base64
    console.log('Downloading images as base64...');
    const imageUrls = new Set();
    
    // Extract all image URLs from the HTML
    const imgTags = outerHTML.match(/<img[^>]+src="([^"]+)"[^>]*>/gi) || [];
    imgTags.forEach(tag => {
      const srcMatch = tag.match(/src="([^"]+)"/);
      if (srcMatch && srcMatch[1]) {
        let url = srcMatch[1];
        // Decode HTML entities
        url = url.replace(/&amp;/g, '&');
        imageUrls.add(url);
      }
      
      // Also extract from srcset attribute
      const srcsetMatch = tag.match(/srcset="([^"]+)"/);
      if (srcsetMatch && srcsetMatch[1]) {
        const srcsetValue = srcsetMatch[1];
        // Split by comma and extract URLs (ignore descriptors like "2x" or "1080w")
        srcsetValue.split(',').forEach(part => {
          let url = part.trim().split(/\s+/)[0];
          // Decode HTML entities
          url = url.replace(/&amp;/g, '&');
          if (url) {
            imageUrls.add(url);
          }
        });
      }
    });
    
    console.log('Found', imageUrls.size, 'unique images to download');
    
    // Download each image and convert to base64
    const imageMap = new Map();
    for (const url of imageUrls) {
      try {
        // Convert relative URLs to absolute
        let absoluteUrl = url;
        if (url.startsWith('/')) {
          absoluteUrl = origin + url;
        } else if (!url.startsWith('http')) {
          absoluteUrl = origin + '/' + url;
        }
        
        console.log('Downloading:', absoluteUrl);
        
        // Use page.request.fetch() instead of page.goto() to avoid download issues
        const response = await page.request.fetch(absoluteUrl, {
          timeout: 10000
        });
        
        if (response.ok()) {
          const buffer = await response.body();
          const contentType = response.headers()['content-type'] || 'image/png';
          const base64 = buffer.toString('base64');
          const dataUri = `data:${contentType};base64,${base64}`;
          imageMap.set(url, dataUri); // Store with original URL as key
          console.log('Downloaded:', absoluteUrl, '(', Math.round(base64.length / 1024), 'KB)');
        } else {
          console.error('Failed to download:', absoluteUrl, 'Status:', response.status());
        }
      } catch (error) {
        console.error('Error downloading image:', url, error.message);
      }
    }
    
    console.log('Successfully downloaded', imageMap.size, 'images');
    
    await browser.close();

  console.log('HTML captured, length:', outerHTML.length);
  
  // Replace image URLs with base64 data URIs
  console.log('Replacing image URLs with base64...');
  
  // First, let's collect all srcset attributes and fix them
  const srcsetMatches = outerHTML.match(/srcset="([^"]+)"/g) || [];
  console.log('Found', srcsetMatches.length, 'srcset attributes to process');
  
  srcsetMatches.forEach(srcsetAttr => {
    let newSrcset = srcsetAttr;
    
    // For each image in our map, try to replace it in this srcset
    imageMap.forEach((dataUri, url) => {
      // Try both original URL and with &amp; encoding
      const urlVariants = [url, url.replace(/&/g, '&amp;')];
      
      urlVariants.forEach((urlVariant) => {
        if (newSrcset.includes(urlVariant)) {
          // Find all occurrences with descriptors (e.g., " 1080w")
          const parts = newSrcset.split(urlVariant);
          newSrcset = parts.join(dataUri);
        }
      });
    });
    
    // Replace the old srcset with the new one
    if (newSrcset !== srcsetAttr) {
      outerHTML = outerHTML.replaceAll(srcsetAttr, newSrcset);
    }
  });
  
  // Now replace in src attributes using simple string replacement
  let replacedCount = 0;
  imageMap.forEach((dataUri, url) => {
    //Try both decoded and encoded versions
    const urlVariants = [
      url,                            // Original decoded version
      url.replace(/&/g, '&amp;')     // HTML entity encoded version
    ];
    
    let found = false;
    urlVariants.forEach(urlVariant => {
      const srcPattern = `src="${urlVariant}"`;
      if (outerHTML.includes(srcPattern)) {
        outerHTML = outerHTML.replaceAll(srcPattern, `src="${dataUri}"`);
        found = true;
      }
    });
    
    if (found) {
      replacedCount++;
    } else {
      console.log('⚠️ URL not found in HTML:', url.substring(0, 80));
    }
  });
  
  console.log('Images replaced with base64 data in src and srcset');
  console.log('Replaced', replacedCount, 'out of', imageMap.size, 'images');

  // Rewrite remaining resource URLs (CSS, fonts, scripts) to proxy them
  
  // 1. Handle relative resource src attributes (scripts, iframes - NOT images, they're already base64)
  outerHTML = outerHTML.replace(/src="\/([^"]+)"/g, (match, path) => {
    // Skip if it looks like an image (already converted to base64)
    if (path.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)/i)) {
      return match;
    }
    const fullUrl = origin + '/' + path;
    return `src="/api/proxy/resource?url=${encodeURIComponent(fullUrl)}"`;
  });
  
  // 2. Skip srcset - already handled with base64 images above
  
  // 3. Handle relative resource links (CSS, fonts, etc)
  outerHTML = outerHTML.replace(/href="\/([^"]+)"/g, (match, path) => {
    if (path.match(/\.(css|woff|woff2|ttf|eot|otf|svg|png|jpg|jpeg|gif|webp|ico)/i)) {
      const fullUrl = origin + '/' + path;
      return `href="/api/proxy/resource?url=${encodeURIComponent(fullUrl)}"`;
    }
    return match;
  });
  
  // 4. Handle absolute URLs in src (skip images, they're already base64)
  outerHTML = outerHTML.replace(/src="(https?:\/\/[^"]+)"/g, (match, url) => {
    // Skip if it's an image (already converted to base64)
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)/i) || url.includes('/_next/image')) {
      return match;
    }
    return `src="/api/proxy/resource?url=${encodeURIComponent(url)}"`;
  });
  
  // 5. Skip absolute URLs in srcset - already handled with base64 images above
  
  // 6. Handle absolute URLs in href (resources only)
  outerHTML = outerHTML.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.match(/\.(css|woff|woff2|ttf|eot|otf|svg|png|jpg|jpeg|gif|webp|ico)/i)) {
      return `href="/api/proxy/resource?url=${encodeURIComponent(url)}"`;
    }
    return match;
  });
  
  // 7. Handle CSS url() with relative paths
  outerHTML = outerHTML.replace(/url\(["']?\/([^"')]+)["']?\)/g, (match, path) => {
    const fullUrl = origin + '/' + path;
    return `url("/api/proxy/resource?url=${encodeURIComponent(fullUrl)}")`;
  });
  
  // 8. Handle CSS url() with absolute URLs
  outerHTML = outerHTML.replace(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g, (match, url) => {
    return `url("/api/proxy/resource?url=${encodeURIComponent(url)}")`;
  });
  
  // 9. Handle background-image in inline styles
  outerHTML = outerHTML.replace(/background-image:\s*url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
    if (url.startsWith('/')) {
      const fullUrl = origin + url;
      return `background-image: url("/api/proxy/resource?url=${encodeURIComponent(fullUrl)}")`;
    } else if (url.startsWith('http')) {
      return `background-image: url("/api/proxy/resource?url=${encodeURIComponent(url)}")`;
    }
    return match;
  });
  
  // Log all image sources after proxying
  const imageSrcsAfter = outerHTML.match(/src="[^"]*"/gi) || [];
  const proxyImageCount = imageSrcsAfter.filter(src => src.includes('/api/proxy/resource')).length;
  console.log('Total src attributes after proxying:', imageSrcsAfter.length);
  console.log('Proxied image sources:', proxyImageCount);
  if (imageSrcsAfter.length > 0) {
    console.log('Sample proxied sources:', imageSrcsAfter.slice(0, 3));
  }

  // Inject captured styles with proxied URLs
  if (capturedStyles && capturedStyles.trim()) {
    // Proxy URLs in captured styles too
    capturedStyles = capturedStyles
      .replace(/url\(["']?\/([^"')]+)["']?\)/g, (match, path) => {
        const fullUrl = origin + '/' + path;
        return `url("/api/proxy/resource?url=${encodeURIComponent(fullUrl)}")`;
      })
      .replace(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g, (match, url) => {
        return `url("/api/proxy/resource?url=${encodeURIComponent(url)}")`;
      });
    
    outerHTML = outerHTML.replace('</head>', `<style id="captured-styles">${capturedStyles}</style></head>`);
  }

  console.log('Page captured successfully');
  console.log('Final HTML length:', outerHTML.length);
  console.log('First 500 chars:', outerHTML.substring(0, 500));

  // If HTML is empty, return error message
  if (!outerHTML || outerHTML.length < 100) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>Error: No content captured</h1>
        <p>HTML length: {outerHTML.length}</p>
        <pre>{outerHTML}</pre>
      </div>
    );
  }

  // Add script for hamburger menu functionality
  const interactionScript = `
    <script>
      // Hamburger menu functionality
      document.addEventListener('DOMContentLoaded', function() {
        console.log('Setting up menu...');
        
        // Find elements - adjust selectors to match your actual HTML structure
        const hamburger = document.querySelector('img[alt="open"]');
        const backdrop = document.querySelector('div[class*="backdrop"]') || 
                        document.querySelector('div[class*="fixed"][class*="z-"]');
        const closeBtn = document.querySelector('img[alt="close"]')?.parentElement;
        
        console.log('Found hamburger:', !!hamburger);
        console.log('Found backdrop:', !!backdrop);
        console.log('Found close:', !!closeBtn);
        
        function openMenu() {
          if (!backdrop) return;
          backdrop.classList.remove('opacity-0', 'pointer-events-none', 'delay-300');
          backdrop.classList.add('opacity-100', 'delay-0');
          
          const panel = backdrop.querySelector('div[class*="right-"]');
          if (panel) {
            panel.classList.remove('right-full');
            panel.classList.add('right-0');
          }
          console.log('Menu opened');
        }
        
        function closeMenu() {
          if (!backdrop) return;
          backdrop.classList.add('opacity-0', 'pointer-events-none', 'delay-300');
          backdrop.classList.remove('opacity-100', 'delay-0');
          
          const panel = backdrop.querySelector('div[class*="right-"]');
          if (panel) {
            panel.classList.add('right-full');
            panel.classList.remove('right-0');
          }
          console.log('Menu closed');
        }
        
        // Hamburger click
        if (hamburger) {
          hamburger.style.cursor = 'pointer';
          hamburger.addEventListener('click', function(e) {
            e.stopPropagation();
            openMenu();
          });
        }
        
        // Close button click
        if (closeBtn) {
          closeBtn.style.cursor = 'pointer';
          closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeMenu();
          });
        }
        
        // Backdrop click
        if (backdrop) {
          backdrop.addEventListener('click', function(e) {
            if (e.target === backdrop) {
              closeMenu();
            }
          });
        }
      });
      
      window.addEventListener('load', function() {
        console.log('Page loaded, checking images...');
        const images = document.querySelectorAll('img');
        console.log('Total images found:', images.length);
        
        let successCount = 0;
        let failedCount = 0;
        let emptyCount = 0;
        
        images.forEach((img, index) => {
          // Check if image actually failed (not just incomplete)
          const isDataUri = img.src.startsWith('data:');
          const isFailed = !img.complete || (img.naturalHeight === 0 && img.naturalWidth === 0);
          
          if (isFailed && !isDataUri) {
            console.error('Image failed to load:', img.src.substring(0, 100));
            failedCount++;
          } else if (img.naturalHeight === 0 && img.naturalWidth === 0) {
            // Empty SVG or hidden image - may be intentional
            emptyCount++;
          } else {
            successCount++;
          }
        });
        
        console.log('Image loading complete:');
        console.log('  ✓ Loaded:', successCount);
        console.log('  ✗ Failed:', failedCount);
        console.log('  ○ Empty/Hidden:', emptyCount);
        
        if (failedCount > 0) {
          console.error('Some images failed to load. Check network tab for details.');
        } else {
          console.log('✓ All images loaded successfully!');
        }
        
        // Re-enable interactive elements (sidebars, modals, etc.)
        console.log('Re-enabling interactive elements...');
        
        // Find all elements that might control sidebars/drawers
        const interactiveTriggers = document.querySelectorAll(
          'button, [role="button"], [onclick], [class*="menu"], [class*="trigger"], [class*="toggle"]'
        );
        
        console.log('Found', interactiveTriggers.length, 'interactive elements');
        
        // Make sure all click handlers work
        interactiveTriggers.forEach(el => {
          // Force re-enable if disabled
          if (el.hasAttribute('disabled')) {
            el.removeAttribute('disabled');
          }
          
          // Add pointer cursor to clickable elements
          if (window.getComputedStyle(el).cursor === 'default') {
            el.style.cursor = 'pointer';
          }
        });
        
        console.log('✓ Interactive elements re-enabled');
      });
    </script>
  `;
  
  outerHTML = outerHTML.replace('</body>', `${interactionScript}</body>`);

    return (
      <div
        dangerouslySetInnerHTML={{ __html: outerHTML }}
        style={{ margin: 0, padding: 0 }}
        suppressHydrationWarning
      />
    );
  } catch (error) {
    console.error('Error capturing page:', error);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>Error capturing page</h1>
        <pre>{error.message}</pre>
        <p>Make sure http://localhost:3001/builder is running and accessible.</p>
      </div>
    );
  }
}
