import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import type { NowState } from '@/modules/operations/onShift';

export type NowPerson = { therapistId: string; name: string; photoUrl: string | null; state: NowState; roomName: string | null };
export type NowLabels = { title: string; empty: string; state: Record<NowState, string>; inRoom: (room: string) => string };

export function NowStrip({ people, labels }: { people: NowPerson[]; labels: NowLabels }) {
  return (
    <Card className="flex flex-col gap-2 p-3" data-testid="now-strip">
      <h2 className="text-heading">{labels.title}</h2>
      {people.length === 0 ? <p className="text-ink-muted">{labels.empty}</p> : (
        <ul className="flex flex-wrap gap-3">
          {people.map((p) => (
            <li key={p.therapistId} data-testid={`now-${p.therapistId}`} className="flex min-w-0 items-center gap-2">
              <Avatar name={p.name} src={p.photoUrl} size="sm" />
              <span className="min-w-0 break-words">{p.name} · {labels.state[p.state]}{p.roomName ? ` · ${labels.inRoom(p.roomName)}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
