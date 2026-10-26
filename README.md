# AUX

A head-to-head music comparison and ranking app — think Letterboxd/Beli, but for songs and albums. Users rank music by directly comparing it against other music they've logged, building a personal 0-10 ranked list plus community rankings, social feeds, and taste-compatibility scoring.

Built for CPSC 491 (Capstone) by Armaan Qazen, Shyan Khazeni, and Arian Gholamipour.

## Repo layout

This is a monorepo with two independent projects:

```
AUX/
├── mobile/   React Native (TypeScript) iOS app
└── server/   NestJS (TypeScript) API + Prisma/PostgreSQL
```

## Tech stack

- **Mobile:** React Native, TypeScript
- **Backend:** NestJS, TypeScript
- **Database:** PostgreSQL via Prisma
- **Music data:** Apple Music API (search, albums, artwork), with MusicBrainz + Cover Art Archive as the fallback catalog
- **iOS tooling:** Xcode, iOS Simulator, CocoaPods

## Getting started

New to the project or on a fresh machine? Follow [SETUP.md](SETUP.md) for a full step-by-step walkthrough. The summary below assumes prerequisites are already installed.

The app uses a shared server that's already online (https://aux-server-cqre.onrender.com, hosted on Render; database on AWS RDS). To run the app you only need the mobile steps.

### Prerequisites

- Node.js 22.13+ (use `nvm install 22` if your system Node is older)
- Xcode + CocoaPods (`brew install cocoapods`) and Watchman (`brew install watchman`) for iOS
- For server work only: PostgreSQL 16 (local via Homebrew, or Docker — see `server/docker-compose.yml`)

### Mobile (`/mobile`)

```bash
cd mobile
npm install
cd ios && pod install && cd ..
npm run ios
```

### Backend (`/server`, only for server work)

```bash
cd server
npm install --legacy-peer-deps
cp .env.example .env          # then set JWT_SECRET (openssl rand -hex 32)
docker compose up -d          # or run Postgres locally and match .env
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

The API starts on `http://localhost:3000`. `GET /health` returns `{ "status": "ok" }`. To point the app at it, set `USE_LOCAL_SERVER` to `true` in `mobile/src/api/config.ts` (don't commit that).

## Workflow

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching, commit, and PR conventions.

### Profile settings

Open your profile, then **Profile settings** to choose/remove a profile photo,
edit your bio, or permanently delete your account. Deletion requires your current
password and a final confirmation; the server deletes the user and cascades to
rankings, saved items, favorites, and friendships. Existing tokens for deleted
accounts are rejected on authenticated routes.

Photos are resized on-device and saved in the existing `avatarUrl` field as JPEG
or PNG data URLs (maximum 256 KiB). No new database migration or storage service
is needed for this feature. The API accepts JSON bodies up to 400 KiB.

The mobile app now depends on `react-native-image-picker`. Install iOS pods in
`mobile/ios` and rebuild the native app before testing photo selection on a device.
Android picks up the native module through React Native autolinking. Test picker
cancellation, permission errors, photo persistence after signing in again, and
account deletion on a development account before releasing.
