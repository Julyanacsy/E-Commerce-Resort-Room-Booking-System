# E-Commerce Resort Room Booking System — Complete 17-Diagram Blueprint

## 1. Project Identification

**Proposal Title:** E-Commerce Resort Room Booking System

This web-based system lets guests discover resorts, view rooms, check dates, and submit booking requests online. Resort owners and authorized staff manage rooms, bookings, payment reviews, and guest messages, while Super Admins review resort registrations and marketplace settings. The application uses Next.js, Vercel, and Firebase, with email OTP verification and manual GCash payment review.

## 2. Structural Diagrams (8)

### Diagram 1: System Architecture Diagram — Selected Essential Blueprint

This diagram is essential because the system runs as a web application across several connected services rather than on one machine. It shows where the browser, Vercel-hosted Next.js application, Firebase services, and external services fit together, and distinguishes public/client interactions from protected server-side booking operations. That layout guides implementation, deployment, and security boundaries.

```mermaid
flowchart LR
    Guest[Guest]
    Owner[Resort owner]
    Staff[Authorized resort staff]
    SuperAdmin[Super Admin]

    subgraph Client["User device"]
        Browser["Web browser<br/>Marketplace, resort booking site,<br/>admin and Super Admin screens"]
    end

    subgraph Vercel["Vercel — Next.js 16 application"]
        Edge["Edge network and middleware"]
        Pages["Next.js pages and static assets"]
        Routes["Serverless API routes"]
        AdminSDK["Firebase Admin SDK"]
        Cron["Daily Vercel Cron"]
    end

    subgraph Firebase["Firebase project"]
        Auth["Firebase Authentication<br/>Google and email/password sign-in"]
        Firestore[("Cloud Firestore<br/>resorts, rooms, bookings,<br/>OTP challenges, date locks,<br/>payments and settings")]
        Rules["Firestore Security Rules"]
    end

    Recaptcha["Google reCAPTCHA"]
    Gmail["Gmail SMTP"]
    Maps["Google Maps"]
    GCash["Resort GCash account<br/>(manual payment outside the app)"]

    Guest --> Browser
    Owner --> Browser
    Staff --> Browser
    SuperAdmin --> Browser
    Browser -->|"HTTPS"| Edge
    Edge --> Pages
    Browser <-->|"Google or email/password sign-in"| Auth
    Browser <-->|"Client reads, limited by rules"| Rules
    Rules <--> Firestore
    Browser -->|"HTTPS JSON requests"| Routes
    Routes --> AdminSDK
    AdminSDK -->|"Server-side reads, writes and transactions"| Firestore
    Routes -->|"Verify booking token"| Recaptcha
    Routes -->|"OTP and booking emails"| Gmail
    Cron --> Routes
    Routes -->|"Resolve map links when requested"| Maps
    Guest -.->|"Scans resort QR and pays directly"| GCash
    Guest -.->|"Submits payment proof for owner review"| Browser
```

**Important boundary:** GCash payment is manual. The application displays the resort's QR code and records uploaded payment proof; it does not process a GCash transaction or use a payment gateway.

**Brief explanation — purpose, function, and flow:** Para ito ipakita ang kabuuang architecture at deployment boundaries ng system. Dinadala ng browser ang user request sa Vercel; ang Next.js pages at API routes ang nagpoproseso nito, at kumokonekta ang server sa Firebase o external services kung kailangan. Direktang hiwalay sa application ang aktuwal na GCash transfer.

### Diagram 2: Class Diagram

The class diagram models the persistent records and their relationships. OTP challenges and date locks are server-managed records; payment history is separate from the booking's current payment status.

```mermaid
classDiagram
    class ResortOwner {
        +string uid
        +string email
        +string status
        +string role
    }
    class Resort {
        +string ownerUid
        +string name
        +string location
        +string status
    }
    class Room {
        +string ownerUid
        +string name
        +number price
        +number discount
        +number maxGuests
        +string availability
    }
    class GuestBooking {
        +string ownerUid
        +string name
        +string email
        +string roomId
        +string roomType
        +date checkIn
        +date checkOut
        +number totalPrice
        +string status
        +string paymentStatus
        +string stayStatus
    }
    class OtpChallenge {
        +string email
        +string ownerUid
        +string codeHash
        +datetime sentAt
        +datetime expiresAt
        +number attempts
    }
    class BookingDateLock {
        +string ownerUid
        +string roomType
        +date date
        +string bookingId
    }
    class PaymentHistory {
        +string ownerUid
        +string bookingId
        +string action
        +string paymentMethod
        +number amount
        +datetime createdAt
    }
    class ContactMessage {
        +string ownerUid
        +string name
        +string email
        +string message
    }
    class Feedback {
        +string ownerUid
        +string name
        +number rating
        +string message
    }
    class SuperAdminAuditLog {
        +string actorUid
        +string action
        +string targetId
        +datetime createdAt
    }
    class ResortSiteSettings {
        +string ownerUid
        +string gcashQrImage
        +string paymentInstructions
        +string branding
    }

    ResortOwner "1" --> "0..1" Resort : owns and registers
    ResortOwner "1" --> "0..*" Room : manages
    ResortOwner "1" --> "0..*" GuestBooking : manages
    ResortOwner "1" --> "0..*" ContactMessage : receives
    ResortOwner "1" --> "0..*" Feedback : receives
    ResortOwner "1" --> "0..1" ResortSiteSettings : configures
    GuestBooking "1" --> "0..*" BookingDateLock : reserves dates
    GuestBooking "1" --> "0..*" PaymentHistory : has payment events
    Room "1" ..> "0..*" GuestBooking : selected by roomId and roomType
    ResortOwner "1" ..> "0..*" OtpChallenge : OTP scoped by owner
    SuperAdminAuditLog ..> Resort : records moderation actions
```

**Brief explanation — purpose, function, and flow:** Ipinapakita ng class diagram ang mga pangunahing uri ng data, mga field ng mga ito, at ugnayan ng mga record. Halimbawa, ang owner ay may resort at rooms, habang ang booking ay may date locks at payment-history events. Blueprint ito ng data structure, hindi sunod-sunod na user workflow.

### Diagram 3: Component Diagram

The component diagram groups the application into UI, API, shared server libraries, data access, and external services. It highlights the browser's limited direct Firestore access and the server-side use of the Firebase Admin SDK.

```mermaid
flowchart TB
    subgraph UI["Presentation components — Next.js pages, React components and hooks"]
        Marketplace["Resort marketplace and registration"]
        GuestSite["Guest resort site and booking form"]
        AdminUI["Owner and staff admin dashboard"]
        SuperUI["Super Admin console"]
        Hooks["Branding, auth and data hooks"]
        Marketplace --> Hooks
        GuestSite --> Hooks
        AdminUI --> Hooks
        SuperUI --> Hooks
    end

    subgraph API["Next.js API route components"]
        BookingAPI["Booking APIs<br/>availability, OTP, booking, payments"]
        AdminAPI["Admin APIs<br/>booking, staff and payment operations"]
        ResortAPI["Resort and payment settings APIs"]
        ContactAPI["Contact and feedback APIs"]
        UtilityAPI["Maps resolver, invoices and reminders"]
    end

    subgraph Shared["Shared server libraries"]
        Tenant["Tenant and authorization checks"]
        OTP["OTP challenge service"]
        Mail["Mail and notification service"]
        Invoice["Invoice and receipt builders"]
        BookingCore["Booking validation and date-lock logic"]
    end

    subgraph Data["Firebase services"]
        ClientSDK["Firebase client SDK"]
        AdminSDK["Firebase Admin SDK"]
        Auth["Firebase Authentication"]
        Rules["Firestore Security Rules"]
        Firestore[("Cloud Firestore")]
        ClientSDK --> Auth
        ClientSDK --> Rules --> Firestore
        AdminSDK --> Firestore
    end

    subgraph External["External integrations"]
        Recaptcha["Google reCAPTCHA"]
        Gmail["Gmail SMTP"]
        Maps["Google Maps"]
    end

    Marketplace --> ResortAPI
    GuestSite --> BookingAPI
    AdminUI --> AdminAPI
    SuperUI --> ResortAPI
    SuperUI --> AdminAPI
    BookingAPI --> Tenant
    BookingAPI --> OTP
    BookingAPI --> BookingCore
    BookingAPI --> Mail
    AdminAPI --> Tenant
    AdminAPI --> BookingCore
    AdminAPI --> Invoice
    AdminAPI --> Mail
    ResortAPI --> Tenant
    ContactAPI --> Mail
    UtilityAPI --> Invoice
    UtilityAPI --> Mail
    BookingAPI --> Recaptcha
    OTP --> AdminSDK
    BookingCore --> AdminSDK
    Tenant --> AdminSDK
    Mail --> Gmail
    UtilityAPI --> Maps
```

**Brief explanation — purpose, function, and flow:** Ipinapakita nito ang software modules at kung paano sila umaasa sa isa't isa. Nagsisimula ang interaction sa UI, dumadaan sa angkop na API at shared logic, at kumokonekta sa Firebase o external service. Nililinaw nito kung aling component ang may responsibilidad sa bawat gawain.

### Diagram 4: Deployment Diagram

This deployment view shows the runtime nodes and network boundaries for the production system. Vercel hosts the Next.js application; Firebase and Google services remain managed external services.

```mermaid
flowchart LR
    subgraph Device["Guest, owner or Super Admin device"]
        Browser["Web browser<br/>HTTPS client"]
    end

    subgraph Vercel["Vercel platform"]
        Edge["Edge network<br/>TLS termination and middleware"]
        Next["Next.js 16 application"]
        Functions["Serverless API functions"]
        Cron["Scheduled Cron invocation"]
        Env["Encrypted environment variables"]
        Edge --> Next
        Next --> Functions
        Cron --> Functions
        Env -. "runtime configuration" .-> Functions
    end

    subgraph Firebase["Google Firebase"]
        Auth["Firebase Authentication"]
        Firestore[("Cloud Firestore<br/>security rules enabled")]
    end

    subgraph Google["Google and email services"]
        Captcha["reCAPTCHA verification"]
        Identity["Identity Toolkit"]
        Gmail["Gmail SMTP"]
        Maps["Google Maps URL resolver"]
    end

    GitHub["GitHub repository"]
    Browser -->|"HTTPS :443"| Edge
    Browser <-->|"Authentication and authorized client reads"| Auth
    Functions -->|"TLS HTTPS"| Auth
    Functions -->|"Admin SDK over TLS"| Firestore
    Functions -->|"HTTPS"| Captcha
    Functions -->|"HTTPS token check"| Identity
    Functions -->|"SMTP over TLS"| Gmail
    Functions -->|"HTTPS"| Maps
    GitHub -->|"source and deployment trigger"| Vercel
```

**Brief explanation — purpose, function, and flow:** Ipinapakita ng deployment diagram kung saan tumatakbo ang application sa production at saang network nodes ito kumokonekta. Ang browser ay kumokonekta sa Vercel sa HTTPS; ang Vercel functions naman ang kumokonekta sa Firebase, reCAPTCHA, email, at iba pang kinakailangang service.

### Diagram 5: Object Diagram

This object diagram is an illustrative snapshot, not live guest data. It shows a resort, owner, room, booking, and associated payment event as instances of the modeled classes.

```mermaid
flowchart LR
    Owner["owner01 : ResortOwner<br/>uid = owner01<br/>status = approved"]
    Resort["resort01 : Resort<br/>name = Sunset Beach Resort<br/>status = approved"]
    Room["room01 : Room<br/>name = Deluxe<br/>price = PHP 3,500<br/>availability = Available"]
    Booking["booking01 : GuestBooking<br/>guest = Ana Cruz<br/>dates = 2026-11-05 to 2026-11-07<br/>nights = 2<br/>totalPrice = PHP 7,000<br/>status = Approved<br/>paymentStatus = paid"]
    Payment["payment01 : PaymentHistory<br/>action = mark-as-paid<br/>method = gcash<br/>amount = PHP 7,000"]
    Settings["settings01 : ResortSiteSettings<br/>payment = manual GCash QR"]

    Owner -->|"owns"| Resort
    Owner -->|"manages"| Room
    Owner -->|"configures"| Settings
    Resort -->|"offers"| Room
    Room -->|"selected by"| Booking
    Booking -->|"payment event"| Payment
    Owner -->|"records"| Payment
```

**Brief explanation — purpose, function, and flow:** Isa itong halimbawa ng aktuwal na instances batay sa mga class na ipinakita sa Diagram 2. Ipinapakita nito kung paano magkakaugnay ang isang sample owner, resort, room, booking, settings, at payment event sa isang snapshot; hindi ito live guest data o workflow.

### Diagram 6: Package Diagram

The package diagram summarizes the repository's major code packages and their dependencies.

```mermaid
flowchart TB
    subgraph App["app — routes, pages and API handlers"]
        Pages["Marketplace, guest site,<br/>admin and Super Admin pages"]
        ApiRoutes["API route handlers"]
    end
    subgraph Components["components — reusable UI"]
        GuestComponents["Guest sections"]
        AdminComponents["Admin and Super Admin components"]
        UI["Shared UI components"]
    end
    subgraph Hooks["hooks — client state and data"]
        BrandingHooks["Branding, marketplace and device hooks"]
    end
    subgraph Lib["lib — domain and service helpers"]
        BookingLib["Booking, tenant and access helpers"]
        OtpLib["OTP service"]
        MailLib["Mail and invoice helpers"]
        FirebaseLib["Firebase client and Admin setup"]
    end
    subgraph Public["public — static assets and service worker"]
        Static["Images, manifest and sw.js"]
    end
    subgraph Config["Root configuration"]
        NextConfig["Next.js, Tailwind, TypeScript and deployment config"]
    end

    Pages --> GuestComponents
    Pages --> AdminComponents
    Pages --> BrandingHooks
    Pages --> BookingLib
    ApiRoutes --> BookingLib
    ApiRoutes --> OtpLib
    ApiRoutes --> MailLib
    ApiRoutes --> FirebaseLib
    GuestComponents --> UI
    AdminComponents --> UI
    AdminComponents --> BrandingHooks
    BookingLib --> FirebaseLib
    OtpLib --> FirebaseLib
    MailLib --> FirebaseLib
    Pages -. "served as static assets" .-> Static
    App -. "built using" .-> Config
```

**Brief explanation — purpose, function, and flow:** Ipinapakita nito kung paano pinangkat ang source code sa repository at kung saan nanggagaling ang dependencies. Halimbawa, gumagamit ang pages at API routes ng shared helpers sa `lib/`, habang umaasa ang UI sa components at hooks. Nakakatulong ito sa pag-navigate at pag-maintain ng codebase.

### Diagram 7: Composite Structure Diagram — Booking Service

This diagram opens the booking service into collaborating parts and shows the main ports and connections used by booking requests.

```mermaid
flowchart LR
    Guest((Guest))
    subgraph BookingService["Booking service — internal structure"]
        Form["Booking form<br/>collects details and uploads"]
        Controller["Booking API controller<br/>send-otp and verify-otp"]
        Validation["Input and price validation"]
        OTPStore["OTP challenge store"]
        Availability["Availability and date-lock service"]
        BookingRepo["Booking repository"]
        AuditRepo["Payment history repository"]
        Mailer["Mail service"]
    end
    Firestore[("Cloud Firestore")]
    Recaptcha["Google reCAPTCHA"]
    SMTP["Gmail SMTP"]

    Guest -->|"form data"| Form
    Form -->|"JSON over HTTPS"| Controller
    Controller -->|"token"| Recaptcha
    Controller --> Validation
    Controller --> OTPStore
    Controller --> Availability
    Controller --> BookingRepo
    Controller --> AuditRepo
    Controller --> Mailer
    OTPStore --> Firestore
    Availability --> Firestore
    BookingRepo --> Firestore
    AuditRepo --> Firestore
    Mailer --> SMTP
```

**Brief explanation — purpose, function, and flow:** Nagfo-focus ito sa internal na bahagi ng booking service at sa koneksyon ng mga ito. Mula sa guest form, pumapasok ang data sa API controller, dumadaan sa validation, CAPTCHA/OTP at availability checks, at pagkatapos ay sa Firestore repositories at mail service. Ipinapakita nito kung paano nagtutulungan ang subcomponents para sa booking request.

### Diagram 8: Profile Diagram — Project UML Profile

This project profile defines a consistent set of stereotypes for documenting the app's pages, API routes, Firestore data, roles, and integrations.

```mermaid
classDiagram
    class BayRestProfile {
        <<profile>>
        +WebPage
        +APIEndpoint
        +FirestoreCollection
        +UserRole
        +ExternalService
    }
    class WebPage {
        <<stereotype>>
        route
        requiresAuth
        role
    }
    class APIEndpoint {
        <<stereotype>>
        method
        path
        authRequired
    }
    class FirestoreCollection {
        <<stereotype>>
        collectionName
        ownerScoped
        clientReadable
    }
    class UserRole {
        <<stereotype>>
        roleName
        permissions
    }
    class ExternalService {
        <<stereotype>>
        serviceName
        protocol
    }

    BayRestProfile ..> WebPage : defines
    BayRestProfile ..> APIEndpoint : defines
    BayRestProfile ..> FirestoreCollection : defines
    BayRestProfile ..> UserRole : defines
    BayRestProfile ..> ExternalService : defines
```

**Brief explanation — purpose, function, and flow:** Tinutukoy ng profile diagram ang mga project-specific UML stereotype na gagamitin sa pagdodokumento ng system. Nagtatakda ito ng pare-parehong labels at katangiang ilalapat sa pages, endpoints, collections, roles, at integrations; wala itong runtime data flow.

## 3. Behavioral Diagrams (9)

### Diagram 9: Data Flow Diagram (DFD), Level 1

This DFD shows the principal actors, transformations, data stores, and integrations involved in guest booking and owner review.

```mermaid
flowchart LR
    Guest[/"Guest"/]
    Owner[/"Resort owner or staff"/]
    Recaptcha[/"Google reCAPTCHA"/]
    Email[/"Gmail SMTP"/]

    P1(["1.0 Verify request<br/>and send OTP"])
    P2(["2.0 Verify OTP<br/>and create booking"])
    P3(["3.0 Read resort,<br/>room and availability"])
    P4(["4.0 Review booking,<br/>payment and stay"])

    D1[("D1 Resorts and rooms")]
    D2[("D2 Guest bookings")]
    D3[("D3 OTP challenges")]
    D4[("D4 Booking date locks")]
    D5[("D5 Payment history")]
    D6[("D6 Owner payment settings")]

    Guest -->|"email, owner and CAPTCHA token"| P1
    P1 <-->|"token validation"| Recaptcha
    P1 -->|"OTP challenge"| D3
    P1 -->|"verification code"| Email
    Email -->|"OTP email"| Guest
    Guest -->|"search and stay dates"| P3
    P3 <--> D1
    P3 <--> D2
    P3 <--> D4
    P3 -->|"rooms, availability and QR instructions"| Guest
    D6 --> P3
    Guest -->|"OTP, guest details, dates and uploads"| P2
    P2 <--> D3
    P2 -->|"recheck and reserve transactionally"| D1
    P2 --> D2
    P2 --> D4
    P2 --> D5
    P2 -->|"booking notifications"| Email
    Email --> Guest
    Email --> Owner
    Owner -->|"review and status/payment actions"| P4
    P4 <--> D2
    P4 <--> D4
    P4 --> D5
    P4 -->|"status and payment emails"| Email
```

**Brief explanation — purpose, function, and flow:** Sinusubaybayan ng DFD kung saan pumapasok, napoproseso, at naiimbak ang data. Mula sa guest input, dumadaan ang request sa CAPTCHA/OTP at availability checks, saka isinusulat ang booking at date locks sa Firestore; maaari namang baguhin o suriin ng owner ang booking at payment sa admin workflow.

### Diagram 10: Use Case Diagram

This diagram defines the system scope and the responsibilities of the guest, resort owner/staff, and Super Admin. Google Authentication, reCAPTCHA, and Gmail SMTP are external services that support selected use cases.

```mermaid
flowchart LR
    Guest[Guest]
    Owner[Resort owner]
    Staff[Authorized resort staff]
    SuperAdmin[Super Admin]
    Google[Firebase Authentication<br/>Google and email/password sign-in]
    Captcha[Google reCAPTCHA]
    Email[Gmail SMTP]

    subgraph System["E-Commerce Resort Room Booking System"]
        Browse([Browse resorts and rooms])
        Availability([Check room availability])
        Book([Submit booking request])
        CaptchaCheck([Verify reCAPTCHA])
        OTP([Verify email OTP])
        Upload([Upload proof and valid ID<br/>for owner-scoped booking])
        Contact([Send contact message])
        Feedback([Submit feedback])

        SignIn([Sign in])
        Register([Register resort])
        ManageRooms([Manage rooms])
        ManageBookings([Manage bookings])
        ReviewPayment([Review payment proof and record payment])
        ManageContent([Manage feedback and contact messages])
        Branding([Manage branding and payment settings])
        CheckIn([Record check-in and check-out])

        ReviewResorts([Review and approve or reject resorts])
        Audit([View Super Admin audit log])
        Marketplace([Manage marketplace settings])

        Notifications([Send email notifications])
    end

    Guest --- Browse
    Guest --- Availability
    Guest --- Book
    Guest --- Contact
    Guest --- Feedback
    Book -. "<<include>>" .-> CaptchaCheck
    Book -. "<<include>>" .-> OTP
    Book -. "<<include>>" .-> Upload
    CaptchaCheck --- Captcha
    OTP --- Email
    Contact -. "<<include>>" .-> Notifications
    Feedback -. "<<include>>" .-> Notifications
    Book -. "<<include>>" .-> Notifications
    Notifications --- Email

    Owner --- SignIn
    Owner --- Register
    Owner --- ManageRooms
    Owner --- ManageBookings
    Owner --- ReviewPayment
    Owner --- ManageContent
    Owner --- Branding
    Owner --- CheckIn
    Staff --- SignIn
    Staff --- ManageBookings
    Staff --- ReviewPayment
    Staff --- ManageContent
    Staff --- CheckIn
    SignIn --- Google

    SuperAdmin --- SignIn
    SuperAdmin --- ReviewResorts
    SuperAdmin --- Audit
    SuperAdmin --- Marketplace
    ReviewResorts -. "<<include>>" .-> Notifications
```

**Brief explanation — purpose, function, and flow:** Nililinaw ng use case diagram ang mga layunin at function na available sa bawat actor. Ipinapakita nito kung ano ang maaaring gawin ng guest, owner/staff, at Super Admin, pati ang mga external service na sumusuporta sa ilang gawain. Hindi ito chronological flow; scope at responsibility ang pangunahing ipinapakita.

### Diagram 11: Activity Diagram — Guest Booking Request

This activity diagram follows one guest booking from availability checking to creation of a pending booking. It includes the reCAPTCHA and email OTP checks, with the system rechecking availability transactionally before it saves the booking.

```mermaid
flowchart TD
    subgraph Guest["Guest"]
        Start((Start))
        Choose["Choose a resort, room, and stay dates"]
        AvailableQuestion{"Dates available?"}
        ChangeDates["Choose another room or dates"]
        Details["Enter guest details, acknowledge terms,<br/>and upload payment proof and valid ID<br/>(for an owner-scoped resort booking)"]
        SolveCaptcha["Complete reCAPTCHA"]
        RequestOTP["Request email OTP"]
        EnterOTP["Enter the 6-digit OTP"]
        EndSuccess((Booking request submitted))
        EndFailure((Show error and retry))
    end

    subgraph System["Next.js application on Vercel"]
        CheckAvailability["Check room and requested dates"]
        VerifyCaptcha["Verify reCAPTCHA token"]
        StoreOTP["Store OTP challenge securely<br/>with a 10-minute expiry"]
        SendOTP["Send OTP email"]
        VerifyOTP["Verify OTP and calculate price<br/>from room rate and stay dates"]
        Reserve["Recheck conflicts and date locks<br/>in a Firestore transaction"]
        CreateBooking["Create Pending booking;<br/>record proof-submitted payment state<br/>and date locks"]
        SendConfirmation["Send booking request email<br/>to guest and resort inbox"]
    end

    subgraph Data["Cloud Firestore"]
        Rooms[(rooms)]
        Bookings[(guestbooking)]
        OTPChallenges[(bookingOtpChallenges)]
        DateLocks[(bookingDateLocks)]
        PaymentHistory[(paymentHistory)]
    end

    subgraph External["External services"]
        Recaptcha[Google reCAPTCHA]
        Gmail[Gmail SMTP]
    end

    Start --> Choose --> CheckAvailability
    CheckAvailability --> Rooms
    CheckAvailability --> Bookings
    CheckAvailability --> AvailableQuestion
    AvailableQuestion -- No --> ChangeDates --> Choose
    AvailableQuestion -- Yes --> Details --> SolveCaptcha --> VerifyCaptcha
    VerifyCaptcha <--> Recaptcha
    VerifyCaptcha -- Invalid --> EndFailure
    VerifyCaptcha -- Valid --> RequestOTP --> StoreOTP
    StoreOTP --> OTPChallenges
    StoreOTP --> SendOTP --> Gmail
    SendOTP --> EnterOTP --> VerifyOTP
    VerifyOTP --> OTPChallenges
    VerifyOTP -- Invalid or expired --> EndFailure
    VerifyOTP -- Valid --> Reserve
    Reserve --> Rooms
    Reserve --> Bookings
    Reserve --> DateLocks
    Reserve -- Conflict found --> EndFailure
    Reserve -- Dates still available --> CreateBooking
    CreateBooking --> Bookings
    CreateBooking --> DateLocks
    CreateBooking --> PaymentHistory
    CreateBooking --> SendConfirmation --> Gmail
    SendConfirmation --> EndSuccess
```

**Brief explanation — purpose, function, and flow:** Inilalarawan ng activity diagram ang sunod-sunod na hakbang at decision points sa guest booking. Mula sa pagpili ng room at dates, sinusuri ang availability, CAPTCHA, at OTP; bago gumawa ng Pending booking, muling sinusuri ng Firestore transaction ang conflicts. Kapag nabigo ang alinmang check, ipinapakita ang error sa halip na magpatuloy.

### Diagram 12: Sequence Diagram — Guest Booking Request

This sequence diagram shows the request/response order for CAPTCHA validation, OTP delivery, and the transactional booking creation. Payment proof and valid ID are uploaded with the booking details for owner-scoped resort bookings.

```mermaid
sequenceDiagram
    actor Guest
    participant Browser
    participant API as Next.js API on Vercel
    participant Captcha as Google reCAPTCHA
    participant Store as Cloud Firestore
    participant Gmail as Gmail SMTP

    Guest->>Browser: Enter booking details and solve CAPTCHA
    Browser->>API: Send OTP request with details and CAPTCHA token
    API->>Captcha: Verify CAPTCHA token
    Captcha-->>API: Verification result
    alt CAPTCHA rejected
        API-->>Browser: Return validation error
        Browser-->>Guest: Show error and allow retry
    else CAPTCHA accepted
        API->>Store: Store hashed OTP challenge and expiry
        Store-->>API: Challenge stored
        API->>Gmail: Send six-digit OTP email
        Gmail-->>Guest: Deliver OTP
        Guest->>Browser: Enter OTP and submit booking
        Browser->>API: Send OTP, guest details, dates, and uploads
        API->>Store: Verify OTP and run booking transaction
        Store->>Store: Recheck room and date-lock conflicts
        alt OTP valid and dates available
            Store->>Store: Write booking, date locks, and payment history
            Store-->>API: Booking created as Pending
            API->>Gmail: Send booking request notification
            Gmail-->>Guest: Deliver confirmation
            API-->>Browser: Return successful booking response
        else OTP invalid or dates conflict
            Store-->>API: Reject transaction
            API-->>Browser: Return validation or availability error
            Browser-->>Guest: Show error and allow retry
        end
    end
```

**Brief explanation — purpose, function, and flow:** Ipinapakita ng sequence diagram ang pagkakasunod-sunod ng messages sa paglipas ng panahon. Nagpapadala ang browser ng CAPTCHA token at booking data sa API; nakikipag-ugnayan ang API sa reCAPTCHA, Firestore, at Gmail; pagkatapos ay ibinabalik ang resulta ng booking o validation error sa guest.

### Diagram 13: State Machine Diagram — Booking and Payment

Booking status and payment status are separate lifecycles. This diagram shows both so an owner can review payment without implying that payment automatically changes the booking status.

```mermaid
stateDiagram-v2
    state "Booking status" as Booking {
        [*] --> Pending
        Pending --> Approved: Owner approves
        Pending --> Declined: Owner declines
        Approved --> Cancelled: Booking cancelled
        Approved --> Completed: Stay completed
        Declined --> [*]
        Cancelled --> [*]
        Completed --> [*]
    }

    state "Payment status" as Payment {
        [*] --> Unpaid
        Unpaid --> ProofSubmitted: Guest submits proof
        ProofSubmitted --> Paid: Owner accepts proof
        ProofSubmitted --> Rejected: Owner rejects proof
        Unpaid --> Paid: Owner records cash payment
        Paid --> [*]
    }
```

**Brief explanation — purpose, function, and flow:** Ipinapakita nito ang lifecycle at pinapahintulutang pagbabago ng booking at payment status. Halimbawa, ang Pending booking ay maaaring maging Approved o Declined; hiwalay dito, ang payment ay maaaring manatiling proof-submitted hanggang ma-review. Hindi ibig sabihin ng paid na awtomatikong approved o completed na ang booking.

### Diagram 14: Communication Diagram — Booking Collaboration

The numbered messages emphasize which participants communicate and the order of the main guest-booking interactions.

```mermaid
flowchart LR
    Guest((Guest))
    Browser[Browser and booking form]
    API[Next.js booking API]
    Captcha[Google reCAPTCHA]
    DB[(Cloud Firestore)]
    Mail[Gmail SMTP]

    Guest -->|"1. Booking details and CAPTCHA"| Browser
    Browser -->|"2. Request OTP"| API
    API -->|"3. Validate token"| Captcha
    Captcha -->|"4. Validation result"| API
    API -->|"5. Save OTP challenge"| DB
    API -->|"6. Send OTP"| Mail
    Mail -->|"7. Deliver code"| Guest
    Guest -->|"8. OTP and final submission"| Browser
    Browser -->|"9. Verify and create booking"| API
    API -->|"10. Verify OTP, check availability,<br/>write booking and date locks"| DB
    DB -->|"11. Transaction result"| API
    API -->|"12. Send booking notification"| Mail
    API -->|"13. Booking result"| Browser
    Browser -->|"14. Show confirmation or error"| Guest
```

**Brief explanation — purpose, function, and flow:** Ipinapakita ng communication diagram kung aling participants ang nagpapalitan ng messages at kung anong pagkakasunod-sunod ang gamit sa numbered labels. Ang guest, browser, API, reCAPTCHA, Firestore, at Gmail ay nagtutulungan mula sa OTP request hanggang sa pagbalik ng confirmation o error.

### Diagram 15: Interaction Overview Diagram — Guest Booking

This overview organizes the booking interactions into reusable sub-flows and shows the decision points between them.

```mermaid
flowchart TD
    Start((Guest starts booking))
    RefAvailability[["Interaction: check resort, room,<br/>dates, and current availability"]]
    Available{"Dates available?"}
    RefCaptchaOTP[["Interaction: submit CAPTCHA<br/>and request email OTP"]]
    CaptchaValid{"CAPTCHA accepted?"}
    RefVerifyOTP[["Interaction: verify OTP,<br/>details, and uploaded files"]]
    OTPValid{"OTP and booking data valid?"}
    RefReserve[["Interaction: transactionally recheck<br/>availability and reserve dates"]]
    Reserved{"Reservation succeeded?"}
    Notify[["Interaction: write booking and payment history;<br/>send booking request email"]]
    Success((Show booking confirmation))
    Retry((Show error and allow retry))
    End((End))

    Start --> RefAvailability --> Available
    Available -- No --> Retry
    Available -- Yes --> RefCaptchaOTP --> CaptchaValid
    CaptchaValid -- No --> Retry
    CaptchaValid -- Yes --> RefVerifyOTP --> OTPValid
    OTPValid -- No --> Retry
    OTPValid -- Yes --> RefReserve --> Reserved
    Reserved -- No --> Retry
    Reserved -- Yes --> Notify --> Success
    Retry --> End
    Success --> End
```

**Brief explanation — purpose, function, and flow:** Nagbibigay ito ng high-level na overview ng magkakaugnay na booking interactions at kanilang decision points. Sinisimulan ang flow sa availability check, nagpapatuloy sa CAPTCHA at OTP validation, at nagtatapos sa transactional reservation at notification o sa error path. Mas nakatuon ito sa pag-uugnay ng sub-flows kaysa sa detalye ng bawat message.

### Diagram 16: Timing Diagram — Email OTP Challenge

Mermaid does not provide a dedicated UML timing-diagram syntax, so this event timeline documents the real OTP time constraints without suggesting that event spacing is to scale. A challenge expires after 10 minutes, can be resent after 60 seconds, and permits up to five verification attempts.

```mermaid
timeline
    title Email OTP challenge timing
    section Challenge lifetime
        T+0 min : OTP challenge stored and email sent
        T+1 min : Earliest allowed resend
        T+10 min : Challenge expires
    section Verification
        Before expiry : Up to five verification attempts
        After five failures : A further attempt is locked and the challenge is removed
```

**Brief explanation — purpose, function, and flow:** Ipinapakita ng timeline ang mahahalagang oras at limitasyon ng OTP challenge. Kapag naipadala na ang code, kailangang gamitin ito bago lumipas ang 10 minuto; maaari lamang mag-resend pagkalipas ng 60 segundo at hanggang limang verification attempts ang pinapayagan. Nililinaw ng diagram ang timing, hindi ang booking workflow.

### Diagram 17: Requirement Diagram — Booking Controls

This SysML-style requirement diagram connects the booking requirements to the application components responsible for satisfying or verifying them.

```mermaid
requirementDiagram
    requirement captcha_req {
        id: BR-01
        text: Booking OTP requests must pass reCAPTCHA verification
        risk: high
        verifymethod: test
    }
    requirement otp_req {
        id: BR-02
        text: Email OTP challenges must expire after 10 minutes and allow no more than five attempts
        risk: high
        verifymethod: test
    }
    requirement availability_req {
        id: BR-03
        text: Booking creation must transactionally recheck room availability and date locks
        risk: high
        verifymethod: test
    }
    requirement payment_req {
        id: BR-04
        text: Booking status and payment status must be recorded and reviewed separately
        risk: medium
        verifymethod: inspection
    }
    element booking_api {
        type: Next.js API routes
        docref: app/api/booking
    }
    element otp_store {
        type: Firestore OTP challenge store
        docref: lib/otp-store.js
    }
    element firestore_transaction {
        type: Cloud Firestore transaction
        docref: booking creation and date-lock writes
    }
    element owner_payment_review {
        type: Owner payment review workflow
        docref: Admin payment management
    }

    booking_api - satisfies -> captcha_req
    otp_store - satisfies -> otp_req
    firestore_transaction - satisfies -> availability_req
    owner_payment_review - satisfies -> payment_req
```

**Brief explanation — purpose, function, and flow:** Iniuugnay ng requirement diagram ang mga functional requirement sa component na tumutupad o nagve-verify sa mga ito. Halimbawa, booking API ang tumutugon sa CAPTCHA requirement at Firestore transaction ang nagpapatupad ng huling availability check. Nakakatulong ito para masubaybayan ang requirement hanggang sa implementation at verification method.

## 4. Data Blueprinting

The guest's room choice, dates, contact details, OTP, and (for an owner-scoped resort) payment proof and valid ID enter through the browser. The browser sends the OTP request and booking details to Next.js API routes on Vercel; the server verifies the reCAPTCHA token with Google, sends the OTP through Gmail SMTP, and stores the OTP challenge in Firestore. After the guest returns the OTP, the server verifies it, recalculates the total using the stored room price and stay dates, and uses a Firestore transaction to recheck availability before writing the pending booking, date locks, and payment-history event. Owners review bookings and payment status through authenticated admin routes.

## 5. Notes on the Initial Draft

- This blueprint now contains all **17 diagrams** listed in the assignment: **8 structural** and **9 behavioral**.
- The current OTP challenge is stored in the server-only Firestore `bookingOtpChallenges` collection. It expires after **10 minutes**, has a **60-second resend delay**, and allows up to **5 verification attempts**; it is not an in-memory five-minute OTP.
- Booking status and payment status are separate. A booking can be `Pending` while its payment is `proof_submitted`; an owner reviews payment separately.
- GCash is a manual QR payment, not a payment gateway integrated with the system.
- The current booking API does not enforce the draft's stated limit of three bookings per email, so that rule is intentionally omitted.
