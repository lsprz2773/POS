import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { storeSettingsSchema, type StoreSettings } from '@pos/shared';
import { ApiError, apiGet, apiPatch } from '../api/client';
import { es } from '../i18n/es';

const responseSchema = storeSettingsSchema;
type Errors = Record<string, string>;

function timeZones(current: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(current) ? zones : [current, ...zones];
}

export function StoreSettingsPage() {
  const [form, setForm] = useState<StoreSettings | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiGet('/api/store', responseSchema)
      .then((settings) => active && setForm(settings))
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (loadFailed) return <p role="alert">{es.common.unexpectedError}</p>;
  if (!form) return <p role="status">{es.common.loading}</p>;

  const update = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setForm({ ...form, [key]: value });
    setMessage(null);
  };

  const toggleDay = (day: number) =>
    update(
      'operatingDays',
      form.operatingDays.includes(day)
        ? form.operatingDays.filter((d) => d !== day)
        : [...form.operatingDays, day],
    );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !form) return;
    setMessage(null);

    // Validación inmediata en el cliente; el servidor valida de nuevo de forma independiente.
    const local = storeSettingsSchema.safeParse(form);
    if (!local.success) {
      setErrors(Object.fromEntries(local.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // La moneda es de solo lectura por ahora: no se envía.
      const { name, timezone, workdayStart, workdayEnd, operatingDays } = local.data;
      const editable = { name, timezone, workdayStart, workdayEnd, operatingDays };
      setForm(await apiPatch('/api/store', responseSchema, editable));
      setMessage({ kind: 'ok', text: es.store.saved });
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields) setErrors(caught.fields);
      setMessage({
        kind: 'error',
        text:
          caught instanceof ApiError && caught.status === 0
            ? es.common.networkError
            : caught instanceof ApiError && caught.status < 500
              ? caught.message
              : es.common.unexpectedError,
      });
    } finally {
      setSaving(false);
    }
  }

  const describedBy = (name: string) => (errors[name] ? `${name}-error` : undefined);

  return (
    <>
      <h1 className="text-2xl font-semibold">{es.store.title}</h1>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <Field id="name" label={es.store.name} error={errors.name}>
          <input
            id="name"
            className="field"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name')}
          />
        </Field>

        <Field id="currency" label={es.store.currency}>
          <input id="currency" className="field bg-gray-100" value={form.currency} readOnly />
        </Field>

        <Field id="timezone" label={es.store.timezone} error={errors.timezone}>
          <select
            id="timezone"
            className="field"
            value={form.timezone}
            onChange={(event) => update('timezone', event.target.value)}
            aria-describedby={describedBy('timezone')}
          >
            {timeZones(form.timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id="workdayStart" label={es.store.workdayStart} error={errors.workdayStart}>
            <input
              id="workdayStart"
              type="time"
              className="field"
              value={form.workdayStart}
              onChange={(event) => update('workdayStart', event.target.value)}
              aria-invalid={Boolean(errors.workdayStart)}
              aria-describedby={describedBy('workdayStart')}
            />
          </Field>
          <Field id="workdayEnd" label={es.store.workdayEnd} error={errors.workdayEnd}>
            <input
              id="workdayEnd"
              type="time"
              className="field"
              value={form.workdayEnd}
              onChange={(event) => update('workdayEnd', event.target.value)}
              aria-invalid={Boolean(errors.workdayEnd)}
              aria-describedby={describedBy('workdayEnd')}
            />
          </Field>
        </div>
        <p className="text-sm text-gray-700">{es.store.workdayHint}</p>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">{es.store.operatingDays}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <label key={day} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={form.operatingDays.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                {es.days[day]}
              </label>
            ))}
          </div>
          {errors.operatingDays && (
            <span id="operatingDays-error" role="alert" className="text-sm text-red-800">
              {errors.operatingDays}
            </span>
          )}
        </fieldset>

        {message && (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={message.kind === 'error' ? 'text-red-800' : 'text-green-900'}
          >
            {message.text}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? es.common.saving : es.common.save}
        </button>
      </form>
      <Link to="/" className="btn-secondary text-center">
        {es.store.back}
      </Link>
    </>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <span id={`${id}-error`} role="alert" className="text-sm text-red-800">
          {error}
        </span>
      )}
    </div>
  );
}
