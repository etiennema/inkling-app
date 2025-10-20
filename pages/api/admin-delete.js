import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use the non-public one
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { submissionId, imageUrl, password } = req.body;

  // Check admin password
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // Extract filename from URL
    const filename = imageUrl.split('/drawings/')[1]?.split('?')[0];

    // Delete from storage
    if (filename) {
      await supabaseAdmin.storage
        .from('drawings')
        .remove([filename]);
    }

    // Delete from database
    const { error } = await supabaseAdmin
      .from('submissions')
      .delete()
      .eq('id', submissionId);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: error.message });
  }
}