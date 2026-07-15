type OperationsPanelProps = {
  title: string;
  items: string[];
};

export function OperationsPanel({ title, items }: OperationsPanelProps) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5 shadow-subtle">
      <h2 className="text-base font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm text-muted">
        {items.map((item) => (
          <li key={item} className="border-l-2 border-border pl-3">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
