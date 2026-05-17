import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { LoginScreen } from '../LoginScreen';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <AuthProvider>{children}</AuthProvider>
  </ToastProvider>
);

beforeEach(() => {
  // Дефолт mock возвращает токен → Auth status станет authenticated сразу.
  // Для LoginScreen теста нам нужно стартовать с unauthenticated.
  installMockApi({
    responses: mockApiResponses(),
    token: null,
  });
});

describe('LoginScreen', () => {
  const noop = () => undefined;

  it('рендерит email-таб по умолчанию с двумя полями', async () => {
    render(
      <Wrap>
        <LoginScreen onShowSignup={noop} />
      </Wrap>,
    );
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-tab-email')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-tab-token')).toBeInTheDocument();
    // Email mode: Email and password placeholders rendered.
    expect(screen.getByPlaceholderText('fields.emailPlaceholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('fields.passwordPlaceholder')).toBeInTheDocument();
  });

  it('переключение на Token-таб показывает textarea', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <LoginScreen onShowSignup={noop} />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.click(screen.getByTestId('auth-tab-token'));
    expect(
      screen.getByPlaceholderText('fields.tokenPlaceholder'),
    ).toBeInTheDocument();
  });

  // Phase R.7 — happy path: submit email + password, calls window.api.auth.login.
  it('Phase R.7: submit email + password calls auth:login IPC', async () => {
    const user = userEvent.setup();
    installMockApi({
      responses: mockApiResponses(),
      token: null,
      authLoginResult: {
        ok: true,
        user: {
          id: 1,
          email: 'user@example.com',
          full_name: 'User One',
          role: 'user',
          avatar: null,
        },
      },
    });
    render(
      <Wrap>
        <LoginScreen onShowSignup={noop} />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.type(screen.getByTestId('login-email'), 'user@example.com');
    await user.type(screen.getByTestId('login-password'), 'correcthorse');
    await user.click(screen.getByTestId('login-submit'));
    await waitFor(() => {
      expect(window.api.auth.login).toHaveBeenCalledWith(
        'user@example.com',
        'correcthorse',
      );
    });
  });

  // Phase R.7 — bad creds: error banner renders.
  it('Phase R.7: shows error banner on bad credentials', async () => {
    const user = userEvent.setup();
    installMockApi({
      responses: mockApiResponses(),
      token: null,
      authLoginResult: { ok: false, error: 'errors.invalidCredentials' },
    });
    render(
      <Wrap>
        <LoginScreen onShowSignup={noop} />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.type(screen.getByTestId('login-email'), 'bad@example.com');
    await user.type(screen.getByTestId('login-password'), 'wrongpassword');
    await user.click(screen.getByTestId('login-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeInTheDocument();
    });
  });

  // Phase R.7 — 2FA branch: when login returns requires2fa, the TOTP input
  // replaces the email/password form and uses the partialToken on verify.
  it('Phase R.7: swaps to 2FA input when requires_2fa', async () => {
    const user = userEvent.setup();
    installMockApi({
      responses: mockApiResponses(),
      token: null,
      authLoginResult: {
        ok: true,
        requires2fa: true,
        partialToken: 'PARTIAL-XYZ',
      },
    });
    render(
      <Wrap>
        <LoginScreen onShowSignup={noop} />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.type(screen.getByTestId('login-email'), 'twofa@example.com');
    await user.type(screen.getByTestId('login-password'), 'mypassword1');
    await user.click(screen.getByTestId('login-submit'));
    // TOTP input replaces the password form.
    expect(await screen.findByTestId('login-totp-input')).toBeInTheDocument();
    await user.type(screen.getByTestId('login-totp-input'), '123456');
    await user.click(screen.getByTestId('login-totp-submit'));
    await waitFor(() => {
      expect(window.api.auth.verify2fa).toHaveBeenCalledWith('PARTIAL-XYZ', '123456');
    });
  });

  // Phase R.7 — forgot password modal opens on click.
  it('Phase R.7: forgot-password link opens the modal', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <LoginScreen onShowSignup={noop} />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.click(screen.getByTestId('login-forgot-password'));
    expect(await screen.findByTestId('forgot-password-modal')).toBeInTheDocument();
  });

  // Phase R.7 — calling onShowSignup callback when the "no account" link is clicked.
  it('Phase R.7: switch-to-signup link calls onShowSignup', async () => {
    const user = userEvent.setup();
    const onShowSignup = vi.fn();
    render(
      <Wrap>
        <LoginScreen onShowSignup={onShowSignup} />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.click(screen.getByTestId('login-switch-signup'));
    expect(onShowSignup).toHaveBeenCalledTimes(1);
  });
});
