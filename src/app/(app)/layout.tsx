import type { ReactNode } from "react";
import SynkShell from "@/components/SynkShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <SynkShell>{children}</SynkShell>;
}
