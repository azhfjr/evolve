import type { WorkspaceData, Task, Status } from "@/lib/types";
import type { Command } from "@/lib/validation";
export type RunCommand = (command: Command) => Promise<Record<string, unknown>>;
export type SharedProps = {
  data: WorkspaceData;
  demo?: boolean;
  run: RunCommand;
  openTask: (task: Task) => void;
  newTask: () => void;
  archiveView?: boolean;
  onArchiveChange?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
  newTaskForStatus?: (status: Status) => void;
  newTaskForDate?: (date: string) => void;
  calendarMonth?: Date;
  onCalendarMonthChange?: (date: Date) => void;
  calendarSelectedDate?: Date;
  onCalendarDateChange?: (date: Date) => void;
};
