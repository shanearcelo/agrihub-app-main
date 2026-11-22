# AgriHub

AgriHub is an Expo / React Native marketplace using Supabase Auth, PostgreSQL,
Storage, and Realtime.

## Supabase setup

1. Create a Supabase project and copy its project URL and publishable (or legacy
   anon) key into `.env.local`:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-project-publishable-key
   ```

   `.env.example` contains these variable names. Never use a service-role key in
   the mobile app.

2. Run [`supabase/migrations/20261117000000_agrihub_supabase.sql`](./supabase/migrations/20261117000000_agrihub_supabase.sql)
   in the Supabase SQL Editor. This is a **destructive AgriHub reset-and-rebuild
   script**: it drops the app's tables and functions, resets the AgriHub schema
   data, then recreates tables, the Auth profile trigger, RLS policies, Storage
   buckets/policies, order/payment RPCs, and Realtime publication membership.
   Back up first: it deletes AgriHub profiles and marketplace/order/payment/chat
   data. It preserves `auth.users` and existing Storage objects, but profile
   fields not held in Auth metadata must be restored separately. Empty the six
   AgriHub Storage buckets using Supabase Storage before running if their files
   should also be removed; Storage objects must be managed through the Storage
   API/dashboard rather than by deleting rows in SQL.

3. Apply the remaining files in [`supabase/migrations/`](./supabase/migrations/)
   in timestamp order after the reset-and-rebuild migration. These migrations
   update stock, seller settings, and RPC behavior without repeating the
   destructive reset.

4. Apply [`supabase/admin_portal_upgrades.sql`](./supabase/admin_portal_upgrades.sql)
   after the timestamped migrations. It adds admin user suspension, moderation
   policies, and the admin-only account, payment, and order RPCs.

5. Configure Google under Supabase **Authentication → Sign-in / Providers →
   Google** with the Google OAuth client ID and secret. Add the app callback
   URLs to Supabase **Authentication → URL Configuration**; do not put Google
   OAuth client credentials in the app environment.

6. Install dependencies and start Expo:

   ```bash
   npm install
   npx expo start
   ```

## Data migration notes

The migration creates the Supabase schema but does not copy Firebase Auth users,
Firestore records, or Storage objects. Import those separately, preserving each
user UUID where possible so profile relationships and Storage ownership paths
remain consistent. Firebase passwords cannot be transferred as plaintext;
choose an Auth-user import/password-reset strategy before cutover.

## Admin account setup

The designated admin email is **`admin@adssu.edu.ph`**. There is no default
password in the app. Admin accounts cannot be created through the public
AgriHub sign-up form.

1. In Supabase Dashboard, open **Authentication → Users** and create or invite
   `admin@adssu.edu.ph`. Set its password there or use the invitation flow.
2. Run the AgriHub migration. Its Auth trigger creates the matching profile and
   assigns the `admin` role based on this exact email. Existing Auth users are
   also backfilled when the migration runs.
3. If the Auth user already exists but the profile has the wrong role, a
   project owner can correct it in the Supabase SQL Editor:

   ```sql
   update public.profiles p
   set role = 'admin',
       is_verified = true,
       verification_status = 'verified'
   from auth.users u
   where p.id = u.id
     and lower(u.email) = 'admin@adssu.edu.ph';
   ```

   This is a privileged recovery step; never expose a service-role key or allow
   clients to assign their own role. To use a different admin email, update the
   designated email consistently in the Auth trigger and app auth screens.

## Validation

```bash
npx expo lint
npx tsc --noEmit
```
