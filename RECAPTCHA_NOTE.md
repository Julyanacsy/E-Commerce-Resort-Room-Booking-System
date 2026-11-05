# reCAPTCHA setup

The guest booking form uses reCAPTCHA v2. Configure both keys in the application environment:

- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is rendered by the browser widget.
- `RECAPTCHA_SECRET_KEY` is used by the server to verify the response before sending an OTP.

Register every deployed hostname (including `localhost` for local testing) with the key provider. Production OTP requests fail closed when the server secret is missing. In development, verification is skipped only when no server secret is configured.

The server validates each token with Google's `siteverify` endpoint. A browser checkbox by itself is not proof of verification; the request to `/api/booking/send-otp` is also checked server-side.
