# Team Setup Guide

Steps for getting this project running on a new Mac. Follow in order — most of this is one-time machine setup.

## 1. Get repo access

Ask an existing collaborator to add your GitHub username under Settings → Collaborators on this repo, then accept the invite email.

## 2. One-time machine setup

### Xcode

1. Install Xcode from the Mac App Store (if not already installed).
2. In Terminal, run:
   ```
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license
   ```
   Accept the license (space to page through, type `agree`).
3. Open Xcode → Settings → Components → download the **iOS Simulator** platform (a few GB, one-time).

### Homebrew

Skip if already installed (check with `brew --version`):

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Watchman + CocoaPods

```
brew install watchman cocoapods
```

### Node via nvm

React Native needs Node 22.13+.

```
brew install nvm   # if not already installed — follow its printed shell setup instructions
nvm install 22
nvm alias default 22
```

### Docker Desktop

Used for local Postgres, matching `server/docker-compose.yml`. Install from [docker.com](https://www.docker.com/products/docker-desktop/).

## 3. Clone and set up the repo

```
git clone https://github.com/armaanq/AUX.git
cd AUX
```

### Backend (`/server`)

```
cd server
npm install --legacy-peer-deps
cp .env.example .env
docker compose up -d
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Check `http://localhost:3000/health` returns `{"status":"ok"}`.

### Mobile (`/mobile`)

In one terminal tab:

```
cd mobile
npm install
cd ios && pod install && cd ..
npm start
```

Leave `npm start` (the Metro bundler) running in its own terminal. In another tab:

```
npm run ios
```

This opens the iOS Simulator and installs the app. If you ever see a black screen, it means Metro isn't running — check the `npm start` terminal is still up.

## 4. Git workflow

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: never commit to `main` directly (it's protected — requires a PR, 1 approval, and passing CI), branch as `feat/...` / `fix/...` / `chore/...`, and squash-merge PRs.
