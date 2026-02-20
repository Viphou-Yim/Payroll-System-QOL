# Payroll System - Client Installation Guide

## Before Installing

1. Install **MongoDB Community Server**.
2. Ensure the **MongoDB** Windows service is running.

## Install the App

1. Run the installer: `dist/Payroll System Setup 1.0.0.exe`
2. Follow the installation wizard.
3. Launch **Payroll System** from Start Menu or desktop shortcut.

## First Launch Behavior

- The app verifies MongoDB availability on `localhost:27017`.
- The app verifies required local app ports are available.
- If checks pass, the app opens normally.
- If checks fail, the app shows a clear fix message.

## Privacy Note

- This app stores payroll data in your local MongoDB database.
- It only checks local service availability needed to run.
- It does **not** scan personal files, browser history, photos, documents, or cloud accounts.
- No data leaves your PC unless an external server is intentionally configured.

## Troubleshooting

### "MongoDB is not running"
- Open Windows Services.
- Start the **MongoDB** service.
- Relaunch Payroll System.

### "Port already in use"
- Close other apps using the blocked port.
- Relaunch Payroll System.
