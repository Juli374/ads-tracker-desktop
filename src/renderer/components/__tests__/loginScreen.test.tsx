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
    expect(
      await screen.findByRole('heading', { name: 'Ads Tracker' }),
    ).toBeInTheDocument();
    // Tabs: Email + пароль (default selected) и API-ключ
    expect(
      await screen.findByRole('tab', { name: 'Таб: Email' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('tab', { name: 'Таб: Token' }),
    ).toBeInTheDocument();
    // В email-режиме есть поля Email и пароль (через placeholder)
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('переключение на Token-таб показывает textarea', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    await screen.findByRole('heading', { name: 'Ads Tracker' });
    await user.click(screen.getByRole('tab', { name: 'Таб: Token' }));
    expect(
      screen.getByPlaceholderText(/at_live_/),
    ).toBeInTheDocument();
  });
});
