# Quick Start Guide

Get the Payroll System desktop app running in 5 minutes.

## TL;DR

```bash
# 1. MongoDB must be running
#    (Windows Services or: mongod)

# 2. Install dependencies
npm install
npm --prefix back install
npm --prefix front install

# 3. Run the app
npm run desktop:dev

# 4. App opens automatically
#    Log in and start using!
```

## Prerequisites

1. **Node.js 16+** - [Download](https://nodejs.org)
2. **MongoDB running** - [Install & Start](https://docs.mongodb.com/manual/installation/)
3. **Available ports** - 3000, 4000

## Commands

| Command | What it does | Time |
|---------|-------------|------|
| `npm run desktop:dev` | Runs desktop app in dev mode (recommended) | 30s |
| `npm run dev` | Runs web version in browser | 30s |
| `npm run desktop:build` | Creates installer (.exe) | 5-10m |

## Troubleshooting

**App won't start?**
- Make sure MongoDB is running
- Check terminal for error messages

**Ports in use?**
- Kill other apps using ports 3000, 4000
- Restart your computer

**"MongoDB not found"?**
- Install from https://www.mongodb.com/try/download/community
- Look in Windows Services to start MongoDB service

## Next Steps

- **For detailed setup:** See [DEVELOPMENT.md](DEVELOPMENT.md)
- **For building & distributing:** See [BUILD_AND_DISTRIBUTE.md](BUILD_AND_DISTRIBUTE.md)
- **For client installation:** See [INSTALLATION.md](INSTALLATION.md)

---

That's it! The app should be running at http://localhost:3000 in an Electron window.
