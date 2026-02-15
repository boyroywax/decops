import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionTitle } from '../../../components/shared/ui';

describe('SectionTitle', () => {
    it('renders the title text', () => {
        render(<SectionTitle text="Test Title" />);
        expect(screen.getByText('Test Title')).toBeInTheDocument();
    });
});
