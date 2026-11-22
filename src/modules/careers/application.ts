export const APPLICATION_STATUSES = ['new', 'contacted', 'interview', 'trial', 'hired', 'declined'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationRow = {
  id: string;
  createdAt: string;
  fullName: string;
  age: number;
  contact: string;
  experience: string;
  hasCertificate: boolean;
  workType: string;
  skills: string | null;
  locale: string;
  status: ApplicationStatus;
  correspondence: string | null;
};
