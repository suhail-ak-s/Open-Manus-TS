require('dotenv').config();
console.log(
  'OPENAI_API_KEY from env:',
  process.env.OPENAI_API_KEY
    ? 'Found (starts with: ' + process.env.OPENAI_API_KEY.substring(0, 3) + '...)'
    : 'Not found'
);
