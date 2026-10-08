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

List parameters: `without_nfc=1`, `search` (mobile number or exact ID), `per_page` (1–100, default 25), and `page`. Pagination response includes `data`, `current_page`, `last_page`, and `total`.

User fields: `id`, `email`, `code`, `mobile_number`, `rfid_uid`. Registration stores the mobile number in `code`; older records may contain a legacy registration code.

Assignment body:

```json
{"rfid_uid":"04A1B2C3D4"}
```

Use the same UID representation as the existing card reader. Duplicate UIDs return 422. Missing/expired tokens return 401; accounts without admin access return 403. Admin accounts cannot be assignment targets (404).

The existing `/api/users/without-nfc` shared-secret endpoint remains available for existing integrations. The desktop app can use `/api/admin/users?without_nfc=1` with its login token instead.
