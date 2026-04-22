import { useState } from 'react';
import { HECard, ChecklistItem } from '../components/DesignSystem';
import { tradeContent } from '../data/tradeData';

interface CueTask {
  id: string;
  text: string;
  time: string;
  completed: boolean;
}

interface CuesScreenProps {
  tradeId: string;
}

export function CuesScreen({ tradeId }: CuesScreenProps) {
  const content = tradeContent[tradeId];

  const [todayTasks, setTodayTasks] = useState<CueTask[]>(
    content.todaysCues.map((cue, idx) => ({
      id: `t${idx + 1}`,
      text: cue.text,
      time: cue.time,
      completed: false,
    }))
  );

  const [tomorrowTasks, setTomorrowTasks] = useState<CueTask[]>([
    { id: 'tm1', text: 'Post giveaway reminder', time: 'Tomorrow', completed: false },
    { id: 'tm2', text: 'Follow up with opportunities', time: 'Tomorrow', completed: false },
  ]);

  const toggleTodayTask = (id: string) => {
    setTodayTasks(todayTasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const toggleTomorrowTask = (id: string) => {
    setTomorrowTasks(tomorrowTasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const todayActive = todayTasks.filter(t => !t.completed).length;
  const tomorrowActive = tomorrowTasks.filter(t => !t.completed).length;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <h1 className="text-2xl font-bold text-[#0F172A]">🦅 Cues</h1>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Today</h2>
          {todayActive === 0 && (
            <span className="text-xs text-[#22C55E] font-medium">✓ All done!</span>
          )}
        </div>
        <div className="space-y-1">
          {todayTasks.map(task => (
            <ChecklistItem
              key={task.id}
              text={task.text}
              time={task.time}
              completed={task.completed}
              onToggle={() => toggleTodayTask(task.id)}
            />
          ))}
        </div>
      </HECard>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tomorrow</h2>
          {tomorrowActive === 0 && (
            <span className="text-xs text-[#22C55E] font-medium">✓ All done!</span>
          )}
        </div>
        <div className="space-y-1">
          {tomorrowTasks.map(task => (
            <ChecklistItem
              key={task.id}
              text={task.text}
              time={task.time}
              completed={task.completed}
              onToggle={() => toggleTomorrowTask(task.id)}
            />
          ))}
        </div>
      </HECard>
    </div>
  );
}
