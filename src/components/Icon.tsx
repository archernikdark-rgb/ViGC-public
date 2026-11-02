import {
  IconFocus2, IconArrowsMinimize, IconSettings, IconArrowBackUp, IconArrowForwardUp, IconArrowsMaximize, IconBolt, IconBug, IconKey,
  IconChevronDown, IconChevronUp, IconDeviceFloppy, IconEye, IconEyeOff, IconFolder,
  IconHandMove, IconLink, IconMapPin, IconMenu2, IconMessage, IconMinus, IconNumber,
  IconPalette, IconPlayerPause, IconPlayerPlay, IconPlus, IconPointer, IconRefresh,
  IconRepeat, IconRoute, IconStack2, IconTable, IconTag, IconTrash, IconUser, IconUserPlus,
  IconFunction, IconGitBranch, IconTransform, IconVariable, IconCircle, IconPoint,
  IconRectangle, IconPolygon, IconChartDonut, IconArrowUpRight, IconLetterT, IconFile, IconSchool, IconLock, IconLockOpen,
} from '@tabler/icons-react';

// Tabler Icons, MIT licensed; the mapping keeps semantic names stable across the UI.
const icons = {
  settings:IconSettings, bug: IconBug, loop: IconRepeat, counter: IconNumber, eventTag: IconTag,
  userPlus: IconUserPlus, plus: IconPlus, play: IconPlayerPlay, pause: IconPlayerPause,
  palette: IconPalette, focus:IconFocus2, minimize:IconArrowsMinimize, fit: IconArrowsMaximize, trash: IconTrash, menu: IconMenu2,
  snapshot: IconKey, person: IconUser, chevronDown: IconChevronDown,
  chevronUp: IconChevronUp, restart: IconRefresh, marker: IconMapPin, eye: IconEye,
  eyeOff: IconEyeOff, link: IconLink, folder: IconFolder, comment: IconMessage,
  undo: IconArrowBackUp, redo: IconArrowForwardUp, path: IconRoute, cursor: IconPointer,
  hand: IconHandMove, save: IconDeviceFloppy, table: IconTable, layers: IconStack2,
  minus: IconMinus, bolt:IconBolt, function:IconFunction, branch:IconGitBranch, transform:IconTransform, variable:IconVariable,
  circle:IconCircle, point:IconPoint, rectangle:IconRectangle, polygon:IconPolygon, chart:IconChartDonut, arrow:IconArrowUpRight, text:IconLetterT,
  file:IconFile, school:IconSchool, lock:IconLock, unlock:IconLockOpen,
} as const;
export type IconName = keyof typeof icons;
export function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const Glyph=icons[name];
  return <Glyph size={size} stroke={1.6} aria-hidden="true"/>;
}
export function IconButton({ icon, label, onClick, disabled = false, primary = false }: {
  icon: IconName; label: string; onClick?: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <button type="button" className={`icon-button ${primary ? 'primary' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon name={icon} /></button>;
}
