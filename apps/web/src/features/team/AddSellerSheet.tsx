import { createSellerSchema } from '@pos/shared';
import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { useCreateSeller } from './useTeam';

type Values = { displayName: string; email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

const FIELDS: (keyof Values)[] = ['displayName', 'email', 'password'];

/**
 * Alta de un vendedor (RF-134): nombre, correo y la contraseña que registra el propietario. Se valida con el
 * mismo esquema que el servidor, que de todos modos vuelve a validar. La contraseña nunca se muestra después.
 */
export function AddSellerSheet({
  online,
  onClose,
  onDone,
}: {
  online: boolean;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const create = useCreateSeller();
  const [values, setValues] = useState<Values>({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);

  const set = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function showErrors(found: Errors) {
    setErrors(found);
    setFailure(copy.team.notSaved);
    const first = FIELDS.find((field) => found[field]);
    if (first) document.getElementById(`seller-${first}`)?.focus();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending) return;
    setFailure(null);
    const checked = createSellerSchema.safeParse(values);
    if (!checked.success) {
      const found: Errors = {};
      for (const issue of checked.error.issues) {
        const field = issue.path[0] as keyof Values | undefined;
        if (field && !found[field]) found[field] = issue.message;
      }
      return showErrors(found);
    }
    create.mutate(checked.data, {
      onSuccess: (member) => onDone(member.displayName ?? member.email),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
          showErrors(error.fields as Errors);
        } else setFailure(messageOf(error));
      },
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => (!open && !create.isPending ? onClose() : undefined)}
      title={copy.team.sheetTitle}
      description={copy.team.sheetText}
      closeLabel={copy.team.close}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {failure ? <Banner tone="bad">{failure}</Banner> : null}
        <Field
          id="seller-displayName"
          label={copy.team.name}
          autoComplete="off"
          maxLength={80}
          value={values.displayName}
          error={errors.displayName}
          onChange={(event) => set('displayName', event.target.value)}
        />
        <Field
          id="seller-email"
          label={copy.team.email}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          error={errors.email}
          onChange={(event) => set('email', event.target.value)}
        />
        <Field
          id="seller-password"
          label={copy.team.password}
          type="password"
          autoComplete="new-password"
          hint={copy.team.passwordHint}
          value={values.password}
          error={errors.password}
          onChange={(event) => set('password', event.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          large
          block
          loading={create.isPending}
          disabled={!online}
        >
          {copy.team.create}
        </Button>
      </form>
    </Sheet>
  );
}
