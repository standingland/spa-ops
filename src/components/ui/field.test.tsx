import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field, Input, Select, Textarea } from './field';

describe('Field', () => {
  it('wraps label text and control in a label', () => {
    const html = renderToStaticMarkup(
      <Field label="Email"><Input name="e" data-testid="e" /></Field>,
    );
    expect(html.startsWith('<label')).toBe(true);
    expect(html).toContain('Email');
    expect(html).toContain('<input');
    expect(html).toContain('data-testid="e"');
    expect(html).not.toContain('role="alert"');
  });
  it('renders the error with role=alert', () => {
    const html = renderToStaticMarkup(
      <Field label="Email" error="Bad"><Input name="e" /></Field>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Bad');
  });
  it('renders native select and textarea', () => {
    expect(renderToStaticMarkup(<Select name="s"><option>a</option></Select>)).toContain('<select');
    expect(renderToStaticMarkup(<Textarea name="t" />)).toContain('<textarea');
  });
});
