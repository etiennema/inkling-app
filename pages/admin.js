import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ADMIN_PASSWORD = 'inkling2025';

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [milestoneEmails, setMilestoneEmails] = useState([]);


useEffect(() => {
    if (isAuthenticated) {
      loadSubmissions();
      loadMilestoneEmails(); // ADD THIS LINE
    }
  }, [isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect password');
    }
  };

  const loadSubmissions = async () => {
  setLoading(true);
  try {
    // First get all submissions
    const { data: submissionsData, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (submissionsError) throw submissionsError;

    // Then get all prompts
    const { data: promptsData, error: promptsError } = await supabase
      .from('prompts')
      .select('prompt_index, prompt_text');

    if (promptsError) throw promptsError;

    // Create a map of prompt_index to prompt_text
    const promptMap = {};
    promptsData.forEach(p => {
      promptMap[p.prompt_index] = p.prompt_text;
    });

    // Add prompt_text to each submission
    const enrichedSubmissions = submissionsData.map(sub => ({
      ...sub,
      prompt_text: promptMap[sub.prompt_index] || 'Unknown'
    }));

    setSubmissions(enrichedSubmissions);
  } catch (err) {
    console.error('Error loading submissions:', err);
    setError('Failed to load submissions');
  } finally {
    setLoading(false);
  }
};

const loadMilestoneEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('milestone_emails')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setMilestoneEmails(data || []);
    } catch (err) {
      console.error('Error loading milestone emails:', err);
    }
  };

  const exportDrawingVideo = async (submission) => {
  setExportingId(submission.id);
  
  try {
    // Create a temporary canvas for recording
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    // Set up canvas
    ctx.fillStyle = '#F5F5DC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Start recording
    const stream = canvas.captureStream(60);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000
    });
    
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `inkling-${submission.id}.webm`;
      a.click();
      
      setExportingId(null);
      alert('Video exported! Convert to MP4 at cloudconvert.com or with HandBrake.');
    };
    
    mediaRecorder.start();
    
    // Animate the drawing
    const strokes = submission.stroke_data?.strokes || [];
    const scale = 1080 / 350;
    
    for (const stroke of strokes) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 5 * scale;
      
      for (let i = 0; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        const x = point.x * scale;
        const y = point.y * scale;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // Hold final frame for 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    mediaRecorder.stop();
    
  } catch (err) {
    console.error('Export failed:', err);
    alert(`Failed to export video: ${err.message}`);
    setExportingId(null);
  }
};

const handleDelete = async (submission) => {
  // existing code continues...
  
  const handleDelete = async (submission) => {
  if (!confirm(`Delete this submission: "${submission.prompt_text}" (Prompt #${submission.prompt_index})?`)) {
    return;
  }

  setDeletingId(submission.id);
  try {
    // Extract filename from URL
    const url = submission.image_url;
    const filename = url.split('/drawings/')[1]?.split('?')[0];

    console.log('Attempting to delete:', filename);

    // Try to delete from storage (don't fail if file doesn't exist)
    if (filename) {
      const { error: storageError } = await supabase.storage
        .from('drawings')
        .remove([filename]);

      if (storageError) {
        console.warn('Storage deletion warning (file may not exist):', storageError);
        // Don't throw - continue to delete from database anyway
      } else {
        console.log('Storage file deleted successfully');
      }
    }

    // Delete from database - this is the critical one
    const { error: dbError } = await supabase
      .from('submissions')
      .delete()
      .eq('id', submission.id);

    if (dbError) {
      console.error('Database deletion error:', dbError);
      throw dbError;
    }

    console.log('Database record deleted successfully');

    // Remove from local state
    setSubmissions(prev => prev.filter(s => s.id !== submission.id));
    alert('Submission deleted successfully');
  } catch (err) {
    console.error('Error deleting submission:', err);
    alert(`Failed to delete submission: ${err.message}`);
  } finally {
    setDeletingId(null);
  }
};

const exportDrawingVideo = async (submission) => {
  setDeletingId(submission.id); // Reuse this state for "busy" indicator
  
  try {
    // Create a temporary canvas for recording
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    // Set up canvas
    ctx.fillStyle = '#F5F5DC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Start recording
    const stream = canvas.captureStream(60); // 60fps
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecision: 5000000
    });
    
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `inkling-${submission.id}.webm`;
      a.click();
      
      setDeletingId(null);
      alert('Video exported! Convert to MP4 at cloudconvert.com or with HandBrake.');
    };
    
    mediaRecorder.start();
    
    // Animate the drawing
    const strokes = submission.stroke_data?.strokes || [];
    const scale = 1080 / 350; // Scale from canvas size to export size
    
    for (const stroke of strokes) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 5 * scale;
      
      for (let i = 0; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        const x = point.x * scale;
        const y = point.y * scale;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        
        // Small delay to control animation speed
        await new Promise(resolve => setTimeout(resolve, 10)); // Adjust speed here
      }
    }
    
    // Hold final frame for 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    mediaRecorder.stop();
    
  } catch (err) {
    console.error('Export failed:', err);
    alert(`Failed to export video: ${err.message}`);
    setDeletingId(null);
  }
};

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#F8F6F2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Helvetica, Arial, sans-serif',
        padding: '20px'
      }}>
        <div style={{ maxWidth: '400px', width: '100%' }}>
          <h1 style={{ 
            fontSize: '48px', 
            fontWeight: 'bold', 
            marginBottom: '40px',
            textAlign: 'center'
          }}>
            ADMIN
          </h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '16px',
                border: '2px solid #000',
                marginBottom: '16px',
                fontFamily: 'Helvetica, Arial, sans-serif',
                boxSizing: 'border-box'
              }}
            />
            {error && (
              <p style={{ color: 'red', marginBottom: '16px' }}>{error}</p>
            )}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '16px',
                backgroundColor: '#0066FF',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontWeight: '500'
              }}
            >
              LOGIN
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8F6F2',
      fontFamily: 'Helvetica, Arial, sans-serif',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '40px'
        }}>
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', margin: 0 }}>
            ADMIN
          </h1>
          <div>
            <button
              onClick={loadSubmissions}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                backgroundColor: '#0066FF',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                marginRight: '12px',
                fontFamily: 'Helvetica, Arial, sans-serif'
              }}
            >
              REFRESH
            </button>
            <button
              onClick={() => setIsAuthenticated(false)}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Helvetica, Arial, sans-serif'
              }}
            >
              LOGOUT
            </button>
          </div>
        </div>

        <p style={{ marginBottom: '40px', fontSize: '18px' }}>
          Total submissions: <strong>{submissions.length}</strong>
        </p>

        {/* Milestone Emails Section */}
        {milestoneEmails.length > 0 && (
          <div style={{ 
            marginBottom: '60px',
            padding: '24px',
            backgroundColor: '#fff',
            border: '3px solid #0066FF'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
              🎉 MILESTONE EMAILS ({milestoneEmails.length})
            </h2>
            {milestoneEmails.map(entry => (
              <div 
                key={entry.id}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  border: '1px solid #ddd',
                  backgroundColor: '#F8F6F2'
                }}
              >
                <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
                  {entry.email}
                </p>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}>
                  User: {entry.user_id.substring(0, 8)}... | Count: {entry.submission_count}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                  {formatDate(entry.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {loading ? (
  <p style={{ fontSize: '24px', textAlign: 'center' }}>Loading...</p>
) : (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '24px'
  }}>
    {submissions.map(submission => (
      <div
        key={submission.id}
        style={{
          border: '2px solid #000',
          padding: '16px',
          backgroundColor: submission.archived ? '#FFE6E6' : '#fff',
          opacity: submission.archived ? 0.6 : 1
        }}
      >
        <img
          src={submission.image_url}
          alt="Submission"
          style={{
            width: '100%',
            aspectRatio: '1/1',
            objectFit: 'cover',
            marginBottom: '12px',
            border: '1px solid #ddd'
          }}
        />
        <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
          <strong>"{submission.prompt_text}" (Prompt #{submission.prompt_index})</strong>
          {submission.archived && <span style={{ color: '#FF0000', marginLeft: '8px' }}>[ARCHIVED]</span>}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
          {formatDate(submission.submitted_at)}
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#666' }}>
          User: {submission.user_id.substring(0, 8)}...
        </p>
        
          <button
                  onClick={() => exportDrawingVideo(submission)}
                  disabled={exportingId === submission.id}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '14px',
                    backgroundColor: exportingId === submission.id ? '#ccc' : '#0066FF',
                    color: '#fff',
                    border: 'none',
                    cursor: exportingId === submission.id ? 'not-allowed' : 'pointer',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    fontWeight: '500',
                    marginBottom: '8px'
                  }}
                >
                  {exportingId === submission.id ? 'EXPORTING...' : 'EXPORT VIDEO'}
                </button>
        
        <button
          onClick={() => handleDelete(submission)}
          disabled={deletingId === submission.id}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '14px',
            backgroundColor: deletingId === submission.id ? '#ccc' : '#FF0000',
            color: '#fff',
            border: 'none',
            cursor: deletingId === submission.id ? 'not-allowed' : 'pointer',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: '500'
          }}
        >
          {deletingId === submission.id ? 'DELETING...' : 'DELETE'}
        </button>
      </div>
    ))}
  </div>
)}

{!loading && submissions.length === 0 && (
  <p style={{ textAlign: 'center', fontSize: '18px', marginTop: '60px' }}>
    No submissions yet.
  </p>
)}
      </div>
    </div>
  );
}