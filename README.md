# Salon Booking System 💇🏾‍♀️

An online booking system for small businesses (salons, clinics, tutors). Customers book open time slots, and the owner manages everything from an admin dashboard.

**Stack:** Next.js 16 · PostgreSQL · Drizzle ORM · TypeScript · Resend (email) · Twilio (WhatsApp)

## Features

**Customers**
- Step-by-step booking: service → staff (or "any available") → date & time → details
- Only real free slots are shown (working hours, lunch breaks, time off, cleanup buffers, minimum notice)
- Confirmation page with a private link to **reschedule or cancel**
- Email and WhatsApp confirmations, plus a reminder 24 hours before

**Team accounts & roles**
- Everyone logs in with their own email and password at `/admin`
- **Owner:** everything, including Settings and Team accounts
- **Manager:** all bookings, customers, finance, services and staff hours
- **Barber / Stylist:** only their own day, calendar, bookings, clients, payments and time off
- Deactivating an account or resetting a password logs that person out immediately
- Edit `lib/permissions.ts` to change what each role can do

**Owner (`/admin`)**
- Dashboard: today's schedule, upcoming bookings, monthly revenue, no-show rate
- Week calendar with a lane per staff member
- Mark bookings Done / No-show / Cancelled
- Add walk-in and phone bookings (outside working hours is allowed)
- Manage services, prices and durations; staff weekly hours and time off
- Customer list with visit history
- **Finance:** record payments (cash, card, EFT), track expenses, and see profit, unpaid visits, expected income, no-show losses, and breakdowns by service, staff and payment method. Export to CSV for your accountant.

**Engineering highlights**
- **Double-booking is impossible.** A PostgreSQL exclusion constraint (`drizzle/0001_no_double_booking.sql`) rejects overlapping bookings, even when many people click the same slot at the same moment. Tested with 12 simultaneous requests: exactly one booking per free staff member succeeds.
- **Time zone safe.** Times are stored in UTC and calculated in the business time zone.
- **Unit-tested slot engine** (`lib/slots.ts`, 9 tests).
- Server-side validation (zod), rate limiting, and signed admin session cookie.

## Run it locally (Windows / Mac / Linux)

You need **Node.js 20+** and a **PostgreSQL** database.

### 1. Get a free database (easiest: Neon)
1. Sign up at https://neon.tech (free) and create a project.
2. Copy the **connection string** (it starts with `postgresql://`).

*(Or install PostgreSQL locally and use `postgresql://postgres:yourpassword@localhost:5432/booking`.)*

### 2. Install and configure
```bash
npm install
cp .env.example .env.local      # Windows PowerShell: Copy-Item .env.example .env.local
```
Open `.env.local` and set `DATABASE_URL` and `ADMIN_PASSWORD`.

### 3. Create the tables and demo data
```bash
npm run db:setup
```
This creates the tables and adds a demo salon with 4 services and 2 staff.

### 4. Start
```bash
npm run dev
```
- Booking site: http://localhost:3000
- Admin: http://localhost:3000/admin. The first time, you'll be asked to create the **owner account** (do this right after deploying), then add your team under **🔑 Team accounts**.

Emails and WhatsApp messages are **printed in the terminal** until you add Resend or Twilio keys.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the slot engine unit tests |
| `npm run db:setup` | Run migrations + seed demo data |
| `npm run db:generate` | Create a migration after you change `db/schema.ts` |
| `npm run db:migrate` | Apply migrations (run this after updating the code) |

## Project structure
```
app/
  page.tsx                    # landing page with services
  book/page.tsx               # booking wizard (also used for rescheduling)
  booking/[token]/page.tsx    # customer's manage-booking page
  admin/login/                # owner login
  admin/(panel)/...           # dashboard, calendar, bookings, customers, services, staff, settings
  admin/actions.ts            # server actions for every admin change
  api/availability            # GET free slots
  api/bookings                # POST create booking
  api/bookings/[token]        # POST cancel / reschedule
  api/cron/reminders          # hourly reminder job
components/                   # BookingWizard, BookingTable, AdminNav, ...
db/schema.ts                  # database tables (Drizzle)
db/seed.ts                    # demo data
drizzle/                      # SQL migrations (incl. double-booking constraint)
lib/slots.ts                  # pure slot-generation logic (+ tests)
lib/booking.ts                # availability, create/reschedule/cancel
lib/notify.ts                 # email + WhatsApp
lib/auth.ts                   # admin session
```

## Deploy (free)
1. Push to GitHub. **Never commit `.env.local`** (it's already in `.gitignore`).
2. Import the repo on https://vercel.com.
3. Add the environment variables from `.env.example`, and set `APP_URL` to your Vercel URL.
4. Run `npm run db:setup` once against your Neon database. Vercel Cron (`vercel.json`) calls the reminders job every hour.

## Real email & WhatsApp
- **Email:** create a free Resend account, then set `RESEND_API_KEY` and `EMAIL_FROM`. The sender `onboarding@resend.dev` works for testing; verify your own domain to send to anyone.
- **WhatsApp:** for testing, use the Twilio WhatsApp Sandbox and set the three `TWILIO_*` variables. For production, WhatsApp requires approved message templates.

## Ideas to extend
- [ ] Online deposits with Paystack / Yoco / PayFast
- [ ] Staff logins (Auth.js) so each stylist sees only their bookings
- [ ] Drag-and-drop rescheduling in the calendar
- [ ] Reviews after a completed appointment
- [ ] Multi-business mode: `/book/[business-slug]`
