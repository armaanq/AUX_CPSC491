# AUX

A head-to-head music comparison and ranking app — think Letterboxd/Beli, but for songs and albums. Users rank music by directly comparing it against other music they've logged, building a personal 0-10 ranked list plus community rankings, social feeds, and taste-compatibility scoring.

Built for CPSC 491 (Capstone) by Armaan Qazen, Shyan Khazeni, and Arian Gholaimpur.

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
- **Music data:** MusicBrainz (catalog), Cover Art Archive (artwork), Deezer (previews)
- **iOS tooling:** Xcode, iOS Simulator, CocoaPods

## Getting started

New to the project or on a fresh machine? Follow [SETUP.md](SETUP.md) for a full step-by-step walkthrough. The summary below assumes prerequisites are already installed.

### Prerequisites

- Node.js 22.13+ (use `nvm install 22` if your system Node is older)
- Xcode + CocoaPods (`brew install cocoapods`) and Watchman (`brew install watchman`) for iOS
- PostgreSQL 16 (local via Homebrew, or Docker — see `server/docker-compose.yml`)

### Backend (`/server`)

```bash
cd server
npm install
cp .env.example .env          # adjust DATABASE_URL if needed
docker compose up -d          # or run Postgres locally and match .env
npx prisma migrate dev
npm run start:dev
```

The API starts on `http://localhost:3000`. `GET /health` returns `{ "status": "ok" }`.

### Mobile (`/mobile`)

```bash
cd mobile
npm install
cd ios && pod install && cd ..
npm run ios
```

## Workflow

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching, commit, and PR conventions.
