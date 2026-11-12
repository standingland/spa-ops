import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, buttonVariants } from './button';

describe('buttonVariants', () => {
  it('guarantees a 44px touch target by default', () => {
    expect(buttonVariants()).toContain('min-h-11');
  });
  it('maps variants to colour classes', () => {
    expect(buttonVariants({ variant: 'primary' })).toContain('bg-primary');
    expect(buttonVariants({ variant: 'danger' })).toContain('bg-danger');
  });
});

describe('Button', () => {
  it('does not set a default type so forms keep submit behaviour', () => {
    expect(renderToStaticMarkup(<Button>x</Button>)).not.toContain('type=');
  });
  it('forwards native attributes', () => {
    const html = renderToStaticMarkup(
      <Button type="submit" data-testid="a">x</Button>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain('data-testid="a"');
  });
});

describe('link variant', () => {
  it('drops size padding and min height', () => {
    const c = buttonVariants({ variant: 'link' });
    expect(c).toContain('underline');
    expect(c).not.toContain('px-4');
    expect(c).not.toContain('min-h-11');
  });
});
