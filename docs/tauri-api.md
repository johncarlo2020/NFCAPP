# Tauri NFC API

Send `Accept: application/json` and `Content-Type: application/json`.

## Login

`POST /api/admin/login`

```json
{
  "email": "admin@example.com",
  "password": "your-password",
  "device_name": "NFC desktop"
}
```

Returns `token`, `token_type`, `expires_at`, and `user`. Token expires after 24 hours. Admin accounts and configured staff accounts can log in. Login and the current-user endpoint include `role`, `staff_function` (`register` or `station`), and `station_id`. Invalid credentials return 422; excessive login attempts return 429.

For all endpoints below send `Authorization: Bearer <token>`.

| Method | Path                                                       | Purpose                                                                     |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| GET    | /api/admin/user                                            | Current signed-in admin, under `data`                                       |
| GET    | /api/admin/users                                           | Paginated attendees, excluding admins and staff                             |
| GET    | /api/admin/users/by-rfid?rfid_uid=04A1B2C3D4               | Attendee details for an RFID card, under `data`                             |
| GET    | /api/admin/users/{id}                                      | One assignment user, under `data`                                           |
| PUT    | /api/admin/users/{id}/nfc                                  | Assign or replace NFC UID                                                   |
| DELETE | /api/admin/users/{id}/nfc                                  | Unassign NFC card (no request body)                                         |
| POST   | /api/admin/logout                                          | Revoke current token                                                        |
| GET    | /api/admin/stations                                        | Stations ordered by ID, under `data` (ID, name, description)                |
| GET    | /api/admin/stations/reward-eligibility?rfid_uid=04A1B2C3D4 | Check reward eligibility without completing a station or releasing the card |
| POST   | /api/admin/stations/check-in                               | Check in an assigned NFC card at a station                                  |

List parameters: `without_nfc=1`, `search` (mobile number, exact ID, or exact RFID UID), `per_page` (1–100, default 25), and `page`. Pagination response includes `data`, `current_page`, `last_page`, and `total`.

User fields: `id`, `email`, `code`, `mobile_number`, `rfid_uid`. Registration stores the mobile number in `code`; older records may contain a legacy registration code.

User responses also include `completed_station_ids` (sorted, distinct station IDs, including station 4), `all_stations_completed` (stations 1–4 complete), `redeemed` (station 4 complete), and `can_link_nfc` (false after redemption). These fields remain available after the NFC card is released. The desktop list shows **Reward redeemed** and closes linking for redeemed attendees, including card replacement. The assignment API also rejects these requests with HTTP 422 and an `rfid_uid` validation error; it locks the attendee row so final-station redemption and assignment cannot race.

Assignment body:

```json
{ "rfid_uid": "04A1B2C3D4" }
```

Use the same UID representation as the existing card reader. Duplicate UIDs return 422. Missing/expired tokens return 401; accounts without admin access return 403. Admin and staff accounts cannot be assignment targets (404).

The existing `/api/users/without-nfc` shared-secret endpoint remains available for existing integrations. The desktop app can use `/api/admin/users?without_nfc=1` with its login token instead.

## RFID user lookup

`GET /api/admin/users/by-rfid?rfid_uid=04A1B2C3D4`

Send `Accept: application/json` and `Authorization: Bearer <token>` using the token from login. Admins, registration staff, and station staff can look up an attendee's assigned card. This request does not check in the attendee or change the card assignment.

Example response (HTTP 200):

```json
{
  "data": {
    "id": 123,
    "email": "attendee@example.com",
    "code": "+639171234567",
    "mobile_number": "+639171234567",
    "rfid_uid": "04A1B2C3D4",
    "role": "client",
    "staff_function": null,
    "station_id": null
  }
}
```

The UID must be a nonempty string of at most 64 characters; surrounding whitespace is trimmed. Use the same UID representation as card assignment, preserving leading zeros. Invalid or missing UIDs return 422. Unknown, unassigned, admin, or staff cards return 404. Missing/expired tokens return 401; unauthorized accounts or tokens without `nfc:manage` return 403. Passwords and authentication tokens are never included in the user details.

## Reward eligibility at the last station

Station 4 is the gift redemption station. Before redeeming, call:

`GET /api/admin/stations/reward-eligibility?rfid_uid=04A1B2C3D4`

Use the login bearer token. Admins and station staff can call this endpoint; registration staff cannot (403). The UID validation and attendee-only lookup rules match the RFID user lookup (422 for invalid UIDs, 404 for unknown or unassigned cards).

Example response (HTTP 200, attendee has completed stations 1 and 2):

```json
{
  "data": {
    "user_id": 123,
    "station_id": 4,
    "eligible": false,
    "redeemed": false,
    "required_station_ids": [1, 2, 3],
    "completed_station_ids": [1, 2],
    "missing_station_ids": [3]
  }
}
```

`eligible` is true only when stations 1, 2, and 3 are complete and station 4 has not been completed. `redeemed` means station 4 is already complete. Duplicate check-in records do not count as additional completed stations. This GET request does not create check-ins or unassign the RFID.

When `eligible` is true, complete redemption with `POST /api/admin/stations/check-in`: admins send `{"station_id":4,"rfid_uid":"04A1B2C3D4"}`; station 4 staff send `{"rfid_uid":"04A1B2C3D4"}`. The server checks eligibility again, saves station 4 completion, and automatically unassigns the RFID in the same transaction. Show redemption success only after this POST succeeds. After success, the released card returns 404 on lookup or eligibility checks until assigned again. Keep the returned `user_id` if the app needs to retain the attendee reference.

If completion is blocked, the POST returns 422 with `status: "prerequisites_not_met"` and eligibility details under `data`.

## Station check-in

Load the station selector from `GET /api/admin/stations`. Send the selected station ID and captured card UID:

```json
{ "station_id": 1, "rfid_uid": "04A1B2C3D4" }
```

`POST /api/admin/stations/check-in` uses the same bearer token as card assignment and the same rules as the web kiosk. A successful check-in returns HTTP 200 with `status: "success"` and `message: "Station checked in successfully"`. A repeat tap returns HTTP 200 with `status: "duplicate"` and does not create another record. Unknown cards return 404 with `status: "error"`; invalid fields return 422 with validation errors. Admin and staff cards are not check-in targets (404).

Station 4 requires completed check-ins at stations 1, 2, and 3; otherwise it returns 422 with `status: "prerequisites_not_met"`. Successful station 4 redemption clears the card assignment so the card can be reused. A subsequent tap of that cleared card returns 404 until it is assigned again. Check-ins record elapsed time using the previous check-in (or last login/registration for the first station) and broadcast the existing attendee confirmation event.

Disable repeat submission while a tap is being processed. Inspect `status` even on HTTP 200, and show the returned message beside the reader controls. A server error returns 500; avoid claiming success or automatically retrying a gift redemption when the outcome is uncertain.

## Staff access

Existing `/api/admin/*` paths serve the Tauri app for both admins and staff. Login selects the staff function from the account; the app does not submit a function to grant access.

| Account        | Access                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Admin          | All existing NFC endpoints                                                                         |
| Register staff | Current user, attendee search/details, link, unlink, logout                                        |
| Station staff  | Current user, RFID attendee lookup, reward eligibility, assigned station, station check-in, logout |

Station staff send only `{"rfid_uid":"04A1B2C3D4"}` when checking in. The server supplies the account's station ID. If a different `station_id` is supplied, the request returns 403. Their station list contains only the assigned station. Admin check-ins still require `station_id`. Unauthorized functions return 403. Staff with an invalid function or missing station configuration cannot log in or use existing tokens.

## Create Tauri staff accounts

Run the migration, ensure station IDs 1–4 exist, then run the # Tauri NFC API

Send `Accept: application/json` on API requests and `Content-Type: application/json` when sending a JSON body. API errors return JSON even if the `Accept` header is missing, so unauthenticated requests receive a 401 response rather than redirecting to the web login page.

## Login

`POST /api/admin/login`

```json
{
  "email": "admin@example.com",
  "password": "your-password",
  "device_name": "NFC desktop"
}
```

Returns `token`, `token_type`, `expires_at`, and `user`. Admin tokens expire after 24 hours; staff tokens expire after 30 days. Use the returned `expires_at` rather than assuming a fixed lifetime. Admin accounts and configured staff accounts can log in. Login and the current-user endpoint include `role`, `staff_function` (`register` or `station`), and `station_id`. Invalid credentials return 422; excessive login attempts return 429.

For all endpoints below send `Authorization: Bearer <token>`.

| Method | Path                                                       | Purpose                                                                     |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| GET    | /api/admin/user                                            | Current signed-in admin, under `data`                                       |
| GET    | /api/admin/users                                           | Paginated attendees, excluding admins and staff                             |
| GET    | /api/admin/users/by-rfid?rfid_uid=04A1B2C3D4               | Attendee details for an RFID card, under `data`                             |
| GET    | /api/admin/users/{id}                                      | One assignment user, under `data`                                           |
| PUT    | /api/admin/users/{id}/nfc                                  | Assign or replace NFC UID                                                   |
| DELETE | /api/admin/users/{id}/nfc                                  | Unassign NFC card (no request body)                                         |
| POST   | /api/admin/logout                                          | Revoke current token                                                        |
| GET    | /api/admin/stations                                        | Stations ordered by ID, under `data` (ID, name, description)                |
| GET    | /api/admin/stations/reward-eligibility?rfid_uid=04A1B2C3D4 | Check reward eligibility without completing a station or releasing the card |
| POST   | /api/admin/stations/check-in                               | Check in an assigned NFC card at a station                                  |

List parameters: `without_nfc=1`, `search` (mobile number, exact ID, or exact RFID UID), `per_page` (1–100, default 25), and `page` (1-based, default 1). A request returns only that page; the app must request subsequent pages through `last_page` if it needs the complete user list. The response includes `data`, `current_page`, `last_page`, `per_page`, and `total`.

Each user in `data` includes `id`, `email`, `code`, `mobile_number`, `rfid_uid`, `role`, `staff_function`, `station_id`, `completed_station_ids`, `all_stations_completed`, `redeemed`, and `can_link_nfc`. Registration stores the mobile number in `code`; older records may contain a legacy registration code. `mobile_number` currently mirrors `code`. `completed_station_ids` contains unique station IDs in ascending order; `all_stations_completed` reflects completion of stations 1–4, `redeemed` reflects completion of station 4, and `can_link_nfc` is false after redemption.

Assignment body:

```json
{ "rfid_uid": "04A1B2C3D4" }
```

Use the same UID representation as the existing card reader. Duplicate UIDs return 422. Missing/expired tokens return 401; accounts without admin access return 403. Admin and staff accounts cannot be assignment targets (404).

The existing `/api/users/without-nfc` shared-secret endpoint remains available for existing integrations. The desktop app can use `/api/admin/users?without_nfc=1` with its login token instead.

## API request logs

Routed requests to `/api/*` are logged in `storage/logs/laravel.log`, including successful requests. 2xx and 3xx responses are logged as info, 4xx as warnings, and 5xx as errors. Entries include the HTTP method, route, status, authenticated user ID when available, request duration, and Cloudflare Ray ID when supplied. Authorization headers, request bodies, and query-string values are not logged. Use the Ray ID and timestamp to correlate a request with Cloudflare Security Events.

The general API limit is 120 requests per minute per authenticated user, or per IP address for unauthenticated requests. Login has a separate limit of 5 attempts per minute.

## RFID user lookup

`GET /api/admin/users/by-rfid?rfid_uid=04A1B2C3D4`

Send `Accept: application/json` and `Authorization: Bearer <token>` using the token from login. Admins, registration staff, and station staff can look up an attendee's assigned card. This request does not check in the attendee or change the card assignment.

Example response (HTTP 200):

```json
{
  "data": {
    "id": 123,
    "email": "attendee@example.com",
    "code": "+639171234567",
    "mobile_number": "+639171234567",
    "rfid_uid": "04A1B2C3D4",
    "role": "client",
    "staff_function": null,
    "station_id": null
  }
}
```

The UID must be a nonempty string of at most 64 characters; surrounding whitespace is trimmed. Use the same UID representation as card assignment, preserving leading zeros. Invalid or missing UIDs return 422. Unknown, unassigned, admin, or staff cards return 404. Missing/expired tokens return 401; unauthorized accounts or tokens without `nfc:manage` return 403. Passwords and authentication tokens are never included in the user details.

## Reward eligibility at the last station

Station 4 is the gift redemption station. Before redeeming, call:

`GET /api/admin/stations/reward-eligibility?rfid_uid=04A1B2C3D4`

Use the login bearer token. Admins and station staff can call this endpoint; registration staff cannot (403). The UID validation and attendee-only lookup rules match the RFID user lookup (422 for invalid UIDs, 404 for unknown or unassigned cards).

Example response (HTTP 200, attendee has completed stations 1 and 2):

```json
{
  "data": {
    "user_id": 123,
    "station_id": 4,
    "eligible": false,
    "redeemed": false,
    "required_station_ids": [1, 2, 3],
    "completed_station_ids": [1, 2],
    "missing_station_ids": [3]
  }
}
```

`eligible` is true only when stations 1, 2, and 3 are complete and station 4 has not been completed. `redeemed` means station 4 is already complete. Duplicate check-in records do not count as additional completed stations. This GET request does not create check-ins or unassign the RFID.

When `eligible` is true, complete redemption with `POST /api/admin/stations/check-in`: admins send `{"station_id":4,"rfid_uid":"04A1B2C3D4"}`; station 4 staff send `{"rfid_uid":"04A1B2C3D4"}`. The server checks eligibility again, saves station 4 completion, and automatically unassigns the RFID in the same transaction. Show redemption success only after this POST succeeds. After success, the released card returns 404 on lookup or eligibility checks until assigned again. Keep the returned `user_id` if the app needs to retain the attendee reference.

If completion is blocked, the POST returns 422 with `status: "prerequisites_not_met"` and eligibility details under `data`.

## Station check-in

Load the station selector from `GET /api/admin/stations`. Send the selected station ID and captured card UID:

```json
{ "station_id": 1, "rfid_uid": "04A1B2C3D4" }
```

`POST /api/admin/stations/check-in` uses the same bearer token as card assignment and the same rules as the web kiosk. A successful check-in returns HTTP 200 with `status: "success"` and `message: "Station checked in successfully"`. A repeat tap returns HTTP 200 with `status: "duplicate"` and does not create another record. Unknown cards return 404 with `status: "error"`; invalid fields return 422 with validation errors. Admin and staff cards are not check-in targets (404).

Station 4 requires completed check-ins at stations 1, 2, and 3; otherwise it returns 422 with `status: "prerequisites_not_met"`. Successful station 4 redemption clears the card assignment so the card can be reused. A subsequent tap of that cleared card returns 404 until it is assigned again. Check-ins record elapsed time using the previous check-in (or last login/registration for the first station) and broadcast the existing attendee confirmation event.

Disable repeat submission while a tap is being processed. Inspect `status` even on HTTP 200, and show the returned message beside the reader controls. A server error returns 500; avoid claiming success or automatically retrying a gift redemption when the outcome is uncertain.

## Staff access

Existing `/api/admin/*` paths serve the Tauri app for both admins and staff. Login selects the staff function from the account; the app does not submit a function to grant access.

| Account        | Access                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Admin          | All existing NFC endpoints                                                                         |
| Register staff | Current user, attendee search/details, link, unlink, logout                                        |
| Station staff  | Current user, RFID attendee lookup, reward eligibility, assigned station, station check-in, logout |

Station staff send only `{"rfid_uid":"04A1B2C3D4"}` when checking in. The server supplies the account's station ID. If a different `station_id` is supplied, the request returns 403. Their station list contains only the assigned station. Admin check-ins still require `station_id`. Unauthorized functions return 403. Staff with an invalid function or missing station configuration cannot log in or use existing tokens.

## Create Tauri staff accounts

Run the migration, ensure station IDs 1–4 exist, then run the separate seeder:

```sh
php artisan migrate
# Set TAURI_STAFF_PASSWORD in your environment or .env (at least 12 characters).
php artisan db:seed --class=TauriStaffSeeder
```

| Email                         | Function | Station |
| ----------------------------- | -------- | ------- |
| registration1@staff.ysl.local | register | —       |
| registration2@staff.ysl.local | register | —       |
| station1@staff.ysl.local      | station  | 1       |
| station2@staff.ysl.local      | station  | 2       |
| station3@staff.ysl.local      | station  | 3       |
| station4@staff.ysl.local      | station  | 4       |

New accounts receive the hashed `TAURI_STAFF_PASSWORD`. Rerunning the seeder preserves passwords and restores the listed function/station assignments. The seeder is separate from the default database seed operation.
eparate seeder:

```sh
php artisan migrate
# Set TAURI_STAFF_PASSWORD in your environment or .env (at least 12 characters).
php artisan db:seed --class=TauriStaffSeeder
```

| Email                         | Function | Station |
| ----------------------------- | -------- | ------- |
| registration1@staff.ysl.local | register | —       |
| registration2@staff.ysl.local | register | —       |
| station1@staff.ysl.local      | station  | 1       |
| station2@staff.ysl.local      | station  | 2       |
| station3@staff.ysl.local      | station  | 3       |
| station4@staff.ysl.local      | station  | 4       |

New accounts receive the hashed `TAURI_STAFF_PASSWORD`. Rerunning the seeder preserves passwords and restores the listed function/station assignments. The seeder is separate from the default database seed operation.


## Desktop server-side user list

The desktop requests one page at a time with `search`, `assignment_status`, `per_page`, and `page`. Search matches part of the mobile number/code, an exact numeric user ID, or an exact RFID UID. Values must be URL-encoded (including `+` and `&` in card UIDs). Search is trimmed and limited to 255 characters.

`assignment_status` accepts `all` (default), `assigned`, `unassigned`, or `redeemed`. Assigned and unassigned exclude attendees who completed station 4; redeemed includes these attendees even after the card is released. The existing `without_nfc=1` remains supported and combines with other filters without changing its previous meaning.

The normal pagination response also includes `counts: {"all": 100, "assigned": 30, "unassigned": 50, "redeemed": 20}`. These are global attendee counts, independent of search, assignment filter, and pagination; admins and staff are excluded. `total` is the number matching the current search and filter. `per_page` is 1–100 and `page` is a positive integer; invalid parameters return 422. Results are ordered by descending user ID.

The desktop debounces search by 300 ms, resets to page 1 when search/filter/page size changes, and ignores outdated responses. It reloads the current page and counts after linking or unlinking a card. Deploy this API update before using the updated desktop app.


## Live attendee registrations

New registrations broadcast `attendee.registered` on the private Pusher channel `private-nfc-registrations`, after the database transaction commits. The event contains only `user_id`. It is triggered by Laravel's existing `Registered` event; creating staff/admin accounts does not notify registration desktops. A broadcast outage is logged and does not fail registration.

Login and `GET /api/admin/user` now include `realtime: {"key": "PUBLIC_PUSHER_KEY", "cluster": "ap1"}` for admins and registration staff when broadcasting is configured. Otherwise `realtime` is null, including for station staff. Pusher secrets and app IDs are not returned. The desktop bundles Pusher JS 8.2.0 locally under `src/assets/vendor`, with its license.

Authorize the private channel through `POST /api/admin/broadcasting/auth` with the existing bearer token and JSON body `{"socket_id":"123.456","channel_name":"private-nfc-registrations"}`. The response is Pusher's signed `auth` object. Admins and valid registration staff need `nfc:manage`; station staff and attendees receive 403. Other channel names and malformed socket IDs return 422. Unconfigured broadcasting returns 503. No browser session cookie or CSRF token is required for this API route.

The desktop reloads only its current search/filter/page after notification. Events arriving together are batched; automatic registration reloads are capped at one per five seconds per desktop. Reloads wait for an active search, list request, or card/lookup/confirmation dialog to finish. A notification during an in-flight reload schedules a later update. Successful subscription/reconnection also schedules a catch-up read. Signing out disconnects and clears pending updates. There is no periodic API polling. Each connection normally uses one channel-authorization request plus one catch-up list request; each event batch uses one list request.

A newly registered attendee appears only when matching the current search/filter and page; global summary counts still update. The list header shows the live-update connection state. If live updates are unavailable, changing the search, filter, or page still fetches the latest server data.

For Laravel 10, configure `BROADCAST_DRIVER=pusher`, `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET`, and `PUSHER_APP_CLUSTER` on the server. Use the hosted Pusher Channels service and allow its secure WebSocket connection from the desktop network. This integration uses synchronous broadcasts and does not require a queue worker. Deploy the new event, listener, provider mapping, API controller, API route, and channel authorization; rebuild any cached configuration/events/routes as part of deployment, then rebuild the desktop app.

Run `node scripts/test-registration-updates.mjs` for mocked desktop subscription, authorization, batching, rate cap, reconnection, busy-work deferral, outage, and cleanup checks. Laravel `AdminApiTest` covers registration broadcasts, commit/rollback behavior, outages, authorization, and public configuration under PHP 8.3. Hosted Pusher delivery must still be verified in the deployed environment.
