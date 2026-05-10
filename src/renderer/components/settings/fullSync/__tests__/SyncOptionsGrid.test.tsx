import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { SyncOptionsGrid } from '../SyncOptionsGrid';
import type { SyncOption } from '../../../../api/syncApi';

const Wrapper: React.FC = () => {
  const [selected, setSelected] = useState<SyncOption[]>(['campaigns']);
  return (
    <SyncOptionsGrid selected={selected} onChange={setSelected} />
  );
};

function getCheckbox(testId: string): HTMLInputElement {
  const label = screen.getByTestId(testId);
  const input = label.querySelector('input[type="checkbox"]');
  if (!input) throw new Error(`No checkbox inside ${testId}`);
  return input as HTMLInputElement;
}

describe('SyncOptionsGrid', () => {
  it('renders all 6 option checkboxes', () => {
    render(<Wrapper />);
    const options: SyncOption[] = [
      'campaigns',
      'ad_groups',
      'keywords',
      'product_targets',
      'negatives',
      'sb',
    ];
    for (const opt of options) {
      expect(screen.getByTestId(`sync-option-${opt}`)).toBeInTheDocument();
    }
  });

  it('toggles option on click', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    // campaigns is initially checked
    const campaignsCheckbox = getCheckbox('sync-option-campaigns');
    expect(campaignsCheckbox).toBeChecked();

    // uncheck campaigns
    await user.click(campaignsCheckbox);
    expect(campaignsCheckbox).not.toBeChecked();

    // check ad_groups
    const adGroupsCheckbox = getCheckbox('sync-option-ad_groups');
    expect(adGroupsCheckbox).not.toBeChecked();
    await user.click(adGroupsCheckbox);
    expect(adGroupsCheckbox).toBeChecked();
  });
});
