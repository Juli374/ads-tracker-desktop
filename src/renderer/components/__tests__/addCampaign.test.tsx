import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';

import { AddCampaignModal } from '../AddCampaignModal';
import { CampaignsPage } from '../../pages/CampaignsPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>
        <MarketplacesProvider>
          <BooksProvider>
            <GlobalFiltersProvider>{children}</GlobalFiltersProvider>
          </BooksProvider>
        </MarketplacesProvider>
      </AuthProvider>
    </ToastProvider>
  </NavProvider>
);

const Stub: React.FC = () => {
  const [open, setOpen] = useState(true);
  if (!open) return <div data-testid="closed" />;
  return (
    <AddCampaignModal onClose={() => setOpen(false)} onCreated={() => setOpen(false)} />
  );
};

describe('AddCampaignModal', () => {
  beforeEach(() => {
    installMockApi({ responses: mockApiResponses() });
  });

  it('рендерит wizard-секции и кнопку Создать', async () => {
    render(
      <Wrap>
        <Stub />
      </Wrap>,
    );
    expect(await screen.findByTestId('add-campaign-modal')).toBeInTheDocument();
    // Все ключевые секции — mock react-i18next возвращает ключи namespace.
    expect(await screen.findByText('add.type.title')).toBeInTheDocument();
    expect(await screen.findByText('add.bookSection')).toBeInTheDocument();
    expect(await screen.findByText('add.params')).toBeInTheDocument();
    expect(await screen.findByText('Bidding & placements')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'add.actions.submit' }),
    ).toBeInTheDocument();
  });

  it('Esc закрывает модал', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <Stub />
      </Wrap>,
    );
    await screen.findByTestId('add-campaign-modal');
    await user.keyboard('{Escape}');
    expect(await screen.findByTestId('closed')).toBeInTheDocument();
  });
});

describe('CampaignsPage: + Кампания', () => {
  beforeEach(() => {
    installMockApi({ responses: mockApiResponses() });
  });

  it('кнопка "+ Кампания" открывает модал', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <CampaignsPage />
      </Wrap>,
    );
    await screen.findByTestId('campaigns-page');
    const addBtn = await screen.findByRole('button', { name: /^list\.addCampaign$/ });
    await user.click(addBtn);
    expect(await screen.findByTestId('add-campaign-modal')).toBeInTheDocument();
  });
});
