// Phase L Lane A — task-selector tabs for Listing Studio.
//
// The 5 tasks are stable; we only ever swap state between them, so a simple
// segmented control fits better than a routing setup.

import React from 'react';
import { Type, AlignLeft, Text, List, Layers } from 'lucide-react';
import type { AiGenerateTask } from '../../../shared/ipc';

export type ListingTask = Extract<AiGenerateTask, 'title' | 'subtitle' | 'description' | 'bullets' | 'aPlus'>;

interface Props {
  active: ListingTask;
  onChange(task: ListingTask): void;
}

interface TaskDef {
  task: ListingTask;
  label: string;
  Icon: React.ElementType;
}

const TASKS: readonly TaskDef[] = [
  { task: 'title', label: 'Title', Icon: Type },
  { task: 'subtitle', label: 'Subtitle', Icon: Text },
  { task: 'description', label: 'Description', Icon: AlignLeft },
  { task: 'bullets', label: 'Bullets', Icon: List },
  { task: 'aPlus', label: 'A+ Angles', Icon: Layers },
];

export const ListingTaskTabs: React.FC<Props> = ({ active, onChange }) => {
  return (
    <div
      role="tablist"
      aria-label="Listing task"
      data-testid="listing-task-tabs"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-100 border border-zinc-200"
    >
      {TASKS.map(({ task, label, Icon }) => {
        const isActive = task === active;
        return (
          <button
            key={task}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`listing-tab-${task}`}
            onClick={() => onChange(task)}
            className={`
              inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium
              transition-colors duration-100
              ${isActive
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60'}
            `}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
};
