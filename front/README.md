Frontend for Payroll-System-QOL

This is a lightweight static SPA that talks to the backend API (default: http://localhost:4000).

Quick start:

1. Ensure backend is running: cd back && npm run dev (or npm start)
2. In another terminal, install and start the frontend:
   - cd front && npm install
   - npm start
3. Open http://localhost:3000 in the browser

Notes:
- The frontend uses cookie-based session auth; login uses the backend's ADMIN_USER / ADMIN_PASSWORD environment variables.
- If your backend runs on a different port, edit `public/index.html` and change `window.API_BASE` to match the backend origin.
