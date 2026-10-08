# Tauri NFC API

Send `Accept: application/json` and `Content-Type: application/json`.

## Login

`POST /api/admin/login`

```json
{"email":"admin@example.com","password":"your-password","device_name":"NFC desktop"}
```

Returns `token`, `token_type`, `expires_at`, and `user`. Token expires after 24 hours. Only accounts with the admin role can log in. Invalid credentials return 422; excessive login attempts return 429.

For all endpoints below send `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/admin/user | Current signed-in admin, under `data` |
| GET | /api/admin/users | Paginated assignment users, excluding admins |
| GET | /api/admin/users/{id} | One assignment user, under `data` |
| PUT | /api/admin/users/{id}/nfc | Assign or replace NFC UID |
| DELETE | /api/admin/users/{id}/nfc | Unassign NFC card (no request body) |
| POST | /api/admin/logout | Revoke current token |
| GET | /api/admin/stations | Stations ordered by ID, under `data` (ID, name, description) |
| POST | /api/admin/stations/check-in | Check in an assigned NFC card at a station |

List parameters: `without_nfc=1`, `search` (mobile number or exact ID), `per_page` (1–100, default 25), and `page`. Pagination response includes `data`, `current_page`, `last_page`, and `total`.

User fields: `id`, `email`, `code`, `mobile_number`, `rfid_uid`. Registration stores the mobile number in `code`; older records may contain a legacy registration code.

Assignment body:

```json
{"rfid_uid":"04A1B2C3D4"}
```

Use the same UID representation as the existing card reader. Duplicate UIDs return 422. Missing/expired tokens return 401; accounts without admin access return 403. Admin accounts cannot be assignment targets (404).

The existing `/api/users/without-nfc` shared-secret endpoint remains available for existing integrations. The desktop app can use `/api/admin/users?without_nfc=1` with its login token instead.

## Station check-in

Load the station selector from `GET /api/admin/stations`. Send the selected station ID and captured card UID:

```json
{"station_id":1,"rfid_uid":"04A1B2C3D4"}
```

`POST /api/admin/stations/check-in` uses the same bearer token as card assignment and the same rules as the web kiosk. A successful check-in returns HTTP 200 with `status: "success"` and `message: "Station checked in successfully"`. A repeat tap returns HTTP 200 with `status: "duplicate"` and does not create another record. Unknown cards return 404 with `status: "error"`; invalid fields return 422 with validation errors. Admin cards are not check-in targets (404).

Station 4 requires completed check-ins at stations 1, 2, and 3; otherwise it returns 422 with `status: "prerequisites_not_met"`. Successful station 4 redemption clears the card assignment so the card can be reused. A subsequent tap of that cleared card returns 404 until it is assigned again. Check-ins record elapsed time using the previous check-in (or last login/registration for the first station) and broadcast the existing attendee confirmation event.

Disable repeat submission while a tap is being processed. Inspect `status` even on HTTP 200, and show the returned message beside the reader controls. A server error returns 500; avoid claiming success or automatically retrying a gift redemption when the outcome is uncertain.
