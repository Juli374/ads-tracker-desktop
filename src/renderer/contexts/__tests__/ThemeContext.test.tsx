import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ThemeProvider, useTheme } from '../ThemeContext';

const Probe: React.FC = () => {
  const { mode, resolved, setMode, cycle } = useTheme();
  return (
    <div>
      <div data-testid="mode">{mode}</div>
      <div data-testid="resolved">{resolved}</div>
      <button onClick={() => setMode('dark')}>set-dark</button>
      <button onClick={() => setMode('light')}>set-light</button>
      <button onClick={() => setMode('system')}>set-system</button>
      <button onClick={cycle}>cycle</button>
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    window.localStorage.clear();
  });

  it('useTheme работает без Provider (defensive default = system)', () => {
    render(<Probe />);
    // Дефолт: mode='system', resolved='light' (jsdom matchMedia → false по умолчанию)
    expect(screen.getByTestId('mode').textContent).toBe('system');
  });

  it('setMode("dark") добавляет класс на html', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await user.click(screen.getByText('set-dark'));
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setMode("light") убирает класс', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByText('set-dark'));
    await user.click(screen.getByText('set-light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme:mode')).toBe('light');
  });

  it('cycle: light → dark → system → light', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByText('set-light'));
    expect(screen.getByTestId('mode').textContent).toBe('light');
    await user.click(screen.getByText('cycle'));
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    await user.click(screen.getByText('cycle'));
    expect(screen.getByTestId('mode').textContent).toBe('system');
    await user.click(screen.getByText('cycle'));
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });
});
