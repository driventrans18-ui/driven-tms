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

### Which anon key to use

In Supabase → Project Settings → API, there are two tabs: "Publishable and secret" and "Legacy anon, service_role". **Use the publishable key** (`sb_publishable_…`). The legacy JWT key may be disabled on newer projects and will return "Invalid API key" even though it looks valid.

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

## Adding the Document Scanner plugin in Xcode (one-time)

The native iOS VNDocumentCameraViewController wrapper lives in
`ios-plugins/DocScan/`. After running `npx cap add ios` the first time,
drag these two files into the `App` group in Xcode's Project Navigator:

- `ios-plugins/DocScan/DocScanPlugin.swift`
- `ios-plugins/DocScan/DocScanPlugin.m`

When Xcode prompts, check **"Copy items if needed"** and add them to the
`App` target. Then archive normally — the "Scan Rate Con (multi-page)"
button in the app will call into the native scanner.

## Native capabilities (iOS Info.plist keys)

Xcode will prompt to add these; paste the purpose strings so iOS approves the prompts:

- `NSCameraUsageDescription` — "Driven Driver uses the camera to capture proof-of-delivery photos."
- `NSPhotoLibraryAddUsageDescription` — "Driven Driver saves captured delivery photos to the load record."
- `NSLocationWhenInUseUsageDescription` — "Driven Driver records a check-in with your location when you tap Check In."

### Expose BOL photos in the iPhone Files app

When the driver taps "Capture POD", the photo is both uploaded to Supabase
and mirrored into the app's Documents folder. Add these Boolean keys to
Info.plist so the folder appears under "On My iPhone → Driven Driver" in
the Files app:

- `UIFileSharingEnabled` = `YES`
- `LSSupportsOpeningDocumentsInPlace` = `YES`

Captured files land at `Documents/BOLs/<load-number>/bol-<timestamp>.jpg`.
Uploads from Files ("From Files" / "Upload BOL" buttons) accept any image
or PDF picked by the iOS document picker.

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
