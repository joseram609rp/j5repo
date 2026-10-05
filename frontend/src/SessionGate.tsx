import type { ReactNode } from 'react';
import type { SessionStatus } from './bootstrap';
export function SessionGate({status,checking,anonymous,authenticated}:{status:SessionStatus;checking:ReactNode;anonymous:ReactNode;authenticated:ReactNode}) {
 return status==='checking'?checking:status==='anonymous'?anonymous:authenticated;
}
