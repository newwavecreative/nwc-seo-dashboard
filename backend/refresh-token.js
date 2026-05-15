const { google } = require('googleapis');
const fs = require('fs');

const tokenPath = '/Users/charles/.openclaw/workspace/token.json';
const tokenData = JSON.parse(fs.readFileSync(tokenPath));

const oauth2Client = new google.auth.OAuth2(
  tokenData.client_id,
  tokenData.client_secret,
  'http://localhost:3000/auth/google/callback'
);

oauth2Client.setCredentials({
  refresh_token: tokenData.refresh_token,
});

oauth2Client.refreshAccessToken((err, tokens) => {
  if (err) {
    console.error('❌ Token refresh failed:', err.message);
    process.exit(1);
  }

  const updated = {
    ...tokenData,
    token: tokens.access_token,
    expiry: new Date(tokens.expiry_date).toISOString(),
  };

  fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2));
  console.log('✅ Token refreshed and saved');
  console.log('New expiry:', updated.expiry);
});
