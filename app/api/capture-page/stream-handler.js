import { chromium } from "playwright";

export async function handleStreamingCapture(request) {
  const targetUrl = 'http://localhost:3001';
  const origin = new URL(targetUrl).origin;

  const encoder = new TextEncoder();
  let browser;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event, data) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendEvent('progress', { task: 'Launching browser', step: 1, total: 9 });
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        // Prevent navigation
        await page.route('**/*', (route) => {
          if (route.request().resourceType() === 'script') {
            route.continue();
            return;
          }
          const url = route.request().url();
          if (url === targetUrl || url.startsWith(origin + '/') || url.startsWith('data:')) {
            route.continue();
          } else if (
            route.request().resourceType() === 'document' &&
            !url.startsWith(origin)
          ) {
            route.abort();
          } else {
            route.continue();
          }
        });
        
        await page.setViewportSize({ width: 1920, height: 1080 });
        
        sendEvent('progress', { task: 'Navigating to page', step: 2, total: 9 });
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
        
        sendEvent('progress', { task: 'Waiting for content to load', step: 3, total: 9 });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        
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
        
        sendEvent('progress', { task: 'Capturing HTML structure', step: 4, total: 9 });
        
        // Remove Next.js portals
        await page.evaluate(() => {
          const nextjsPortals = document.querySelectorAll('nextjs-portal');
          nextjsPortals.forEach(portal => portal.remove());
          
          const devOverlays = document.querySelectorAll('[id*="nextjs"], [class*="nextjs"]');
          devOverlays.forEach(overlay => {
            if (overlay.tagName.toLowerCase() !== 'script' && 
                overlay.tagName.toLowerCase() !== 'style') {
              overlay.remove();
            }
          });
        });
        
        let outerHTML = await page.content();
        
        sendEvent('progress', { task: 'Extracting CSS styles', step: 5, total: 9 });
        let capturedStyles = await page.evaluate(() => {
          return Array.from(document.styleSheets).map(sheet => {
            try {
              return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
            } catch(e) {
              return '';
            }
          }).join('\n');
        }).catch(() => '');
        
        const externalScripts = await page.evaluate(() => {
          return Array.from(document.scripts)
            .filter(script => script.src)
            .map(script => script.src);
        });
        
        const inlineScripts = await page.evaluate(() => {
          return Array.from(document.scripts)
            .filter(script => script.textContent && !script.src)
            .map(script => script.textContent)
            .join('\n');
        });
        
        sendEvent('progress', { task: 'Downloading images', step: 6, total: 9 });
        
        const imageUrls = new Set();
        const imgTags = outerHTML.match(/<img[^>]+src="([^"]+)"[^>]*>/gi) || [];
        imgTags.forEach(tag => {
          const srcMatch = tag.match(/src="([^"]+)"/);
          if (srcMatch && srcMatch[1]) {
            let url = srcMatch[1];
            url = url.replace(/&amp;/g, '&');
            imageUrls.add(url);
          }
          
          const srcsetMatch = tag.match(/srcset="([^"]+)"/);
          if (srcsetMatch && srcsetMatch[1]) {
            const srcsetValue = srcsetMatch[1];
            srcsetValue.split(',').forEach(part => {
              let url = part.trim().split(/\s+/)[0];
              url = url.replace(/&amp;/g, '&');
              if (url) {
                imageUrls.add(url);
              }
            });
          }
        });
        
        const imageMap = new Map();
        let downloadedCount = 0;
        
        for (const url of imageUrls) {
          try {
            let absoluteUrl = url;
            if (url.startsWith('/')) {
              absoluteUrl = origin + url;
            } else if (!url.startsWith('http')) {
              absoluteUrl = origin + '/' + url;
            }
            
            const response = await page.request.fetch(absoluteUrl, {
              timeout: 10000
            });
            
            if (response.ok()) {
              const buffer = await response.body();
              const contentType = response.headers()['content-type'] || 'image/png';
              const base64 = buffer.toString('base64');
              const dataUri = `data:${contentType};base64,${base64}`;
              imageMap.set(url, dataUri);
              downloadedCount++;
              
              sendEvent('progress', { 
                task: `Downloading images (${downloadedCount}/${imageUrls.size})`, 
                step: 6, 
                total: 9 
              });
            }
          } catch (error) {
            console.error('Error downloading image:', url, error.message);
          }
        }
        
        sendEvent('progress', { task: 'Converting images to base64', step: 7, total: 9 });
        
        // Replace images in HTML
        const srcsetMatches = outerHTML.match(/srcset="([^"]+)"/g) || [];
        srcsetMatches.forEach(srcsetAttr => {
          let newSrcset = srcsetAttr;
          
          imageMap.forEach((dataUri, url) => {
            const urlVariants = [url, url.replace(/&/g, '&amp;')];
            
            urlVariants.forEach((urlVariant) => {
              if (newSrcset.includes(urlVariant)) {
                const parts = newSrcset.split(urlVariant);
                newSrcset = parts.join(dataUri);
              }
            });
          });
          
          if (newSrcset !== srcsetAttr) {
            outerHTML = outerHTML.replaceAll(srcsetAttr, newSrcset);
          }
        });
        
        imageMap.forEach((dataUri, url) => {
          const urlVariants = [url, url.replace(/&/g, '&amp;')];
          
          urlVariants.forEach(urlVariant => {
            const srcPattern = `src="${urlVariant}"`;
            if (outerHTML.includes(srcPattern)) {
              outerHTML = outerHTML.replaceAll(srcPattern, `src="${dataUri}"`);
            }
          });
        });
        
        sendEvent('progress', { task: 'Processing resources', step: 8, total: 9 });
        
        // Rewrite resource URLs
        outerHTML = outerHTML.replace(/src="\/([^"]+)"/g, (match, path) => {
          if (path.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)/i)) {
            return match;
          }
          const fullUrl = origin + '/' + path;
          if (path.match(/\.js$/i) || path.includes('/_next/')) {
            return `src="${fullUrl}"`;
          }
          return `src="/api/proxy/resource?url=${encodeURIComponent(fullUrl)}"`;
        });
        
        outerHTML = outerHTML.replace(/href="\/([^"]+)"/g, (match, path) => {
          if (path.match(/\.(css|woff|woff2|ttf|eot|otf|svg|png|jpg|jpeg|gif|webp|ico)/i)) {
            const fullUrl = origin + '/' + path;
            return `href="/api/proxy/resource?url=${encodeURIComponent(fullUrl)}"`;
          }
          return match;
        });
        
        outerHTML = outerHTML.replace(/src="(https?:\/\/[^"]+)"/g, (match, url) => {
          if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)/i) || url.includes('/_next/image')) {
            return match;
          }
          if (url.includes('/_next/') && url.endsWith('.js')) {
            return match;
          }
          if ((url.match(/\.js$/i) || url.includes('/_next/')) && url.startsWith(origin)) {
            return match;
          }
          return `src="/api/proxy/resource?url=${encodeURIComponent(url)}"`;
        });
        
        outerHTML = outerHTML.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
          if (url.match(/\.(css|woff|woff2|ttf|eot|otf|svg|png|jpg|jpeg|gif|webp|ico)/i)) {
            return `href="/api/proxy/resource?url=${encodeURIComponent(url)}"`;
          }
          return match;
        });
        
        outerHTML = outerHTML.replace(/url\(["']?\/([^"')]+)["']?\)/g, (match, path) => {
          const fullUrl = origin + '/' + path;
          return `url("/api/proxy/resource?url=${encodeURIComponent(fullUrl)}")`;
        });
        
        outerHTML = outerHTML.replace(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g, (match, url) => {
          return `url("/api/proxy/resource?url=${encodeURIComponent(url)}")`;
        });
        
        outerHTML = outerHTML.replace(/background-image:\s*url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
          if (url.startsWith('/')) {
            const fullUrl = origin + url;
            return `background-image: url("/api/proxy/resource?url=${encodeURIComponent(fullUrl)}")`;
          } else if (url.startsWith('http')) {
            return `background-image: url("/api/proxy/resource?url=${encodeURIComponent(url)}")`;
          }
          return match;
        });

        outerHTML = outerHTML.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, "");

        if (capturedStyles && capturedStyles.trim()) {
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

        await browser.close();
        
        sendEvent('progress', { task: 'Finalizing capture', step: 9, total: 9 });
        
        // Send final result
        sendEvent('complete', {
          success: true,
          html: outerHTML,
          stats: {
            htmlLength: outerHTML.length,
            cssLength: capturedStyles.length,
            externalScripts: externalScripts.length,
            inlineScriptsLength: inlineScripts.length,
            imagesDownloaded: imageMap.size
          }
        });
        
        controller.close();
        
      } catch (error) {
        console.error('Error capturing page:', error);
        if (browser) {
          try { await browser.close(); } catch (e) {}
        }
        
        sendEvent('error', {
          success: false,
          error: error.message
        });
        
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
