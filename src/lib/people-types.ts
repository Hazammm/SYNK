import type { PersonStatus } from "./account-types";

// One member in the people directory.
export type DirectoryPerson = {
  id: string; name: string | null; email: string | null; image: string | null; role: "ADMIN" | "MEMBER";
  title: string; phone: string; location: string; timezone: string; pronouns: string;
  status: PersonStatus;
  // Connected now and not set to away.
  online: boolean;
  joinedAt: string;
};
