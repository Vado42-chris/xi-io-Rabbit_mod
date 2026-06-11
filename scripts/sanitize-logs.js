const fs = require('fs');
const path = require('path');

const filesToSanitize = [
  path.join(__dirname, '../data/diagnostics.jsonl'),
  path.join(__dirname, '../data/events.jsonl')
];

console.log("Starting log sanitization...");

for (const filePath of filesToSanitize) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping file (not found): ${filePath}`);
    continue;
  }

  console.log(`Reading file: ${filePath}`);
  const rawData = fs.readFileSync(filePath, 'utf8');
  const lines = rawData.split('\n');
  let sanitizedCount = 0;
  
  const sanitizedLines = lines.map((line, index) => {
    if (line.includes('xi_io_rabbit_mod')) {
      sanitizedCount++;
      // Global replacement of the legacy identifier
      return line.replace(/xi_io_rabbit_mod/g, 'xi_io_ibal');
    }
    return line;
  });

  if (sanitizedCount > 0) {
    const tempFilePath = filePath + '.tmp';
    fs.writeFileSync(tempFilePath, sanitizedLines.join('\n'), 'utf8');
    fs.renameSync(tempFilePath, filePath);
    console.log(`Successfully sanitized ${sanitizedCount} lines in ${filePath}`);
  } else {
    console.log(`No legacy identifiers found in ${filePath}`);
  }
}

console.log("Log sanitization completed.");
