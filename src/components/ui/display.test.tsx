import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card } from './card';
import { Badge, StatusChip, StatusDot } from './badge';
import { Alert } from './alert';
import { PageHeader } from './page-header';
import { EmptyState } from './empty-state';

describe('display primitives', () => {
  it('Alert error uses role=alert and forwards props', () => {
    const html = renderToStaticMarkup(
      <Alert tone="error" data-testid="err">
        Boom
      </Alert>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="err"');
    expect(html).toContain('Boom');
  });

  it('Alert info uses role=status', () => {
    const html = renderToStaticMarkup(<Alert tone="info">Hi</Alert>);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it('PageHeader renders exactly one h1 with optional parts', () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Today" subtitle="Mon" actions={<button>Go</button>} />,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Today');
    expect(html).toContain('Mon');
    expect(html).toContain('Go');
    expect(renderToStaticMarkup(<PageHeader title="X" />).match(/<h1/g)).toHaveLength(1);
  });

  it('StatusChip always prints the label', () => {
    expect(
      renderToStaticMarkup(<StatusChip kind="room" status="occupied" label="Occupied" />),
    ).toContain('Occupied');
    expect(
      renderToStaticMarkup(<StatusChip kind="booking" status="confirmed" label="Confirmed" />),
    ).toContain('Confirmed');
    expect(
      renderToStaticMarkup(<StatusChip kind="room" status="bogus" label="Mystery" />),
    ).toContain('Mystery');
  });

  it('StatusDot is aria-hidden', () => {
    expect(renderToStaticMarkup(<StatusDot status="available" />)).toContain('aria-hidden="true"');
  });

  it('Card danger tone has a danger border', () => {
    expect(renderToStaticMarkup(<Card tone="danger">x</Card>)).toContain('border-danger');
    expect(renderToStaticMarkup(<Card>x</Card>)).not.toContain('border-danger');
  });

  it('Badge and EmptyState render children', () => {
    expect(renderToStaticMarkup(<Badge tone="warning">W</Badge>)).toContain('W');
    expect(renderToStaticMarkup(<EmptyState>Nothing</EmptyState>)).toContain('Nothing');
  });
});
