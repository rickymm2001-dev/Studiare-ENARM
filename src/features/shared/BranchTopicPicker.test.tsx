// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { BranchTopicPicker } from './BranchTopicPicker';
import { ALL_TOPICS, CLINICAL_TOPICS, ENGLISH_BRANCHES } from './topics';

afterEach(cleanup);

const english = t.branchNames.medical_english as string;

describe('selector de ramas y subespecialidades con Inglés médico (B13, 2.8)', () => {
  it('las subespecialidades clínicas no incluyen las de Inglés médico', () => {
    expect(ALL_TOPICS).toEqual(
      expect.arrayContaining(['reading_comprehension', 'medical_vocabulary']),
    );
    expect(CLINICAL_TOPICS).not.toContain('reading_comprehension');
    expect(CLINICAL_TOPICS).not.toContain('medical_vocabulary');
    expect(CLINICAL_TOPICS.length).toBe(ALL_TOPICS.length - 2);
    expect(ENGLISH_BRANCHES.has('medical_english')).toBe(true);
    expect(ENGLISH_BRANCHES.has('internal_medicine')).toBe(false);
  });

  it('la práctica en español ofrece solo las ramas clínicas y Todas marca las clínicas', async () => {
    const typing = userEvent.setup();
    const onChange = vi.fn();
    render(<BranchTopicPicker selected={new Set()} onChange={onChange} scope="clinical" />);
    expect(screen.queryByText(english)).toBeNull();
    expect(screen.getByText(t.branchNames.internal_medicine as string)).toBeVisible();
    expect(screen.getByText(t.topicPicker.selected(0, CLINICAL_TOPICS.length))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.topicPicker.all }));
    expect([...(onChange.mock.calls[0]?.[0] as Set<string>)].sort()).toEqual(
      [...CLINICAL_TOPICS].sort(),
    );
  });

  it('Repasar ofrece todas, con Inglés médico, y Todas marca también sus temas', async () => {
    const typing = userEvent.setup();
    const onChange = vi.fn();
    render(<BranchTopicPicker selected={new Set()} onChange={onChange} />);
    expect(screen.getByText(english)).toBeVisible();
    expect(screen.getByText(t.topicPicker.selected(0, ALL_TOPICS.length))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.topicPicker.all }));
    expect((onChange.mock.calls[0]?.[0] as Set<string>).size).toBe(ALL_TOPICS.length);
  });
});
