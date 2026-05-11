import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Home } from 'lucide-react';

import { Button } from '../Button';
import { Input } from '../Input';
import { Badge } from '../Badge';
import { NavItem } from '../NavItem';
import { Num } from '../Num';
import { Table, Thead, Tbody, Tr, Th, Td } from '../DataTable';

describe('Button', () => {
  it('renders with children and handles click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByText('Save'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('forwards ref to underlying button', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('respects disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>x</Button>);
    await user.click(screen.getByText('x'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies primary variant classes', () => {
    render(<Button variant="primary">x</Button>);
    expect(screen.getByText('x').className).toMatch(/bg-accent/);
  });
});

describe('Input', () => {
  it('forwards ref and accepts typing', async () => {
    const user = userEvent.setup();
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="email" />);
    const input = screen.getByLabelText('email');
    await user.type(input, 'hi');
    expect((input as HTMLInputElement).value).toBe('hi');
    expect(ref.current).toBe(input);
  });
});

describe('Badge', () => {
  it('renders with variant', () => {
    render(<Badge variant="success">OK</Badge>);
    const el = screen.getByText('OK');
    expect(el.className).toMatch(/bg-success-soft/);
  });

  it('shows dot when requested', () => {
    const { container } = render(<Badge variant="warning" dot>WARN</Badge>);
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot).not.toBeNull();
  });
});

describe('NavItem', () => {
  it('renders label and icon, fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<NavItem icon={Home} label="Dashboard" onClick={onClick} />);
    await user.click(screen.getByText('Dashboard'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks active state with aria-current', () => {
    render(<NavItem label="X" active />);
    const btn = screen.getByText('X').closest('button')!;
    expect(btn.getAttribute('aria-current')).toBe('page');
  });

  it('renders count in mono', () => {
    render(<NavItem label="Books" count={42} />);
    expect(screen.getByText('42').className).toMatch(/font-mono/);
  });
});

describe('Num', () => {
  it('wraps content with mono+tabular', () => {
    render(<Num>123</Num>);
    expect(screen.getByText('123').className).toMatch(/font-mono/);
    expect(screen.getByText('123').className).toMatch(/tabular-nums/);
  });

  it('forwards className', () => {
    render(<Num className="text-error">9</Num>);
    expect(screen.getByText('9').className).toMatch(/text-error/);
  });
});

describe('DataTable primitives', () => {
  it('renders styled table with Th uppercase + Td numCol', () => {
    render(
      <Table>
        <Thead>
          <Tr>
            <Th>Name</Th>
            <Th numCol>Spend</Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr>
            <Td>Camp A</Td>
            <Td numCol>123.45</Td>
          </Tr>
        </Tbody>
      </Table>,
    );
    expect(screen.getByText('Spend').className).toMatch(/uppercase/);
    expect(screen.getByText('123.45').className).toMatch(/font-mono/);
  });
});
