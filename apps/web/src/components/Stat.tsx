/** Cifra con etiqueta (Inicial, Vendido, Disponible). */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="cap">{label}</div>
      <div className="font-extrabold" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  );
}
