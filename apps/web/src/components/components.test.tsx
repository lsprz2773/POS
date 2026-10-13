import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { Banner } from './Banner';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { Field } from './Field';
import { useState } from 'react';
import { Sheet } from './Sheet';
import { StatusBadge } from './StatusBadge';

describe('Button', () => {
  it('mientras procesa se deshabilita, dice "Procesando…" y no repite el clic', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Confirmar venta
      </Button>,
    );
    const button = screen.getByRole('button', { name: /procesando/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('no es de envío salvo que se pida', () => {
    render(<Button>Aceptar</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Field', () => {
  it('asocia etiqueta, error y ayuda al control', () => {
    render(<Field label="Correo" error="Escribe un correo válido." hint="Usa el de tu cuenta" />);
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Escribe un correo válido. Usa el de tu cuenta');
  });

  it('sin error no marca el campo como inválido', () => {
    render(<Field label="Correo" />);
    expect(screen.getByLabelText('Correo')).not.toHaveAttribute('aria-invalid');
  });
});

describe('StatusBadge', () => {
  it.each([
    ['paid', 'Pagada'],
    ['pending', 'Pendiente'],
    ['partial', 'Pendiente'],
    ['cancelled', 'Cancelada'],
  ] as const)('%s se lee como texto, no solo como color', (status, text) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('Banner', () => {
  it('los errores se anuncian como alerta y el resto como estado', () => {
    render(
      <>
        <Banner tone="bad">Falló</Banner>
        <Banner tone="info">Aviso</Banner>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    expect(screen.getByRole('status')).toHaveTextContent('Aviso');
  });
});

describe('ErrorState', () => {
  it('ofrece reintentar y muestra el código de referencia del servidor', async () => {
    const retry = vi.fn();
    const error = new ApiError(500, 'internal_error', 'Error interno', {}, 'req-42');
    render(<ErrorState error={error} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('req-42');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('sin conexión explica qué hacer', () => {
    render(<ErrorState error={new ApiError(0, 'network', 'x')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Revisa tu internet/);
  });
});

describe('Sheet', () => {
  it('es un diálogo con título accesible, se cierra con Esc y devuelve el foco', async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Registrar pago">
        <button>Dentro</button>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Registrar pago' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });

  it('al cerrarse devuelve el foco al botón que la abrió, aunque se abra por estado', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir filtro</button>
          {open ? (
            <Sheet open onOpenChange={(next) => setOpen(next)} title="Filtro">
              <button>Dentro</button>
            </Sheet>
          ) : null}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Abrir filtro' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Filtro' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('si es bloqueante no ofrece cerrar ni responde a Esc', async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Tu sesión expiró" dismissible={false}>
        <button>Iniciar sesión</button>
      </Sheet>,
    );
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
