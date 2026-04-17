# Driven Driver (iOS, React + Capacitor)

Native iOS driver-mode app that shares the Supabase project used by the web TMS.
Five bottom tabs: Home, Loads, Brokers, Invoices, Profile.

## Prerequisites

- Node 18+ and npm
- macOS with Xcode 15+ and CocoaPods (`sudo gem install cocoapods`)
- An Apple developer account for TestFlight

## First-time setup (on your Mac)

```bash
cd ios-driver-app
cp .env.example .env   # if .env is missing; paste VITE_SUPABASE_URL + key
npm install
```

### One-time — apply the SQL migration

In the Supabase SQL Editor, paste and run:

- `../supabase/migrations/20260417200000_driver_app.sql`

It adds `drivers.user_id`, the `hos_events` table, and the `load_checkins` table, plus RLS policies.

### One-time — link your driver row to your auth user

In the web TMS, make sure a Driver row exists for you with `email` set to the same address you'll sign into the app with. The first sign-in auto-links that driver row via email.

## Run on the iOS simulator

```bash
npm run build
npx cap add ios          # only the first time
npx cap sync ios
npx cap open ios         # opens Xcode
```

In Xcode: pick an iPhone simulator → ⌘R.

## Deploy to TestFlight (your iPhone only)

1. In Xcode, set the Signing Team to your Apple developer team.
2. Bump the build number, Product → Archive.
3. In the Organizer, Distribute App → App Store Connect → Upload.
4. On App Store Connect, add yourself as an internal tester and the build will appear in TestFlight on your phone.

## Native capabilities (iOS Info.plist keys)

Xcode will prompt to add these; paste the purpose strings so iOS approves the prompts:

- `NSCameraUsageDescription` — "Driven Driver uses the camera to capture proof-of-delivery photos."
- `NSPhotoLibraryAddUsageDescription` — "Driven Driver saves captured delivery photos to the load record."
- `NSLocationWhenInUseUsageDescription` — "Driven Driver records a check-in with your location when you tap Check In."

## What's in the code

- `src/lib/supabase.ts` — shared Supabase client
- `src/lib/hos.ts` — 11-hour drive clock math
- `src/hooks/useAuth.ts` / `useDriver.ts` / `useHOS.ts`
- `src/screens/Home.tsx` — active load card, HOS timer, POD/check-in/delivered actions
- `src/screens/Loads.tsx` — assigned loads with tap-to-detail sheet
- `src/screens/Brokers.tsx` — search + tap-to-call
- `src/screens/Invoices.tsx` — delivered loads with create-invoice button
- `src/screens/Profile.tsx` — driver info + sign out
- `src/components/TabBar.tsx` — iOS-style bottom tab bar

## Notes / limits

- HOS is a simplified 11-hour drive-time clock, not a full DOT ELD. Off-duty/sleeper distinction is collapsed into "Off Duty" in the UI. Local notifications fire at 2h, 1h, 30m remaining once per session.
- Offline: the Home tab caches the active load in `localStorage`. Submitting a check-in/POD while offline will fail; we can add a queue if needed.
- Push notifications use the local notifications plugin (no server). If you want server-triggered pushes, wire in `@capacitor/push-notifications` with an APNS certificate later.
