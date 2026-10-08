# YSL Admin design system

Reference for the Tauri NFC app, derived from the current admin login, Users table, RFID page, and sidebar. Import `tokens.css` into the app stylesheet. This reference does not change the admin's existing styles.

Open `reference.html` in a browser for the visual component sheet. Keep fonts, icons, and logos bundled locally in the desktop app so the UI works offline. The sheet uses system font fallback unless Open Sans is installed.

## Foundations

| Role | Value | Usage |
| --- | --- | --- |
| Canvas | #f8f9fa | App background |
| Surface | #ffffff | Sidebar, cards, dialogs |
| Subtle surface | #f8fafc | Inputs, table headers |
| Primary | #5e72e4 | Main actions, selected filters, current page |
| Primary hover | #4c60d2 | Button hover |
| Primary soft | #eef0ff | Icon tiles, information notices |
| Main text | #344767 | Headings, labels, body |
| Secondary text | #67748e | Table headings, supporting content |
| Muted text | #8392ab | Existing admin captions and metadata |
| Border / divider | #e9edf3 / #edf0f5 | Controls / sections |
| Input border | #dfe5ee | Text fields |
| Success | #23864b on #e7f5ec | Assigned card, completed station |
| Danger | #b42332 on #fff1f2 | Unassign, errors, destructive actions |
| Neutral | #67748e on #f1f2f5 | Unassigned card, secondary controls |

The existing muted color is light. Use secondary text for essential instructions and small text that must be comfortably readable; reserve muted text for decorative or disabled content. Always pair status color with a written label.

Typography: Open Sans, weights 400, 600, 700. Use 24px/700 for page and login titles, 20px/600 for section or dialog titles, 16px/600 for empty-state titles, 14px/400 for body and inputs, 13px/600 for action labels, 12px/400 for metadata and badges, and 11px/600 with .5px tracking for table headings. Body line-height is 1.6. Card UIDs use monospace; retain their exact value.

Spacing uses 4, 8, 12, 16, 20, 24, 28, and 32px. Default card padding is 24px; table cells use 16px. Use 24px between cards and 12–16px between related controls. Control radius is 10px, badges 8px, menus 12px, cards 16px, dialogs 18px, and login cards 20px.

## Layout

Desktop: white sidebar, gray canvas, page heading, then content cards. Keep the logo at the top and Logout in a footer at the bottom. Navigation fills the sidebar width; long navigation scrolls above its footer. Use a 250px sidebar as the app starting point, adapting to the window size.

Toolbar: search on the left and a single Export dropdown on the right. Place the All / Assigned / Unassigned switch below. Put pagination under the table, separated by a divider: page size and result count on the left, page controls on the right. Horizontal overflow belongs to the table, not the whole window.

At narrow widths, use 16px card padding, wrap toolbar controls, and collapse navigation. The admin uses 576px for compact table layouts and 480px for login adjustments. In the app, ensure buttons remain usable at its minimum supported window size.

## Components and states

| Component | Specification |
| --- | --- |
| Primary button | Purple background, white text, 12px 16px padding, 13px/600 label, 10px radius |
| Secondary button | Neutral background, secondary text, same dimensions |
| Destructive button | Pale red background, dark red text; explicit label such as Unassign |
| Input / search | Subtle background, 1px input border, 12–14px padding, 10px radius; purple border and focus ring on focus |
| Card | White, 1px divider border, 16px radius; header separated by divider |
| Badge | 6px 10px padding, 8px radius, 12px text; icon plus status label |
| Filter switch | Subtle container, 4px inset and gap, 10px radius; selected segment purple with white text; aria-pressed state |
| Export menu | One Export trigger with icon and chevron; white menu, 180px minimum width, 6px inset, 12px radius, menu shadow |
| Pagination | 34px minimum width, 7px 10px padding, 8px radius; selected purple, inactive white with border, disabled opacity .4 |
| Empty state | Centered 64px soft purple icon tile, 16px title, short explanatory text, 32–48px vertical padding |
| Dialog | White, 400–460px maximum width, 28–32px padding, 18px radius, dialog shadow, dark translucent backdrop |
| Login | Centered 440px maximum card, 36px padding, logo, title, email/password fields, full-width Sign in button; purple upper background |

Loading: show a short action label such as Assigning… and disable repeat submission. Keep existing rows visible during refresh. Errors belong beside the affected field or inside the dialog and must retain entered values. Success updates the row and announces a short status message. Do not rely on a transient toast alone for reader connection failures.

Use semantic buttons, labels, and tables. Icon-only controls need an accessible name. Focus uses a 3px #b6bfff outline with 2px offset. Dialogs trap focus, support Escape, start on Cancel for destructive actions, and return focus to the opener. Use at least 44px targets for primary app controls; the smaller admin pagination can use extra outer space for touch targets.

Motion: 200ms for hover color changes and dialog entrance (12px upward movement with fade). Logout icon may move 4px on hover. Respect prefers-reduced-motion. Avoid continuous animation when the reader is idle.

## Icons and branding

The admin uses Font Awesome solid icons. Match these concepts in the app's chosen icon package:

| Purpose | Existing icon |
| --- | --- |
| RFID card | fa-id-card |
| Assigned | fa-link |
| Unassign | fa-link-slash |
| Search | fa-magnifying-glass |
| Export | fa-arrow-up-from-bracket |
| Copy / CSV / Excel | fa-copy / fa-file-csv / fa-file-excel |
| Logout | fa-right-from-bracket |
| Desktop app | fa-desktop |

Use 14–16px icons inside controls, 24–26px in feature tiles. Preserve the logo aspect ratio; the admin uses `public/images/logo2.png`. Do not recolor or stretch the logo.

## NFC app flow

1. Sign in with admin credentials using the existing API.
2. Show reader connection state next to the page heading, with text such as Reader connected or Reader disconnected.
3. Display searchable users with ID, mobile number, UID, and Assigned / Unassigned status. Default filter: All.
4. Select a user, then open a Link card panel showing that user's identity and a waiting-for-card state. Show the captured UID before the explicit Link card action.
5. If replacing a card, explain the old link will be replaced and request confirmation.
6. Unassign uses a confirmation dialog: “Unassign this card?” with Cancel and Yes, unassign. On success, clear the UID and update filter membership.
7. Logout uses the same confirmation pattern as the admin.

Use “Assigned” and “Unassigned” consistently in the app; the current web badges use “Linked” and “Not linked” with the same meanings. All search and filter states compose. Export includes filtered results and excludes action controls. API details are in `../tauri-api.md`.

## Implementation sources

- `resources/views/layouts/admin.blade.php`: font, shell, sidebar, logout dialog and motion.
- `resources/views/auth/admin-login.blade.php`: login card, form fields and errors.
- `resources/views/users.blade.php`: export menu, pagination, empty states.
- `resources/views/rfid.blade.php`: cards, assignment filter, UID styling and unlink dialog.

App-specific layout widths and NFC reader states above are adaptations; palette and component dimensions come from the current admin. Bundle `tokens.css` and use the same tokens in every app screen.
