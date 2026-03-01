const net = require('net');

/**
 * Check if MongoDB is running by attempting a TCP connection
 * @returns {Promise<boolean>}
 */
async function checkMongoDB() {
  return new Promise((resolve) => {
    const mongoHost = 'localhost';
    const mongoPort = 27017;
    
    const socket = new net.Socket();
    const timeout = 3000;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(mongoPort, mongoHost);
  });
}

module.exports = { checkMongoDB };
