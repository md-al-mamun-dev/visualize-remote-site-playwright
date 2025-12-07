
import { chromium } from "playwright";
import { NextResponse } from "next/server";
import { handleStreamingCapture } from './stream-handler.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream') === 'true';

  // If streaming is requested, return SSE stream
  if (stream) return handleStreamingCapture(request);
  

  // Original non-streaming implementation
  const targetUrl = 'http://localhost:3001';
  const origin = new URL(targetUrl).origin;

  let browser;

  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Prevent navigation when clicking elements
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
    
    // Remove Next.js development overlays and portals before capturing
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
    
    console.log('Getting external scripts...');
    const externalScripts = await page.evaluate(() => {
      return Array.from(document.scripts)
        .filter(script => script.src)
        .map(script => script.src);
    });
    
    console.log('Getting inline scripts...');
    const inlineScripts = await page.evaluate(() => {
      return Array.from(document.scripts)
        .filter(script => script.textContent && !script.src)
        .map(script => script.textContent)
        .join('\n');
    });
    
    console.log('HTML length:', outerHTML.length);
    console.log('CSS length:', capturedStyles.length);
    console.log('External scripts:', externalScripts.length);
    console.log('Inline scripts length:', inlineScripts.length);
    
    // Download all images and convert to base64
    console.log('Downloading images as base64...');
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
    
    console.log('Found', imageUrls.size, 'unique images to download');
    
    const imageMap = new Map();
    for (const url of imageUrls) {
      try {
        let absoluteUrl = url;
        if (url.startsWith('/')) {
          absoluteUrl = origin + url;
        } else if (!url.startsWith('http')) {
          absoluteUrl = origin + '/' + url;
        }
        
        console.log('Downloading:', absoluteUrl);
        
        const response = await page.request.fetch(absoluteUrl, {
          timeout: 10000
        });
        
        if (response.ok()) {
          const buffer = await response.body();
          const contentType = response.headers()['content-type'] || 'image/png';
          const base64 = buffer.toString('base64');
          const dataUri = `data:${contentType};base64,${base64}`;
          imageMap.set(url, dataUri);
          console.log('Downloaded:', absoluteUrl, '(', Math.round(base64.length / 1024), 'KB)');
        } else {
          console.error('Failed to download:', absoluteUrl, 'Status:', response.status());
        }
      } catch (error) {
        console.error('Error downloading image:', url, error.message);
      }
    }
    
    console.log('Successfully downloaded', imageMap.size, 'images');

    console.log('HTML captured, length:', outerHTML.length);
    
    console.log('Replacing image URLs with base64...');
    
    const srcsetMatches = outerHTML.match(/srcset="([^"]+)"/g) || [];
    console.log('Found', srcsetMatches.length, 'srcset attributes to process');
    
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
    
    let replacedCount = 0;
    imageMap.forEach((dataUri, url) => {
      const urlVariants = [
        url,
        url.replace(/&/g, '&amp;')
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

    

    console.log('Page captured successfully');
    console.log('Final HTML length:', outerHTML.length);

    await browser.close();


    return NextResponse.json({
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

  } catch (error) {
    console.error('Error capturing page:', error);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}




// // /api/snapshot/route.js
// import { chromium } from "playwright";
// import { NextResponse } from "next/server";

// export async function GET() {
//   const url = "http://localhost:3001/builder";
//   let browser;

//   try {
//     browser = await chromium.launch({ headless: true });
//     const page = await browser.newPage();

//     await page.setViewportSize({ width: 1920, height: 1080 });

//     await page.goto(url, { waitUntil: "networkidle" });

//     // Wait for fonts
//     await page.evaluate(async () => await document.fonts.ready);

//     const imageUrls = await page.evaluate(() => {
//         const urls = new Set();

//         document.querySelectorAll("img").forEach(img => {
//             if (img.src) urls.add(img.src);

//             if (img.srcset) {
//             img.srcset.split(",").forEach(part => {
//                 const url = part.trim().split(" ")[0];
//                 if (url) urls.add(url);
//             });
//             }
//         });

//         return Array.from(urls);
//     });

//     const imageMap = new Map();

//     for (const imgUrl of imageUrls) {
//         try {
//             const response = await page.request.get(imgUrl);
//             if (!response.ok()) continue;

//             const buffer = await response.body();
//             const type = response.headers()["content-type"] || "image/png";
//             const base64 = buffer.toString("base64");
//             const dataUri = `data:${type};base64,${base64}`;

//             imageMap.set(imgUrl, dataUri);

//         } catch (_) {
//             // Ignore failed downloads
//         }
//     }

//     // Get rendered HTML
//     let html = await page.content();

//     for (const [url, dataUri] of imageMap.entries()) {
//         const escaped = url.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
//         // html = html.replace(new RegExp(escaped, "g"), dataUri);

//         html = html.replaceAll(`src="${url}"`, `src="${dataUri}"`);
//         html = html.replaceAll(`srcset="${url}"`, `srcset="${dataUri}"`);
//     }

//     await browser.close();

//     // return NextResponse.json({ success: true, html });
//     const finalHTML = `
//                         <!DOCTYPE html>
//                         <html>
//                         <head><meta charset="utf-8"></head>
//                         <body>${html}</body>
//                         </html>
//                     `;
                    
//     return NextResponse.json({ success: true, html: finalHTML });

//   } catch (err) {
//     if (browser) await browser.close();
//     return NextResponse.json({ success: false, error: err.message });
//   }
// }

