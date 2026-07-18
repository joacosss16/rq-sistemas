import { createClient } from '@supabase/supabase-js';

// La anon key es pública por diseño: la seguridad real la da RLS en la base.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oslemwzocyzdoivujbpv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zbGVtd3pvY3l6ZG9pdnVqYnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMjM0ODMsImV4cCI6MjA5OTg5OTQ4M30.LXrlZwovgZCjBh0FDIPSfkGcRbwqjbw1ISk7SWPPxvk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
