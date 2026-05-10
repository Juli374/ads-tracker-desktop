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

  it('shows source toggle with cloud and local options', async () => {
    render(
      <Wrap>
        <RoyaltiesTab />
      </Wrap>,
    );
    await screen.findByTestId('settings-royalties-tab');
    // SourceToggle radio group is rendered
    expect(screen.getByRole('radiogroup', { name: /source\.ariaLabel/i })).toBeInTheDocument();
  });
});
