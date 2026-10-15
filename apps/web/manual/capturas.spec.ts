// Genera las capturas del manual de usuario (docs/manual-usuario.md). Un solo recorrido: se arma la tienda de
// ejemplo (por API y por la interfaz) y cada pantalla se captura en el estado que describe el paso del manual.
// Nombres: `comun-*` (parte 1), `propietario-*` (parte 2) y `vendedor-*` (parte 3).
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { orphan, owner, signIn } from '../e2e/helpers';
import {
  CATALOG,
  createProduct,
  createSeller,
  mobileSession,
  offerToday,
  randomSecret,
  sell,
} from './seed';
import { shot } from './shot';

const sellerSecret = randomSecret();
const toast = (page: Page, text: string | RegExp) =>
  expect(page.getByText(text).last()).toBeVisible();

/** Agrega `pieces` piezas del producto al carrito de Nueva venta. */
async function addToCart(page: Page, name: string, pieces: number) {
  await page.getByRole('button', { name: `Agregar ${name}`, exact: true }).click();
  for (let i = 1; i < pieces; i++) {
    await page.getByRole('button', { name: `Agregar una pieza de ${name}` }).click();
  }
}

test('capturas del manual', async ({ page, browser }, info) => {
  // ─── Parte 1 · Para todos ───────────────────────────────────────────────────────────────────────────
  // Iniciar sesión
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(owner.email);
  await page.getByLabel('Contraseña').fill(randomUUID().slice(0, 12));
  await shot(page, 'comun-inicio-sesion', {
    highlight: page.getByRole('button', { name: 'Iniciar sesión' }),
  });
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
  await shot(page, 'comun-inicio-sesion-error', { highlight: page.getByRole('alert') });

  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();

  // Catálogo base del ejemplo (el propietario lo arma desde Catálogo; aquí se crea por API).
  const products = [];
  for (const item of CATALOG) products.push(await createProduct(page, item));
  const [japones, salado, garapinado, palanqueta, pepitas] = products as [
    (typeof products)[number],
    (typeof products)[number],
    (typeof products)[number],
    (typeof products)[number],
    (typeof products)[number],
  ];

  // Hoy sin preparar el día
  await page.goto('/');
  await expect(page.getByText('Hoy todavía no preparas el día')).toBeVisible();
  await shot(page, 'comun-hoy-sin-preparar', {
    highlight: page.getByRole('link', { name: 'Preparar día' }),
  });

  // Preparar el día
  await page.goto('/dia');
  await expect(page.getByRole('heading', { name: 'Preparar día' })).toBeVisible();
  await shot(page, 'comun-dia-vacio', {
    highlight: page.getByRole('button', { name: 'Agregar producto' }).first(),
  });
  await page.getByRole('button', { name: 'Agregar producto' }).first().click();
  const addSheet = page.getByRole('dialog', { name: 'Agregar producto' });
  await expect(addSheet).toBeVisible();
  await shot(page, 'comun-dia-agregar-buscar');
  await addSheet.getByRole('button', { name: new RegExp(japones.name) }).click();
  await addSheet.getByLabel('Cantidad inicial', { exact: true }).fill('40');
  await shot(page, 'comun-dia-agregar-cantidad', {
    highlight: addSheet.getByRole('button', { name: 'Agregar al día' }),
  });
  await addSheet.getByRole('button', { name: 'Agregar al día' }).click();
  await toast(page, 'Producto agregado al día.');
  for (const [product, item] of [
    [salado, CATALOG[1]!],
    [garapinado, CATALOG[2]!],
    [palanqueta, CATALOG[3]!],
    [pepitas, CATALOG[4]!],
  ] as const) {
    await offerToday(page, product.id, item.quantity);
  }
  const extra = await createProduct(page, {
    name: 'Habas con sal',
    price: '18',
    cost: '10',
    quantity: '20',
  });
  await offerToday(page, extra.id, '20');
  await page.goto('/dia');
  await expect(page.getByRole('listitem').filter({ hasText: japones.name })).toBeVisible();
  await shot(page, 'comun-dia-preparado', { fullPage: true });

  const japonesRow = page.getByRole('listitem').filter({ hasText: japones.name });
  await japonesRow.getByRole('button', { name: /Aumentar/ }).click();
  const adjust = page.getByRole('dialog', { name: 'Aumentar cantidad' });
  await adjust.getByLabel('Nueva cantidad', { exact: true }).fill('50');
  await adjust.getByLabel('Motivo *').fill('Se preparó más producto');
  await shot(page, 'comun-dia-aumentar', {
    highlight: adjust.getByRole('button', { name: /Guardar aumento/ }),
  });
  await adjust.getByRole('button', { name: /Guardar aumento/ }).click();
  await toast(page, 'Cantidad aumentada.');

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Habas con sal' })
    .getByRole('button', { name: /Quitar/ })
    .click();
  const remove = page.getByRole('alertdialog', { name: /¿Quitar/ });
  await expect(remove).toBeVisible();
  await shot(page, 'comun-dia-quitar', {
    highlight: remove.getByRole('button', { name: 'Quitar del día' }),
  });
  await remove.getByRole('button', { name: 'Volver' }).click();

  await page.goto('/dia/anteriores');
  await expect(page.getByRole('heading', { name: 'Aún no hay jornadas anteriores' })).toBeVisible();
  await shot(page, 'comun-jornadas-anteriores');

  // Vender
  await page.goto('/vender');
  await expect(page.getByText('Paso 1 de 2 · Productos')).toBeVisible();
  await shot(page, 'comun-vender-productos', {
    highlight: page.getByRole('searchbox', { name: 'Buscar producto' }),
  });
  await addToCart(page, japones.name, 2);
  await expect(page.getByText('2 piezas · 1 producto')).toBeVisible();
  await shot(page, 'comun-vender-carrito', {
    highlight: page.getByRole('button', { name: 'Continuar' }),
  });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Paso 2 de 2 · Cobro')).toBeVisible();
  await shot(page, 'comun-vender-cobro', {
    highlight: page.getByRole('button', { name: /Confirmar venta/ }),
  });
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  await shot(page, 'comun-venta-registrada', {
    highlight: page.getByRole('link', { name: 'Ver detalle' }),
  });
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toBeVisible();
  await shot(page, 'comun-venta-detalle', { fullPage: true });

  // Cobro mixto
  await page.goto('/vender');
  await addToCart(page, pepitas.name, 2); // $44.00
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Cambiar método o importes' }).click();
  const payment = page.getByRole('dialog', { name: 'Cobro' });
  await payment.getByRole('button', { name: 'Mixto' }).click();
  await payment.getByLabel('Efectivo').fill('30');
  await payment.getByLabel('Transferencia').fill('14');
  await shot(page, 'comun-vender-mixto', {
    highlight: payment.getByRole('button', { name: /Usar este cobro/ }),
  });
  await payment.getByRole('button', { name: /Usar este cobro/ }).click();
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toBeVisible();
  const mixedSaleUrl = page.url();

  // Venta que se deja pendiente
  await page.goto('/vender');
  await addToCart(page, garapinado.name, 2); // $60.00
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Cliente o referencia (opcional)').fill('Doña Lupe');
  await page.getByRole('button', { name: 'Dejar pendiente' }).click();
  await expect(page.getByText(/La venta quedará pendiente por el total/)).toBeVisible();
  await shot(page, 'comun-vender-pendiente', {
    highlight: page.getByRole('button', { name: 'Dejar pendiente' }),
  });
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();

  // Más ventas por API: parcial y una para cancelar.
  await sell(page, [{ productId: salado.id, quantity: '3' }], {
    customerReference: 'Don Ramón',
    payments: [{ method: 'cash', amount: '20.00' }],
  });
  const toCancel = await sell(page, [{ productId: palanqueta.id, quantity: '2' }], {
    payments: [{ method: 'cash', amount: '30.00' }],
  });

  // Pendientes y cobro posterior
  await page.goto('/pendientes');
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Doña Lupe' })).toBeVisible();
  await shot(page, 'comun-pendientes');
  await page.getByRole('button', { name: 'Todas las fechas' }).click();
  await expect(page.getByRole('dialog', { name: 'Filtrar por fecha de venta' })).toBeVisible();
  await shot(page, 'comun-pendientes-filtro');
  await page.keyboard.press('Escape');

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Doña Lupe' })
    .getByRole('link', { name: /Registrar pago/ })
    .click();
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
  await shot(page, 'comun-pago-detalle-pendiente', {
    highlight: page.getByRole('button', { name: 'Registrar pago' }),
  });
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(pay.getByLabel('Efectivo')).toHaveValue('60.00');
  await shot(page, 'comun-pago-registrar', {
    highlight: pay.getByRole('button', { name: /Registrar pago ·/ }),
  });
  await pay.getByRole('button', { name: /Registrar pago ·/ }).click();
  await toast(page, 'Pago registrado.');
  await expect(page.getByText('Pagada').first()).toBeVisible();
  await shot(page, 'comun-pago-registrado', { fullPage: true });

  // Anular un pago
  await page.goto(mixedSaleUrl);
  await page.getByRole('button', { name: /^Anular Transferencia/ }).click();
  const voidDialog = page.getByRole('alertdialog', { name: '¿Anular este pago?' });
  await voidDialog.getByLabel('Motivo *').fill('Método equivocado');
  await shot(page, 'comun-pago-anular', {
    highlight: voidDialog.getByRole('button', { name: 'Anular pago' }),
  });
  await voidDialog.getByRole('button', { name: 'Anular pago' }).click();
  await toast(page, 'Pago anulado.');
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toContainText('Anulado');
  await shot(page, 'comun-pago-anulado', { fullPage: true });

  // Cancelar una venta
  await page.goto(`/ventas/${toCancel.id}`);
  await page.getByRole('button', { name: 'Cancelar venta' }).click();
  const cancel = page.getByRole('alertdialog', { name: /¿Cancelar la venta V-/ });
  await cancel.getByLabel('Motivo de la cancelación *').fill('Se capturó por error');
  await shot(page, 'comun-cancelar-venta', {
    highlight: cancel.getByRole('button', { name: 'Cancelar venta' }),
  });
  await cancel.getByRole('button', { name: 'Cancelar venta' }).click();
  await toast(page, 'Venta cancelada.');
  await expect(page.getByText('Por devolver fuera del sistema')).toBeVisible();
  await shot(page, 'comun-venta-cancelada', { fullPage: true });

  // Hoy con datos, inventario y día con ventas
  await page.goto('/');
  await expect(page.getByText('Falta por cobrar').first()).toBeVisible();
  await shot(page, 'comun-hoy', { fullPage: true });
  await page.goto('/dia/inventario');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  await shot(page, 'comun-inventario', { fullPage: true });
  await page.goto('/dia');
  await page
    .getByRole('listitem')
    .filter({ hasText: japones.name })
    .getByRole('button', { name: 'Con ventas: no se puede quitar.' })
    .click();
  await expect(page.getByRole('alertdialog', { name: 'No se puede quitar' })).toBeVisible();
  await shot(page, 'comun-dia-no-quitar');
  await page.getByRole('button', { name: 'Entendido' }).click();

  // Historial
  await page.goto('/historial');
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Doña Lupe/ })).toBeVisible();
  await shot(page, 'comun-historial', { fullPage: true });
  await page.getByRole('button', { name: 'Pendientes' }).click();
  await shot(page, 'comun-historial-pendientes', {
    highlight: page.getByRole('button', { name: 'Pendientes' }),
  });
  await page.getByRole('button', { name: 'Todas las fechas' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'comun-historial-fechas');
  await page.keyboard.press('Escape');

  // Reportes
  await page.goto('/reportes');
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Utilidad bruta' })).toBeVisible();
  await shot(page, 'comun-reportes-dia', { fullPage: true });
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Utilidad bruta' })).toBeVisible();
  await shot(page, 'comun-reportes-periodo', {
    highlight: page.getByRole('button', { name: 'Semana', exact: true }),
  });
  await page.getByRole('button', { name: 'Rango', exact: true }).click();
  await shot(page, 'comun-reportes-rango', {
    highlight: page.getByRole('button', { name: 'Aplicar rango' }),
  });

  // Más y Perfil
  await page.goto('/mas');
  await expect(page.getByRole('heading', { name: 'Más' })).toBeVisible();
  await shot(page, 'comun-mas');
  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByText(owner.email)).toBeVisible();
  await shot(page, 'comun-perfil', {
    highlight: page.getByRole('button', { name: 'Cerrar sesión' }),
  });

  // Si algo falla
  await page.goto('/mas');
  await expect(page.getByRole('heading', { name: 'Más' })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText(/Sin conexión/)).toBeVisible();
  await shot(page, 'comun-sin-conexion', {
    highlight: page.getByRole('status').filter({ hasText: 'Sin conexión' }),
  });
  await page.context().setOffline(false);

  await page.route('**/api/reports**', (route) => route.abort());
  await page.goto('/reportes');
  await expect(page.getByText('No pudimos cargar la información')).toBeVisible({
    timeout: 60_000,
  });
  await shot(page, 'comun-error-carga', {
    highlight: page.getByRole('button', { name: 'Reintentar' }),
  });
  await page.unroute('**/api/reports**');

  await page.goto('/esta-pagina-no-existe');
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
  await shot(page, 'comun-no-encontrada');

  const lost = await mobileSession(browser, info, orphan);
  await expect(
    lost.getByRole('heading', { name: 'Tu cuenta aún no tiene una tienda' }),
  ).toBeVisible();
  await shot(lost, 'comun-cuenta-sin-tienda');
  await lost.context().close();

  // Sesión expirada: se vacían las cookies justo antes de confirmar una venta.
  await page.goto('/vender');
  await addToCart(page, palanqueta.name, 1);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.context().clearCookies();
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(page.getByRole('dialog', { name: 'Tu sesión expiró' })).toBeVisible();
  await shot(page, 'comun-sesion-expirada', {
    highlight: page.getByRole('dialog', { name: 'Tu sesión expiró' }).getByRole('button'),
  });
  await page.getByRole('dialog', { name: 'Tu sesión expiró' }).getByRole('button').click();
  await signIn(page, owner);
  await expect(page).toHaveURL(/\/vender$/);
  await page.evaluate(() => sessionStorage.clear());

  // ─── Parte 2 · Propietario ──────────────────────────────────────────────────────────────────────────
  // Catálogo
  await page.goto('/mas');
  await page.getByRole('link', { name: /Catálogo/ }).click();
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: japones.name })).toBeVisible();
  await shot(page, 'propietario-catalogo', { fullPage: true });

  await page.goto('/catalogo/nuevo');
  await page.getByLabel('Nombre *').fill('Mix botanero');
  await page.getByLabel('Precio de venta *').fill('35');
  await page.getByLabel('Costo *').fill('20');
  await page.getByLabel('Código interno').fill('MIX-01');
  await shot(page, 'propietario-producto-nuevo', {
    fullPage: true,
    highlight: page.getByRole('button', { name: 'Guardar producto' }),
  });
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await toast(page, 'Producto guardado.');
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
  const mix = (await (await page.request.get('/api/products')).json()) as {
    items: { id: string; name: string }[];
  };
  const mixId = mix.items.find((item) => item.name === 'Mix botanero')!.id;
  await offerToday(page, mixId, '25');
  await shot(page, 'propietario-catalogo-guardado', { fullPage: true });

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Habas con sal' })
    .getByRole('link')
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Editar producto' })).toBeVisible();
  await shot(page, 'propietario-producto-editar', { fullPage: true });
  await page.goBack();
  await page.getByRole('switch', { name: 'Producto activo: Habas con sal' }).click();
  await page.getByRole('button', { name: 'Inactivos' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Habas con sal' })).toBeVisible();
  await shot(page, 'propietario-catalogo-inactivos', {
    highlight: page.getByRole('button', { name: 'Inactivos' }),
  });

  // Mi tienda
  await page.goto('/configuracion');
  await expect(page.getByRole('heading', { name: 'Mi tienda' })).toBeVisible();
  await shot(page, 'propietario-mi-tienda', { fullPage: true });

  // Equipo
  await page.goto('/equipo');
  await expect(page.getByRole('heading', { name: 'Equipo' })).toBeVisible();
  await shot(page, 'propietario-equipo-vacio', {
    highlight: page.getByRole('button', { name: /Agregar vendedor/ }).first(),
  });
  await page
    .getByRole('button', { name: /Agregar vendedor/ })
    .first()
    .click();
  const addSeller = page.getByRole('dialog', { name: 'Agregar vendedor' });
  await addSeller.getByLabel('Nombre').fill('Ana (ejemplo)');
  await addSeller.getByLabel('Correo').fill('ana@ejemplo.test');
  await addSeller.getByLabel('Contraseña').fill(sellerSecret);
  await shot(page, 'propietario-equipo-agregar', {
    highlight: addSeller.getByRole('button', { name: 'Crear vendedor' }),
  });
  await addSeller.getByRole('button', { name: 'Crear vendedor' }).click();
  await toast(page, 'Ana (ejemplo) ya puede iniciar sesión.');

  await createSeller(page, 'Beto (ejemplo)', 'beto@ejemplo.test', sellerSecret);
  await page.goto('/equipo');
  await expect(page.getByRole('listitem').filter({ hasText: 'Beto (ejemplo)' })).toBeVisible();
  await shot(page, 'propietario-equipo-lista', { fullPage: true });

  // ─── Parte 3 · Vendedor (Ana) ───────────────────────────────────────────────────────────────────────
  const ana = await mobileSession(browser, info, {
    email: 'ana@ejemplo.test',
    password: sellerSecret,
  });
  await expect(ana.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await expect(ana.getByText('Hoy todavía no preparas el día')).toBeVisible();
  await shot(ana, 'vendedor-hoy-sin-preparar', {
    highlight: ana.getByRole('link', { name: 'Preparar día' }),
  });
  await ana.goto('/mas');
  await expect(ana.getByRole('link', { name: 'Mis ventas' })).toBeVisible();
  await shot(ana, 'vendedor-mas');

  await ana.goto('/dia');
  await ana.getByRole('button', { name: 'Agregar producto' }).first().click();
  const anaSheet = ana.getByRole('dialog', { name: 'Agregar producto' });
  await expect(anaSheet.getByRole('button', { name: /Mix botanero/ })).toBeVisible();
  await shot(ana, 'vendedor-dia-agregar');
  await anaSheet.getByRole('button', { name: /Mix botanero/ }).click();
  await anaSheet.getByLabel('Cantidad inicial', { exact: true }).fill('12');
  await anaSheet.getByRole('button', { name: 'Agregar al día' }).click();
  await toast(ana, 'Producto agregado al día.');
  await offerToday(ana, japones.id, '15');
  await offerToday(ana, salado.id, '15');
  await ana.goto('/dia');
  await expect(ana.getByRole('listitem').filter({ hasText: 'Mix botanero' })).toBeVisible();
  await shot(ana, 'vendedor-dia-preparado', { fullPage: true });

  await sell(ana, [{ productId: mixId, quantity: '3' }], {
    customerReference: 'Tienda La Esquina',
  });
  await sell(ana, [{ productId: japones.id, quantity: '4' }], {
    payments: [{ method: 'transfer', amount: '100.00' }],
  });
  await sell(ana, [{ productId: salado.id, quantity: '2' }], {
    customerReference: 'Mtra. Rosa',
    payments: [{ method: 'cash', amount: '15.00' }],
  });
  await ana.goto('/historial');
  await expect(ana.getByRole('heading', { name: 'Mis ventas' })).toBeVisible();
  await expect(ana.getByRole('link', { name: /Mtra. Rosa/ })).toBeVisible();
  await shot(ana, 'vendedor-mis-ventas', { fullPage: true });
  await ana.goto('/reportes');
  await expect(ana.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  await expect(ana.getByRole('region', { name: 'Utilidad bruta' })).toBeVisible();
  await shot(ana, 'vendedor-mis-reportes', { fullPage: true });
  await ana.goto('/catalogo');
  await expect(ana.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await expect(ana.getByText('No tienes acceso a esa pantalla.').last()).toBeVisible();
  await shot(ana, 'vendedor-sin-acceso');
  await ana.context().close();

  // ─── Parte 2 (continuación) · Lo que el propietario ve del equipo ───────────────────────────────────
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Por vendedor' })).toContainText('Ana (ejemplo)');
  await shot(page, 'propietario-hoy-por-vendedor', {
    fullPage: true,
    highlight: page.getByRole('region', { name: 'Por vendedor' }),
  });
  await page.goto('/mas');
  await expect(page.getByRole('link', { name: 'Reportes por vendedor' })).toBeVisible();
  await shot(page, 'propietario-mas', {
    highlight: page.getByRole('link', { name: 'Reportes por vendedor' }),
  });
  await page.getByRole('link', { name: 'Reportes por vendedor' }).click();
  await expect(page.getByRole('heading', { name: 'Reportes por vendedor' })).toBeVisible();
  await page.getByRole('button', { name: 'Día' }).click();
  await expect(page.getByRole('link', { name: 'Ver el detalle de Ana (ejemplo)' })).toBeVisible();
  await shot(page, 'propietario-reportes-equipo', { fullPage: true });
  await page.getByRole('link', { name: 'Ver el detalle de Ana (ejemplo)' }).click();
  await expect(page.getByRole('region', { name: 'Lo que se le debe' })).toBeVisible();
  await shot(page, 'propietario-reporte-vendedor', { fullPage: true });

  await page.goto('/pendientes');
  await expect(page.getByRole('region', { name: 'Por vendedor' })).toBeVisible();
  await shot(page, 'propietario-pendientes-por-vendedor', {
    fullPage: true,
    highlight: page.getByRole('region', { name: 'Por vendedor' }),
  });
  await page.goto('/historial');
  await page.getByRole('button', { name: 'Todas las fechas' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox')).toBeVisible();
  await shot(page, 'propietario-historial-vendedor', {
    highlight: page.getByRole('dialog').getByRole('combobox'),
  });
  await page.keyboard.press('Escape');

  await page.goto('/equipo');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Ana (ejemplo)' })
    .getByRole('link', { name: /Ver su día/ })
    .click();
  await expect(page.getByText('Día de Ana (ejemplo)')).toBeVisible();
  await shot(page, 'propietario-ver-dia-vendedor', { fullPage: true });

  // Baja y reactivación (Beto): el vendedor ve su cuenta dada de baja.
  const beto = await mobileSession(browser, info, {
    email: 'beto@ejemplo.test',
    password: sellerSecret,
  });
  await expect(beto.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await page.goto('/equipo');
  const betoRow = page.getByRole('listitem').filter({ hasText: 'Beto (ejemplo)' });
  await betoRow.getByRole('button', { name: 'Dar de baja' }).click();
  const baja = page.getByRole('alertdialog', { name: '¿Dar de baja a Beto (ejemplo)?' });
  await shot(page, 'propietario-equipo-baja', {
    highlight: baja.getByRole('button', { name: 'Dar de baja' }),
  });
  await baja.getByRole('button', { name: 'Dar de baja' }).click();
  await toast(page, 'Beto (ejemplo) ya no puede entrar.');
  await expect(betoRow).toContainText('Dado de baja');
  await shot(page, 'propietario-equipo-baja-hecha', {
    highlight: betoRow.getByRole('button', { name: 'Reactivar' }),
  });
  await beto.goto('/historial');
  await expect(beto.getByRole('heading', { name: 'Tu cuenta fue dada de baja' })).toBeVisible();
  await shot(beto, 'vendedor-cuenta-baja');
  await beto.context().close();
  await betoRow.getByRole('button', { name: 'Reactivar' }).click();
  await expect(betoRow).toContainText('Activo');
});
