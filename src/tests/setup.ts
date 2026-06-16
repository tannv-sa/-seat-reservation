// Thiết lập env vars cho tests — không cần credentials thật
process.env.NEXT_PUBLIC_SUPABASE_URL      = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY     = 'test-service-role-key'
process.env.STRIPE_SECRET_KEY             = 'sk_test_dummy'
process.env.STRIPE_WEBHOOK_SECRET         = 'whsec_test_dummy'
process.env.NEXT_PUBLIC_APP_URL           = 'http://localhost:3000'
process.env.CRON_SECRET                   = 'test-cron-secret'
