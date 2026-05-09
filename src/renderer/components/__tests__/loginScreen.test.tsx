import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('рендерит email-таб по умолчанию с двумя полями', async () => {
    render(
      <Wrap>
        <LoginScreen />
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
        <LoginScreen />
      </Wrap>,
    );
    await screen.findByTestId('login-screen');
    await user.click(screen.getByTestId('auth-tab-token'));
    expect(
      screen.getByPlaceholderText('fields.tokenPlaceholder'),
    ).toBeInTheDocument();
  });
});
