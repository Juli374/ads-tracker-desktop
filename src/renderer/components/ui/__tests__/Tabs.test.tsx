import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { Tabs, type TabItem } from '../Tabs';

type TabKey = 'overview' | 'details' | 'logs';

const ITEMS: ReadonlyArray<TabItem<TabKey>> = [
  { value: 'overview', label: 'Overview' },
  { value: 'details', label: 'Details', count: 3 },
  { value: 'logs', label: 'Logs', disabled: true },
];

describe('Tabs', () => {
  it('renders a tablist with three tabs', () => {
    render(<Tabs<TabKey> value="overview" onChange={vi.fn()} items={ITEMS} />);
    const list = screen.getByRole('tablist');
    expect(list).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('marks the active tab with aria-selected=true and underline classes', () => {
    render(<Tabs<TabKey> value="overview" onChange={vi.fn()} items={ITEMS} />);
    const overview = screen.getByRole('tab', { name: /Overview/ });
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(overview.className).toMatch(/border-b-2/);
    expect(overview.className).toMatch(/border-zinc-900/);
    expect(overview.className).toMatch(/font-medium/);
  });

  it('marks inactive tabs with aria-selected=false', () => {
    render(<Tabs<TabKey> value="overview" onChange={vi.fn()} items={ITEMS} />);
    const details = screen.getByRole('tab', { name: /Details/ });
    expect(details.getAttribute('aria-selected')).toBe('false');
    expect(details.className).toMatch(/text-zinc-500/);
  });

  it('renders count badge when count > 0', () => {
    render(<Tabs<TabKey> value="overview" onChange={vi.fn()} items={ITEMS} />);
    const badge = screen.getByText('3');
    expect(badge.className).toMatch(/rounded-full/);
    expect(badge.className).toMatch(/bg-zinc-100/);
  });

  it('fires onChange when clicking a non-active tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs<TabKey> value="overview" onChange={onChange} items={ITEMS} />);
    await user.click(screen.getByRole('tab', { name: /Details/ }));
    expect(onChange).toHaveBeenCalledWith('details');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('does not fire onChange when clicking the active tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs<TabKey> value="overview" onChange={onChange} items={ITEMS} />);
    await user.click(screen.getByRole('tab', { name: /Overview/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not fire onChange when clicking a disabled tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs<TabKey> value="overview" onChange={onChange} items={ITEMS} />);
    await user.click(screen.getByRole('tab', { name: /Logs/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies disabled classes to disabled tabs', () => {
    render(<Tabs<TabKey> value="overview" onChange={vi.fn()} items={ITEMS} />);
    const logs = screen.getByRole('tab', { name: /Logs/ });
    expect(logs.className).toMatch(/text-zinc-300/);
    expect(logs.className).toMatch(/cursor-not-allowed/);
    expect((logs as HTMLButtonElement).disabled).toBe(true);
  });

  it('forwards aria-label to the tablist', () => {
    render(
      <Tabs<TabKey>
        value="overview"
        onChange={vi.fn()}
        items={ITEMS}
        aria-label="Page sections"
      />,
    );
    const list = screen.getByRole('tablist');
    expect(list.getAttribute('aria-label')).toBe('Page sections');
  });
});
