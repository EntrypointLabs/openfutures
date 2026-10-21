export interface BoardEntry {
  username: string;
  count: number;
  rank: number;
  isYou: boolean;
}
export interface Page<T> {
  items: T[];
  nextOffset: number | null;
}
export interface Member {
  username: string;
  code: string;
  joinedAt: string;
  count: number;
  rank: number;
}
export interface Me {
  member: Member | null;
  activity: Page<{ at: string }>;
}
export interface Pending {
  email: string;
  username: string;
  signIn: boolean;
  sentAt: number;
}
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
