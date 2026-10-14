import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient, routes } from '../App';
import { ToastProvider } from '../components/Toast';

export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Handler = (request: { method: string; body: unknown }) => FakeResponse | Promise<FakeResponse>;

/** Sustituye `fetch` por rutas simuladas; una ruta sin simular hace fallar la prueba. */
export function stubApi(routes: Record<string, Handler | FakeResponse>) {
  const calls: { key: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace(/^\/api/, '');
    // Una ruta sin consulta (`GET /products`) atiende cualquier consulta (`?q=…&status=…`).
    const key = `${method} ${url.split('?')[0]}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, url, body });
    const route = routes[`${method} ${url}`] ?? routes[key];
    if (!route) throw new Error(`Ruta sin simular: ${method} ${url}`);
    const result = typeof route === 'function' ? await route({ method, body }) : route;
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json', ...result.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const ME = {
  user: { id: 'u1', email: 'ana@tienda.test' },
  tenant: { id: 't1', name: 'Tamales Ana' },
  role: 'owner',
};

export const apiError = (status: number, code: string, error: string, requestId = 'req-123') => ({
  status,
  body: { code, error },
  headers: { 'x-request-id': requestId },
});

export function renderApp(path = '/') {
  return render(
    <QueryClientProvider client={createQueryClient(false)}>
      <ToastProvider>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

let counter = 0;

/** Producto de prueba con los campos que devuelve el API. */
export function makeProduct(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    name: 'Tamal de rajas',
    description: null,
    category: null,
    code: 'TAM-01',
    unit: 'pieza',
    allowsFractions: false,
    price: '25.00',
    cost: '14.00',
    notes: null,
    active: true,
    version: 1,
    createdAt: '2026-10-12T15:00:00.000Z',
    updatedAt: '2026-10-12T15:00:00.000Z',
    ...overrides,
  };
}

export const productList = (items: unknown[], total = items.length, offset = 0) => ({
  body: { items, total, limit: 50, offset },
});

export const STORE = {
  name: 'Tamales Ana',
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  workdayStart: '08:00',
  workdayEnd: '16:00',
  operatingDays: [1, 2, 3, 4, 5],
};

let offerCounter = 0;

/** Producto del día con las cantidades que devuelve el API. */
export function makeOffer(overrides: Record<string, unknown> = {}) {
  offerCounter += 1;
  return {
    id: `10000000-0000-4000-8000-${String(offerCounter).padStart(12, '0')}`,
    productId: `20000000-0000-4000-8000-${String(offerCounter).padStart(12, '0')}`,
    productName: 'Tamal de rajas',
    productCode: 'TAM-01',
    productActive: true,
    unit: 'pieza',
    allowsFractions: false,
    price: '25.00',
    initialQuantity: '40',
    adjustedQuantity: '0',
    soldQuantity: '18',
    availableQuantity: '22',
    adjustments: [],
    ...overrides,
  };
}

export function makeWorkday(offers: unknown[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    date: '2026-10-15',
    startTime: '08:00',
    endTime: '16:00',
    isToday: true,
    editable: true,
    isOperatingDay: true,
    offers,
    ...overrides,
  };
}

export const notPrepared = () => apiError(404, 'not_found', 'Ese día todavía no está preparado.');

let saleCounter = 0;

/** Venta con la forma que devuelve el API (vigente, pendiente, sin pagos). */
export function makeSale(overrides: Record<string, unknown> = {}) {
  saleCounter += 1;
  return {
    id: `50000000-0000-4000-8000-${String(saleCounter).padStart(12, '0')}`,
    folio: `V-${String(40 + saleCounter).padStart(4, '0')}`,
    folioNumber: 40 + saleCounter,
    date: '2026-10-15',
    createdAt: '2026-10-15T15:48:00.000Z',
    status: 'active',
    customerReference: null,
    note: null,
    total: '135.00',
    outsideWorkdayHours: false,
    paid: '0.00',
    balance: '135.00',
    paymentStatus: 'pending',
    settledAt: null,
    createdBy: { id: 'u1', name: 'ana@tienda.test' },
    cancellation: null,
    payments: [] as ReturnType<typeof makePayment>[],
    items: [
      {
        id: '60000000-0000-4000-8000-000000000001',
        productId: '20000000-0000-4000-8000-000000000001',
        productName: 'Tamal de rajas',
        quantity: '3',
        unitPrice: '25.00',
        subtotal: '75.00',
      },
      {
        id: '60000000-0000-4000-8000-000000000002',
        productId: '20000000-0000-4000-8000-000000000002',
        productName: 'Jugo de naranja',
        quantity: '2',
        unitPrice: '18.00',
        subtotal: '36.00',
      },
      {
        id: '60000000-0000-4000-8000-000000000003',
        productId: '20000000-0000-4000-8000-000000000003',
        productName: 'Gelatina',
        quantity: '2',
        unitPrice: '12.00',
        subtotal: '24.00',
      },
    ],
    ...overrides,
  };
}

export function makePayment(overrides: Record<string, unknown> = {}) {
  saleCounter += 1;
  return {
    id: `70000000-0000-4000-8000-${String(saleCounter).padStart(12, '0')}`,
    operationId: '80000000-0000-4000-8000-000000000001',
    method: 'cash',
    amount: '40.00',
    status: 'valid',
    createdAt: '2026-10-15T15:50:00.000Z',
    voidedAt: null,
    voidReason: null,
    ...overrides,
  };
}

export const pendingItem = (sale: ReturnType<typeof makeSale>) => ({
  id: sale.id,
  folio: sale.folio,
  folioNumber: sale.folioNumber,
  date: sale.date,
  createdAt: sale.createdAt,
  customerReference: sale.customerReference,
  total: sale.total,
  paid: sale.paid,
  balance: sale.balance,
  paymentStatus: sale.paymentStatus,
  createdBy: sale.createdBy,
});

export function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-10-15',
    salesTotal: '1285.00',
    salesCount: 18,
    collected: '985.00',
    collectedByMethod: { cash: '640.00', transfer: '345.00' },
    pendingCount: 3,
    pendingTotal: '300.00',
    estimatedGrossProfit: '512.00',
    isGrossLoss: false,
    dayPrepared: true,
    ...overrides,
  };
}

export function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-10-12',
    to: '2026-10-18',
    salesTotal: '4892.00',
    salesCount: 66,
    averageTicket: '74.12',
    unitsSold: '263',
    collected: '4592.00',
    collectedByMethod: { cash: '2980.00', transfer: '1612.00' },
    pending: '300.00',
    costOfGoodsSold: '2963.00',
    grossProfit: '1929.00',
    isGrossLoss: false,
    grossMargin: '39.43',
    topProducts: [
      {
        productId: '20000000-0000-4000-8000-000000000001',
        name: 'Tamal de rajas',
        units: '98',
        amount: '2450.00',
      },
      {
        productId: '20000000-0000-4000-8000-000000000002',
        name: 'Jugo de naranja',
        units: '62',
        amount: '1116.00',
      },
    ],
    cancelled: { count: 2, total: '108.00', refundDue: '54.00' },
    ...overrides,
  };
}

export const saleSummary = (overrides: Record<string, unknown> = {}) => {
  const sale = makeSale();
  return {
    id: sale.id,
    folio: sale.folio,
    folioNumber: sale.folioNumber,
    date: '2026-10-15',
    createdAt: '2026-10-15T16:20:00.000Z',
    customerReference: null,
    status: 'active',
    total: '68.00',
    paid: '68.00',
    balance: '0.00',
    paymentStatus: 'paid',
    createdBy: { id: 'u1', name: 'ana@tienda.test' },
    ...overrides,
  };
};

/** Sesión de un vendedor. */
export const SELLER_ME = {
  user: { id: 'u2', email: 'vera@tienda.test' },
  tenant: { id: 't1', name: 'Tamales Ana' },
  role: 'seller',
};

const MEMBER_BASE = { createdAt: '2026-10-14T15:00:00.000Z' };

export const OWNER_MEMBER = {
  ...MEMBER_BASE,
  id: 'u1',
  email: 'ana@tienda.test',
  displayName: null,
  role: 'owner',
  status: 'active',
};

export function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    ...MEMBER_BASE,
    id: '90000000-0000-4000-8000-000000000001',
    email: 'vera@tienda.test',
    displayName: 'Vera López',
    role: 'seller',
    status: 'active',
    ...overrides,
  };
}

export function makeTeam(members: unknown[], activeSellers?: number) {
  const sellers = (members as { role: string; status: string }[]).filter(
    (m) => m.role === 'seller' && m.status === 'active',
  );
  return {
    body: {
      items: [OWNER_MEMBER, ...members],
      activeSellers: activeSellers ?? sellers.length,
      sellerLimit: 10,
    },
  };
}

export function makeSellerRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: '90000000-0000-4000-8000-000000000001',
    name: 'Vera López',
    email: 'vera@tienda.test',
    role: 'seller',
    status: 'active',
    salesTotal: '150.00',
    salesCount: 2,
    averageTicket: '75.00',
    unitsSold: '6',
    collected: '90.00',
    collectedByMethod: { cash: '40.00', transfer: '50.00' },
    pending: '60.00',
    costOfGoodsSold: '84.00',
    grossProfit: '66.00',
    isGrossLoss: false,
    grossMargin: '44.00',
    share: '60.00',
    cancelled: { count: 0, total: '0.00', refundDue: '0.00', rate: null },
    owed: { total: '60.00', count: 1 },
    ...overrides,
  };
}

export function makeSellersReport(rows: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    body: {
      from: '2026-10-12',
      to: '2026-10-18',
      hasSellers: true,
      items: rows,
      totals: {
        salesTotal: '250.00',
        salesCount: 4,
        costOfGoodsSold: '140.00',
        grossProfit: '110.00',
        collected: '115.00',
        pending: '135.00',
        owed: { total: '135.00', count: 2 },
      },
      ...overrides,
    },
  };
}

export function makeSellerDetail(overrides: Record<string, unknown> = {}) {
  return {
    body: {
      from: '2026-10-12',
      to: '2026-10-18',
      seller: makeSellerRow(),
      topProducts: [
        {
          productId: '20000000-0000-4000-8000-000000000001',
          name: 'Tamal de rajas',
          units: '6',
          amount: '150.00',
        },
      ],
      daily: [
        { date: '2026-10-14', salesTotal: '0.00', salesCount: 0 },
        { date: '2026-10-15', salesTotal: '150.00', salesCount: 2 },
      ],
      previous: {
        from: '2026-10-05',
        to: '2026-10-11',
        salesTotal: '50.00',
        salesCount: 2,
        grossProfit: '22.00',
      },
      aging: {
        upTo7: { total: '85.00', count: 2 },
        from8To30: { total: '25.00', count: 1 },
        over30: { total: '50.00', count: 1 },
      },
      utilization: {
        preparedUnits: '50',
        soldUnits: '6',
        soldPercent: '12.00',
        products: 1,
        soldOutProducts: 0,
      },
      ...overrides,
    },
  };
}
