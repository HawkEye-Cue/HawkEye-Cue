// Regression tests: scheduled posts (readOnly timeline events) must be read-only in the
// hourly timeline — NO Edit/Delete/Done controls — while ordinary calendar events keep
// their controls. Renders the real component to static markup (react-dom/server, no extra
// deps) and asserts on the output.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HourlyTimeline from './HourlyTimeline';
import type { TimelineEvent } from './HourlyTimeline';

function render(events: TimelineEvent[], extraProps: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(HourlyTimeline, {
      events,
      startHour: 6,
      endHour: 19,
      showActions: true,
      onToggleComplete: () => {},
      onEdit: () => {},
      onDelete: () => {},
      ...extraProps,
    }),
  );
}

const scheduledPost: TimelineEvent = {
  id: 'p1',
  title: '[10:00] 📤 Fall roof inspection reminder',
  type: 'post',
  completed: false,
  readOnly: true,
};

const ordinaryEvent: TimelineEvent = {
  id: 'e1',
  title: '[10:00] Team standup',
  type: 'meeting',
  completed: false,
};

describe('HourlyTimeline — readOnly scheduled posts', () => {
  it('renders NO Edit/Delete/Done controls for a readOnly (scheduled post) event', () => {
    const html = render([scheduledPost]);
    // The post still appears (visible), at its hour.
    expect(html).toContain('Fall roof inspection reminder');
    // But no mutating controls.
    expect(html).not.toContain('✏️');
    expect(html).not.toContain('🗑️');
    expect(html).not.toContain('>Done<');
    // Shows the read-only hint instead.
    expect(html).toContain('Scheduled · manage in Create');
  });

  it('renders Edit/Delete/Done controls for an ordinary calendar event', () => {
    const html = render([ordinaryEvent]);
    expect(html).toContain('Team standup');
    expect(html).toContain('✏️');
    expect(html).toContain('🗑️');
    expect(html).toContain('>Done<');
    expect(html).not.toContain('Scheduled · manage in Create');
  });

  it('in a mixed timeline, only the ordinary event is editable', () => {
    const html = render([scheduledPost, ordinaryEvent]);
    // Exactly one edit and one delete control (for the ordinary event only).
    expect((html.match(/✏️/g) || []).length).toBe(1);
    expect((html.match(/🗑️/g) || []).length).toBe(1);
    expect(html).toContain('Scheduled · manage in Create');
  });

  it('a readOnly post with no handlers still shows no controls and remains visible', () => {
    const html = render([scheduledPost], { onToggleComplete: undefined, onEdit: undefined, onDelete: undefined });
    expect(html).toContain('Fall roof inspection reminder');
    expect(html).not.toContain('✏️');
    expect(html).not.toContain('🗑️');
  });
});
