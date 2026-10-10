// Goal 11: the monthly learning report as text, for the owner to keep each month. Reads the
// database DATABASE_URL points at, and changes nothing. Counts only: no names, businesses or sites.
//
//   node scripts/learning-report.js [YYYY-MM] [file.md]
//
// The month is in Queensland time; without one it is the last whole month. Without a file the
// report is printed. The owner's admin page has the same report, and a button to download it.
const fs = require('fs');
const db = require('../db');
const { monthlyReport, reportMarkdown, isMonth } = require('../control-learning');

(async () => {
  const [month, file] = process.argv.slice(2);
  if (month && !isMonth(month)) throw new Error('Give the month as YYYY-MM.');
  if (!db.enabled()) throw new Error('Set DATABASE_URL to the database to read.');
  const text = reportMarkdown(await monthlyReport({ month }));
  if (file) {
    fs.writeFileSync(file, text);
    console.log(`Written: ${file}`);
  } else process.stdout.write(text);
  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
