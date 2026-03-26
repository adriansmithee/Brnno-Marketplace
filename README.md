# DetailFlow Web App Starter

This folder now has a working web app starter:

- `web/index.html` - app shell and screens.
- `web/styles.css` - app styling.
- `web/js/main.js` - booking, live job, garage, referral logic.
- `web/js/data.js` - Supabase/local data adapter layer.
- `web/js/storage.js` - persistent local data storage.
- `web/js/config.js` - Supabase toggle and keys.
- `supabase/03_marketplace_mvp.sql` - database schema for customers, vehicles, detailers, bookings, chat, tracking, garage, and referrals.
- `supabase/04_marketplace_webapp_support.sql` - web app compatibility migration.

## Run the web app

Open `web/index.html` directly in your browser.

If you prefer a local server:

```bash
cd "/Users/adriansmithee/Downloads/brnno.html"
python3 -m http.server 8080
```

Then visit `http://localhost:8080/web/index.html`.

## Current behavior

- Tries `Supabase mode` first when env keys are set.
- Auto-falls back to `Local mode` if Supabase is unavailable.
- Booking creates real records in local app data.
- Live job progress updates from booking start time.
- Chat messages persist per booking.
- Garage stores cars and supports "Book again".
- Referral code is generated and shown per customer.

## Supabase mode

1. Keep `web/js/config.js` with `enableSupabase: true`.
2. Add Supabase env vars in Netlify:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Redeploy; app will connect automatically.

## Netlify deployment

1. Push this folder to GitHub.
2. In Netlify, create a new site from that repo.
3. Netlify reads `netlify.toml` and publishes `web/`.
4. In Netlify Site Settings -> Environment variables, add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Trigger a redeploy.

At deploy time, Netlify generates `web/env.js` with those values.

## Set up Supabase schema

1. Open Supabase dashboard -> SQL Editor.
2. Run your existing SQL scripts first.
3. Run `supabase/03_marketplace_mvp.sql`.
4. Run `supabase/04_marketplace_webapp_support.sql`.

## What to connect next

1. **Auth**: Supabase Auth (Google + Apple + SMS OTP).
2. **Address autocomplete**: Radar or Google Places.
3. **VIN API**: NHTSA first, then paid provider later.
4. **Realtime**: use `booking_messages` and `booking_tracking` tables for chat + live map.
5. **Payments**: Stripe + Stripe Connect for split payouts to detailers.

