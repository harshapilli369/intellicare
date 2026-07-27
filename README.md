# IntelliCare

An AI-Assisted Clinical Workflow Management Platform for reducing administrative burden in primary healthcare.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React.js, Tailwind CSS, Axios, React Router |
| Backend | Node.js, Express.js |
| Relational DB | MySQL (hosted on Railway) |
| Document DB | MongoDB (hosted on MongoDB Atlas) |
| AI | Google Gemini API |
| Auth | JWT (JSON Web Tokens) |
| Email | Nodemailer |
| Deployment | Vercel (frontend), Render/Railway (backend) |

---

## Project Structure

```
Advance-Web-Dev-Project/
├── package.json               # Root — runs both servers with concurrently
├── frontend/                  # React application
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── assets/
│       ├── components/
│       │   ├── ai/
│       │   ├── appointments/
│       │   ├── auth/
│       │   ├── common/
│       │   ├── dashboard/
│       │   ├── layout/
│       │   ├── notes/
│       │   ├── notifications/
│       │   ├── patients/
│       │   └── prescriptions/
│       ├── context/           # AuthContext, NotificationContext
│       ├── hooks/
│       ├── pages/
│       │   ├── admin/
│       │   ├── auth/
│       │   ├── clinician/
│       │   └── patient/
│       ├── routes/            # ProtectedRoute (RBAC)
│       ├── services/          # Axios API wrappers
│       ├── styles/
│       └── utils/
└── backend/                   # Node.js + Express API
    ├── package.json
    ├── .env.example
    └── src/
        ├── config/            # MySQL, MongoDB, Gemini connections
        ├── controllers/
        ├── jobs/              # Cron jobs for appointment reminders
        ├── middleware/        # authenticate, authorize, validate, errorHandler
        ├── models/
        │   ├── mysql/         # User, Patient, Appointment, Prescription
        │   └── mongodb/       # ClinicalNote, AISummary
        ├── routes/
        ├── services/          # aiService, emailService, reminderService
        └── utils/
```

---

## User Roles

| Role | Access |
|------|--------|
| **Clinician** | View patients, write clinical notes, create prescriptions, review AI summaries |
| **Admin** | Onboard patients, manage appointments, import/export records |
| **Patient** | Book appointments, submit intake forms, view visit summaries |

---

## Core Features

- **Authentication & RBAC** — JWT-based login, role-enforced API endpoints
- **Patient Management** — searchable dashboard, full patient profiles, CRUD
- **Appointment Booking** — patient self-service or admin-assisted, availability check, reminders
- **Clinical Notes** — per-appointment notes stored in MongoDB
- **Prescription Management** — create, view, and print prescriptions
- **AI Summaries** — Gemini-powered pre and post-appointment summaries
- **Import / Export** — CSV/JSON bulk import, full chart export with PDF option
- **Notifications** — in-app and email reminders (24h and 1h before appointments)

---

## Getting Started

### Prerequisites

- Node.js v18+
- A MySQL database (local or Railway)
- A MongoDB database (local or Atlas)
- A Google Gemini API key

### Installation

```bash
# Install all dependencies (root + frontend + backend)
npm run install:all
```

### Environment Variables

Copy the example file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description |
|----------|-------------|
| `PORT` | Backend port (default 5000) |
| `JWT_SECRET` | Secret key for signing JWTs |
| `MYSQL_HOST` | MySQL host |
| `MYSQL_USER` | MySQL username |
| `MYSQL_PASSWORD` | MySQL password |
| `MYSQL_DATABASE` | MySQL database name |
| `MONGODB_URI` | MongoDB connection string |
| `GEMINI_API_KEY` | Google Gemini API key |
| `SMTP_HOST` | SMTP server for emails |
| `SMTP_USER` | SMTP email address |
| `SMTP_PASS` | SMTP password or app password |
| `CLIENT_URL` | Frontend URL for CORS (e.g. http://localhost:3000) |

### Running the App

```bash
# Run frontend and backend together
npm run dev

# Or run separately
npm run dev --prefix frontend   # React on http://localhost:3000
npm run dev --prefix backend    # Express on http://localhost:5000
```

### Seeding the Database

Populate both databases with sample staff, patients, appointments,
prescriptions, notes, and an AI summary. Safe to re-run — it clears existing
data first.

```bash
npm run seed --prefix backend
```

Seeded accounts (all use the password `Password123!`):

| Role | Email |
|------|-------|
| Clinician | `dr.kuteishi@intellicare.ca` |
| Admin | `admin@intellicare.ca` |
| Patient | `elias.tobias@example.com` (and five other `<name>@example.com`) |

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login and receive JWT |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/patients` | List all patients |
| POST | `/api/patients` | Create patient (admin only) |
| GET | `/api/appointments` | List appointments |
| POST | `/api/appointments` | Book appointment |
| GET | `/api/notes/patient/:id` | Get clinical notes for patient |
| POST | `/api/notes` | Create clinical note |
| POST | `/api/prescriptions` | Create prescription |
| POST | `/api/ai/pre-appointment/:id` | Generate pre-appointment summary |
| POST | `/api/ai/post-appointment/:id` | Generate post-appointment summary |
| POST | `/api/patients/import` | Bulk import patients from CSV/JSON |
| GET | `/api/patients/:id/export` | Export patient chart |

---

## AI Architecture

The frontend never communicates with Gemini directly. All AI requests follow this flow:

```
Frontend → Backend API → Gemini API → Backend API → Frontend
```

Generated summaries are reviewed and approved by the clinician before being released to the patient.
