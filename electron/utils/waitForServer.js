const http = require('http');

/**
 * Wait for a server to be ready at the given URL
 * @param {string} url - The URL to check
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const maxWaitTime = timeout;

    function checkServer() {
      const request = http.get(url, (response) => {
        if (response.statusCode < 500) {
          // Server is responding
          resolve();
        } else {
          scheduleCheck();
        }
      });

      request.on('error', () => {
        if (Date.now() - startTime > maxWaitTime) {
          reject(new Error(`Server ${url} did not respond within ${timeout}ms`));
        } else {
          scheduleCheck();
        }
      });

      request.setTimeout(1000);
    }

    function scheduleCheck() {
      setTimeout(checkServer, 500);
    }

    checkServer();
  });
}

module.exports = { waitForServer };
