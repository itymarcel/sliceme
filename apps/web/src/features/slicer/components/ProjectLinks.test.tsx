// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectLinks } from './ProjectLinks';

afterEach(cleanup);

describe('ProjectLinks', () => {
  it('renders support and source links as safe external links', () => {
    render(<ProjectLinks />);

    expect(screen.getByRole('link', { name: 'Buy Me a Coffee' })).toMatchObject({
      href: 'https://buymeacoffee.com/slicemeweb',
      target: '_blank',
      rel: 'noreferrer',
    });
    expect(screen.getByRole('link', { name: 'SliceMe repository' })).toHaveProperty(
      'href',
      'https://github.com/itymarcel/sliceme',
    );
    expect(screen.getByRole('link', { name: 'Custom Orca repository' })).toHaveProperty(
      'href',
      'https://github.com/itymarcel/custom-orca',
    );
  });
});
