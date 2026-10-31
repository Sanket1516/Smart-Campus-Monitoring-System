import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DeviceOverview from '../components/sync/DeviceOverview';
import { GateStatusBadge, SyncStatusBadge } from '../components/sync/SyncStatusBadges';

const terminal = (overrides) => ({
  serialNumber: 'SN',
  terminalLabel: 'T',
  ip: '10.0.0.1',
  online: true,
  deviceModel: 'X990',
  firmware: 'fw',
  communicationProtocol: 'adms_push',
  dialect: 'classic',
  enrolledUsers: 3,
  fingerprintsStored: 3,
  fingerprintsVerified: 2,
  pending: 0,
  failed: 0,
  simulated: false,
  ...overrides,
});

describe('DeviceOverview', () => {
  it('shows the three roles and flags a missing one', () => {
    render(
      <DeviceOverview
        devices={{
          ADMIN_ENROLLMENT: [terminal({ serialNumber: 'D1' })],
          GATE_ENTRY: [terminal({ serialNumber: 'D2', online: false, simulated: true })],
          GATE_EXIT: [],
        }}
      />
    );
    expect(screen.getByText('Device 1: Admin Enrollment')).toBeInTheDocument();
    expect(screen.getByText('Device 2: Gate Entry')).toBeInTheDocument();
    expect(screen.getByText('Device 3: Gate Exit')).toBeInTheDocument();
    expect(screen.getByText(/Not registered/)).toBeInTheDocument();
    expect(screen.getByText('SIMULATED')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
  });
});

describe('sync badges', () => {
  it('never shows full sync for partial or unverified states', () => {
    const { rerender } = render(<SyncStatusBadge status="PARTIALLY_SYNCHRONIZED" />);
    expect(screen.getByText('Partially synchronized')).toBeInTheDocument();
    rerender(<SyncStatusBadge status="SYNCHRONIZED_UNVERIFIED" />);
    expect(screen.getByText('Stored, not verified')).toBeInTheDocument();
    rerender(<GateStatusBadge gate={{ status: 'failed', detail: 'x' }} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
