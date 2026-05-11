import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ExportMenu } from '../ExportMenu';

describe('ExportMenu', () => {
  it('renders single button when only one item is provided', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <ExportMenu
        items={[{ id: 'xlsx', label: 'XLSX', onClick }]}
        testId="t-export"
        buttonLabel="Export"
      />,
    );
    const btn = screen.getByTestId('t-export');
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders dropdown menu when 2+ items are provided', async () => {
    const onXlsx = vi.fn();
    const onPdf = vi.fn();
    const user = userEvent.setup();
    render(
      <ExportMenu
        items={[
          { id: 'xlsx', label: 'XLSX', onClick: onXlsx },
          { id: 'pdf', label: 'PDF', onClick: onPdf },
        ]}
        testId="t-multi"
      />,
    );
    // Dropdown closed initially
    expect(screen.queryByTestId('t-multi-popover')).toBeNull();
    await user.click(screen.getByTestId('t-multi'));
    // Popover open
    expect(await screen.findByTestId('t-multi-popover')).toBeInTheDocument();
    await user.click(screen.getByTestId('t-multi-pdf'));
    expect(onPdf).toHaveBeenCalledOnce();
    expect(onXlsx).not.toHaveBeenCalled();
  });
});
