import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FingerprintStatusBadge from '../components/sync/FingerprintStatusBadge';

describe('FingerprintStatusBadge', () => {
  it.each([
    ['enrolled', 'Enrolled'],
    ['awaiting', 'Awaiting fingerprint'],
    ['none', 'No fingerprint'],
    [undefined, 'No fingerprint'],
  ])('renders %s', (status, label) => {
    render(<FingerprintStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
