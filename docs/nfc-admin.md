# NFC administration page

The desktop app now opens `src/index.html`, the card administration workspace built from the design system and Tauri API guide. The original reader, registration, and station tools remain in `src/scanner.html`, accessible through the sidebar. Those original tools retain their existing local-server integration.

## Use

Run the desktop app with `npm run dev`. Enter the API server base URL and sign in with an admin account. The initial URL comes from the existing server configuration; change it to your deployed API or local development server as needed. Only the server URL is saved locally. The bearer token stays in memory and signing in is required after restarting or returning from the scanner tools.

Connect and select a USB NFC reader, choose **Link card**, and tap a card. Review the captured UID, then click **Link card**. Replacement explicitly identifies the old UID and uses **Confirm replacement**. Unassignment and logout both require confirmation. The UID is sent without changing its representation.

Search matches a mobile number (with `code` as a fallback for older records) or exact user ID. The page loads all API pages in batches of 100, then applies search, assignment filters, and display pagination locally. This supports Assigned filtering, which has no documented API parameter, and exports all matching results rather than just the visible page. For very large datasets, a server-side Assigned filter and export endpoint would avoid fetching the entire directory.

Export offers CSV download and tab-separated clipboard copy. Values that could execute spreadsheet formulas are prefixed with an apostrophe in exports. Action controls are excluded.

## Integration

Uses `/api/admin/login`, `/api/admin/users`, `PUT /api/admin/users/{id}/nfc`, `DELETE /api/admin/users/{id}/nfc`, and `/api/admin/logout`. All requests include JSON headers, and protected requests include the bearer token. A 401 returns to sign-in; validation errors remain in the relevant dialog with the scanned UID retained for retry.

Native reader integration uses the existing `nfc-status` event and `get_nfc_status` command. A browser can show the page but cannot access the USB reader. The API server must allow requests from the desktop application's origin through its CORS configuration.

The app bundles `src/assets/design-tokens.css`, copied from the supplied design reference. It uses the documented local system-font fallback; Open Sans and the original admin logo were not included in this repository. The current brand mark is text, not a replacement copy of the unavailable logo.

## Validation

JavaScript syntax checks passed. A mocked DOM/API check covered login and bearer headers, search and filters, capture without automatic submission, duplicate-UID validation and retry, successful assignment, and bodyless DELETE unassignment. Live API authentication, USB hardware behavior, and browser visual verification remain unverified.
