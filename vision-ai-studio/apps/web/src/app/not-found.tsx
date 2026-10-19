import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-500">404</p>
        <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
        <Link href="/" className="mt-4 inline-block text-sm text-gold-400 hover:underline">Voltar ao início</Link>
      </div>
    </div>
  );
}
