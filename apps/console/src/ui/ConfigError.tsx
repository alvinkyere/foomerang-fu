export function ConfigError({ problems }: { readonly problems: readonly string[] }) {
  return (
    <main className="screen home">
      <h1>Foomerang</h1>
      <p className="notice" role="alert">
        The console is not configured correctly:
      </p>
      <ul>
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </main>
  );
}
