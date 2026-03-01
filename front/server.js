const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static front-end
app.use(express.static(path.join(__dirname, 'public')));

<<<<<<< HEAD
// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
=======
// Fallback to index.html for SPA routes without using path patterns
app.use((req, res) => {
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Frontend server running on http://localhost:${PORT}`));