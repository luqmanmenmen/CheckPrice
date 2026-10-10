import { createClient } from '@supabase/supabase-js';

// Pakai nama tanpa NEXT_PUBLIC_ agar bisa disimpan sebagai Secret di Vercel
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
