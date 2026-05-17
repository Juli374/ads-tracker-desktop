import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { SignupScreen } from '../SignupScreen';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <AuthProvider>{children}</AuthProvider>
  </ToastProvider>
);

beforeEach(() => {
  installMockApi({
    responses: mockApiResponses(),
    token: null,
  });
});

describe('SignupScreen', () => {
  const noop = () => undefined;

  it('renders the email, password, confirm, and terms fields', async () => {
    render(
      <Wrap>
        <SignupScreen onSwitchToLogin={noop} />
      </Wrap>,
    );
    expect(await screen.findByTestId('signup-screen')).toBeInTheDocument();
    expect(screen.getByTestId('signup-email')).toBeInTheDocument();
    expect(screen.getByTestId('signup-password')).toBeInTheDocument();
    expect(screen.getByTestId('signup-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('signup-agree-terms')).toBeInTheDocument();
    // Terms not yet agreed → submit must be disabled.
    expect(screen.getByTestId('signup-submit')).toBeDisabled();
  });

  it('validates short password — submit shows error', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <SignupScreen onSwitchToLogin={noop} />
      </Wrap>,
    );
    await screen.findByTestId('signup-screen');
    await user.type(screen.getByTestId('signup-email'), 'a@b.co');
    await user.type(screen.getByTestId('signup-password'), 'short'); // 5 chars
    await user.type(screen.getByTestId('signup-confirm'), 'short');
    await user.click(screen.getByTestId('signup-agree-terms'));
    // Submit stays disabled because password is too short.
    expect(screen.getByTestId('signup-submit')).toBeDisabled();
    expect(window.api.auth.signup).not.toHaveBeenCalled();
  });

  it('validates password mismatch — submit stays disabled', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <SignupScreen onSwitchToLogin={noop} />
      </Wrap>,
    );
    await screen.findByTestId('signup-screen');
    await user.type(screen.getByTestId('signup-email'), 'a@b.co');
    await user.type(screen.getByTestId('signup-password'), 'longenough1');
    await user.type(screen.getByTestId('signup-confirm'), 'different11');
    await user.click(screen.getByTestId('signup-agree-terms'));
    expect(screen.getByTestId('signup-submit')).toBeDisabled();
  });

  it('happy path: valid signup calls auth:signup IPC', async () => {
    const user = userEvent.setup();
    installMockApi({
      responses: mockApiResponses(),
      token: null,
      authSignupResult: {
        ok: true,
        emailVerified: false,
        user: {
          id: 42,
          email: 'new@user.com',
          full_name: 'New User',
          role: 'user',
          avatar: null,
        },
      },
    });
    render(
      <Wrap>
        <SignupScreen onSwitchToLogin={noop} />
      </Wrap>,
    );
    await screen.findByTestId('signup-screen');
    await user.type(screen.getByTestId('signup-email'), 'new@user.com');
    await user.type(screen.getByTestId('signup-full-name'), 'New User');
    await user.type(screen.getByTestId('signup-password'), 'longenough1');
    await user.type(screen.getByTestId('signup-confirm'), 'longenough1');
    await user.click(screen.getByTestId('signup-agree-terms'));
    expect(screen.getByTestId('signup-submit')).toBeEnabled();
    await user.click(screen.getByTestId('signup-submit'));
    await waitFor(() => {
      expect(window.api.auth.signup).toHaveBeenCalledWith(
        'new@user.com',
        'longenough1',
        'New User',
      );
    });
  });

  it('surfaces signup error in the form', async () => {
    const user = userEvent.setup();
    installMockApi({
      responses: mockApiResponses(),
      token: null,
      authSignupResult: { ok: false, error: 'Email already taken' },
    });
    render(
      <Wrap>
        <SignupScreen onSwitchToLogin={noop} />
      </Wrap>,
    );
    await screen.findByTestId('signup-screen');
    await user.type(screen.getByTestId('signup-email'), 'taken@user.com');
    await user.type(screen.getByTestId('signup-password'), 'longenough1');
    await user.type(screen.getByTestId('signup-confirm'), 'longenough1');
    await user.click(screen.getByTestId('signup-agree-terms'));
    await user.click(screen.getByTestId('signup-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('signup-error')).toBeInTheDocument();
      expect(screen.getByTestId('signup-error')).toHaveTextContent('Email already taken');
    });
  });

  it('switch-to-login button calls onSwitchToLogin', async () => {
    const user = userEvent.setup();
    const onSwitchToLogin = vi.fn();
    render(
      <Wrap>
        <SignupScreen onSwitchToLogin={onSwitchToLogin} />
      </Wrap>,
    );
    await screen.findByTestId('signup-screen');
    await user.click(screen.getByTestId('signup-switch-login'));
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });
});
