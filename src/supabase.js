import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
});

let _settings = null;
let _fetchedAt = 0;

// settings are cached for 60s to avoid a query on every button tap
export async function getSettings() {
  if (_settings && Date.now() - _fetchedAt < 60_000) return _settings;
  const { data, error } = await supabase.from('settings').select('*');
  if (error) throw error;
  const map = {};
  for (const r of data || []) map[r.key] = r.value;
  _settings = map;
  _fetchedAt = Date.now();
  return map;
}
