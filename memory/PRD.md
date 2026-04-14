# PDF Link Tracker - PRD

## Problem Statement
Build a web application called "PDF Link Tracker" that allows users to upload PDFs, generate unique tracking links for customers, and monitor when/how often those PDFs are viewed.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (port 3000)
- **Backend**: FastAPI (port 8001)
- **Database**: MongoDB
- **Storage**: Emergent Object Storage (cloud-based)
- **Auth**: JWT with httpOnly cookies

## User Personas
1. **Business User** - Uploads PDFs (proposals, contracts), generates links for customers, tracks engagement
2. **Customer/Viewer** - Receives unique link, views PDF (no auth required)

## Core Requirements
- [x] User authentication (email + password, JWT)
- [x] PDF upload to cloud storage
- [x] Unique link generation per PDF with customer details
- [x] Link tracking (opened status, open count, last opened timestamp)
- [x] Public PDF viewer at /view/{unique_id}
- [x] Dashboard with stats and tracking table
- [x] Filter links by opened/not opened
- [x] Search links by customer name or phone
- [x] Copy link to clipboard

## What's Been Implemented (April 13, 2026)
- Complete auth system (register, login, logout, session refresh)
- PDF upload with Emergent Object Storage integration
- Link generation with customer name and phone
- Real-time tracking (open count, timestamps)
- Swiss-style dashboard UI with stats cards
- Public PDF viewer (no auth required)
- Search and filter functionality
- Admin seed on startup

## Prioritized Backlog
### P1
- Email notifications when PDF is opened
- Batch link generation (CSV import)
- PDF analytics (time spent viewing)

### P2
- Custom branding for view pages
- Link expiration dates
- Password-protected links
- Export tracking data to CSV

### P3
- Team/organization support
- API access for integrations
- Webhook notifications
