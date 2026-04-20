# Test Credentials

## Admin
- Email: admin@travloger.in
- Password: admin123
- Role: admin

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh

## PDF Endpoints
- POST /api/pdfs/upload/initiate
- POST /api/pdfs/upload/complete
- GET /api/pdfs
- DELETE /api/pdfs/{pdf_id}

## Link Endpoints
- POST /api/links
- GET /api/links
- DELETE /api/links/{link_id}

## View Endpoints
- GET /api/view/{unique_id}
- GET /api/view/{unique_id}/pdf

## Dashboard
- GET /api/dashboard/stats
