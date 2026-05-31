import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { RoyaltiesTab } from '../RoyaltiesTab';
import { ToastProvider } from '../../../contexts/ToastContext';
import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
});

describe('RoyaltiesTab', () => {
  it('renders with data-testid settings-royalties-tab', async () => {
    render(
      <Wrap>
        <RoyaltiesTab />
      </Wrap>,
    );
    expect(await screen.findByTestId('settings-royalties-tab')).toBeInTheDocument();
  });

  it('shows the local import button (royalty is local-only now)', async () => {
    render(
      <Wrap>
        <RoyaltiesTab />
      </Wrap>,
    );
    await screen.findByTestId('settings-royalties-tab');
    // Royalty is fully local: import button is always available, no source toggle.
    expect(await screen.findByTestId('royalty-import-btn')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /source\.ariaLabel/i })).not.toBeInTheDocument();
  });
});
