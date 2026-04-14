#!/usr/bin/env python3
"""
PDF Link Tracker Backend API Testing
Tests all endpoints with proper authentication flow
"""

import requests
import sys
import json
import io
from datetime import datetime

class PDFLinkTrackerTester:
    def __init__(self, base_url="https://pdf-engagement.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tests_run = 0
        self.tests_passed = 0
        self.user_data = None
        self.pdf_id = None
        self.link_id = None

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        return success

    def test_auth_register(self):
        """Test user registration"""
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        payload = {
            "email": test_email,
            "password": "testpass123",
            "name": "Test User"
        }
        try:
            response = self.session.post(f"{self.api_url}/auth/register", json=payload)
            success = response.status_code == 200
            if success:
                data = response.json()
                self.user_data = {"email": test_email, "password": "testpass123"}
            return self.log_test("User Registration", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("User Registration", False, str(e))

    def test_auth_login(self):
        """Test admin login"""
        payload = {
            "email": "admin@example.com",
            "password": "admin123"
        }
        try:
            response = self.session.post(f"{self.api_url}/auth/login", json=payload)
            success = response.status_code == 200
            if success:
                data = response.json()
                self.user_data = data
            return self.log_test("Admin Login", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("Admin Login", False, str(e))

    def test_auth_me(self):
        """Test get current user"""
        try:
            response = self.session.get(f"{self.api_url}/auth/me")
            success = response.status_code == 200
            return self.log_test("Get Current User", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("Get Current User", False, str(e))

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        try:
            response = self.session.get(f"{self.api_url}/dashboard/stats")
            success = response.status_code == 200
            if success:
                data = response.json()
                required_keys = ['total_pdfs', 'total_links', 'opened_links', 'unopened_links']
                has_all_keys = all(key in data for key in required_keys)
                success = has_all_keys
            return self.log_test("Dashboard Stats", success, 
                               f"Status: {response.status_code}, Data: {response.text[:100]}")
        except Exception as e:
            return self.log_test("Dashboard Stats", False, str(e))

    def test_pdf_upload(self):
        """Test PDF upload"""
        try:
            # Create a simple PDF-like file for testing
            pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000074 00000 n \n0000000120 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n179\n%%EOF"
            
            # Create a proper file-like object
            files = {'file': ('test.pdf', pdf_content, 'application/pdf')}
            
            # Create a new request without Content-Type header for multipart
            cookies = self.session.cookies
            response = requests.post(f"{self.api_url}/pdfs/upload", files=files, cookies=cookies)
            success = response.status_code == 200
            if success:
                data = response.json()
                self.pdf_id = data.get('id')
            return self.log_test("PDF Upload", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("PDF Upload", False, str(e))

    def test_list_pdfs(self):
        """Test list PDFs"""
        try:
            response = self.session.get(f"{self.api_url}/pdfs")
            success = response.status_code == 200
            return self.log_test("List PDFs", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("List PDFs", False, str(e))

    def test_create_link(self):
        """Test create tracking link"""
        if not self.pdf_id:
            return self.log_test("Create Link", False, "No PDF ID available")
        
        payload = {
            "pdf_id": self.pdf_id,
            "customer_name": "Test Customer",
            "customer_phone": "+1-555-0123"
        }
        try:
            response = self.session.post(f"{self.api_url}/links", json=payload)
            success = response.status_code == 200
            if success:
                data = response.json()
                self.link_id = data.get('id')
            return self.log_test("Create Link", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("Create Link", False, str(e))

    def test_list_links(self):
        """Test list links"""
        try:
            response = self.session.get(f"{self.api_url}/links")
            success = response.status_code == 200
            return self.log_test("List Links", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("List Links", False, str(e))

    def test_list_links_with_filters(self):
        """Test list links with filters"""
        try:
            # Test status filter
            response = self.session.get(f"{self.api_url}/links?status=not_opened")
            success1 = response.status_code == 200
            
            # Test search filter
            response = self.session.get(f"{self.api_url}/links?search=Test")
            success2 = response.status_code == 200
            
            success = success1 and success2
            return self.log_test("List Links with Filters", success, 
                               f"Status filter: {success1}, Search filter: {success2}")
        except Exception as e:
            return self.log_test("List Links with Filters", False, str(e))

    def test_view_link_tracking(self):
        """Test public view link (tracking)"""
        if not self.link_id:
            return self.log_test("View Link Tracking", False, "No link ID available")
        
        try:
            # Use a new session without auth for public endpoint
            public_session = requests.Session()
            response = public_session.get(f"{self.api_url}/view/{self.link_id}")
            success = response.status_code == 200
            if success:
                data = response.json()
                has_required_fields = 'pdf_name' in data and 'storage_path' in data
                success = has_required_fields
            return self.log_test("View Link Tracking", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("View Link Tracking", False, str(e))

    def test_auth_logout(self):
        """Test logout"""
        try:
            response = self.session.post(f"{self.api_url}/auth/logout")
            success = response.status_code == 200
            return self.log_test("Logout", success, 
                               f"Status: {response.status_code}, Response: {response.text[:100]}")
        except Exception as e:
            return self.log_test("Logout", False, str(e))

    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🔍 Testing PDF Link Tracker API at {self.api_url}")
        print("=" * 60)
        
        # Authentication tests
        print("\n📝 Authentication Tests:")
        self.test_auth_register()
        self.test_auth_login()
        self.test_auth_me()
        
        # Dashboard tests
        print("\n📊 Dashboard Tests:")
        self.test_dashboard_stats()
        
        # PDF tests
        print("\n📄 PDF Management Tests:")
        self.test_pdf_upload()
        self.test_list_pdfs()
        
        # Link tests
        print("\n🔗 Link Management Tests:")
        self.test_create_link()
        self.test_list_links()
        self.test_list_links_with_filters()
        
        # Public view tests
        print("\n👁️ Public View Tests:")
        self.test_view_link_tracking()
        
        # Cleanup
        print("\n🚪 Cleanup Tests:")
        self.test_auth_logout()
        
        # Summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"✨ Success Rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = PDFLinkTrackerTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())