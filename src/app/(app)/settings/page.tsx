import SettingsView from "@/features/account/SettingsView";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  await requirePageUser();
  return <SettingsView initialSection={(await searchParams).section} />;
}
