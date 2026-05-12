import { redirect } from 'next/navigation';

// "All Customers" has been merged into the Contacts module.
export default function CustomersRedirect() {
  redirect('/admin/contacts');
}
