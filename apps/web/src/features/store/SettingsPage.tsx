import type { StoreSettings } from '@pos/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Field, SelectField } from '../../components/Field';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { useUnsavedGuard } from '../../lib/useUnsavedGuard';
import {
  MEXICO_ZONES,
  otherZones,
  settingsChanges,
  validateSettings,
  type SettingsErrors,
} from './settingsForm';
import { useStore, useUpdateStore } from './useStore';

const DAYS = [
  { n: 1, short: 'L', name: 'lunes' },
  { n: 2, short: 'M', name: 'martes' },
  { n: 3, short: 'M', name: 'miércoles' },
  { n: 4, short: 'J', name: 'jueves' },
  { n: 5, short: 'V', name: 'viernes' },
  { n: 6, short: 'S', name: 'sábado' },
  { n: 7, short: 'D', name: 'domingo' },
] as const;

export function SettingsPage() {
  const query = useStore();
  const header = (
    <PageHeader title={copy.settings.title} back={{ to: '/mas', label: copy.settings.back }} />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <LoadingRegion label={copy.states.loading}>
          <div className="glass2 card flex flex-col gap-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-12 w-full" />
            ))}
          </div>
        </LoadingRegion>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  return (
    <>
      {header}
      <SettingsForm settings={query.data} />
    </>
  );
}

function SettingsForm({ settings }: { settings: StoreSettings }) {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const update = useUpdateStore();
  const [values, setValues] = useState<StoreSettings>(settings);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const zones = useMemo(() => otherZones(settings.timezone), [settings.timezone]);

  const dirty = JSON.stringify(values) !== JSON.stringify(settings);
  const guard = useUnsavedGuard(dirty && !update.isPending);

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function showErrors(found: SettingsErrors) {
    setErrors(found);
    setFailure(copy.settings.notSaved);
    const first = Object.keys(found)[0];
    if (first) document.getElementById(`store-${first}`)?.focus();
  }

  function toggleDay(day: number) {
    const next = values.operatingDays.includes(day)
      ? values.operatingDays.filter((d) => d !== day)
      : [...values.operatingDays, day].sort((a, b) => a - b);
    set('operatingDays', next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (update.isPending) return;
    setFailure(null);
    const checked = validateSettings(values);
    if (!checked.ok) return showErrors(checked.errors);
    const changes = settingsChanges(settings, checked.data);
    if (Object.keys(changes).length === 0) {
      toast.show('info', copy.settings.noChanges);
      return;
    }
    update.mutate(changes, {
      onSuccess: () => {
        guard.allowLeave();
        toast.show('ok', copy.settings.saved);
        void navigate('/mas');
      },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
          showErrors(error.fields as SettingsErrors);
        } else {
          setFailure(messageOf(error));
        }
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="glass2 card flex flex-col gap-4">
      {failure ? <Banner tone="bad">{failure}</Banner> : null}

      <Field
        id="store-name"
        label={`${copy.settings.name} *`}
        value={values.name}
        error={errors.name}
        maxLength={100}
        autoComplete="organization"
        onChange={(e) => set('name', e.target.value)}
      />

      <div className="flex flex-col gap-4">
        <SelectField
          label={copy.settings.currency}
          value={values.currency}
          onChange={(e) => set('currency', e.target.value as StoreSettings['currency'])}
        >
          <option value="MXN">{copy.settings.currencyMxn}</option>
        </SelectField>
        <SelectField
          id="store-timezone"
          label={copy.settings.timezone}
          value={values.timezone}
          error={errors.timezone}
          onChange={(e) => set('timezone', e.target.value)}
        >
          <optgroup label={copy.settings.timezoneMexico}>
            {MEXICO_ZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </optgroup>
          <optgroup label={copy.settings.timezoneOther}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </optgroup>
        </SelectField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="store-workdayStart"
          type="time"
          label={copy.settings.start}
          value={values.workdayStart}
          error={errors.workdayStart}
          onChange={(e) => set('workdayStart', e.target.value)}
        />
        <Field
          id="store-workdayEnd"
          type="time"
          label={copy.settings.end}
          value={values.workdayEnd}
          error={errors.workdayEnd}
          onChange={(e) => set('workdayEnd', e.target.value)}
        />
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="lbl">{copy.settings.days}</legend>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(({ n, short, name }) => (
            <button
              key={n}
              type="button"
              className="pill"
              style={{ padding: 0, minWidth: 0 }}
              aria-pressed={values.operatingDays.includes(n)}
              aria-label={name}
              onClick={() => toggleDay(n)}
            >
              {short}
            </button>
          ))}
        </div>
        {errors.operatingDays ? (
          <p id="store-operatingDays" tabIndex={-1} role="alert" className="errt">
            {errors.operatingDays}
          </p>
        ) : (
          <p className="hint">{copy.settings.daysHint}</p>
        )}
      </fieldset>

      <Banner tone="info">{copy.settings.hoursInfo}</Banner>

      <Button
        type="submit"
        variant="primary"
        large
        block
        loading={update.isPending}
        disabled={!online}
      >
        {copy.settings.save}
      </Button>
      {guard.dialog}
    </form>
  );
}
