// Phase L Lane A / L.5 — CommandPalette "Ask AI" tests.
//
// Covers:
//   1. Typing a non-matching query surfaces the Ask AI entry.
//   2. Submitting it (Enter or click) dispatches ai:generate and renders the
//      answer panel.
//   3. tier=start → Ask AI shows the locked error message instead of calling.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CommandPalette } from '../CommandPalette';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { EntitlementsProvider } from '../../contexts/EntitlementsContext';
import { installMockApi } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>
        <EntitlementsProvider>{children}</EntitlementsProvider>
      </AuthProvider>
    </ToastProvider>
  </NavProvider>
);

describe('CommandPalette — Ask AI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('surfaces the Ask AI entry when query has no command match', async () => {
    installMockApi({ entitlements: { tier: 'pro' } });
    render(
      <Wrap>
        <CommandPalette open onClose={() => undefined} />
      </Wrap>,
    );
    const input = screen.getByPlaceholderText(/palette\.placeholder/i);
    const user = userEvent.setup();
    await user.type(input, 'explain my acos spike');
    await waitFor(() => {
      expect(screen.getByTestId('palette-ask-ai')).toBeInTheDocument();
    });
    // Quick AI verbs render too.
    expect(screen.getByTestId('palette-ai-verb-rewrite-blurb')).toBeInTheDocument();
    expect(screen.getByTestId('palette-ai-verb-explain-spike')).toBeInTheDocument();
  });

  it('clicking Ask AI dispatches ai:generate and renders the answer', async () => {
    installMockApi({
      entitlements: { tier: 'pro' },
      aiGenerateResult: {
        text: 'Likely cause: bid spike combined with weekend impressions surge.',
        model: 'claude-opus-4-7',
      },
    });
    render(
      <Wrap>
        <CommandPalette open onClose={() => undefined} />
      </Wrap>,
    );
    const input = screen.getByPlaceholderText(/palette\.placeholder/i);
    const user = userEvent.setup();
    await user.type(input, 'why did my spend spike on Friday?');
    await waitFor(() => {
      expect(screen.getByTestId('palette-ask-ai')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('palette-ask-ai'));

    const generateMock = window.api.ai.generate as ReturnType<typeof import('vitest').vi.fn>;
    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledTimes(1);
    });
    expect(generateMock.mock.calls[0][0].task).toBe('ask');

    // Answer panel appears.
    await waitFor(() => {
      expect(screen.getByTestId('palette-ask-ai-answer')).toBeInTheDocument();
    });
    expect(screen.getByText(/Likely cause/)).toBeInTheDocument();
  });

  it('shows the locked error when tier=start', async () => {
    installMockApi({ entitlements: { tier: 'start' } });
    render(
      <Wrap>
        <CommandPalette open onClose={() => undefined} />
      </Wrap>,
    );
    const input = screen.getByPlaceholderText(/palette\.placeholder/i);
    const user = userEvent.setup();
    await user.type(input, '?how do I lower acos');
    await waitFor(() => {
      expect(screen.getByTestId('palette-ask-ai')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('palette-ask-ai'));

    await waitFor(() => {
      expect(screen.getByTestId('palette-ask-ai-error')).toBeInTheDocument();
    });
    // We never actually called ai:generate when locked.
    const generateMock = window.api.ai.generate as ReturnType<typeof import('vitest').vi.fn>;
    expect(generateMock).not.toHaveBeenCalled();
  });
});
