function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const config = {
  botToken: requireEnv('BOT_TOKEN'),
  botUsername: process.env.BOT_USERNAME || null,
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  adminIds: (process.env.ADMIN_TELEGRAM_ID || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),
};
