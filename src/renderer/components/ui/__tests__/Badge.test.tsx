// Phase Q.1 tests for the extended Badge primitive. Original variant/dot
// behavior is still covered in primitives.test.tsx — this file focuses on the
// new props: size (xs/sm/md), shape (rect/pill), and the active variant.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { Badge } from '../Badge';

describe('Badge (Phase Q.1 extensions)', () => {
  describe('size prop', () => {
    it('applies xs size classes', () => {
      render(<Badge size="xs">XS</Badge>);
      const el = screen.getByText('XS');
      expect(el.className).toMatch(/h-4/);
      expect(el.className).toMatch(/text-\[10px\]/);
      expect(el.className).toMatch(/px-1\.5/);
    });

    it('applies sm size classes', () => {
      render(<Badge size="sm">SM</Badge>);
      const el = screen.getByText('SM');
      expect(el.className).toMatch(/h-5/);
      expect(el.className).toMatch(/text-\[10px\]/);
      expect(el.className).toMatch(/px-2/);
    });

    it('applies md size classes (default)', () => {
      render(<Badge>MD</Badge>);
      const el = screen.getByText('MD');
      expect(el.className).toMatch(/h-5/);
      expect(el.className).toMatch(/text-xs/);
      expect(el.className).toMatch(/px-2/);
    });
  });

  describe('shape prop', () => {
    it('applies rect shape classes by default', () => {
      render(<Badge>R</Badge>);
      expect(screen.getByText('R').className).toMatch(/rounded-sm/);
    });

    it('applies pill shape classes (rounded-pill + uppercase + tracking-wider)', () => {
      render(<Badge shape="pill">P</Badge>);
      const el = screen.getByText('P');
      expect(el.className).toMatch(/rounded-pill/);
      expect(el.className).toMatch(/uppercase/);
      expect(el.className).toMatch(/tracking-wider/);
    });
  });

  describe('active variant', () => {
    it('renders with emerald color tokens', () => {
      render(<Badge variant="active">LIVE</Badge>);
      const el = screen.getByText('LIVE');
      expect(el.className).toMatch(/bg-emerald-50/);
      expect(el.className).toMatch(/text-emerald-700/);
      expect(el.className).toMatch(/border-emerald-200/);
    });

    it('shows emerald-500 dot when dot=true on active variant', () => {
      const { container } = render(
        <Badge variant="active" dot>
          ACTIVE
        </Badge>,
      );
      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot?.className).toMatch(/bg-emerald-500/);
    });
  });

  describe('original behavior preserved', () => {
    it('still renders neutral variant by default with surface tokens', () => {
      render(<Badge>N</Badge>);
      expect(screen.getByText('N').className).toMatch(/bg-surface-2/);
    });

    it('still renders success variant', () => {
      render(<Badge variant="success">OK</Badge>);
      expect(screen.getByText('OK').className).toMatch(/bg-success-soft/);
    });

    it('still forwards custom className', () => {
      render(<Badge className="custom-x">x</Badge>);
      expect(screen.getByText('x').className).toMatch(/custom-x/);
    });

    it('still forwards ref to the span element', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Badge ref={ref}>r</Badge>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });

  describe('combinations', () => {
    it('combines active + pill + xs', () => {
      render(
        <Badge variant="active" shape="pill" size="xs">
          LIVE
        </Badge>,
      );
      const el = screen.getByText('LIVE');
      expect(el.className).toMatch(/bg-emerald-50/);
      expect(el.className).toMatch(/rounded-pill/);
      expect(el.className).toMatch(/uppercase/);
      expect(el.className).toMatch(/h-4/);
    });
  });
});
