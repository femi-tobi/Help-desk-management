const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'mbusers.csv');
const outputPath = path.join(__dirname, 'mbusers.filtered.csv');

const allowedDomains = ['@gmail.com', '@may-bakerng.com'];

const lines = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/);
const header = lines[0];
const filtered = [header];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const email = line.split(',')[0].toLowerCase();
  if (allowedDomains.some(domain => email.endsWith(domain))) {
    filtered.push(line);
  }
}

fs.writeFileSync(outputPath, filtered.join('\n'), 'utf8');
console.log(`Filtered CSV saved to ${outputPath}`);
