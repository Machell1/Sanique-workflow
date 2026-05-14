const crypto = require('node:crypto');
const fs = require('node:fs');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function newId() {
  return crypto.randomUUID();
}

module.exports = { sha256, sha256File, newId };
