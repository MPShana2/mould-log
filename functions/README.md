# GT Hub server functions

`driveLink`, `driveToken`, `driveUnlink` keep Google Drive connected without sign-in popups
(see the comments in `index.js`). Region: australia-southeast1. Needs the Blaze plan.

Deploy (Google Cloud Shell, project mould-log):

    git clone https://github.com/MPShana2/mould-log && cd mould-log
    firebase login --no-localhost
    firebase functions:secrets:set GOOGLE_CLIENT_SECRET      # paste the OAuth web client's secret
    firebase functions:secrets:set ALLOWED_EMAILS            # your Google account email
    openssl rand -base64 32 | firebase functions:secrets:set DRIVE_TOKEN_KEY --data-file=-
    firebase deploy --only functions

Secrets live in Google Secret Manager, never in this repo.
