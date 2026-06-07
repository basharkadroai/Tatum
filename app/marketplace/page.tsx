import { redirect } from 'next/navigation';

// The marketplace lives in-app (sidebar → Marketplace), not as a standalone
// route. This old page is retired — send any /marketplace visit (or browser
// back into it) to the app home.
export default function MarketplaceRedirect() {
  redirect('/');
}
