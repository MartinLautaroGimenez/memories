'use client';

export function PrintButton() {
  return (
    <button className="btn print-btn" type="button" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
