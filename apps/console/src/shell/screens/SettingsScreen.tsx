import { useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { SettingsList, SettingsRow } from '../components/SettingsList';
import { FocusScope, useFocusItem } from '../focus/FocusManager';
import { stepSetting, type ShellSettings } from '../settings';

export type CategoryId = 'display' | 'accessibility' | 'controllers' | 'network' | 'about';

const CATEGORIES: readonly { id: CategoryId; label: string; icon: IconName }[] = [
  { id: 'display', label: 'Display', icon: 'display' },
  { id: 'accessibility', label: 'Accessibility', icon: 'access' },
  { id: 'controllers', label: 'Controllers', icon: 'controllers' },
  { id: 'network', label: 'Network', icon: 'network' },
  { id: 'about', label: 'About', icon: 'about' },
];

const LABELS = {
  margin: { off: 'Off', small: 'Small', medium: 'Medium', large: 'Large' },
  textSize: { normal: 'Normal', large: 'Large', xlarge: 'Extra Large' },
  reducedMotion: { system: 'Follow System', on: 'On', off: 'Off' },
  highContrast: { off: 'Off', on: 'On' },
  controlHints: { auto: 'Automatic', keyboard: 'Keyboard', gamepad: 'Gamepad' },
} as const;

/** Read-only facts the shell is handed (from configuration and the session); it never reads them itself. */
export interface SettingsFacts {
  readonly phonesConnected: number;
  readonly phoneAddress: string;
  readonly connection: string;
  readonly addressNote?: string | undefined;
  readonly version: string;
  readonly build: string;
}

export interface SettingsScreenProps {
  readonly settings: ShellSettings;
  readonly facts: SettingsFacts;
  readonly onChange: (next: ShellSettings) => void;
  readonly onBack: () => void;
  readonly initialCategory?: CategoryId;
}

function Category({
  id,
  label,
  icon,
  current,
  onFocus,
}: {
  readonly id: CategoryId;
  readonly label: string;
  readonly icon: IconName;
  readonly current: boolean;
  readonly onFocus: () => void;
}) {
  const item = useFocusItem<HTMLButtonElement>(`cat-${id}`);
  return (
    <button
      type="button"
      {...item}
      className="cat"
      aria-current={current || undefined}
      onFocus={onFocus}
      onClick={() => {
        // Select moves into the rows: the first row of this category.
        document.querySelector<HTMLElement>('[data-region="rows"] [data-focus-id]')?.focus();
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

const HELP: Readonly<Record<string, string>> = {
  margin: 'Pulls everything in from the edges, for TVs that crop the picture.',
  textSize: 'Makes every word on the console bigger. Everything stays on one screen.',
  reducedMotion: 'Stops sliding, bouncing and looping motion. Focus still shows where you are.',
  highContrast: 'Stronger outlines and brighter text on every screen.',
  controlHints: 'Which button pictures to show. Automatic follows what you used last.',
  phones: 'Phones that are in your room right now.',
  address: 'Players who cannot scan the code can open this address on their phone.',
  connection: 'Whether this console can reach the game.',
  version: 'The version of Foomerang on this screen.',
  build: 'Which kind of build you are running.',
};

/** Console-style settings: categories on the left, big rows on the right, values that change as you press. */
export function SettingsScreen({
  settings,
  facts,
  onChange,
  onBack,
  initialCategory = 'display',
}: SettingsScreenProps) {
  const [category, setCategory] = useState<CategoryId>(initialCategory);
  const [help, setHelp] = useState<string>('');
  const rows = useRef<HTMLDivElement>(null);
  const meta = CATEGORIES.find((c) => c.id === category) as (typeof CATEGORIES)[number];

  const choice = <K extends keyof ShellSettings>(key: K, label: string) => (
    <SettingsRow
      id={`row-${key}`}
      label={label}
      value={LABELS[key][settings[key] as never]}
      onFocus={() => setHelp(HELP[key] ?? '')}
      onStep={(delta) => onChange(stepSetting(settings, key, delta))}
    />
  );
  const info = (id: string, label: string, value: string) => (
    <SettingsRow
      id={`row-${id}`}
      label={label}
      value={value}
      kind="info"
      onFocus={() => setHelp((id === 'address' ? facts.addressNote : undefined) ?? HELP[id] ?? '')}
    />
  );

  return (
    <FocusScope
      id="settings"
      initialFocus="cat-display"
      onBack={() => {
        // From a row, Back returns to its category; from a category, it leaves Settings.
        const inRows = rows.current?.contains(document.activeElement) === true;
        if (inRows)
          document.querySelector<HTMLElement>(`[data-focus-id="cat-${category}"]`)?.focus();
        else onBack();
      }}
    >
      <div className="settings">
        <nav className="cats" aria-label="Settings categories">
          {CATEGORIES.map((c) => (
            <Category
              key={c.id}
              id={c.id}
              label={c.label}
              icon={c.icon}
              current={c.id === category}
              onFocus={() => {
                setCategory(c.id);
                setHelp('');
              }}
            />
          ))}
        </nav>
        <section
          className="panel"
          key={category}
          data-region="rows"
          ref={rows}
          aria-label={meta.label}
        >
          <h2 className="panel__title">
            <Icon name={meta.icon} />
            {meta.label}
          </h2>
          <SettingsList label={meta.label}>
            {category === 'display' && (
              <>
                {choice('margin', 'Screen Margin')}
                {choice('textSize', 'Text Size')}
              </>
            )}
            {category === 'accessibility' && (
              <>
                {choice('reducedMotion', 'Reduced Motion')}
                {choice('highContrast', 'High Contrast')}
              </>
            )}
            {category === 'controllers' && (
              <>
                {choice('controlHints', 'Button Pictures')}
                {info('phones', 'Phones Connected', String(facts.phonesConnected))}
              </>
            )}
            {category === 'network' && (
              <>
                {info('address', 'Phones Join At', facts.phoneAddress)}
                {info('connection', 'Game Connection', facts.connection)}
              </>
            )}
            {category === 'about' && (
              <>
                {info('version', 'Foomerang', facts.version)}
                {info('build', 'Build', facts.build)}
              </>
            )}
          </SettingsList>
          <p className="panel__help" aria-live="polite">
            {help}
          </p>
        </section>
      </div>
    </FocusScope>
  );
}
