# Team Setup Guide

Steps for getting AUX running on a new Mac. Follow in order — most of this is one-time machine setup.

The app talks to a shared server that's already online (https://aux-server-cqre.onrender.com), so to **use** the app you only need sections 1–3. Section 4 is only for working on `server/` code.

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

## 3. Run the app

```
git clone https://github.com/armaanq/AUX_CPSC491.git
cd AUX_CPSC491/mobile
npm install
cd ios && LANG=en_US.UTF-8 pod install && cd ..
npm start
```

(`LANG=en_US.UTF-8` avoids a CocoaPods "Unicode Normalization" error on some Macs.)

Leave `npm start` (the Metro bundler) running in its own terminal. In another tab:

```
cd AUX_CPSC491/mobile
npm run ios
```

This opens the iOS Simulator and installs the app. Create an account on the signup screen — accounts and rankings are saved on the shared server, so they're the same on every teammate's machine.

**Good to know**

- The shared server is on Render's free plan and goes to sleep after 15 minutes without use. The first request after that takes up to a minute; the app says "Waking up the AUX server" while it waits.
- A black screen after launch means Metro isn't running — check the `npm start` terminal is still up.

## 4. Working on server code (optional)

You only need this to change `server/`. You'll run your own copy of the server against your own local database, so nothing you do here touches the shared data.

### Local Postgres

Pick one:

- **Docker:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then run `docker compose up -d` in `server/`.
- **Homebrew:**
  ```
  brew install postgresql@16
  echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
  brew services start postgresql@16
  psql postgres -c "CREATE ROLE aux LOGIN PASSWORD 'aux' CREATEDB;"
  createdb -O aux aux
  ```

Either way, the database matches the `DATABASE_URL` in `server/.env.example`.

### Server

```
cd AUX_CPSC491/server
npm install --legacy-peer-deps
cp .env.example .env
```

Open `server/.env` and set `JWT_SECRET` to the output of `openssl rand -hex 32`. Then:

```
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Check `http://localhost:3000/health` returns `{"status":"ok"}`.

### Point the app at your server

In `mobile/src/api/config.ts`, set `USE_LOCAL_SERVER` to `true` and reload the app. Set it back to `false` before committing — a test fails if it's left on.

### Rules for the shared server and database

- Merging to `main` redeploys the shared server automatically, and any new migrations run against the shared AWS database on startup. Review migration PRs carefully.
- Only run `prisma migrate dev` against your **local** database. Against the shared one it can offer to reset the database, which deletes everyone's data.
- Never commit `server/.env`. Ask Armaan if you need access to the shared database or the Render dashboard.

## 5. Git workflow

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: never commit to `main` directly (it's protected — requires a PR, 1 approval, and passing CI), branch as `feat/...` / `fix/...` / `chore/...`, and squash-merge PRs.
