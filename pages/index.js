import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const COLORS = ['#000000', '#0066FF', '#FF0000', '#00CC00', '#FFCC00'];
const BRUSH_SIZE = 5;
const TIMER_DURATION = 60;
const MIN_COVERAGE = 1.5;
const MIN_TIME = 10;

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
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);
  const [todayPrompt, setTodayPrompt] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [gallery, setGallery] = useState([]);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFirstTimeWarning, setShowFirstTimeWarning] = useState(false);
  const [countdown, setCountdown] = useState('');
  
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
        const fingerprint = await generateFingerprint();
        const { data, error } = await supabase
          .from('users')
          .insert({ timezone, id: fingerprint })
          .select()
          .single();
        
        if (error) throw error;
        uid = data.id;
        localStorage.setItem('inkling_user_id', uid);
        setShowFirstTimeWarning(true);
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
      setScreen('error');
    }
  };

  const generateFingerprint = async () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('fingerprint', 2, 2);
  const data = canvas.toDataURL();
  
  const fingerprint = `${data}-${navigator.userAgent}-${screen.width}x${screen.height}-${new Date().getTimezoneOffset()}`;
  
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Convert to proper UUID format
  const hex = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
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
        setTodayPrompt('Draw your day');
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
        setHasSubmittedToday(true);
        await loadGallery(currentPromptIndex);
        setScreen('already-done');
      } else {
        if (showFirstTimeWarning || localStorage.getItem('inkling_seen_warning') !== 'true') {
          setScreen('first-time');
        } else {
          setScreen('landing');
        }
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
      setShowFirstTimeWarning(false);
    }
    setScreen('drawing');
    setDrawingStartTime(Date.now());
    setTimeLeft(TIMER_DURATION);
    setTimeout(() => initCanvas(), 0);
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = Math.min(window.innerWidth - 40, 600);
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
    e.preventDefault();
    
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
      setScreen('congrats');
      
      setTimeout(() => {
        setScreen('gallery');
      }, 2000);

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
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl">. . .</div>
        </div>
      </div>
    );
  }

  if (screen === 'first-time') {
    return (
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-black text-white p-8 mb-8">
            <p className="text-sm leading-relaxed">
              IT IS RECOMMENDED THAT YOU DON'T DRAW ANYTHING YOU WOULDN'T WANT OTHER PEOPLE TO SEE.
              <br /><br />
              ALL DRAWINGS ARE PUBLIC. THERE IS NO PRIVACY.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="bg-blue-600 text-white px-8 py-3 text-lg font-medium hover:bg-blue-700 w-full"
          >
            I UNDERSTAND
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'landing') {
    return (
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-5xl font-bold mb-2">INKLING</h1>
          <p className="text-sm uppercase mb-8">TINY ACTS OF DRAWING</p>
          <div className="text-left mb-8 space-y-1">
            <p>1 PROMPT</p>
            <p>1 MINUTE</p>
            <p>1 DRAWING</p>
            <p className="mt-4">DAILY</p>
          </div>
          <button
            onClick={handleStart}
            className="bg-blue-600 text-white px-8 py-3 text-lg font-medium hover:bg-blue-700"
          >
            START
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'drawing' || screen === 'submitting') {
    return (
      <div className="min-h-screen bg-[#F5F5DC] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl text-center mb-4">"{todayPrompt}"</h2>
          
          <div className="relative">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={endDrawing}
              className="border-2 border-black mx-auto cursor-crosshair touch-none"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>

          <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
            <div className="flex gap-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: color,
                    borderColor: selectedColor === color ? '#666' : 'transparent',
                    borderWidth: selectedColor === color ? '3px' : '2px'
                  }}
                />
              ))}
            </div>
            
            <div className="text-xl font-mono">{formatTime(timeLeft)}</div>
            
            <button
              onClick={handleSubmit}
              disabled={screen === 'submitting'}
              className="bg-blue-600 text-white px-6 py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {screen === 'submitting' ? 'SUBMITTING...' : 'SUBMIT'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'error-validation') {
    return (
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-black text-white p-8 mb-8">
            <p className="text-sm leading-relaxed">
              {errorMessage === 'blank' && "OOPS. THERE'S NO BLANK CANVASES ALLOWED. YOU'RE ALMOST THERE!"}
              {errorMessage === 'time' && "YOU CAN DO IT! KEEP GOING! FOLLOW ANY THEME."}
              {errorMessage === 'network' && "OOF. PLEASE TRY AGAIN. IF YOU'RE HAVING AN ISSUE, PLEASE LET US KNOW."}
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="bg-blue-600 text-white px-8 py-3 text-lg font-medium hover:bg-blue-700 w-full"
          >
            BACK TO DRAWING
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'congrats') {
    return (
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-4">CONGRATS!</h2>
          <p className="text-lg">
            YOU'VE COMPLETED<br />
            {submissionCount} DRAWING{submissionCount !== 1 ? 'S' : ''} SO FAR.
          </p>
        </div>
      </div>
    );
  }

  if (screen === 'gallery') {
    return (
      <div className="min-h-screen bg-[#F5F5DC] p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold">GALLERY</h2>
            <p className="text-sm mt-2">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </p>
          </div>

          {gallery.length === 0 ? (
            <div className="text-center max-w-md mx-auto">
              <p className="mb-4">YOU'RE FIRST TODAY!</p>
              <p>COME BACK LATER TO SEE SOME OTHER CREATIONS.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {gallery.map(item => (
                <div key={item.id} className="border-2 border-black p-2 bg-white aspect-square">
                  <img 
                    src={item.image_url} 
                    alt="Drawing"
                    className="w-full h-full object-contain"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="text-center mt-8">
            <button
              onClick={() => setScreen('already-done')}
              className="bg-blue-600 text-white px-6 py-2 font-medium hover:bg-blue-700"
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
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg mb-4">ALL DONE FOR TODAY.</p>
          <p className="mb-8">COME BACK TOMORROW!</p>
          <p className="text-3xl font-mono mb-8">{countdown || getTimeUntilMidnight()}</p>
          <button
            onClick={() => setScreen('gallery')}
            className="bg-blue-600 text-white px-6 py-2 font-medium hover:bg-blue-700"
          >
            BACK TO GALLERY
          </button>
        </div>
      </div>
    );
  }

  return null;
}