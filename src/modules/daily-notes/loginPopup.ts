const STORAGE_KEY = 'spa-ops:daily-notes-login';

export function queueDailyNotesPopup(userId: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, userId);
  } catch {
    // A browser that blocks tab storage can still complete sign-in.
  }
}

export function consumeDailyNotesPopup(userId: string): boolean {
  try {
    const pendingUser = sessionStorage.getItem(STORAGE_KEY);
    if (pendingUser === null) return false;
    sessionStorage.removeItem(STORAGE_KEY);
    return pendingUser === userId;
  } catch {
    return false;
  }
}
