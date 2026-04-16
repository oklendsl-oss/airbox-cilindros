import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pwybaiuuxuyocbfiubfb.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eWJhaXV1eHV5b2NiZml1YmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzA2NDEsImV4cCI6MjA5MTkwNjY0MX0.bdyI1k9OUkWDrPNn-nQszAnh986p32asXB-7KJnyW88'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})
