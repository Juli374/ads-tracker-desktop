import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { AITab } from '../AITab';
import { ToastProvider } from '../../../contexts/ToastContext';
import { installMockApi } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi();
});

describe('AITab', () => {
  it('renders three cards (key, models, brand voice)', async () => {
    render(
      <Wrap>
        <AITab />
      </Wrap>,
    );
    expect(await screen.findByTestId('settings-ai-tab')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-key-input')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-model-completion')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-model-vision')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-model-fast')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-model-advisor')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-pov')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-tone')).toBeInTheDocument();
    expect(screen.getByTestId('settings-ai-banned')).toBeInTheDocument();
  });

  it('hydrates from local-db on mount and shows "Not configured" when empty', async () => {
    render(
      <Wrap>
        <AITab />
      </Wrap>,
    );
    await waitFor(() => {
      expect(window.api.ai.getSettings).toHaveBeenCalledTimes(1);
    });
    // Empty key → not_configured status badge
    expect(await screen.findByText('ai.statusNotConfigured')).toBeInTheDocument();
  });

  it('persists settings via setSettings when Save is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <AITab />
      </Wrap>,
    );
    const input = (await screen.findByTestId(
      'settings-ai-key-input',
    )) as HTMLInputElement;
    await user.type(input, 'sk-ant-test-12345');

    const saveBtn = screen.getByTestId('settings-ai-save');
    await user.click(saveBtn);

    await waitFor(() => {
      expect(window.api.ai.setSettings).toHaveBeenCalledTimes(1);
    });
    const arg = (window.api.ai.setSettings as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg.claudeKey).toBe('sk-ant-test-12345');
    expect(arg.models.completion).toBe('claude-opus-4-8');
    expect(arg.brandVoice.toneWords).toEqual([]);
  });

  it('refuses to test when key field is empty', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <AITab />
      </Wrap>,
    );
    const testBtn = await screen.findByTestId('settings-ai-test-key');
    await user.click(testBtn);
    // testKey IPC must not be called when there is no input
    expect(window.api.ai.testKey).not.toHaveBeenCalled();
  });

  it('shows pass badge when test succeeds', async () => {
    installMockApi({ aiTestKey: { ok: true, status: 200 } });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AITab />
      </Wrap>,
    );
    const input = (await screen.findByTestId(
      'settings-ai-key-input',
    )) as HTMLInputElement;
    await user.type(input, 'sk-ant-test');
    await user.click(screen.getByTestId('settings-ai-test-key'));

    expect(await screen.findByTestId('settings-ai-test-pass')).toBeInTheDocument();
    expect(window.api.ai.testKey).toHaveBeenCalledWith('sk-ant-test', 'claude-haiku-4-5');
  });

  it('shows fail badge with error when test fails', async () => {
    installMockApi({
      aiTestKey: { ok: false, status: 401, error: 'invalid x-api-key' },
    });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AITab />
      </Wrap>,
    );
    const input = await screen.findByTestId('settings-ai-key-input');
    fireEvent.change(input, { target: { value: 'sk-bad' } });
    await user.click(screen.getByTestId('settings-ai-test-key'));

    const fail = await screen.findByTestId('settings-ai-test-fail');
    expect(fail).toHaveTextContent('invalid x-api-key');
    // Status badge flips to invalid
    expect(await screen.findByText('ai.statusInvalid')).toBeInTheDocument();
  });
});
