# NFC administration page

The desktop app opens `src/index.html`, with an account-specific workspace built from the design system and Tauri API guide. Admin and registration staff manage card assignments. Station staff see only their assigned station and NFC tap results. The legacy `src/scanner.html` is no longer linked from the workspace.

## Use

Set `NFC_API_BASE_URL` in `server/.env` to your API base URL, then run the desktop app with `npm run dev` and sign in with your staff email and password. The login page has no server URL field. The native environment loader reads the process environment, nearby `.env` files, or the `server/.env` embedded when building the app. If `NFC_API_BASE_URL` is absent, the origin of the existing `USERS_API_URL` is used. The app does not save the server URL locally. The bearer token stays in memory and signing in is required after restarting.

For admin and registration staff, connect and select a USB NFC reader, choose **Link card**, and tap a card. Review the captured UID, then click **Link card**. Replacement explicitly identifies the old UID and uses **Confirm replacement**. Unassignment and logout both require confirmation. The UID is sent without changing its representation.

Search matches a mobile number (with `code` as a fallback for older records) or exact user ID. The page loads all API pages in batches of 100, then applies search, assignment filters, and display pagination locally. This supports Assigned filtering, which has no documented API parameter. Export controls are not part of this workspace.

Station staff never load `/api/admin/users`. The users list, assignment statistics, and assignment navigation are hidden. Selecting a USB reader and tapping an attendee card sends only `rfid_uid` to `/api/admin/stations/check-in`; the server supplies the assigned station. Remove the card before tapping again. Held cards do not resubmit, and only one check-in runs at a time. The UI displays success, duplicate, and error responses; uncertain server/network failures do not trigger automatic retries.

Admin and registration staff can select **RFID lookup** in the sidebar. A modal lets staff select a reader and tap an assigned card to display the linked customer’s details from `GET /api/admin/users/by-rfid?rfid_uid=...`. It preserves the scanned UID and sends the login bearer token. Unknown cards show a message in the modal. Closing the modal clears the customer details and ignores pending responses; tapping another card replaces the previous result. Lookup does not change the assignment or create a check-in.

## Integration

Uses `/api/admin/login`, `/api/admin/users`, `PUT /api/admin/users/{id}/nfc`, `DELETE /api/admin/users/{id}/nfc`, `POST /api/admin/stations/check-in`, and `/api/admin/logout`. All requests include JSON headers, and protected requests include the bearer token. A 401 returns to sign-in; validation errors remain in the relevant dialog with the scanned UID retained for retry.

Native reader integration uses the existing `nfc-status` event and `get_nfc_status` command. A browser can show the page but cannot access the USB reader. The API server must allow requests from the desktop application's origin through its CORS configuration.

The app bundles `src/assets/design-tokens.css`, copied from the supplied design reference. It uses the documented local system-font fallback; Open Sans and the original admin logo were not included in this repository. The current brand mark is text, not a replacement copy of the unavailable logo.

## Validation

JavaScript syntax checks passed. A mocked DOM/API check covered login and bearer headers, search and filters, capture without automatic submission, duplicate-UID validation and retry, successful assignment, and bodyless DELETE unassignment. Live API authentication, USB hardware behavior, and browser visual verification remain unverified.

Run `node scripts/test-station-ui.mjs` for mocked checks of account routing, station payloads, held-card suppression, concurrent-tap prevention, response handling, session reset, admin/registration user loading, and RFID lookup modal behavior (including response ordering and cleanup). Live API and USB testing remain necessary to verify hardware integration.
