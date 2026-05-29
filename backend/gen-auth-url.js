const { google } = require('googleapis');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',  // force re-issue of refresh_token
  scope: ['https://www.googleapis.com/auth/webmasters.readonly'],
});
console.log(url);
