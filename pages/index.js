import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const COLORS = ['#000000', '#0066FF', '#FF0000', '#00CC00', '#FFCC00'];
const BRUSH_SIZE = 5;
const TIMER_DURATION = 60;
const MIN_COVERAGE = 0.3;
const MIN_TIME = 3;

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
      return () => clearInterval(timerRef.current);
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

  const initializeApp = async () => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let uid = localStorage.getItem('inkling_user_id');
      
      if (!uid) {
        const fingerprint = generateFingerprint();
        const { data, error } = await supabase
          .from('users')
          .insert({ timezone, id: fingerprint })
          .select()
          .single();
        
        if (error) throw error;
        uid = data.id;
        localStorage.setItem('inkling_user_id', uid);

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
  // Generate a proper random UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

  const checkTodayStatus = async (uid, timezone) => {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', uid)
        .single();

      const userStartDate = new Date(userData.created_at);
      const now = new Date();
      const daysSinceStart = Math.floor((now - userStartDate) / (1000 * 60 * 60 * 24));
      const currentPromptIndex = daysSinceStart + 1;

      setPromptIndex(currentPromptIndex);

      const { data: prompt } = await supabase
        .from('prompts')
        .select('prompt_text')
        .eq('prompt_index', currentPromptIndex)
        .single();

      if (prompt) {
        setTodayPrompt(prompt.prompt_text);
      } else {
        setTodayPrompt('draw');
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: todaySubmission } = await supabase
        .from('submissions')
        .select('*')
        .eq('user_id', uid)
        .eq('prompt_index', currentPromptIndex)
        .gte('submitted_at', startOfToday.toISOString())
        .single();

      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid);

      setSubmissionCount(count || 0);

      if (todaySubmission) {
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
        .select('id, image_url, stroke_data, submitted_at')
        .eq('prompt_index', pIndex)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setGallery(data || []);
    } catch (error) {
      console.error('Gallery load error:', error);
    }
  };

  const handleStart = () => {
  if (screen === 'first-time') {
    localStorage.setItem('inkling_seen_warning', 'true');
    setScreen('drawing');
    setDrawingStartTime(Date.now());
    setTimeLeft(TIMER_DURATION);
    setTimeout(() => initCanvas(), 0);
    return;
  }
  
  if (localStorage.getItem('inkling_seen_warning') !== 'true') {
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

  // Get the canvas container's actual available height
  const container = canvas.parentElement;
  const containerHeight = container ? container.clientHeight : window.innerHeight - 320;
  
  // Calculate available dimensions
  const availableWidth = window.innerWidth - 32;
  const availableHeight = Math.max(containerHeight - 20, 200); // At least 200px, with 20px margin
  
  // Make canvas fit within both constraints, keeping it square
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
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    let markedPixels = 0;
    const bgR = 245, bgG = 245, bgB = 220;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      if (Math.abs(r - bgR) > 10 || Math.abs(g - bgG) > 10 || Math.abs(b - bgB) > 10) {
        markedPixels++;
      }
    }
    
    return (markedPixels / (pixels.length / 4)) * 100;
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

      setSubmissionCount(prev => prev + 1);
      await loadGallery(promptIndex);
      
        setSubmissionCount(prev => prev + 1);
        await loadGallery(promptIndex);

        // Animate dots
        const dotInterval = setInterval(() => {
          setSubmittingDots(prev => prev === 3 ? 1 : prev + 1);
        }, 300);

        // Wait 900ms then flash and transition
        setTimeout(() => {
          clearInterval(dotInterval);
          document.body.style.transition = 'background-color 0.05s';
          document.body.style.backgroundColor = '#FFFFFF';
          
          setTimeout(() => {
            document.body.style.backgroundColor = '#F5F5DC';
            setScreen('congrats');
            
            setTimeout(() => {
              setScreen('gallery');
              document.body.style.transition = '';
            }, 2000);
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

  if (screen === 'drawing' || screen === 'submitting') {
    return (
      <div style={{ height: '100vh', minHeight: '-webkit-fill-available', backgroundColor: '#F5F5DC', display: 'flex', flexDirection: 'column', padding: '16px 16px 0 16px', fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'hidden', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <h2 style={{ fontSize: 'clamp(28px, 6vw, 40px)', textAlign: 'center', margin: '0 0 16px 0', fontWeight: 'bold', textTransform: 'uppercase', flexShrink: 0 }}>"{todayPrompt}"</h2>

        <div style={{ height: '55vh', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
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
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto'
            }}
          />
        </div>

        <div style={{ borderBottom: '2px solid #000', paddingBottom: '12px', margin: '0 -16px', paddingLeft: '16px', paddingRight: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: selectedColor === color ? '4.2px solid #666' : '2px solid #000',
                  backgroundColor: color,
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', alignItems: 'stretch', flexShrink: 0, margin: '0 -16px', paddingBottom: '16px' }}>
          <div style={{ fontSize: 'clamp(20px, 4.5vw, 28px)', fontFamily: 'Helvetica, Arial, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
            {formatTime(timeLeft)}
          </div>
          
          <div style={{ backgroundColor: '#000', width: '2px' }}></div>
          
          <button
            onClick={handleSubmit}
            disabled={screen === 'submitting'}
            style={{
              backgroundColor: screen === 'submitting' ? '#F5F5DC' : '#0066FF',
              color: screen === 'submitting' ? '#000' : '#fff',
              fontSize: 'clamp(14px, 3vw, 18px)',
              fontWeight: '500',
              border: 'none',
              cursor: screen === 'submitting' ? 'default' : 'pointer',
              fontFamily: 'Helvetica, Arial, sans-serif',
              padding: '16px 0'
            }}
          >
            {screen === 'submitting' ? '.'.repeat(submittingDots) : 'SUBMIT'}
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'error-validation') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '400px', width: '100%' }}>
          <div style={{ backgroundColor: '#000', color: '#fff', padding: '32px', marginBottom: '32px' }}>
            <p style={{ fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
              {errorMessage === 'blank' && "OOPS. THERE'S NO BLANK CANVASES ALLOWED. YOU'RE ALMOST THERE!"}
              {errorMessage === 'time' && "YOU CAN DO IT! KEEP GOING! FOLLOW ANY THEME."}
              {errorMessage === 'network' && "OOF. PLEASE TRY AGAIN. IF YOU'RE HAVING AN ISSUE, PLEASE LET US KNOW."}
            </p>
          </div>
          <button
            onClick={handleRetry}
            style={{
              backgroundColor: '#0066FF',
              color: '#fff',
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              fontFamily: 'Helvetica, Arial, sans-serif'
            }}
          >
            BACK TO DRAWING
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'congrats') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '16px' }}>CONGRATS!</h2>
          <p style={{ fontSize: '18px', lineHeight: '1.5' }}>
            YOU'VE COMPLETED<br />
            {submissionCount} DRAWING{submissionCount !== 1 ? 'S' : ''} SO FAR.
          </p>
        </div>
      </div>
    );
  }

  if (screen === 'gallery') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F5F5DC', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 'bold', margin: '0 0 8px 0' }}>GALLERY</h2>
            <p style={{ fontSize: '14px', margin: 0 }}>
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </p>
          </div>

          {gallery.length === 0 ? (
            <div style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
              <p style={{ marginBottom: '16px' }}>YOU'RE FIRST TODAY!</p>
              <p>COME BACK LATER TO SEE SOME OTHER CREATIONS.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {gallery.map(item => (
                <div key={item.id} style={{ border: '2px solid #000', padding: '8px', backgroundColor: '#fff', aspectRatio: '1' }}>
                  <img 
                    src={item.image_url} 
                    alt="Drawing"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <button
              onClick={() => setScreen('already-done')}
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
              BACK
            </button>
          </div>
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

  return null;

  
}