# Resort Booking System

A modern, full-featured resort booking management system built with Next.js and Firebase.

## Features

- 🏨 **Room Management** - Add, edit, and manage resort rooms with pricing
- 📅 **Booking System** - Real-time booking with date availability checking
- 💳 **Manual GCash Payments** - Resort QR payments with owner verification
- 📧 **Email Notifications** - Automated email notifications for bookings
- 👤 **Admin Dashboard** - Comprehensive admin panel for managing bookings, rooms, and settings
- 📱 **PWA Support** - Progressive Web App with offline functionality
- 🔐 **OTP Verification** - Email-based OTP verification for bookings
- 📊 **Analytics Dashboard** - Revenue tracking and booking analytics
- 🎨 **Dynamic Branding** - Customizable branding settings (logo, colors, contact info)
- 💬 **Contact & Feedback** - Contact form and guest feedback system

## Tech Stack

- **Framework**: Next.js 14
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
# One Gmail for all automated mail (OTP, booking status, contact, feedback, super-admin approve/reject)
EMAIL_USER=your_sender@gmail.com
EMAIL_PASSWORD=your_16_char_app_password
# (alias) EMAIL_PASS=...

# Optional: Reply-To / internal copies (defaults to EMAIL_USER)
# EMAIL_REPLY_TO=frontdesk@example.com
ADMIN_EMAIL=admin@example.com

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
2. System checks availability
3. User fills booking form with reCAPTCHA verification
4. OTP sent to user's email
5. User enters 6-digit OTP (auto-submits on completion)
6. Booking saved to Firestore
7. Admin receives email notification

### Admin Dashboard
- **Overview**: Revenue charts, booking statistics
- **Manage Bookings**: Approve, decline, cancel bookings
- **Manage Rooms**: Add, edit, delete rooms
- **Contact Messages**: View and manage contact inquiries
- **Feedback**: Publish/hide guest feedback
- **Brand Settings**: Customize branding and contact info
- **Payments**: Review payments, download booking invoices, export an Excel-compatible payment report, and review payment history

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
| `createdAt` | Firestore timestamp | Room creation time |

Owner accounts manage rooms whose `ownerUid` matches their Firebase Auth UID. New rooms are always saved with the signed-in UID. Internal helpdesk accounts may manage their own rooms and claim legacy room documents without an `ownerUid`; the claim assigns the helpdesk user's UID. Firestore rules permit only the matching owner to update or delete an owned room.

The public resort site is available at `/?o=<ownerUid>` and the shorter `/stay/<ownerUid>` URL redirects to it. Both render the same owner-scoped rooms and booking experience. Configure `settings/marketplace.legacyUnscopedRoomsOwnerUid` (or `NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID`) to group older unscoped rooms with the intended legacy resort.

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
| `ownerUid` | string | Resort owner's Firebase Auth UID; omitted for legacy marketplace bookings |
| `proofOfPaymentImage` | string | Compressed payment-proof image data URL |
| `validIdImage` | string | Compressed guest-ID data URL; readable only by the owning resort |
| `createdAt`, `updatedAt` | Firestore timestamp | Server-generated timestamps |

Availability locks and OTP challenges are stored in server-only collections. Firestore rules let only the matching resort owner read its booking documents; public booking pages cannot read bookings or guest uploads. Booking creation and mutations use the Firebase Admin SDK. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` and a random `OTP_SECRET` on the server. Configure `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` for reCAPTCHA.

### Manual GCash Payments
Payment is manual; the project does not use a payment gateway, API key, or webhook.

The resort owner document `resortOwners/{ownerUid}` stores:

| Field | Type | Description |
| --- | --- | --- |
| `gcashQrImage` | string | Compressed embedded PNG/JPG data URL; kept below 500 KB |
| `paymentInstructions` | string | Optional instructions displayed on the guest booking form |

Guests on an owner-specific booking site upload payment proof and one valid ID before requesting the email OTP. The booking starts with `paymentStatus: proof_submitted`; the owning resort verifies it and marks it `paid` or `rejected`. In Admin → Payments, an owner can also record cash received for an existing booking or create an approved, fully paid walk-in booking. Walk-in dates are checked and locked against other bookings, and the total is calculated from the room's saved price and discount. The public booking form receives only the QR image and payment instructions. Valid IDs are only returned to the matching resort owner and are deleted when a booking is completed.

Payment proof submissions, GCash reviews, cash receipts, and walk-in payments are appended to the server-only `paymentHistory` collection. The Payments tab can download an invoice PDF per booking and export payment history as a UTF-8 CSV that opens in Excel. Firestore client access to payment history is denied; the authenticated server API scopes records to the signed-in resort owner.

### PWA Features
- Offline support with service worker
- Background sync for form submissions
- Installable on mobile and desktop
- Offline data caching

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
