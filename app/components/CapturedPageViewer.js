'use client';

import { useEffect, useRef, useState } from 'react';

export default function CapturedPageViewer() {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(9);

  const iframeRef = useRef(null);

  useEffect(() => {
    async function fetchCapturedPage() {
      try {
        // Use Server-Sent Events for real-time progress
        const eventSource = new EventSource('/api/capture-page?stream=true');

        eventSource.addEventListener('progress', (e) => {
          const data = JSON.parse(e.data);
          setCurrentStep(data.step);
          setTotalSteps(data.total);
          
          setTasks(prevTasks => {
            const existingIndex = prevTasks.findIndex(t => t.name === data.task);
            const taskProgress = Math.round((data.step / data.total) * 100);
            
            if (existingIndex >= 0) {
              // Update existing task
              const updated = [...prevTasks];
              updated[existingIndex] = { name: data.task, status: 'in-progress', progress: taskProgress };
              return updated;
            } else {
              // Mark previous task as complete and add new one
              const updated = prevTasks.map(t => ({ ...t, status: 'completed', progress: 100 }));
              return [...updated, { name: data.task, status: 'in-progress', progress: taskProgress }];
            }
          });
          
          console.log(`Progress: ${data.task} (${data.step}/${data.total})`);
        });

        eventSource.addEventListener('complete', (e) => {
          const data = JSON.parse(e.data);
          if (data.success) {
            setTasks(prevTasks => prevTasks.map(t => ({ ...t, status: 'completed', progress: 100 })));
            setCurrentStep(totalSteps);
            setHtml(data.html);
            setStats(data.stats);
            setTimeout(() => setLoading(false), 800);
          } else {
            throw new Error(data.error || 'Failed to capture page');
          }
          eventSource.close();
        });

        eventSource.addEventListener('error', (e) => {
          const data = JSON.parse(e.data);
          setError(data.error || 'Stream connection failed');
          setLoading(false);
          eventSource.close();
        });

        eventSource.onerror = () => {
          setError('Connection to server lost');
          setLoading(false);
          eventSource.close();
        };

      } catch (err) {
        console.error(err);
        setError(err.message);
        setLoading(false);
      }
    }

    fetchCapturedPage();
  }, []);

  // Safe highlight & click inspector
  useEffect(() => {
    if (!html) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (!doc || !win) return;

        const highlight = doc.createElement('div');
        Object.assign(highlight.style, {
          position: 'fixed',
          pointerEvents: 'none',
          border: '2px solid #00f',
          zIndex: '999999',
          transition: 'all 0.05s ease-out',
        });
        doc.body.appendChild(highlight);

        // Mouse hover
        // doc.addEventListener('mousemove', (e) => {
        //   const el = e.target;
        //   if (!el) return;
        //   const rect = el.getBoundingClientRect();
        //   highlight.style.left = rect.left + 'px';
        //   highlight.style.top = rect.top + 'px';
        //   highlight.style.width = rect.width + 'px';
        //   highlight.style.height = rect.height + 'px';
        // });

        // Click inspector
        doc.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const el = e.target;
          if (!el) return;

          const rect = el.getBoundingClientRect();
          const styles = win.getComputedStyle(el);
          const info = {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            classes: [...el.classList],
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            html: el.outerHTML,
            styles: {
              color: styles.color,
              fontSize: styles.fontSize,
              background: styles.background,
              display: styles.display,
            },
          };
          window.parent.postMessage({ type: 'element-selected', info }, '*');
          console.log('Element selected:', info);
        });
      } catch (err) {
        console.error('Error injecting inspector:', err);
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [html]);

  if (loading)
    return (
      <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 40,
      background: 'linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: 'relative',
      overflow: 'hidden'
      }}>
      <style>{`
        @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
        }
        @keyframes checkmark {
        0% { transform: scale(0) rotate(45deg); }
        50% { transform: scale(1.2) rotate(45deg); }
        100% { transform: scale(1) rotate(45deg); }
        }
        @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.4), 0 0 40px rgba(102, 126, 234, 0.2); }
        50% { box-shadow: 0 0 30px rgba(102, 126, 234, 0.6), 0 0 60px rgba(102, 126, 234, 0.3); }
        }
        @keyframes progressBar {
        from { width: 0%; }
        }
      `}</style>
      
      {/* Background decorative elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        filter: 'blur(40px)',
        animation: 'float 6s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        right: '15%',
        width: 150,
        height: 150,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.08)',
        filter: 'blur(50px)',
        animation: 'float 8s ease-in-out infinite'
      }} />
      
      <div style={{
        maxWidth: 650,
        width: '100%',
        background: 'rgba(255, 255, 255, 0.25)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24,
        padding: 40,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), 0 0 1px rgba(255, 255, 255, 0.5) inset',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        position: 'relative',
        zIndex: 1
      }}>
        <h2 style={{ 
        fontSize: 28, 
        margin: 0, 
        marginBottom: 8,
        fontWeight: 700,
        color: '#1f2937',
        textAlign: 'center',
        textShadow: '0 1px 2px rgba(255, 255, 255, 0.5)',
        letterSpacing: '-0.5px'
        }}>
        Preparing Your Workspace
        </h2>
        
        <p style={{
        fontSize: 14,
        color: '#374151',
        textAlign: 'center',
        margin: '0 0 30px 0',
        fontWeight: 600
        }}>
        {Math.round((currentStep / totalSteps) * 100)}% Complete
        </p>

        {/* Progress Bar */}
        <div style={{
        width: '100%',
        height: 8,
        background: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 30,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1) inset'
        }}>
        <div style={{
          height: '100%',
          width: `${(currentStep / totalSteps) * 100}%`,
          background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
          borderRadius: 10,
          transition: 'width 0.5s ease-out',
          boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
        }} />
        </div>

        {/* Task List */}
        <div style={{
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 16,
        padding: 20,
        border: '1px solid rgba(255, 255, 255, 0.5)',
        height: 280,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        position: 'relative'
        }}>
        <div style={{
          transition: 'transform 0.5s ease-out',
          transform: tasks.length > 4 ? `translateY(-${(tasks.length - 4) * 52}px)` : 'translateY(0)'
        }}>
          {tasks.map((task, index) => {
          const isCompleted = task.status === 'completed';
          const isCurrent = task.status === 'in-progress';

          return (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            marginBottom: index < tasks.length - 1 ? 10 : 0,
            background: isCurrent 
            ? 'rgba(255, 255, 255, 0.6)' 
            : isCompleted 
            ? 'rgba(16, 185, 129, 0.15)' 
            : 'rgba(255, 255, 255, 0.3)',
            borderRadius: 12,
            transition: 'all 0.3s ease',
            animation: 'fadeIn 0.4s ease-out',
            border: isCurrent 
            ? '2px solid rgba(102, 126, 234, 0.5)' 
            : isCompleted
            ? '1px solid rgba(16, 185, 129, 0.3)'
            : '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: isCurrent ? '0 2px 8px rgba(102, 126, 234, 0.2)' : 'none'
          }}>
            {/* Task Name */}
            <span style={{
            fontSize: 15,
            color: isCompleted ? '#059669' : isCurrent ? '#1f2937' : '#4b5563',
            fontWeight: isCurrent ? 700 : isCompleted ? 600 : 500,
            textShadow: 'none',
            flex: 1
            }}>
            {task.name}
            </span>

            {/* Status Indicator on Right */}
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginLeft: 16
            }}>
            {isCompleted ? (
              <>
              <span style={{
                fontSize: 13,
                color: '#059669',
                fontWeight: 700,
                minWidth: 40,
                textAlign: 'right'
              }}>
                100%
              </span>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                boxShadow: '0 0 12px rgba(16, 185, 129, 0.6)'
              }}>
                <div style={{
                width: 5,
                height: 10,
                borderRight: '2px solid white',
                borderBottom: '2px solid white',
                transform: 'rotate(45deg)',
                marginBottom: 2,
                animation: 'checkmark 0.3s ease-out'
                }} />
              </div>
              </>
            ) : isCurrent ? (
              <>
              <span style={{
                fontSize: 13,
                color: '#667eea',
                fontWeight: 700,
                minWidth: 40,
                textAlign: 'right'
              }}>
                {task.progress || 0}%
              </span>
              <div style={{
                width: 18,
                height: 18,
                border: '3px solid rgba(102, 126, 234, 0.3)',
                borderTop: '3px solid #667eea',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              </>
            ) : null}
            </div>
          </div>
          );
        })}
        </div>
        </div>
        <div style={{
        fontSize: 13,
        color: '#374151',
        lineHeight: 1.6,
        textAlign: 'center',
        fontWeight: 600,
        marginTop: 20
        }}>
          🎨 Getting your theme...
        </div>
      </div>
      </div>
    );

  if (error)
    return (
      <div style={{ padding: 20, color: 'red' }}>
        <h1>Error capturing page</h1>
        <pre>{error}</pre>
        <p>Make sure Theme Site is running.</p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 20 }}>
          Retry
        </button>
      </div>
    );

  return (
    <>
      {stats && (
        <div
          style={{
            position: 'fixed',
            top: 10,
            right: 10,
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: 10,
            fontSize: 12,
            borderRadius: 5,
            zIndex: 9999,
          }}
        >
          <div>HTML: {Math.round(stats.htmlLength / 1024)} KB</div>
          <div>CSS: {Math.round(stats.cssLength / 1024)} KB</div>
          <div>Images: {stats.imagesDownloaded}</div>
          <div>Scripts: {stats.externalScripts}</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ width: '100vw', height: '100vh', border: 'none', margin: 0, padding: 0 }}
      />
    </>
  );
}









// 'use client';

// import { useEffect, useRef, useState } from 'react';

// export default function CapturedPageViewer() {
//   const [html, setHtml] = useState('');
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [stats, setStats] = useState(null);

//   const iframeRef = useRef(null);

//   // ----------------------------
//   // FETCH CAPTURED HTML
//   // ----------------------------
//   useEffect(() => {
//     async function fetchCapturedPage() {
//       try {
//         console.log('Fetching captured page from API...');

//         const response = await fetch('/api/capture-page', {
//           cache: 'no-store',
//         });

//         if (!response.ok) {
//           throw new Error(`API request failed: ${response.status}`);
//         }

//         const data = await response.json();

//         if (!data.success) {
//           throw new Error(data.error || 'Failed to capture page');
//         }

//         if (!data.html || data.html.length < 100) {
//           throw new Error('No content captured');
//         }

//         console.log('Page captured successfully');
//         console.log('Stats:', data.stats);

//         setHtml(data.html);
//         setStats(data.stats);
//         setLoading(false);
//       } catch (err) {
//         console.error('Error fetching page:', err);
//         setError(err.message);
//         setLoading(false);
//       }
//     }

//     fetchCapturedPage();
//   }, []);

//   // ----------------------------
//   // INJECT INSPECTOR INTO IFRAME
//   // ----------------------------
//   useEffect(() => {
//     if (!html) return;

//     const iframe = iframeRef.current;
//     if (!iframe) return;

//     const handleLoad = () => {
//       const doc = iframe.contentDocument;
//       const win = iframe.contentWindow;

//       if (!doc || !win) return;

//       // --- Create Highlight Overlay ---
//       const highlight = doc.createElement('div');
//       highlight.style.position = 'fixed';
//       highlight.style.pointerEvents = 'none';
//       highlight.style.border = '2px solid #00f';
//       highlight.style.zIndex = '999999';
//       highlight.style.transition = 'all 0.05s ease-out';
//       doc.body.appendChild(highlight);

//       // --- Mouse hover tracking ---
//       doc.addEventListener('mousemove', (e) => {
//         const el = e.target;
//         if (!el) return;

//         const rect = el.getBoundingClientRect();
//         highlight.style.left = rect.left + 'px';
//         highlight.style.top = rect.top + 'px';
//         highlight.style.width = rect.width + 'px';
//         highlight.style.height = rect.height + 'px';
//       });

//       // --- Click: Capture element info ---
//       doc.addEventListener('click', (e) => {
//         e.preventDefault();
//         e.stopPropagation();

//         const el = e.target;
//         if (!el) return;

//         const rect = el.getBoundingClientRect();
//         const styles = win.getComputedStyle(el);

//         const info = {
//           tag: el.tagName.toLowerCase(),
//           id: el.id,
//           classes: [...el.classList],
//           rect: {
//             x: rect.x,
//             y: rect.y,
//             width: rect.width,
//             height: rect.height,
//           },
//           html: el.outerHTML,
//           styles: {
//             color: styles.color,
//             fontSize: styles.fontSize,
//             background: styles.background,
//             display: styles.display,
//           },
//         };

//         // Send to parent window
//         window.parent.postMessage({ type: 'element-selected', info }, '*');

//         console.log('Selected Element:', info);
//       });
//     };

//     iframe.addEventListener('load', handleLoad);
//     return () => iframe.removeEventListener('load', handleLoad);
//   }, [html]);

//   // ----------------------------
//   // UI STATES
//   // ----------------------------
//   if (loading) {
//     return (
//       <div style={{ padding: 20, textAlign: 'center', fontSize: 18, color: '#666' }}>
//         <p>Loading captured page...</p>
//         <p style={{ fontSize: 14, marginTop: 10 }}>
//           This may take a few seconds while Playwright captures the page.
//         </p>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div style={{ padding: 20, color: 'red' }}>
//         <h1>Error capturing page</h1>
//         <pre>{error}</pre>
//         <p>Make sure http://localhost:3001/builder is running.</p>
//         <button
//           onClick={() => window.location.reload()}
//           style={{
//             marginTop: 20,
//             padding: '10px 20px',
//             fontSize: 16,
//             cursor: 'pointer',
//           }}
//         >
//           Retry
//         </button>
//       </div>
//     );
//   }

//   // ----------------------------
//   // FINAL RENDER
//   // ----------------------------
//   return (
//     <>
//       {stats && (
//         <div
//           style={{
//             position: 'fixed',
//             top: 10,
//             right: 10,
//             background: 'rgba(0,0,0,0.7)',
//             color: 'white',
//             padding: 10,
//             fontSize: 12,
//             borderRadius: 5,
//             zIndex: 9999,
//           }}
//         >
//           <div>HTML: {Math.round(stats.htmlLength / 1024)} KB</div>
//           <div>CSS: {Math.round(stats.cssLength / 1024)} KB</div>
//           <div>Images: {stats.imagesDownloaded}</div>
//           <div>Scripts: {stats.externalScripts}</div>
//         </div>
//       )}

//       {/* --- FULL PAGE INSPECTOR INSIDE IFRAME --- */}
//       <iframe
//         ref={iframeRef}
//         srcDoc={html}
//         style={{
//           width: '100vw',
//           height: '100vh',
//           border: 'none',
//           margin: 0,
//           padding: 0,
//           overflow: 'hidden',
//         }}
//       />
//     </>
//   );
// }


























// 'use client';

// import { useEffect, useState } from 'react';

// export default function CapturedPageViewer() {
//   const [html, setHtml] = useState('');
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [stats, setStats] = useState(null);

//   useEffect(() => {
//     async function fetchCapturedPage() {
//       try {
//         console.log('Fetching captured page from API...');
        
//         const response = await fetch('/api/capture-page', {
//           cache: 'no-store'
//         });
        
//         if (!response.ok) {
//           throw new Error(`API request failed: ${response.status}`);
//         }
        
//         const data = await response.json();
        
//         if (!data.success) {
//           throw new Error(data.error || 'Failed to capture page');
//         }
        
//         console.log('Page captured successfully');
//         console.log('Stats:', data.stats);
        
//         if (!data.html || data.html.length < 100) {
//           throw new Error('No content captured');
//         }

//         setHtml(data.html);
//         setStats(data.stats);
//         setLoading(false);
//       } catch (err) {
//         console.error('Error fetching page:', err);
//         setError(err.message);
//         setLoading(false);
//       }
//     }

//     fetchCapturedPage();
//   }, []);

//   if (loading) {
//     return (
//       <div style={{ 
//         padding: '20px', 
//         textAlign: 'center',
//         fontSize: '18px',
//         color: '#666'
//       }}>
//         <p>Loading captured page...</p>
//         <p style={{ fontSize: '14px', marginTop: '10px' }}>
//           This may take a few seconds while we capture the page with Playwright
//         </p>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div style={{ padding: '20px', color: 'red' }}>
//         <h1>Error capturing page</h1>
//         <pre>{error}</pre>
//         <p>Make sure http://localhost:3001/builder is running and accessible.</p>
//         <button 
//           onClick={() => window.location.reload()}
//           style={{
//             marginTop: '20px',
//             padding: '10px 20px',
//             fontSize: '16px',
//             cursor: 'pointer'
//           }}
//         >
//           Retry
//         </button>
//       </div>
//     );
//   }

//   return (
//     <>
//       {stats && (
//         <div style={{ 
//           position: 'fixed', 
//           top: 10, 
//           right: 10, 
//           background: 'rgba(0,0,0,0.7)', 
//           color: 'white',
//           padding: '10px',
//           fontSize: '12px',
//           borderRadius: '5px',
//           zIndex: 9999
//         }}>
//           <div>HTML: {Math.round(stats.htmlLength / 1024)} KB</div>
//           <div>CSS: {Math.round(stats.cssLength / 1024)} KB</div>
//           <div>Images: {stats.imagesDownloaded}</div>
//           <div>Scripts: {stats.externalScripts}</div>
//         </div>
//       )}
//       <div
//         dangerouslySetInnerHTML={{ __html: html }}
//         style={{ margin: 0, padding: 0 }}
//         suppressHydrationWarning
//       />
//     </>
//   );
// }
