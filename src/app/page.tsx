import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-4xl font-bold">Bethel GTM</h1>
        <p className="text-gray-400 text-lg">
          Server-Side Tag Manager para Meta Conversions API
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/admin"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
          >
            Admin Dashboard
          </Link>
          <Link
            href="/api/health"
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
          >
            Health Check
          </Link>
        </div>
      </div>
    </div>
  );
}
