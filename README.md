# Mould Log

Mould and toolroom maintenance work orders, as an installable app for Android and Windows.

- **Sync:** work orders are stored in your own Firebase (Firestore) database and sync between every device you sign in on. Changes made offline are kept on the device and sync when it reconnects.
- **Photos & files:** saved to the work order's folder in Google Drive (`Work Orders/#2549 - Mould name`). The folder is created automatically if it doesn't exist. Uploads wait on the device until Drive is reachable.
- **Install:** Android: open the site in Chrome → ⋮ → *Install app*. Windows: open the site in Edge or Chrome → *Install* icon in the address bar (or ⋯ → Apps → *Install this site as an app*).

## Files
- `index.html`: the app
- `config.js`: your Firebase settings and Google OAuth client ID
- `firestore.rules`: database security rules (paste into Firebase → Firestore → Rules)
- `sw.js`, `manifest.webmanifest`, `icons/`: make it installable and able to open offline

No work order data is stored in this repository.
