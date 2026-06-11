const fs = require('fs');
const path = require('path');

const tasksJsonPath = path.join(__dirname, '..', 'tasks.json');
const tasksJsonlPath = path.join(__dirname, '..', 'tasks.jsonl');
const backupPath = path.join(__dirname, '..', 'tasks.json.bak');

function migrate() {
  console.log('Starting tasks database migration...');

  if (!fs.existsSync(tasksJsonPath)) {
    console.log('No tasks.json file found to migrate.');
    return;
  }

  try {
    const rawData = fs.readFileSync(tasksJsonPath, 'utf8');
    const tasks = JSON.parse(rawData);

    if (!Array.isArray(tasks)) {
      throw new Error('tasks.json content is not a JSON array.');
    }

    console.log(`Parsed ${tasks.length} tasks from tasks.json.`);

    // Convert array of tasks to line-delimited JSON
    const lines = tasks.map(task => JSON.stringify(task)).join('\n') + '\n';
    fs.writeFileSync(tasksJsonlPath, lines, 'utf8');
    console.log(`Successfully wrote tasks to ${tasksJsonlPath}`);

    // Create a backup of the original tasks.json
    fs.writeFileSync(backupPath, rawData, 'utf8');
    console.log(`Created backup of tasks.json at ${backupPath}`);

    // Remove the original tasks.json
    fs.unlinkSync(tasksJsonPath);
    console.log(`Removed original tasks.json`);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
