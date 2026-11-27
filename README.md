## Relay Web App
# What is Relay?
Relay is a publishing and findability app for small and medium firms. The problem this would solve is there is no sanctioned path from a working draft to a correctly named, correctly placed, correctly permissioned published document which is the root cause. The main problem is that resources take a long time to be acquired in the current system because of the lack of a unified system. The solution is one path into a published folder. The firm's own rules set the name, folder, and audience. AI pre-fills the work. A human always approves. Nobody writes directly to a published folder, manangment included. This folder only fills through the approval process.

# How Setup Relay
1. `npm install`

2. Copy the env template:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   (macOS/Linux: `cp .env.example .env.local`)

   Fill in `.env.local` with values from the Supabase dashboard.

3. `npm run dev`