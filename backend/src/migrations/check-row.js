const XLSX = require('xlsx');
const filePath = process.argv[2];
console.log('Opening:', filePath);
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log('Total rows:', data.length);
console.log('Headers:', Object.keys(data[0] || {}));
if (data.length > 0) {
  console.log('First row:', JSON.stringify(data[0]));
  console.log('Last row:', JSON.stringify(data[data.length - 1]));
}
for (let i = 0; i < data.length; i++) {
  const code = String(data[i].Codigo || data[i].codigo || '');
  if (code.length > 36) {
    console.log('Long code at row', i + 2, ':', code.length, 'chars -', code);
  }
}
console.log('No rows with code > 36 chars');
