# Resort Booking System

A modern, full-featured resort booking management system built with Next.js and Firebase.

## Features

- 🏨 **Room Management** - Add, edit, and manage resort rooms with pricing
- 📅 **Booking System** - Real-time booking with date availability checking
- 💳 **Manual GCash Payments** - Per-resort reservation deposit percentage, GCash proof review, and remaining balance collection at check-in
- 📧 **Email Notifications** - Automated email notifications for bookings
- 👤 **Admin Dashboard** - Owner and role-based staff panel for bookings, rooms, payments, and settings
- 📱 **PWA Support** - Progressive Web App with offline functionality
- 🔐 **OTP Verification** - Email-based OTP verification for bookings
- 📊 **Analytics Dashboard** - Revenue tracking and booking analytics
- 🎨 **Dynamic Branding** - Customizable branding settings (logo, colors, contact info)
- 💬 **Contact & Feedback** - Contact form and guest feedback system

## Tech Stack

- **Framework**: Next.js 16
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Payment**: Manual GCash QR
- **Email**: Nodemailer (Gmail)
- **UI Components**: Custom components with Tailwind CSS
- **PWA**: Service Worker with offline support

## Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- Firebase project with Firestore enabled
- Gmail account for email service

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Julyanacsy/E-Commerce-Resort-Room-Booking-System.git
cd E-Commerce-Resort-Room-Booking-System
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
# Public app URL used for Firebase account action links
NEXT_PUBLIC_APP_URL=https://your-domain.example
# One Gmail for all automated mail (OTP, booking status, contact, feedback, super-admin approve/reject)
EMAIL_USER=your_sender@gmail.com
EMAIL_PASSWORD=your_16_char_app_password
# (alias) EMAIL_PASS=...

# Optional: Reply-To / internal copies (defaults to EMAIL_USER)
# EMAIL_REPLY_TO=frontdesk@example.com
ADMIN_EMAIL=admin@example.com
# Required by scheduled reminders and transaction notification delivery
CRON_SECRET=use-a-long-random-secret

# reCAPTCHA
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
```

4. Run the development server:
```bash
npm run dev
# or
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

Enable the Email/Password sign-in provider in Firebase Authentication. Staff approval emails use the configured Gmail SMTP credentials and Firebase action links; add the app's production domain to Firebase Authentication's authorized domains.

### Run with Docker Desktop

Docker Desktop must be running. Put local credentials in the ignored `.env.local` file; never add that file to Git. `docker-compose.yml` passes public `NEXT_PUBLIC_*` settings to the build and server-only credentials to the container at runtime. Docker Compose creates the `dev-network` automatically, so no manual network setup is needed after cloning.

```powershell
docker --version
docker compose version
docker compose --env-file .env.local config --quiet
.\scripts\docker-up.ps1
docker compose ps
curl.exe -I http://localhost:3000/resorts
```

Open [http://localhost:3000](http://localhost:3000). Check container output with `docker compose logs --tail 100 resort-web`. The helper script copies the source into a temporary local build context to avoid Docker BuildKit errors from OneDrive cloud placeholders; it excludes `.env.local` and removes the temporary context after the image is built. For a normal local (non-OneDrive) checkout, `docker compose --env-file .env.local up -d --build` also works. The current local environment must include `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` for guest booking OTP/verification to work in production mode. `CRON_SECRET` is needed for scheduled reminders. Add these to `.env.local` before expecting those features to work.

## Project Structure

```
├── app/
│   ├── admin/          # Admin dashboard pages
│   ├── api/            # API routes
│   └── page.jsx        # Landing page
├── components/
│   ├── admin/          # Admin components
│   ├── sections/       # Landing page sections
│   └── ui/             # Reusable UI components
├── lib/                # Utilities and Firebase config
├── hooks/              # Custom React hooks
└── public/             # Static assets
```

## Key Features

### Booking Flow
1. User selects dates and room type
2. System checks availability and calculates the reservation deposit
3. Guest pays the resort's configured deposit percentage and uploads payment proof and a valid ID
4. User fills the booking form with reCAPTCHA verification
5. OTP sent to user's email
6. User enters 6-digit OTP (auto-submits on completion)
7. Booking and deposit snapshot saved to Firestore
8. Admin receives email notification; the remaining balance is recorded by staff during check-in

The booking total and reservation deposit are calculated and validated by the server from the selected room rate, stay dates, and resort's configured deposit percentage. The guest must acknowledge that cancellation and refund terms are set by the resort and should be confirmed directly before payment. Availability is checked again inside a Firestore transaction; per-night lock documents prevent simultaneous requests from reserving the same room type and dates.

Resorts can set the reservation deposit percentage. Guests pay that deposit to reserve, and the remaining verified balance is collected at check-in.

### Admin Dashboard
- **Overview**: Revenue charts, booking statistics
- **Manage Bookings**: Approve, decline, cancel bookings
- **Manage Rooms**: Add, edit, archive, and restore rooms
- **Inventory Management**: Track resort supplies by name, category, quantity, and low-stock threshold; add, edit, archive, and restore inventory items with low-stock alerts
- **Room Item Monitoring**: Set an expected checklist of supplies and appliances for each room, record condition and quantity before check-in and after checkout, and track refill/replacement needs as resolved
- **Lost and Found**: Front desk and Admin staff log found items with a photo, description, date, and location; guests can view available items on the resort site and submit claims for staff review
- **Contact Messages**: View and manage contact inquiries
- **Feedback**: Issue a private one-time feedback link after verified checkout; review results with the booking reference and stay dates, then publish or hide each response
- **Guest Wi-Fi**: Show each resort's network, password, and optional voucher only after a guest verifies a currently checked-in booking
- **Brand Settings**: Customize branding and contact info
- **Payments**: Set the reservation deposit percentage, review deposits and check-in balances, download booking invoices, export an Excel-compatible payment report, and review payment history
- **Booking Calendar**: View room availability by day and see occupied room types
- **Check-in / Check-out**: Record arrival and departure with timestamps
- **Email Reminders**: Booking confirmation emails include resort rules and check-in instructions; scheduled check-in and checkout reminders are sent one day before each date, followed by a one-time feedback link after verified checkout
- **Cancellations / Refunds**: Record cancellation reasons and manually track refund amounts, dates, and statuses
- **Staff Accounts**: Convert existing accounts or create new staff accounts with Admin, Front desk, or Finance permissions; approve pending accounts and revoke access
- **Admin Notifications**: Resort-admin bell with unread counts and read controls for new bookings, cancellations, pending staff approvals, and received payments
- **Audit Log**: Append-only, resort-scoped history of successful booking, payment, staff, room, listing, branding, settings, contact, and feedback changes

Resort notifications and audit entries are written in the same Firestore transaction as the business change. Booking events notify Admin and Front desk staff; payment and refund events notify Admin and Finance; other resort operations are routed to their permitted roles. Resort owners receive all resort events, and guests receive relevant booking, payment, refund, and stay-status emails. Super Admin alerts are reserved for platform events such as resort applications and approval decisions. Audit records include the actor, action, entity, timestamp, and allowlisted before/after fields; guest contact details, credentials, verification links, and payment evidence are excluded.

Emails are queued in the server-only `resortNotificationOutbox` collection and delivered by `/api/resort/notification-dispatch`. The GitHub Actions workflow `.github/workflows/dispatch-notifications.yml` calls this endpoint every five minutes, avoiding Vercel Hobby's daily-cron limit. Add the GitHub Actions secrets `NOTIFICATION_APP_URL` (the production HTTPS base URL) and `CRON_SECRET`; configure the same `CRON_SECRET`, `EMAIL_USER`, and `EMAIL_PASSWORD` (or `EMAIL_PASS`) in the Vercel environment. The daily booking reminder remains a Vercel cron. Failed messages are retried with exponential backoff; existing events are not backfilled.

Existing audit and notification records are not backfilled. Deploy the Firestore security rules and outbox/admin-notification indexes with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

The Firebase CLI configuration is in `firebase.json`; the index definition is in `firestore.indexes.json`.

### Rooms
Room documents are stored in the Firestore `rooms` collection. Each room uses these fields:

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Guest-facing room name |
| `roomNumber` | string | Resort's room identifier |
| `type` | string | Room category, such as Standard, Deluxe, or Suite |
| `description` | string | Room description |
| `price` | number | Nightly price in PHP |
| `discount` | number | Discount percentage |
| `maxGuests` | number | Maximum guest capacity |
| `bedType` | string | Primary bed type |
| `beds` | number | Number of beds |
| `amenities` | string array | Amenities shown with the room |
| `availability` | string | Availability status, such as Available, Maintenance, or Unavailable |
| `featured` | boolean | Whether the room is highlighted |
| `images` | string array | Image URLs or data URLs for the room |
| `mapsUrl` | string | Optional Google Maps link for the room |
| `ownerUid` | string | Firebase Auth UID of the resort owner; omitted only for legacy unscoped rooms |
| `isArchived` | boolean | Whether the room is hidden from new bookings without deleting its history |
| `createdAt` | Firestore timestamp | Room creation time |
| `isArchived` | boolean | Whether the room is archived and unavailable for new bookings |
| `archivedAt` | Firestore timestamp | When the room was archived; removed when restored |

Owner accounts manage rooms whose `ownerUid` matches their Firebase Auth UID. New rooms are always saved with the signed-in UID. Internal helpdesk accounts may manage their own rooms and claim legacy room documents without an `ownerUid`; the claim assigns the helpdesk user's UID. Room archive and restore actions are audited server mutations; archived rooms are hidden from public listings, marketplace counts, calendar room choices, and new booking or walk-in forms. Existing bookings and their history are retained. The admin room manager shows active rooms by default and supports Archived and All filters.

The room manager supports search, availability filtering, and archive/restore. Room changes are authenticated and audited by the server API. Room item templates and stay inspections are stored under `resortOwners/{ownerUid}/roomInventoryItems` and `resortOwners/{ownerUid}/roomInspections`. Owners and Admin staff manage room supply/appliance templates; Admin and Front desk staff can record pre-check-in and post-checkout quantities and conditions. Checkout findings identify refill, damaged, and missing items and can be marked resolved. These collections are accessed through the authenticated server API; no index deployment is needed.

The public resort site is available at `/?o=<ownerUid>` and the shorter `/stay/<ownerUid>` URL redirects to it. Both render the same owner-scoped rooms and booking experience. Configure `settings/marketplace.legacyUnscopedRoomsOwnerUid` (or `NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID`) to group older unscoped rooms with the intended legacy resort.

### Inventory
General inventory items are stored per resort under `resortOwners/{ownerUid}/inventoryItems`. Room-specific checklists and stay inspection records are stored separately under `roomInventoryItems` and `roomInspections`. Owners and Admin staff set expected room supplies/appliances; Admin and Front desk staff can record quantities and conditions before check-in and after checkout. The checkout inspection calculates refill quantities and flags missing or damaged items; staff can record when each need has been addressed. Changes are resort-scoped and written to the audit log. Firestore creates these subcollections on first use, so no database migration or index deployment is required.

### Lost and Found
Found items are stored per resort under `resortOwners/{ownerUid}/lostAndFound`; guest claims are private documents in each item's `claims` subcollection. Front desk and Admin staff can log items, review or decline claims, and mark items claimed. The public resort landing page lists only unclaimed items and accepts claim submissions through server APIs; guest contact details are not included in the public list. This feature creates its Firestore collections on first use and needs no database migration or composite-index deployment.

### Bookings
Booking documents are stored in the Firestore `guestbooking` collection and are created only after the server verifies the emailed OTP. Each booking contains:

| Field | Type | Description |
| --- | --- | --- |
| `name`, `email`, `phone` | string | Guest contact details |
| `roomType`, `roomId` | string | Selected room name and Firestore document ID |
| `checkIn`, `checkOut` | `YYYY-MM-DD` string | Requested stay dates; checkout is exclusive for availability |
| `guests` | number | Guest count |
| `specialRequests` | string | Optional guest notes |
| `nights`, `pricePerNight`, `totalPrice` | number | Server-calculated stay and price snapshot |
| `status` | string | `Pending`, `Approved`, `Declined`, `Cancelled`, or `Completed` |
| `paymentStatus` | string | `unpaid`, `proof_submitted`, `paid`, or `rejected` |
| `paymentMethod` | string | `gcash` or `cash` when a payment is recorded |
| `paymentAmount` | number | Amount recorded as paid |
| `paymentSource` | string | `walk-in` for walk-in bookings created in Payment management |
| `paymentReviewedAt`, `paymentReviewedBy` | timestamp, string | When and by whom the payment was recorded or reviewed |
| `stayStatus` | string | `not_checked_in`, `checked_in`, or `checked_out` |
| `checkedInAt`, `checkedOutAt` | Firestore timestamp | Recorded arrival and departure times |
| `cancellationReason` | string | Reason recorded when a booking is cancelled |
| `refundAmount`, `refundDate`, `refundStatus`, `refundReason` | number, date, string, string | Manual refund tracking; no refund is sent by the app |
| `reminderEmails` | map | Idempotency state for scheduled confirmation, arrival, and follow-up emails |
| `ownerUid` | string | Resort owner's Firebase Auth UID; omitted for legacy marketplace bookings |
| `proofOfPaymentImage` | string | Compressed payment-proof image data URL |
| `validIdImage` | string | Compressed guest-ID data URL; readable only by the owning resort |
| `createdAt`, `updatedAt` | Firestore timestamp | Server-generated timestamps |

Availability locks and OTP challenges are stored in server-only collections. Firestore rules let only the matching resort owner read its booking documents; public booking pages cannot read bookings or guest uploads. Booking creation and mutations use the Firebase Admin SDK. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` and a random `OTP_SECRET` on the server. Configure `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` for reCAPTCHA.

### Guest Feedback, Wi-Fi, and Safety Emails
In Admin → Guest Information & Reminders, each resort can edit its rules and check-in instructions and configure its Wi-Fi SSID, password, optional voucher, and connection instructions. These values are stored on that resort's `resortOwners/{ownerUid}` document and are not included in audit records. The Wi-Fi API requires the resort, booking reference, and matching booking email, then checks that the booking is approved and currently checked in before returning credentials. Deploy the Firestore rules so unpublished feedback remains private and feedback-token records stay server-only.

The existing daily Vercel cron at `/api/booking/send-reminders` sends check-in and check-out reminders one day before the corresponding date. Booking approval emails include that resort's rules and check-in instructions. After staff records checkout, the scheduled job sends a one-time feedback link; its random token is stored only as a SHA-256 hash in `bookingFeedbackTokens`, expires after 90 days, and is consumed transactionally on submission. Feedback starts hidden and appears publicly only after resort staff publishes it. Set `CRON_SECRET` for scheduled requests and `NEXT_PUBLIC_APP_URL` to the public site URL so feedback links use the correct domain. Email uses the existing `EMAIL_USER` / `EMAIL_PASSWORD` setup.

### Manual GCash Payments
Payment is manual; the project does not use a payment gateway, API key, or webhook.

The resort owner document `resortOwners/{ownerUid}` stores:

| Field | Type | Description |
| --- | --- | --- |
| `gcashQrImage` | string | Compressed embedded PNG/JPG data URL; kept below 500 KB |
| `paymentInstructions` | string | Optional instructions displayed on the guest booking form |
| `reservationDepositPercent` | integer | Reservation deposit percentage (1-100; defaults to 30); the balance is due at check-in |

Guests on an owner-specific booking site pay the configured deposit and upload its payment proof plus one valid ID before requesting the email OTP. The booking stores a snapshot of the deposit percentage and amount, so later setting changes do not affect existing reservations. Once verified, the booking is `partially_paid` unless the resort chose a 100% deposit. Staff record the remaining cash or GCash balance as part of check-in; check-in is rejected until the reservation deposit is verified or recorded. In Admin → Payments, authorized staff may also record an unpaid reservation deposit as cash or create an approved, fully paid walk-in booking. Walk-in dates are checked and locked against other bookings, and the total is calculated from the room's saved price and discount. The public booking form receives only the QR image, payment instructions, and deposit percentage. Valid IDs are only returned to the matching resort owner and are deleted when a booking is completed.

Payment proof submissions, deposit reviews, balance collections at check-in, cash receipts, walk-in payments, and recorded refunds are appended to the server-only `paymentHistory` collection. Payment history supports date, method, and status filters; monthly receipts, refunds, net receipts, and an outstanding balance summary; and Excel-compatible CSV export. Invoices show the booking charge, while downloadable PDF receipts show the actual amount received, method, and date. Firestore client access to payment history is denied; the authenticated server API scopes records to the resort owner and assigned staff role.

### Resort Operations and Staff
The Booking Calendar displays active reservations and available room types by date. Approved bookings can be marked checked in and checked out; the server records the actor and timestamp. Cancelling a booking requires a reason and supports manual refund tracking. Refund records are operational notes only: this project has no payment processor and cannot transfer or return funds.

Resort owners and internal admins sign in at `/admin`; staff sign in separately at `/staff`. Each portal checks the authenticated account's server-verified role and directs users to the correct sign-in page if they use the wrong portal. Owners add staff from Admin → Staff Accounts by checking an email. Existing registered accounts can be converted; for an unregistered person, the owner provides their name, email, and contact details and the system creates a Firebase Auth account. Every new assignment starts Pending. Owner approval sends password-setup and email-verification links and creates an in-app notification for the staff member. Staff can sign in with email/password or Google using their verified account. Enable Firebase's Email/Password provider and configure `NEXT_PUBLIC_APP_URL` and Gmail SMTP for these flows.

Admin staff can manage booking operations and payments; Front desk staff can manage bookings, calendar, check-in/out, walk-ins, and Lost and Found; Finance staff can review payment history, receipts, and refunds. Staff API access and dashboard navigation are scoped to the assigned resort. Valid guest IDs remain viewable only by the resort owner.

Staff assignments are stored under `resortOwners/{ownerUid}/staffInvitations/{email}` with a `pending`, `approved`, or `revoked` status. Approval notifications are stored under `resortOwners/{ownerUid}/staffNotifications/{notificationId}`. Existing invitation documents remain valid through a legacy `active`-field fallback; no destructive migration is required. Staff lookup and sign-in use a Firestore collection-group index on `staffInvitations.email` (ascending). If Firebase returns an index-required error, open its generated Firebase Console link, create the index, and wait until it is enabled. Deploy the updated Firestore rules in `firestore-rules.txt` separately.

Email confirmations are sent when a booking is approved. A daily Vercel Cron job sends check-in instructions one day before arrival and a follow-up after checkout. Configure `CRON_SECRET` alongside the existing email variables; set it in the deployment environment. SMS reminders are not enabled.

### PWA Features
- Offline support with service worker
- Background sync for form submissions
- Installable on mobile and desktop
- Offline data caching

### Tests

Run the booking rules and permission tests with:

```bash
npm test
```

### Image Storage Roadmap

Room photos, resort GCash QR images, payment proofs, and guest IDs currently use compressed data URLs in Firestore documents. This keeps uploads simple but increases document size and read costs. A future Firebase Storage migration should:

1. Add authenticated, server-authorized uploads under tenant-scoped paths; guest ID and payment-proof paths must remain private to the owning resort.
2. Save Storage object paths and small metadata in Firestore instead of image data URLs. Public room photos and QR codes should be separated from private guest documents.
3. Update upload, preview, admin review, email, and deletion flows to use short-lived authorized URLs or server-proxied reads where access is private.
4. Migrate existing images in batches, verify each uploaded object and its tenant permissions, then switch reads before removing old Firestore fields.
5. Add lifecycle cleanup for abandoned uploads and completed-booking IDs, and retain a rollback window before deleting legacy data.

Do not delete existing data URLs until migration verification, tenant access tests, and a rollback plan are complete.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, email admin@example.com or open an issue in the repository.
