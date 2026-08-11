varvatoVision Video Phone — App Foundation that is FREE!

This version is a real deployable web application foundation rather than a static mockup.

## Included

- Google account sign-in using Google Identity Services
- Server-side verification of Google ID tokens
- Secure signed session cookie
- SQLite persistent database
- User records
- Contacts by Google email
- Persistent one-to-one messaging
- Call history
- Two-person WebRTC video/audio calls
- Socket.IO signaling
- Incoming call notification
- Screen sharing
- Mute and camera controls
- Responsive varvatoVision dashboard

## Local setup

Install Node.js 20+.

1. Copy `.env.example` to `.env`.
2. Put your Google OAuth Web Client ID into `GOOGLE_CLIENT_ID`.
3. Create a long random `SESSION_SECRET`.
4. Run:

npm install
npm start

Then open `http://localhost:3000`.

## Google setup

In Google Cloud, create a Web application OAuth client for Google Identity Services and add your app's origin to the authorized JavaScript origins.

For local development that is normally:

http://localhost:3000

For production, use your real HTTPS domain.

## Calling

Sign in on two browsers with two different Google accounts. Add each other by email. Start a call from Contacts. The second user receives an incoming-call prompt.

The current WebRTC configuration includes a public STUN server. Production calling should also have a TURN service so calls can connect reliably across restrictive NAT/firewall networks.

## Production checklist

Before public launch:

- HTTPS
- TURN server
- Production Google OAuth origin
- Strong SESSION_SECRET
- Database backups
- Rate limiting
- Abuse reporting/blocking
- Account deletion/data export
- Privacy policy and terms
- Secure headers and logging
- Proper production hosting
- Optional managed database if scaling beyond one server
- Group calling architecture if needed
