"""
TripDeck API Test Suite
Run: python3 test_tripdeck.py

Tests all TripDeck endpoints in order and prints PASS / FAIL for each.
Cleans up all test data it creates.

Set BASE_URL and credentials at the top if needed.
"""

import sys
import requests

# ── CONFIG ───────────────────────────────────────────────────────────────────
BASE_URL   = "http://localhost:8002"   # change to your deployed URL if needed
ADMIN_EMAIL    = "hello@travloger.in"
ADMIN_PASSWORD = "Travloger@2026"
# ─────────────────────────────────────────────────────────────────────────────

GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW = "\033[93m"
BOLD  = "\033[1m"
RESET = "\033[0m"

session = requests.Session()
passed = failed = skipped = 0
_token = None

# ── HELPERS ──────────────────────────────────────────────────────────────────

def api(method, path, expected=None, **kwargs):
    url = f"{BASE_URL}/api{path}"
    if _token:
        kwargs.setdefault("headers", {})
        kwargs["headers"]["Authorization"] = f"Bearer {_token}"
    try:
        r = getattr(session, method)(url, timeout=15, **kwargs)
    except Exception as exc:
        return None, str(exc)
    if expected and r.status_code != expected:
        return r, f"expected {expected}, got {r.status_code} — {r.text[:200]}"
    return r, None


def check(label, r, err, *, key=None):
    global passed, failed
    if err or r is None:
        print(f"  {RED}[FAIL]{RESET} {label}")
        print(f"         {err or 'No response'}")
        failed += 1
        return None
    if key:
        val = r.json().get(key)
        if not val:
            print(f"  {RED}[FAIL]{RESET} {label}")
            print(f"         Response missing key '{key}': {r.text[:200]}")
            failed += 1
            return None
        print(f"  {GREEN}[PASS]{RESET} {label}")
        passed += 1
        return val
    print(f"  {GREEN}[PASS]{RESET} {label}")
    passed += 1
    return r


def skip(label, reason):
    global skipped
    print(f"  {YELLOW}[SKIP]{RESET} {label} — {reason}")
    skipped += 1


def section(title):
    print(f"\n{BOLD}── {title} {'─' * (50 - len(title))}{RESET}")


# ── TESTS ────────────────────────────────────────────────────────────────────

def test_auth():
    global _token
    section("AUTH — Login")
    r, err = api("post", "/auth/login", expected=200,
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    _token = check("Login with admin credentials", r, err, key="access_token")
    if not _token:
        print(f"\n{RED}Cannot continue — login failed. Check ADMIN_EMAIL / ADMIN_PASSWORD above.{RESET}")
        sys.exit(1)


def test_form_schema():
    section("FORM SCHEMA CRUD")

    # Create
    r, err = api("post", "/form-schema", expected=200, json={
        "name": "__test_schema__",
        "fields": [
            {"label": "Full Name",     "field_type": "text",     "is_required": True,  "order": 0},
            {"label": "Phone",         "field_type": "phone",    "is_required": True,  "order": 1},
            {"label": "Travel Month",  "field_type": "dropdown", "is_required": True,  "order": 2,
             "options": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]},
            {"label": "Travellers",    "field_type": "number",   "is_required": False, "order": 3},
        ]
    })
    schema_id = check("Create form schema", r, err, key="_id")
    if not schema_id:
        return None

    # List
    r, err = api("get", "/form-schema", expected=200)
    r2 = check("List form schemas", r, err)
    if r2:
        found = any(s["_id"] == schema_id for s in r2.json())
        if not found:
            print(f"  {RED}[FAIL]{RESET} Created schema not in list")
            global failed
            failed += 1

    # Get single
    r, err = api("get", f"/form-schema/{schema_id}", expected=200)
    check("Get single form schema", r, err, key="name")

    # Update
    r, err = api("put", f"/form-schema/{schema_id}", expected=200,
                 json={"name": "__test_schema_v2__"})
    updated_name = check("Update form schema name", r, err, key="name")
    if updated_name and updated_name != "__test_schema_v2__":
        print(f"  {RED}[FAIL]{RESET} Name not updated correctly (got: {updated_name})")
        failed += 1

    # Invalid field_type
    r, err = api("post", "/form-schema", json={
        "name": "bad", "fields": [{"label": "x", "field_type": "badtype", "is_required": True, "order": 0}]
    })
    if r is not None and r.status_code == 400:
        print(f"  {GREEN}[PASS]{RESET} Reject invalid field_type")
        global passed
        passed += 1
    else:
        status = r.status_code if r is not None else "no response"
        print(f"  {RED}[FAIL]{RESET} Should reject invalid field_type (got {status})")
        failed += 1

    return schema_id


def test_tripdeck(schema_id, pdf_id):
    section("TRIPDECK CRUD")

    # Create
    r, err = api("post", "/tripdeck", expected=200, json={
        "title": "__Test TripDeck__",
        "description": "Automated test deck"
    })
    tripdeck_id = check("Create TripDeck", r, err, key="_id")
    if not tripdeck_id:
        return None, None

    slug = r.json().get("slug")
    if slug:
        print(f"         slug → {slug}")

    # Empty title should fail
    r, err = api("post", "/tripdeck", json={"title": "   "})
    if r is not None and r.status_code == 400:
        print(f"  {GREEN}[PASS]{RESET} Reject empty title")
        global passed
        passed += 1
    else:
        status = r.status_code if r is not None else "no response"
        print(f"  {RED}[FAIL]{RESET} Should reject empty title (got {status})")
        global failed
        failed += 1

    # List
    r, err = api("get", "/tripdeck", expected=200)
    r2 = check("List TripDecks", r, err)
    if r2:
        found = any(t["_id"] == tripdeck_id for t in r2.json())
        if not found:
            print(f"  {RED}[FAIL]{RESET} Created TripDeck not in list")
            failed += 1

    # Get single
    r, err = api("get", f"/tripdeck/{tripdeck_id}", expected=200)
    check("Get single TripDeck", r, err, key="title")

    # Update
    r, err = api("put", f"/tripdeck/{tripdeck_id}", expected=200,
                 json={"title": "__Test TripDeck Updated__", "status": "active"})
    check("Update TripDeck title", r, err, key="title")

    # Invalid status
    r, err = api("put", f"/tripdeck/{tripdeck_id}", json={"status": "badstatus"})
    if r is not None and r.status_code == 400:
        print(f"  {GREEN}[PASS]{RESET} Reject invalid status value")
        passed += 1
    else:
        status = r.status_code if r is not None else "no response"
        print(f"  {RED}[FAIL]{RESET} Should reject invalid status (got {status})")
        failed += 1

    return tripdeck_id, slug


def test_destinations(tripdeck_id, schema_id, pdf_id):
    section("DESTINATION MANAGEMENT")

    if not pdf_id:
        skip("Add destination",     "No PDF found in system — upload a PDF first, then re-run")
        skip("Update destination",  "Skipped (no PDF)")
        skip("Reorder destinations","Skipped (no PDF)")
        return None

    # Add destination
    r, err = api("post", f"/tripdeck/{tripdeck_id}/destination", expected=200, json={
        "name": "Bali, Indonesia",
        "duration": "5 Days 4 Nights",
        "hero_image_url": "https://images.unsplash.com/photo-bali.jpg",
        "pdf_id": pdf_id,
        "form_schema_id": schema_id,
        "order": 0
    })
    dest_id = check("Add destination", r, err, key="_id")
    if not dest_id:
        return None

    # Bad pdf_id
    r, err = api("post", f"/tripdeck/{tripdeck_id}/destination", json={
        "name": "x", "duration": "x", "hero_image_url": "x",
        "pdf_id": "nonexistent-pdf-id",
        "form_schema_id": schema_id, "order": 1
    })
    if r is not None and r.status_code == 404:
        print(f"  {GREEN}[PASS]{RESET} Reject destination with unknown pdf_id")
        global passed
        passed += 1
    else:
        print(f"  {RED}[FAIL]{RESET} Should reject unknown pdf_id")
        global failed
        failed += 1

    # Update destination
    r, err = api("put", f"/tripdeck/{tripdeck_id}/destination/{dest_id}", expected=200,
                 json={"duration": "6 Days 5 Nights"})
    check("Update destination duration", r, err, key="duration")

    # Reorder
    r, err = api("put", f"/tripdeck/{tripdeck_id}/destinations/reorder", expected=200,
                 json={"destination_ids": [dest_id]})
    check("Reorder destinations", r, err, key="destinations")

    # Bad dest_id in reorder
    r, err = api("put", f"/tripdeck/{tripdeck_id}/destinations/reorder",
                 json={"destination_ids": ["000000000000000000000000"]})
    if r is not None and r.status_code == 400:
        print(f"  {GREEN}[PASS]{RESET} Reject reorder with unknown dest_id")
        passed += 1
    else:
        print(f"  {RED}[FAIL]{RESET} Should reject unknown dest_id in reorder")
        failed += 1

    return dest_id


def test_public_and_responses(tripdeck_id, slug, dest_id, pdf_id):
    section("PUBLIC — Get TripDeck Page")

    # Public GET (no auth needed)
    r, err = api("get", f"/public/tripdeck/{slug}", expected=200)
    r2 = check("Public GET TripDeck page", r, err, key="_id")
    if r2:
        data = r.json()
        # Verify pdf_id is NOT exposed
        for dest in data.get("destinations", []):
            if "pdf_id" in dest:
                print(f"  {RED}[FAIL]{RESET} pdf_id exposed in public response (security)")
                global failed
                failed += 1
            else:
                print(f"  {GREEN}[PASS]{RESET} pdf_id not exposed in public response")
                global passed
                passed += 1
            break

    # Archived TripDeck should not be found
    api("put", f"/tripdeck/{tripdeck_id}", json={"status": "archived"})
    r, err = api("get", f"/public/tripdeck/{slug}")
    if r is not None and r.status_code == 404:
        print(f"  {GREEN}[PASS]{RESET} Archived TripDeck returns 404 on public page")
        passed += 1
    else:
        status = r.status_code if r is not None else "no response"
        print(f"  {RED}[FAIL]{RESET} Archived TripDeck should return 404 (got {status})")
        failed += 1
    # Restore active
    api("put", f"/tripdeck/{tripdeck_id}", json={"status": "active"})

    section("PUBLIC — Submit Lead Form + PDF Access")

    if not dest_id:
        skip("Submit lead form",         "No destination (PDF required)")
        skip("PDF access with token",    "Skipped")
        skip("PDF access without token", "Skipped")
        skip("PDF access with bad token","Skipped")
        return None

    # Submit form
    r, err = api("post", f"/public/tripdeck/{slug}/destination/{dest_id}/submit",
                 expected=200, json={
        "customer_name":  "Rahul Sharma",
        "customer_phone": "9876543210",
        "customer_email": "rahul@example.com",
        "responses": {
            "Full Name":    "Rahul Sharma",
            "Phone":        "9876543210",
            "Travel Month": "Jun",
            "Travellers":   "2"
        }
    })
    pdf_token = check("Submit lead form", r, err, key="pdf_access_token")
    if not pdf_token:
        return None

    # PDF access with valid token
    r, err = api("get", f"/public/tripdeck/{slug}/destination/{dest_id}/pdf",
                 params={"token": pdf_token})
    if r is not None and r.status_code == 200 and "pdf" in (r.headers.get("Content-Type") or ""):
        print(f"  {GREEN}[PASS]{RESET} PDF served with valid token")
        passed += 1
    elif r is not None and r.status_code == 200:
        print(f"  {GREEN}[PASS]{RESET} PDF endpoint responded 200 (content-type: {r.headers.get('Content-Type')})")
        passed += 1
    else:
        status = r.status_code if r is not None else "no response"
        print(f"  {RED}[FAIL]{RESET} PDF with valid token — got {status}")
        if r is not None:
            print(f"         {r.text[:200]}")
        failed += 1

    # PDF access without token → 422 (FastAPI missing required param)
    r, err = api("get", f"/public/tripdeck/{slug}/destination/{dest_id}/pdf")
    if r is not None and r.status_code == 422:
        print(f"  {GREEN}[PASS]{RESET} PDF without token returns 422 (missing param)")
        passed += 1
    else:
        print(f"  {RED}[FAIL]{RESET} PDF without token should return 422")
        failed += 1

    # PDF access with wrong token → 403
    r, err = api("get", f"/public/tripdeck/{slug}/destination/{dest_id}/pdf",
                 params={"token": "fake-token-that-does-not-exist"})
    if r is not None and r.status_code == 403:
        print(f"  {GREEN}[PASS]{RESET} PDF with wrong token returns 403")
        passed += 1
    else:
        print(f"  {RED}[FAIL]{RESET} PDF with wrong token should return 403 (got {r.status_code if r is not None else 'none'})")
        failed += 1

    section("FORM RESPONSES (Agent Views)")

    r, err = api("get", f"/tripdeck/{tripdeck_id}/responses", expected=200)
    r2 = check("Get all responses for TripDeck", r, err)
    if r2:
        items = r2.json()
        # Verify token is stripped
        for item in items:
            if "pdf_access_token" in item:
                print(f"  {RED}[FAIL]{RESET} pdf_access_token exposed in agent response (security)")
                failed += 1
                break
        else:
            if items:
                print(f"  {GREEN}[PASS]{RESET} pdf_access_token not exposed in agent response")
                passed += 1
        if items:
            print(f"         {len(items)} response(s) found")

    r, err = api("get", f"/tripdeck/{tripdeck_id}/destination/{dest_id}/responses", expected=200)
    check("Get responses by destination", r, err)

    r, err = api("get", f"/tripdeck/{tripdeck_id}/responses/export", expected=200)
    if r is not None and r.status_code == 200 and "text/csv" in (r.headers.get("Content-Type") or ""):
        print(f"  {GREEN}[PASS]{RESET} Export CSV — correct content-type")
        passed += 1
        lines = r.text.strip().split("\n")
        print(f"         {len(lines)} row(s) (1 header + {len(lines)-1} data)")
    else:
        status = r.status_code if r is not None else "no response"
        ct = r.headers.get("Content-Type") if r is not None else ""
        print(f"  {RED}[FAIL]{RESET} Export CSV — got {status} / {ct}")
        failed += 1

    return pdf_token


def test_analytics(tripdeck_id):
    section("ANALYTICS")

    r, err = api("get", f"/tripdeck/{tripdeck_id}/analytics", expected=200)
    r2 = check("Get TripDeck analytics", r, err, key="tripdeck_id")
    if r2:
        data = r.json()
        print(f"         opens={data.get('total_opens')}  "
              f"submissions={data.get('total_submissions')}  "
              f"conversion={data.get('conversion_rate')}%")
        required = {"tripdeck_id","title","total_opens","total_submissions","conversion_rate","destination_stats"}
        missing = required - set(data.keys())
        if missing:
            print(f"  {RED}[FAIL]{RESET} Analytics missing keys: {missing}")
            global failed
            failed += 1
        else:
            print(f"  {GREEN}[PASS]{RESET} Analytics response has all required keys")
            global passed
            passed += 1


def test_cleanup(tripdeck_id, schema_id, dest_id):
    section("CLEANUP")

    if dest_id:
        r, err = api("delete", f"/tripdeck/{tripdeck_id}/destination/{dest_id}", expected=200)
        check("Delete destination", r, err)

    r, err = api("delete", f"/tripdeck/{tripdeck_id}", expected=200)
    check("Delete TripDeck (also deletes its responses)", r, err)

    # Verify gone
    r, err = api("get", f"/tripdeck/{tripdeck_id}")
    if r is not None and r.status_code == 404:
        print(f"  {GREEN}[PASS]{RESET} Deleted TripDeck returns 404")
        global passed
        passed += 1
    else:
        status = r.status_code if r is not None else "no response"
        print(f"  {RED}[FAIL]{RESET} Deleted TripDeck should return 404 (got {status})")
        global failed
        failed += 1

    r, err = api("delete", f"/form-schema/{schema_id}", expected=200)
    check("Delete form schema", r, err)


def get_pdf_id():
    """Grab the first ready PDF belonging to the logged-in user, if any."""
    r, _ = api("get", "/pdfs", expected=200)
    if r is not None and r.status_code == 200:
        pdfs = r.json()
        ready = [p for p in pdfs if p.get("upload_status") == "ready" or "upload_status" not in p]
        if ready:
            pdf_id = ready[0].get("id")
            print(f"  Using pdf_id: {pdf_id} ({ready[0].get('file_name')})")
            return pdf_id
    return None


# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print(f"\n{BOLD}TripDeck API Test Suite{RESET}")
    print(f"Target: {BASE_URL}\n")

    test_auth()

    section("Looking for an existing PDF to use in destination tests")
    pdf_id = get_pdf_id()
    if not pdf_id:
        print(f"  {YELLOW}No ready PDFs found.{RESET} Destination + public PDF tests will be skipped.")
        print(f"  Upload at least one PDF via the dashboard, then re-run this script.")

    schema_id    = test_form_schema()
    tripdeck_id, slug = test_tripdeck(schema_id, pdf_id) if schema_id else (None, None)
    dest_id      = test_destinations(tripdeck_id, schema_id, pdf_id) if tripdeck_id else None
    test_public_and_responses(tripdeck_id, slug, dest_id, pdf_id) if tripdeck_id else None
    test_analytics(tripdeck_id) if tripdeck_id else None
    test_cleanup(tripdeck_id, schema_id, dest_id) if tripdeck_id and schema_id else None

    # ── SUMMARY ──────────────────────────────────────────────────────────────
    total = passed + failed + skipped
    print(f"\n{'═'*55}")
    print(f"  {BOLD}Results:{RESET}  "
          f"{GREEN}{passed} passed{RESET}  "
          f"{RED}{failed} failed{RESET}  "
          f"{YELLOW}{skipped} skipped{RESET}  "
          f"(of {total} checks)")
    print(f"{'═'*55}\n")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
