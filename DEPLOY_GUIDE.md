# LinkDeck by Travloger — Deployment Guide

## What was changed from Emergent version
- ✅ Removed all Emergent branding (title, badge, scripts, logo)
- ✅ Full Travloger teal (#144a57) + gold (#E8A020) branding
- ✅ WhatsApp Business button for every customer (auto formats Indian numbers)
- ✅ "LinkDeck by Travloger" name throughout
- ✅ Travloger logo mark (SVG, no external image dependency)
- ✅ Login page redesigned with Travloger brand
- ✅ View page (customer PDF viewer) shows Travloger header
- ✅ render.yaml for one-click Render.com deploy

---

## STEP 1 — MongoDB Atlas (Free Database)
1. Go to https://cloud.mongodb.com → Sign up free
2. Create a free M0 cluster
3. Database Access → Add user: `linkdeck` with a password → copy it
4. Network Access → Add IP → Allow from anywhere (0.0.0.0/0)
5. Connect → Drivers → Copy connection string
   Looks like: `mongodb+srv://linkdeck:PASSWORD@cluster0.xxxxx.mongodb.net/`

---

## STEP 2 — Render.com (Free Hosting)
1. Go to https://render.com → Sign up with GitHub
2. Connect your GitHub repo (PDF-LINK-EMERGENT)

### Deploy Backend first:
1. New → Web Service → Connect your repo
2. Name: `linkdeck-backend`
3. Root Directory: (leave blank)
4. Build Command: `pip install -r backend/requirements.txt`
5. Start Command: `uvicorn backend.server:app --host 0.0.0.0 --port $PORT`
6. Instance Type: Free
7. Add Environment Variables:
   - `MONGO_URL` → your Atlas connection string
   - `DB_NAME` → `linkdeck`
   - `JWT_SECRET` → any random string (e.g. `travloger2024secret`)
   - `FRONTEND_URL` → `https://itinerary.travloger.in`
   - `ADMIN_EMAIL` → `admin@travloger.in`
   - `ADMIN_PASSWORD` → your chosen password
   - `EMERGENT_LLM_KEY` → (leave blank)
8. Deploy → Wait ~3 mins → Copy the backend URL (e.g. https://linkdeck-backend.onrender.com)

### Deploy Frontend:
1. New → Static Site → Connect your repo
2. Name: `linkdeck-frontend`
3. Build Command: `cd frontend && npm install && npm run build`
4. Publish Directory: `frontend/build`
5. Add Environment Variables:
   - `REACT_APP_BACKEND_URL` → your backend URL from above
   - `REACT_APP_SITE_URL` → `https://itinerary.travloger.in`
6. Deploy → Wait ~2 mins → You'll get a .onrender.com URL

---

## STEP 3 — GoDaddy DNS (itinerary.travloger.in)
1. Log in to GoDaddy
2. My Products → travloger.in → Manage DNS
3. Add Record:
   - Type: **CNAME**
   - Name: `itinerary`
   - Value: your frontend Render URL (without https://) e.g. `linkdeck-frontend.onrender.com`
   - TTL: 1 Hour
4. Save → Wait 10-30 minutes for DNS to propagate

### In Render Frontend settings:
1. Settings → Custom Domains → Add `itinerary.travloger.in`
2. Render will auto-provision SSL certificate

---

## STEP 4 — First Login
- Go to https://itinerary.travloger.in
- Email: admin@travloger.in (or whatever you set in ADMIN_EMAIL)
- Password: whatever you set in ADMIN_PASSWORD

---

## PDF Storage Note
The app currently uses Emergent's object storage for PDFs.
Once you leave Emergent, PDF serving will break.
**Fix:** Replace with Cloudinary (free 25GB) — ask for the code change when ready.

---

## WhatsApp Button Logic
- Enter `8328046859` → opens `wa.me/918328046859` ✅
- Enter `+918328046859` → opens `wa.me/918328046859` ✅
- Enter `918328046859` → opens `wa.me/918328046859` ✅
