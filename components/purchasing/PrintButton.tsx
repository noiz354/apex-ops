'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 px-4 rounded bg-blue-700 text-white font-semibold print:hidden"
    >
      Print dossier
    </button>
  );
}
