/** Textos de la interfaz centralizados para facilitar cambios y traducciones futuras. */
export const es = {
  appName: 'POS',
  status: {
    checking: 'Verificando conexión…',
    ok: 'Conectado al servidor',
    unavailable: 'Sin conexión con el servidor',
  },
  common: {
    loading: 'Cargando…',
    retry: 'Reintentar',
    save: 'Guardar cambios',
    saving: 'Guardando…',
    networkError: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
    unexpectedError: 'Ocurrió un error inesperado. Intenta de nuevo.',
  },
  auth: {
    loginTitle: 'Iniciar sesión',
    email: 'Correo electrónico',
    password: 'Contraseña',
    submit: 'Entrar',
    submitting: 'Entrando…',
    logout: 'Cerrar sesión',
    sessionExpired: 'Tu sesión expiró. Inicia sesión de nuevo.',
    serverUnavailable: 'No se pudo verificar tu sesión.',
    blocked: {
      store_not_configured: {
        title: 'Cuenta sin tienda',
        message: 'Tu cuenta aún no tiene una tienda configurada. Contacta al administrador.',
      },
      tenant_disabled: {
        title: 'Tienda desactivada',
        message: 'Esta tienda está desactivada. Contacta al administrador.',
      },
    },
  },
  home: {
    welcome: 'Bienvenido',
    storeSettings: 'Configuración de la tienda',
  },
  store: {
    title: 'Configuración de la tienda',
    name: 'Nombre de la tienda',
    currency: 'Moneda',
    timezone: 'Zona horaria',
    workdayStart: 'Inicio de la jornada',
    workdayEnd: 'Fin de la jornada',
    operatingDays: 'Días de operación',
    workdayHint: 'El horario es informativo: no bloquea ventas fuera de la jornada.',
    saved: 'Cambios guardados.',
    back: 'Volver al inicio',
  },
  days: {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
    7: 'Domingo',
  } as Record<number, string>,
} as const;
