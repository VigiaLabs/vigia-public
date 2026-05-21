export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">404</h1>
        <p className="mt-2 text-text-muted">Page not found</p>
        <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">
          Return home
        </a>
      </div>
    </div>
  );
}
