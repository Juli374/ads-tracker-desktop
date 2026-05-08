import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { DashboardPage } from '../DashboardPage';
import { BooksPage } from '../BooksPage';
import { CampaignsPage } from '../CampaignsPage';
import { SearchTermsPage } from '../SearchTermsPage';
import { ReportsPage } from '../ReportsPage';
import { SettingsPage } from '../SettingsPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';

import { installMockApi, mockApiResponses } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  </NavProvider>
);

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
});

describe('page smoke renders', () => {
  it('DashboardPage renders header and KPIs', async () => {
    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    expect(screen.getByText('Обзор')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Spend')).toBeInTheDocument();
      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('ACOS')).toBeInTheDocument();
      expect(screen.getByText('TACoS')).toBeInTheDocument();
    });
  });

  it('BooksPage renders header and table', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    expect(screen.getByText('Книги')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Test Book')).toBeInTheDocument();
    });
  });

  it('CampaignsPage renders header and table', async () => {
    render(
      <Wrap>
        <CampaignsPage />
      </Wrap>,
    );
    expect(screen.getByText('Кампании')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    });
  });

  it('SearchTermsPage renders header without crashing on empty list', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    expect(screen.getByText('Поисковые запросы')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Нет запросов/)).toBeInTheDocument();
    });
  });

  it('ReportsPage renders header, table and marketplace card', async () => {
    render(
      <Wrap>
        <ReportsPage />
      </Wrap>,
    );
    expect(screen.getByText('Отчёты')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Динамика')).toBeInTheDocument();
      expect(screen.getByText('По маркетплейсам')).toBeInTheDocument();
    });
  });

  it('SettingsPage renders sections', async () => {
    render(
      <Wrap>
        <SettingsPage />
      </Wrap>,
    );
    expect(screen.getByText('Настройки')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Учётная запись')).toBeInTheDocument();
      expect(screen.getByText('API-ключ')).toBeInTheDocument();
      expect(screen.getByText('Backend')).toBeInTheDocument();
      expect(screen.getByText('Приложение')).toBeInTheDocument();
    });
  });
});
