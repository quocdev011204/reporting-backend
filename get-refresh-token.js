const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Thay YOUR_CLIENT_ID và YOUR_CLIENT_SECRET bằng giá trị thực tế của bạn
const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob' // Redirect URI cho installed apps
);

const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('\n========================================');
console.log('Google OAuth 2.0 - Get Refresh Token');
console.log('========================================\n');
console.log('Authorize this app by visiting this url:\n');
console.log(authUrl);
console.log('\n========================================\n');

rl.question('Enter the code from that page here: ', (code) => {
  oauth2Client.getToken(code, (err, token) => {
    if (err) {
      console.error('\n❌ Error retrieving access token:', err.message);
      rl.close();
      return;
    }
    
    console.log('\n========================================');
    console.log('✅ Success! Copy these values to your .env file:');
    console.log('========================================\n');
    console.log('GOOGLE_CLIENT_ID=' + CLIENT_ID);
    console.log('GOOGLE_CLIENT_SECRET=' + CLIENT_SECRET);
    console.log('GOOGLE_REFRESH_TOKEN=' + token.refresh_token);
    console.log('\n========================================\n');
    
    rl.close();
  });
});

