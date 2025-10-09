import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const COLORS = ['#000000', '#0066FF', '#FF0000', '#00CC00', '#FFCC00'];
const BRUSH_SIZE = 5;
const TIMER_DURATION = 60;
const MIN_COVERAGE = 0.002;
const MIN_TIME = 3;

// Helper functions
const formatDate = () => {
  const date = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
  return `${months[date.getMonth()]}. ${date.getDate()} ${date.getFullYear()}`;
};

const getRandomPosition = (index, total) => {
  const columns = Math.ceil(Math.sqrt(total * 1.5));
  const rows = Math.ceil(total / columns);
  
  const row = Math.floor(index / columns);
  const col = index % columns;
  
  // Center the grid around (0, 0)
  const centerOffsetX = (columns * 400) / 2;
  const centerOffsetY = (rows * 400) / 2;
  
  const baseX = (col * 400) - centerOffsetX;
  const baseY = (row * 400) - centerOffsetY;
  
  const randomX = (Math.random() - 0.5) * 100;
  const randomY = (Math.random() - 0.5) * 100;
  const rotation = (Math.random() - 0.5) * 6;
  
  return {
    left: baseX + randomX,
    top: baseY + randomY,
    rotation
  };
};

function GalleryDrawing({ drawing, index, isUserDrawing }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [shouldStart, setShouldStart] = useState(false);

  useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasAnimated) {
          let delay = 0;
          
          if (isUserDrawing) {
            // User's drawing: animate immediately
            delay = 0;
          } else {
            // Other drawings: random quick stagger
            delay = Math.random() * 300;
          }
          
          setTimeout(() => {
            setShouldStart(true);
          }, delay);
        }
      });
    },
    { threshold: 0.3 }
  );

  if (containerRef.current) {
    observer.observe(containerRef.current);
  }

  return () => {
    if (containerRef.current) {
      observer.unobserve(containerRef.current);
    }
  };
}, [hasAnimated, isUserDrawing]);

  useEffect(() => {
    if (!canvasRef.current || !shouldStart || hasAnimated) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = 350;
    canvas.height = 350;
    
    ctx.fillStyle = '#F5F5DC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const strokes = drawing.stroke_data?.strokes || [];
    if (strokes.length === 0) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = drawing.image_url;
      setIsAnimating(false);
      setHasAnimated(true);
      return;
    }
    
    // Find max coordinates to calculate scale
    let maxX = 0;
    let maxY = 0;
    strokes.forEach(stroke => {
      stroke.points.forEach(point => {
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
      });
    });
    
    const originalSize = Math.max(maxX, maxY);
    const scale = originalSize > 0 ? 350 / originalSize : 1;
    
    setIsAnimating(true);
    
    let currentStrokeIndex = 0;
    let currentPointIndex = 0;
    
    const animateStrokes = () => {
      if (currentStrokeIndex >= strokes.length) {
        setIsAnimating(false);
        setHasAnimated(true);
        return;
      }
      
      const stroke = strokes[currentStrokeIndex];
      const points = stroke.points;
      
      if (currentPointIndex === 0) {
        ctx.beginPath();
        ctx.moveTo(points[0].x * scale, points[0].y * scale);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = 5 * scale;
      }
      
      if (currentPointIndex < points.length) {
        const point = points[currentPointIndex];
        ctx.lineTo(point.x * scale, point.y * scale);
        ctx.stroke();
        currentPointIndex++;
        
        setTimeout(animateStrokes, 10 / 1.25);
      } else {
        currentStrokeIndex++;
        currentPointIndex = 0;
        setTimeout(animateStrokes, 50);
      }
    };
    
    animateStrokes();
  }, [drawing, hasAnimated, shouldStart]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#F5F5DC',
          opacity: hasAnimated || isAnimating ? 1 : 0.3,
          transition: 'opacity 0.3s ease-in'
        }}
      />
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState('loading');
  const [userId, setUserId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [drawingStartTime, setDrawingStartTime] = useState(null);
  const [firstStrokeTime, setFirstStrokeTime] = useState(null);
  const [todayPrompt, setTodayPrompt] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [gallery, setGallery] = useState([]);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [submittingDots, setSubmittingDots] = useState(1);
  const [lastSubmittedImage, setLastSubmittedImage] = useState(null);
  const [galleryState, setGalleryState] = useState('loading');
  
  const canvasRef = useRef(null);
  const timerRef = useRef(null); 

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (screen === 'drawing' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [screen, timeLeft]);

  useEffect(() => {
    if (screen === 'already-done') {
      const interval = setInterval(() => {
        setCountdown(getTimeUntilMidnight());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [screen]);

  useEffect(() => {
    if (screen === 'drawing' || screen === 'submitting') {
      const resizeCanvas = () => {
        const reservedSpace = 200;
        const size = Math.min(
          window.innerWidth - 32,
          window.innerHeight - reservedSpace
        );
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = size;
          canvas.height = size;
        }
      };
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }
  }, [screen]);

useEffect(() => {
    if (screen === 'gallery') {
      if (gallery.length === 0) {
        setGalleryState('loading');
      } else if (gallery.length === 1 && gallery[0].user_id === userId) {
        setGalleryState('first');
      } else {
        setGalleryState('loaded');
      }
    }
  }, [screen, gallery, userId]);

  
  const initializeApp = async () => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let uid = null;
      
      if (typeof window !== 'undefined') {
        uid = localStorage.getItem('inkling_user_id');
      }
      
      if (!uid) {
        const fingerprint = generateFingerprint();
        const { data, error } = await supabase
          .from('users')
          .insert({ timezone, id: fingerprint })
          .select()
          .single();
        
        if (error) throw error;
        uid = data.id;
        if (typeof window !== 'undefined') {
          localStorage.setItem('inkling_user_id', uid);
        }
      } else {
        await supabase
          .from('users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', uid);
      }
      
      setUserId(uid);
      await checkTodayStatus(uid, timezone);
    } catch (error) {
      console.error('Init error:', error);
      setScreen('landing');
    }
  };

  const generateFingerprint = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const checkTodayStatus = async (uid, timezone) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', uid)
        .single();

      if (userError) throw userError;

      const userStartDate = new Date(userData.created_at);
      const now = new Date();
      const daysSinceStart = Math.floor((now - userStartDate) / (1000 * 60 * 60 * 24));
      const currentPromptIndex = daysSinceStart + 1;

      setPromptIndex(currentPromptIndex);

      const { data: prompt } = await supabase
        .from('prompts')
        .select('prompt_text')
        .eq('prompt_index', currentPromptIndex)
        .maybeSingle();

      if (prompt) {
        setTodayPrompt(prompt.prompt_text);
      } else {
        setTodayPrompt('draw');
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: submissions, error: submissionError } = await supabase
        .from('submissions')
        .select('id, image_url, submitted_at, user_id')
        .eq('user_id', uid)
        .eq('prompt_index', currentPromptIndex)
        .gte('submitted_at', startOfToday.toISOString())
        .limit(1);

      if (submissionError) throw submissionError;

      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid);

      setSubmissionCount(count || 0);

      if (submissions && submissions.length > 0) {
        await loadGallery(currentPromptIndex);
        setScreen('already-done');
      } else {
        setScreen('landing');
      }
    } catch (error) {
      console.error('Check status error:', error);
      setScreen('landing');
    }
  };

  const loadGallery = async (pIndex) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('id, image_url, stroke_data, submitted_at, user_id')
      .eq('prompt_index', pIndex)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    
    // Sort so user's drawing is first, rest maintain order
    const sortedData = data || [];
    const userDrawingIndex = sortedData.findIndex(d => d.user_id === userId);
    
    if (userDrawingIndex > 0) {
      const userDrawing = sortedData.splice(userDrawingIndex, 1)[0];
      sortedData.unshift(userDrawing);
    }
    
    setGallery(sortedData);
  } catch (error) {
    console.error('Gallery load error:', error);
    setGalleryState('error');
  }
};

  const handleStart = () => {
    if (screen === 'first-time') {
      if (typeof window !== 'undefined') {
        localStorage.setItem('inkling_seen_warning', 'true');
      }
      setScreen('drawing');
      setDrawingStartTime(Date.now());
      setTimeLeft(TIMER_DURATION);
      setTimeout(() => initCanvas(), 0);
      return;
    }
    
    if (typeof window !== 'undefined' && localStorage.getItem('inkling_seen_warning') !== 'true') {
      setScreen('first-time');
      return;
    }
    
    setScreen('drawing');
    setDrawingStartTime(Date.now());
    setTimeLeft(TIMER_DURATION);
    setTimeout(() => initCanvas(), 0);
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    const containerHeight = container ? container.clientHeight : window.innerHeight - 320;
    
    const availableWidth = window.innerWidth - 32;
    const availableHeight = Math.max(containerHeight - 20, 200);
    
    const size = Math.min(availableWidth, availableHeight, 600);
    
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F5DC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const startDrawing = (e) => {
    if (screen !== 'drawing') return;
    e.preventDefault();
    
    const pos = getPosition(e);
    setIsDrawing(true);
    setCurrentStroke([pos]);
    
    if (!firstStrokeTime) {
      setFirstStrokeTime(Date.now());
    }

    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawing || screen !== 'drawing') return;
    e.preventDefault();
    
    const pos = getPosition(e);
    setCurrentStroke(prev => [...prev, pos]);

    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = BRUSH_SIZE;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDrawing = (e) => {
    if (!isDrawing) return;
    if (e) e.preventDefault();
    
    setIsDrawing(false);
    if (currentStroke.length > 0) {
      setStrokes(prev => [...prev, {
        points: currentStroke,
        color: selectedColor,
        time: Date.now() - drawingStartTime
      }]);
    }
    setCurrentStroke([]);
  };

  const getPosition = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const calculateCoverage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    let markedPixels = 0;
    const totalPixels = pixels.length / 4;
    const bgR = 245, bgG = 245, bgB = 220;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      if (Math.abs(r - bgR) > 10 || Math.abs(g - bgG) > 10 || Math.abs(b - bgB) > 10) {
        markedPixels++;
      }
    }
    
    return markedPixels / totalPixels;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const coverage = calculateCoverage();
    const drawingTime = firstStrokeTime ? (Date.now() - firstStrokeTime) / 1000 : 0;

    if (coverage < MIN_COVERAGE) {
      setErrorMessage('blank');
      setScreen('error-validation');
      return;
    }

    if (drawingTime < MIN_TIME) {
      setErrorMessage('time');
      setScreen('error-validation');
      return;
    }

    await submitDrawing(coverage, drawingTime);
  };

  const handleAutoSubmit = async () => {
    const coverage = calculateCoverage();
    const drawingTime = firstStrokeTime ? (Date.now() - firstStrokeTime) / 1000 : 0;

    if (coverage < MIN_COVERAGE) {
      setErrorMessage('blank');
      setScreen('error-validation');
      setTimeLeft(TIMER_DURATION);
      setStrokes([]);
      setFirstStrokeTime(null);
      return;
    }

    await submitDrawing(coverage, drawingTime);
  };

  const submitDrawing = async (coverage, drawingTime) => {
    setIsSubmitting(true);
    setScreen('submitting');

    try {
      const canvas = canvasRef.current;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      const fileName = `${userId}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from('drawings')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('drawings')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('submissions')
        .insert({
          user_id: userId,
          prompt_index: promptIndex,
          image_url: publicUrl,
          stroke_data: { strokes },
          canvas_coverage: coverage,
          drawing_duration: Math.floor(drawingTime)
        });

      if (insertError) throw insertError;

      setLastSubmittedImage(publicUrl);
      setSubmissionCount(prev => prev + 1);
      await loadGallery(promptIndex);

      const dotInterval = setInterval(() => {
        setSubmittingDots(prev => prev === 3 ? 1 : prev + 1);
      }, 300);

      setTimeout(() => {
        clearInterval(dotInterval);
        document.body.style.transition = 'background-color 0.05s';
        document.body.style.backgroundColor = '#FFFFFF';
        
        setTimeout(() => {
          document.body.style.backgroundColor = '#F5F5DC';
          setScreen('congrats');
          document.body.style.transition = '';
        }, 200);
      }, 900);

    } catch (error) {
      console.error('Submit error:', error);
      setErrorMessage('network');
      setScreen('error-validation');
      setTimeLeft(TIMER_DURATION);
      setStrokes([]);
      setFirstStrokeTime(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    setStrokes([]);
    setCurrentStroke([]);
    setFirstStrokeTime(null);
    setTimeLeft(TIMER_DURATION);
    setScreen('drawing');
    setTimeout(() => initCanvas(), 0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (screen === 'loading') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', fontSize: '24px' }}>. . .</div>
      </div>
    );
  }

  if (screen === 'first-time') {
    return (
      <div style={{ height: '100vh', minHeight: '-webkit-fill-available', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'hidden', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <div style={{ maxWidth: '600px', width: '100%' }}>
          <div style={{ backgroundColor: '#000', color: '#fff', padding: '48px', marginBottom: '48px' }}>
            <p style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', lineHeight: '1.6', margin: '0 0 24px 0' }}>
              HI!
            </p>
            <p style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', lineHeight: '1.6', margin: '0 0 24px 0' }}>
              THIS IS AN EXPERIMENT. THINGS MIGHT BREAK!
            </p>
            <p style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', lineHeight: '1.6', margin: '0 0 24px 0' }}>
              BE NICE, DON'T OVERTHINK IT, AND HAVE SOME FUN!
            </p>
            <p style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', lineHeight: '1.6', margin: '0' }}>
              —ETIENNE
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              onClick={handleStart}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0'
              }}
            >
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 30H50M50 30L35 15M50 30L35 45" stroke="#0066FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'landing') {
    return (
      <div style={{ height: '100vh', minHeight: '-webkit-fill-available', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'hidden', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <div style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(50px, 12.5vw, 90px)', fontWeight: 'bold', margin: '0 0 16px 0', letterSpacing: '-2px' }}>INKLING</h1>
          <p style={{ fontSize: 'clamp(11px, 2.5vw, 14px)', textTransform: 'uppercase', margin: '0 0 60px 0', letterSpacing: '1px' }}>TINY ACTS OF DRAWING</p>
          <div style={{ marginBottom: '60px', fontSize: 'clamp(21px, 5vw, 27px)', lineHeight: '1.2' }}>
            <p style={{ margin: '0' }}>1 PROMPT</p>
            <p style={{ margin: '0' }}>1 MINUTE</p>
            <p style={{ margin: '0' }}>1 DRAWING</p>
            <p style={{ margin: '48px 0 0 0', fontWeight: 'bold' }}>DAILY</p>
          </div>
          <button
            onClick={handleStart}
            style={{
              backgroundColor: '#0066FF',
              color: '#fff',
              padding: '24px 40px',
              fontSize: 'clamp(21px, 5vw, 27px)',
              fontWeight: '500',
              border: 'none',
              borderRadius: '0',
              cursor: 'pointer',
              fontFamily: 'Helvetica, Arial, sans-serif',
              letterSpacing: '1px',
              display: 'inline-block'
            }}
          >
            START
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'submitting') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', fontSize: '48px' }}>{'.'.repeat(submittingDots)}</div>
      </div>
    );
  }

  if (screen === 'drawing') {
    return (
      <div
        style={{
          height: '100dvh',
          minHeight: '-webkit-fill-available',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F5F5DC',
          overflow: 'hidden',
          fontFamily: 'Helvetica, Arial, sans-serif',
          boxSizing: 'border-box',
          padding: '0'
        }}
      >
        <div style={{ flex: '1', minHeight: 0 }}></div>
        
        <h2
          style={{
            fontSize: 'clamp(28px, 6vw, 42px)',
            textAlign: 'center',
            margin: '12px 0',
            fontWeight: 'bold',
            flexShrink: 0
          }}
        >
          "{todayPrompt}"
        </h2>

        <div style={{ flex: '1', minHeight: 0 }}></div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0 16px' }}>
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
            style={{
              border: '2px solid #000',
              cursor: 'crosshair',
              touchAction: 'none',
              maxWidth: '100%',
              maxHeight: '60vh',
              aspectRatio: '1 / 1',
              width: 'auto',
              height: 'auto'
            }}
          />
        </div>

        <div style={{ flex: '0.5', minHeight: 0 }}></div>
        
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '0 16px', flexShrink: 0 }}>
          {COLORS.map(color => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                border: selectedColor === color ? '6px solid #666' : '2px solid #000',
                backgroundColor: color,
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0
              }}
            />
          ))}
        </div>

        <div style={{ flex: '1.5', minHeight: 0 }}></div>

        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ height: '2px', backgroundColor: '#000', width: '100%' }}></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', alignItems: 'stretch' }}>
            <div style={{ fontSize: 'clamp(20px, 4.5vw, 28px)', fontFamily: 'Helvetica, Arial, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
              {formatTime(timeLeft)}
            </div>
            
            <div style={{ backgroundColor: '#000', width: '2px' }}></div>
            
            <button
              onClick={handleSubmit}
              disabled={screen === 'submitting'}
              style={{
                backgroundColor: '#0066FF',
                color: '#fff',
                fontSize: 'clamp(14px, 3vw, 18px)',
                fontWeight: '500',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Helvetica, Arial, sans-serif',
                padding: '16px 0'
              }}
            >
              SUBMIT
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'error-validation') {
    return (
      <div 
        onClick={handleRetry}
        style={{ 
          minHeight: '100vh', 
          backgroundColor: '#F5F5DC', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '20px', 
          fontFamily: 'Helvetica, Arial, sans-serif',
          cursor: 'pointer'
        }}
      >
        <div style={{ 
          backgroundColor: '#000', 
          color: '#fff', 
          padding: '112px 48px 140px 48px', 
          maxWidth: '600px', 
          width: '100%',
          position: 'relative'
        }}>
          <p style={{ fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: '1.4', margin: '0 0 32px 0', fontWeight: '500', textAlign: 'left' }}>
            YOU CAN DO IT!
          </p>
          <p style={{ fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: '1.4', margin: '0 0 40px 0', fontWeight: '500', textAlign: 'left' }}>
            DRAW SOMETHING—ANYTHING!
          </p>
          <p style={{ fontSize: 'clamp(12px, 2.5vw, 16px)', lineHeight: '1.4', margin: 0, fontWeight: '400', textAlign: 'left' }}>
            (YOU CAN'T JUST SUBMIT AN EMPTY CANVAS)
          </p>
          
          <div style={{ position: 'absolute', bottom: '32px', left: '32px' }}>
            <svg width="165" height="83" viewBox="0 0 165 83" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 41.5H137.5M137.5 41.5L110 27.5M137.5 41.5L110 55.5" stroke="#0066FF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'congrats') {
    return (
      <div 
        onClick={() => setScreen('gallery')}
        style={{ 
          minHeight: '100vh', 
          backgroundColor: '#F5F5DC', 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '40px 20px', 
          fontFamily: 'Helvetica, Arial, sans-serif',
          cursor: 'pointer',
          position: 'relative'
        }}
      >
        <h1 style={{ fontSize: 'clamp(48px, 10vw, 72px)', fontWeight: 'bold', margin: '0 0 60px 0', textAlign: 'center' }}>
          CONGRATS!
        </h1>
        
        <div style={{ marginBottom: '40px', maxWidth: '400px', width: '100%', aspectRatio: '1/1' }}>
          {lastSubmittedImage && (
            <img
              src={lastSubmittedImage}
              alt="Your drawing"
              style={{
                border: '2px solid #000',
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          )}
        </div>
        
        <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', textAlign: 'center', margin: '0 0 60px 0', lineHeight: '1.4' }}>
          YOU'VE COMPLETED<br />
          <strong style={{ fontSize: 'clamp(36px, 8vw, 56px)' }}>{submissionCount}</strong><br />
          DRAWING{submissionCount !== 1 ? 'S' : ''} SO FAR.
        </p>
        
        <div style={{ position: 'absolute', bottom: '40px' }}>
          <svg width="165" height="83" viewBox="0 0 165 83" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 41.5H137.5M137.5 41.5L110 27.5M137.5 41.5L110 55.5" stroke="#0066FF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    );
  }

  if (screen === 'already-done') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '18px', marginBottom: '16px' }}>ALL DONE FOR TODAY.</p>
          <p style={{ marginBottom: '32px' }}>COME BACK TOMORROW!</p>
          <p style={{ fontSize: '32px', fontFamily: 'monospace', marginBottom: '32px' }}>{countdown || getTimeUntilMidnight()}</p>
          <button
            onClick={() => setScreen('gallery')}
            style={{
              backgroundColor: '#0066FF',
              color: '#fff',
              padding: '8px 24px',
              fontSize: '16px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Helvetica, Arial, sans-serif'
            }}
          >
            BACK TO GALLERY
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'gallery') {
  if (galleryState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', padding: '40px 20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <h1 style={{ fontSize: 'clamp(48px, 10vw, 72px)', fontWeight: 'bold', margin: '0 0 16px 0', textAlign: 'center' }}>
          GALLERY
        </h1>
        <p style={{ fontSize: 'clamp(16px, 3vw, 20px)', textAlign: 'center', margin: '0 0 60px 0' }}>
          {formatDate()}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
          <div style={{ fontSize: '48px', letterSpacing: '8px' }}>. . .</div>
        </div>
      </div>
    );
  }

  if (galleryState === 'error') {
    return (
      <div 
        onClick={() => {
          setGalleryState('loading');
          loadGallery(promptIndex);
        }}
        style={{ 
          minHeight: '100vh', 
          backgroundColor: '#F5F5DC', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '20px', 
          fontFamily: 'Helvetica, Arial, sans-serif',
          cursor: 'pointer'
        }}
      >
        <div>
          <h1 style={{ fontSize: 'clamp(48px, 10vw, 72px)', fontWeight: 'bold', margin: '0 0 16px 0', textAlign: 'center', position: 'absolute', top: '40px', left: 0, right: 0 }}>
            GALLERY
          </h1>
          <p style={{ fontSize: 'clamp(16px, 3vw, 20px)', textAlign: 'center', position: 'absolute', top: '140px', left: 0, right: 0 }}>
            {formatDate()}
          </p>
        </div>
        
        <div style={{ 
          backgroundColor: '#000', 
          color: '#fff', 
          padding: '60px 48px', 
          maxWidth: '600px', 
          width: '100%',
          position: 'relative'
        }}>
          <p style={{ fontSize: 'clamp(20px, 4vw, 24px)', lineHeight: '1.4', margin: '0 0 24px 0', fontWeight: '500', textAlign: 'left' }}>
            COULDN'T LOAD GALLERY.
          </p>
          <p style={{ fontSize: 'clamp(20px, 4vw, 24px)', lineHeight: '1.4', margin: 0, fontWeight: '500', textAlign: 'left' }}>
            CHECK YOUR CONNECTION AND TRY AGAIN.
          </p>
          
          <div style={{ position: 'absolute', bottom: '32px', left: '32px' }}>
            <svg width="165" height="83" viewBox="0 0 165 83" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 41.5H137.5M137.5 41.5L110 27.5M137.5 41.5L110 55.5" stroke="#0066FF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (galleryState === 'first') {
    const userDrawing = gallery[0];
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', padding: '40px 20px', fontFamily: 'Helvetica, Arial, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={{ fontSize: 'clamp(48px, 10vw, 72px)', fontWeight: 'bold', margin: '0 0 16px 0', textAlign: 'center' }}>
          GALLERY
        </h1>
        <p style={{ fontSize: 'clamp(16px, 3vw, 20px)', textAlign: 'center', margin: '0 0 60px 0' }}>
          {formatDate()}
        </p>
        
        <div style={{ marginBottom: '40px', maxWidth: '400px', width: '100%', aspectRatio: '1/1' }}>
          <GalleryDrawing drawing={userDrawing} index={0} isUserDrawing={true} />
        </div>
        
        <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', textAlign: 'center', margin: '0 0 80px 0', lineHeight: '1.4', maxWidth: '500px' }}>
          YOU'RE FIRST TODAY!<br />
          COME BACK IN A BIT TO SEE SOME OTHER CREATIONS.
        </p>
        
        <div 
          onClick={() => setScreen('already-done')}
          style={{ cursor: 'pointer', marginTop: 'auto' }}
        >
          <svg width="165" height="83" viewBox="0 0 165 83" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 41.5H137.5M137.5 41.5L110 27.5M137.5 41.5L110 55.5" stroke="#0066FF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    );
  }

// Calculate gallery container dimensions based on drawing positions
const positions = gallery.map((_, index) => getRandomPosition(index, gallery.length));

// User's drawing is always at index 0
const userDrawingPos = positions[0];

// Find the bounds of all drawings relative to their original positions
const minX = Math.min(...positions.map(p => p.left));
const maxX = Math.max(...positions.map(p => p.left));
const minY = Math.min(...positions.map(p => p.top));
const maxY = Math.max(...positions.map(p => p.top));

// Calculate how much we need to offset to position user's drawing near top
const topMargin = 250; // Space for header + small gap
const userDrawingOffsetY = topMargin - (userDrawingPos.top - minY);

// Calculate container dimensions with smaller padding
const padding = 200; // Reduced from 400
const drawingSize = 350;
const containerWidth = (maxX - minX) + (padding * 2) + drawingSize;
const containerHeight = (maxY - minY) + topMargin + padding + drawingSize; // Start from top, add padding at bottom only

// Calculate final positions
const finalPositions = positions.map(pos => ({
  left: pos.left - minX + padding + (drawingSize / 2), // Center the drawing on its position
  top: pos.top - minY + userDrawingOffsetY,
  rotation: pos.rotation
}));

const userFinalPos = finalPositions[0];

console.log('User drawing position:', userDrawingPos);
console.log('Min/Max X:', minX, maxX);
console.log('Min/Max Y:', minY, maxY);
console.log('Container size:', containerWidth, containerHeight);
console.log('userDrawingOffsetY:', userDrawingOffsetY);
console.log('User final position:', userFinalPos);

return (
  <div style={{ height: '100vh', backgroundColor: '#F5F5DC', fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    {/* Header - scrolls with content */}
    <div style={{ padding: '40px 20px 20px', flexShrink: 0 }}>
      <h1 style={{ fontSize: 'clamp(48px, 10vw, 72px)', fontWeight: 'bold', margin: '0 0 16px 0', textAlign: 'center' }}>
        GALLERY
      </h1>
      <p style={{ fontSize: 'clamp(16px, 3vw, 20px)', textAlign: 'center', margin: 0 }}>
        {formatDate()}
      </p>
    </div>
    
    {/* Scrollable gallery container */}
    <div 
      data-gallery-container
      ref={(el) => {
        if (el && galleryState === 'loaded') {
          // Center user's drawing horizontally, start at top vertically
          const scrollX = userFinalPos.left - (window.innerWidth / 2) + 175; // 175 = half of drawing width (350/2)
          const scrollY = 0;
          el.scrollTo(scrollX, scrollY);
        }
      }}
      style={{ 
        flex: 1,
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <div style={{ 
        position: 'relative', 
        width: `${containerWidth}px`, 
        height: `${containerHeight}px`,
        minHeight: '100%'
      }}>
        {gallery.map((item, index) => {
          const pos = finalPositions[index];
          const isUserDrawing = index === 0;
          
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                width: '350px',
                height: '350px'
              }}
            >
              <GalleryDrawing 
                drawing={item} 
                index={index}
                isUserDrawing={isUserDrawing}
              />
            </div>
          );
        })}
      </div>
    </div>
    
    {/* Fixed back button */}
    <div 
      onClick={() => setScreen('already-done')}
      style={{ 
        position: 'fixed', 
        bottom: '40px', 
        left: '50%', 
        transform: 'translateX(-50%)',
        cursor: 'pointer',
        zIndex: 20
      }}
    >
      <svg width="165" height="83" viewBox="0 0 165 83" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 41.5H137.5M137.5 41.5L110 27.5M137.5 41.5L110 55.5" stroke="#0066FF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  </div>
  );
}

return null;
}