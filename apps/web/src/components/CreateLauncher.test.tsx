// Unit tests for CreateLauncher — the welcoming three-choice home of the Create tab.
// Renders to static markup (react-dom/server, no extra deps) and asserts the three
// prominent choices exist. (Create Tab Redesign, Requirement 6)

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CreateLauncher from './CreateLauncher';

function render(props: Partial<Parameters<typeof CreateLauncher>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(CreateLauncher, {
      onChoose: () => {},
      todayFlockCount: 0,
      savedGroupCount: 0,
      ...props,
    }),
  );
}

describe('CreateLauncher', () => {
  it('renders exactly the three main choices', () => {
    const html = render();
    expect(html).toContain('Create a Post');
    expect(html).toContain('Post to Groups');
    expect(html).toContain('Schedule a Post');
  });

  it('mentions Mass Flock / Flight Mode under Post to Groups (discoverability)', () => {
    const html = render();
    expect(html.toLowerCase()).toContain('mass flock');
    expect(html.toLowerCase()).toContain('flight mode');
  });

  it('shows a friendly today-flock hint when there are flocks to post', () => {
    const html = render({ todayFlockCount: 3 });
    expect(html).toContain('3 flocks to post today');
  });

  it('falls back to saved-group count when no flocks are due today', () => {
    const html = render({ todayFlockCount: 0, savedGroupCount: 5 });
    expect(html).toContain('5 groups saved');
  });

  it('renders three Open affordances (one primary action per card)', () => {
    const html = render();
    const matches = html.match(/Open →/g) || [];
    expect(matches.length).toBe(3);
  });
});
